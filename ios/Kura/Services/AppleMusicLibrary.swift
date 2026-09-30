import Foundation
import MusicKit

// Apple Music on THIS iPhone (contract §6.1 / §6.3). The app does the work with MusicKit and
// reports to the server; the store (`AppStore+MusicExport`) drives the steps, this file only talks
// to Apple. Library calls go through `MusicDataRequest` against `/v1/me/library/playlists` with the
// same bodies as the web (MusicKit signs them with its own developer token + the user token), so
// the id we report is the library id `p.…` the server turns into "Abrir en Apple Music".
//
// Needs the MusicKit App Service on the App ID `com.tromwey.kura` and
// `NSAppleMusicUsageDescription` in Info.plist. No entitlement: MusicKit is an App Service, not a
// capability in the provisioning profile.

enum AppleMusicFailure: Error, Equatable {
    /// The person said no (iOS won't ask again: Ajustes).
    case denied
    case restricted
    /// No Apple Music subscription: nothing can be added to a library.
    case noSubscription
    /// Subscribed, but "Sincronizar biblioteca" is off: there's no cloud library to write to.
    case libraryOff
    /// Apple answered something else (5xx, timeout, bad JSON): "no se pudo exportar."
    case service
    /// MusicKit couldn't get a token, so nothing reached Apple Music at all.
    case token(AppleMusicTokenIssue)
    /// Any other failure, with WHERE it happened and what MusicKit said — shown as a short
    /// "detalle" under the failure copy so a report from the field says the real cause.
    case failed(stage: String, detail: String)
}

enum AppleMusicTokenIssue: Equatable {
    /// `developerTokenRequestFailed`: Apple doesn't hand Kura its developer token yet (the MusicKit
    /// App Service on `com.tromwey.kura` is off or still propagating).
    case developer
    /// `userNotSignedIn`: no Apple ID signed in to Música on this iPhone.
    case signedOut
    /// `privacyAcknowledgementRequired`: Música was never opened (its privacy sheet is pending).
    case privacy
    /// The user token failed for another reason.
    case user
}

enum AppleMusicAuthorization: Equatable { case authorized, notDetermined, denied, restricted }

protocol AppleMusicLibrary: Sendable {
    var authorization: AppleMusicAuthorization { get }
    /// The system prompt (only the first time; afterwards it returns the saved answer).
    func requestAuthorization() async -> AppleMusicAuthorization
    /// Throws `.noSubscription` / `.libraryOff` when a playlist can't be written.
    func checkCapabilities() async throws
    /// titleId → catalog id in the person's storefront (by `appleMusicId`, then by `isrc`).
    /// A song not in the result is missing there.
    func resolve(_ songs: [ExportSong]) async throws -> [String: String]
    /// The catalog ids already in the playlist; nil = the playlist is gone (404).
    func playlistCatalogIDs(_ playlistID: String) async throws -> Set<String>?
    /// Creates an empty library playlist and returns its library id (`p.…`).
    func createPlaylist(name: String, description: String) async throws -> String
    func add(_ catalogIDs: [String], to playlistID: String) async throws
}

struct LiveAppleMusicLibrary: AppleMusicLibrary {
    private static let base = URL(string: "https://api.music.apple.com/v1/me/library/playlists")!

    var authorization: AppleMusicAuthorization { Self.map(MusicAuthorization.currentStatus) }

    func requestAuthorization() async -> AppleMusicAuthorization {
        Self.map(await MusicAuthorization.request())
    }

    private static func map(_ s: MusicAuthorization.Status) -> AppleMusicAuthorization {
        switch s {
        case .authorized: return .authorized
        case .denied: return .denied
        case .restricted: return .restricted
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }

    func checkCapabilities() async throws {
        let sub: MusicSubscription
        do { sub = try await MusicSubscription.current } catch { throw Self.failure("suscripción", error) }
        if !sub.canPlayCatalogContent { throw AppleMusicFailure.noSubscription }
        if !sub.hasCloudLibraryEnabled { throw AppleMusicFailure.libraryOff }
    }

    func resolve(_ songs: [ExportSong]) async throws -> [String: String] {
        var out: [String: String] = [:]
        // 1. By catalog id, in the person's own storefront (MusicKit uses it by default).
        let byID = songs.compactMap { s in s.appleMusicID.map { (s.titleID, $0) } }
        if !byID.isEmpty {
            let found: Set<String>
            do {
                var req = MusicCatalogResourceRequest<Song>(matching: \.id, memberOf: byID.map { MusicItemID($0.1) })
                req.limit = byID.count
                let r = try await req.response()
                found = Set(r.items.map(\.id.rawValue))
            } catch { throw Self.failure("catálogo", error) }
            for (titleID, id) in byID where found.contains(id) { out[titleID] = id }
        }
        // 2. Not there (another storefront, or no id): by ISRC, the id that comes back.
        let byISRC = songs.filter { out[$0.titleID] == nil }.compactMap { s in s.isrc.map { (s.titleID, $0.uppercased()) } }
        if !byISRC.isEmpty {
            var isrcToID: [String: String] = [:]
            do {
                let req = MusicCatalogResourceRequest<Song>(matching: \.isrc, memberOf: byISRC.map(\.1))
                let r = try await req.response()
                for song in r.items { if let i = song.isrc?.uppercased(), isrcToID[i] == nil { isrcToID[i] = song.id.rawValue } }
            } catch { throw Self.failure("catálogo isrc", error) }
            for (titleID, isrc) in byISRC { if let id = isrcToID[isrc] { out[titleID] = id } }
        }
        return out
    }

    private struct Page: Decodable {
        struct Item: Decodable {
            struct Attributes: Decodable {
                struct PlayParams: Decodable { let catalogId: String? }
                let playParams: PlayParams?
            }
            let id: String?
            let attributes: Attributes?
        }
        let data: [Item]?
        let next: String?
    }

    func playlistCatalogIDs(_ playlistID: String) async throws -> Set<String>? {
        let playlist = Self.base.appendingPathComponent(playlistID)
        // The playlist itself first: an EMPTY playlist answers 404 on `/tracks`, a deleted one here.
        do { _ = try await send(URLRequest(url: playlist)) } catch AppleMusicHTTP.notFound { return nil }
        var ids = Set<String>()
        var next: URL? = URL(string: playlist.absoluteString + "/tracks?limit=100")
        var pages = 0
        while let url = next, pages < 50 {
            pages += 1
            let data: Data
            do { data = try await send(URLRequest(url: url)) } catch AppleMusicHTTP.notFound { break }
            guard let page = try? JSONDecoder().decode(Page.self, from: data) else { throw AppleMusicFailure.service }
            for item in page.data ?? [] { if let c = item.attributes?.playParams?.catalogId { ids.insert(c) } }
            next = page.next.flatMap { URL(string: $0, relativeTo: URL(string: "https://api.music.apple.com")!)?.absoluteURL }
        }
        return ids
    }

    private struct NewPlaylist: Encodable {
        struct Attributes: Encodable { let name: String; let description: String }
        let attributes: Attributes
    }

    func createPlaylist(name: String, description: String) async throws -> String {
        var req = URLRequest(url: Self.base)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(NewPlaylist(attributes: .init(name: name, description: description)))
        let data: Data
        do { data = try await send(req) } catch AppleMusicHTTP.notFound { throw AppleMusicFailure.service }
        guard let id = (try? JSONDecoder().decode(Page.self, from: data))?.data?.first?.id, !id.isEmpty else {
            throw AppleMusicFailure.service
        }
        return id
    }

    private struct Tracks: Encodable {
        struct Ref: Encodable { let id: String; let type = "songs" }
        let data: [Ref]
    }

    func add(_ catalogIDs: [String], to playlistID: String) async throws {
        guard !catalogIDs.isEmpty else { return }
        var req = URLRequest(url: Self.base.appendingPathComponent(playlistID).appendingPathComponent("tracks"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(Tracks(data: catalogIDs.map { Tracks.Ref(id: $0) }))
        do { _ = try await send(req) } catch AppleMusicHTTP.notFound { throw AppleMusicFailure.service }
    }

    private enum AppleMusicHTTP: Error { case notFound }

    /// One call to the Apple Music API, signed by MusicKit. 404 is its own case; anything else
    /// that fails is `.service` (never the body in a log).
    private func send(_ req: URLRequest) async throws -> Data {
        do {
            return try await MusicDataRequest(urlRequest: req).response().data
        } catch let e as MusicDataRequest.Error {
            if e.status == 404 { throw AppleMusicHTTP.notFound }
            let stage = "biblioteca \(req.httpMethod ?? "GET")"
            KuraLog.party.error("apple music \(stage, privacy: .public) → \(e.status, privacy: .public) \(e.title, privacy: .public)")
            throw AppleMusicFailure.failed(stage: stage, detail: "HTTP \(e.status) · \(e.title)")
        } catch {
            throw Self.failure("biblioteca \(req.httpMethod ?? "GET")", error)
        }
    }

    /// Every MusicKit error goes through here: logged with its stage (never a body or a token),
    /// token problems become their own case, the rest keeps a short readable detail.
    private static func failure(_ stage: String, _ error: Error) -> AppleMusicFailure {
        if let a = error as? AppleMusicFailure { return a }
        let described = String(describing: error)
        KuraLog.party.error("apple music \(stage, privacy: .public) failed: \(described, privacy: .public)")
        if let t = error as? MusicTokenRequestError {
            switch t {
            case .developerTokenRequestFailed: return .token(.developer)
            case .userNotSignedIn: return .token(.signedOut)
            case .privacyAcknowledgementRequired: return .token(.privacy)
            case .permissionDenied: return .denied
            default: return .token(.user)
            }
        }
        return .failed(stage: stage, detail: String(described.prefix(160)))
    }
}
