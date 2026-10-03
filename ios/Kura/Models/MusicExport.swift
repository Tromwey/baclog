import Foundation

// "Llévala a otra app": a party's songs as a playlist in the person's own Apple Music or TIDAL
// (contrato `.claude/knowledge/state/export-contract.md`, design `fiesta-app-v2` · `shExport` /
// `isExport`). Apple Music runs HERE with MusicKit and reports to the server; TIDAL runs on the
// server in steps the app keeps calling. Host AND guests export, each to their own account.
// Tolerant decoding like the rest of the wire.

enum MusicProvider: String, Codable, Hashable, CaseIterable, Sendable {
    case appleMusic = "apple_music"
    case tidal

    /// The server's `serviceLabel` (`rules.ts`): "Apple Music" · "TIDAL".
    var label: String { self == .tidal ? "TIDAL" : "Apple Music" }
}

/// `GET /music/services`: which button works on this deploy. `available: false` → "Próximamente",
/// except Apple Music with `reason: "web_key_missing"` (iOS doesn't need the web's key). Unknown
/// fields (e.g. a future `webAvailable`) are ignored.
struct MusicServices: Hashable, Decodable, Sendable {
    struct Service: Hashable, Decodable, Sendable {
        var available: Bool
        var connected: Bool
        var reason: String?

        init(available: Bool, connected: Bool = false, reason: String? = nil) {
            self.available = available; self.connected = connected; self.reason = reason
        }

        private enum CodingKeys: String, CodingKey { case available, connected, reason }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            available = try c.decodeIfPresent(Bool.self, forKey: .available) ?? false
            connected = try c.decodeIfPresent(Bool.self, forKey: .connected) ?? false
            reason = try c.decodeIfPresent(String.self, forKey: .reason)
        }
    }

    var appleMusic: Service
    var tidal: Service

    init(appleMusic: Service, tidal: Service) { self.appleMusic = appleMusic; self.tidal = tidal }

    private enum CodingKeys: String, CodingKey { case apple_music, tidal }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        var apple = try c.decodeIfPresent(Service.self, forKey: .apple_music) ?? Service(available: false)
        // The server's Apple Music key only matters to the web (MusicKit JS needs a developer
        // token); iOS uses native MusicKit, so a missing WEB key still leaves it available here.
        if apple.reason == Self.webKeyMissing { apple.available = true }
        appleMusic = apple
        tidal = try c.decodeIfPresent(Service.self, forKey: .tidal) ?? Service(available: false)
    }

    /// `apple_music.reason` when only the web lacks the MusicKit key (backend, 2026-09-29).
    static let webKeyMissing = "web_key_missing"

    subscript(_ p: MusicProvider) -> Service { p == .tidal ? tidal : appleMusic }

    /// Both off: the switch (`MIGRATION_0034_LIVE`) or nothing configured.
    static let off = MusicServices(appleMusic: Service(available: false), tidal: Service(available: false))
}

/// A song of the export (`ExportSong`), in party order.
struct ExportSong: Identifiable, Hashable, Decodable, Sendable {
    enum State: String, Decodable, Sendable { case pending, added, missing }

    var id: String { titleID }
    let titleID: String
    var title: String
    var artist: String?
    var album: String?
    var artworkURL: URL?
    var durationMs: Int?
    /// Apple Music CATALOG id (the iTunes trackId, storefront `mx`).
    var appleMusicID: String?
    var isrc: String?
    var state: State
    /// nil → "Agregó alguien".
    var addedBy: PartyPerson?
    /// → "Pusiste".
    var mine: Bool

    init(titleID: String, title: String, artist: String?, album: String? = nil, artworkURL: URL? = nil,
         appleMusicID: String? = nil, isrc: String? = nil, state: State = .pending,
         addedBy: PartyPerson? = nil, mine: Bool = false) {
        self.titleID = titleID; self.title = title; self.artist = artist; self.album = album
        self.artworkURL = artworkURL; self.durationMs = nil; self.appleMusicID = appleMusicID; self.isrc = isrc
        self.state = state; self.addedBy = addedBy; self.mine = mine
    }

    private enum CodingKeys: String, CodingKey {
        case titleId, title, artist, album, artworkUrl, durationMs, appleMusicId, isrc, state, addedBy, mine
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        titleID = try c.decode(String.self, forKey: .titleId)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        artist = try c.decodeIfPresent(String.self, forKey: .artist).flatMap { $0.isEmpty ? nil : $0 }
        album = try c.decodeIfPresent(String.self, forKey: .album).flatMap { $0.isEmpty ? nil : $0 }
        artworkURL = try c.decodeIfPresent(String.self, forKey: .artworkUrl).flatMap(URL.init(string:))
        durationMs = try c.decodeIfPresent(Int.self, forKey: .durationMs)
        appleMusicID = try c.decodeIfPresent(String.self, forKey: .appleMusicId).flatMap { $0.isEmpty ? nil : $0 }
        isrc = try c.decodeIfPresent(String.self, forKey: .isrc).flatMap { $0.isEmpty ? nil : $0 }
        // A state this build doesn't know is NOT "pending" (that would offer to export the song
        // again): it fails the decode, and the export says it couldn't read its state.
        state = try c.decodeIfPresent(State.self, forKey: .state) ?? .pending
        addedBy = try c.decodeIfPresent(PartyPerson.self, forKey: .addedBy)
        mine = try c.decodeIfPresent(Bool.self, forKey: .mine) ?? false
    }

    /// "Pusiste" · "Puso @ana" · "Agregó alguien" (the "No están en…" rows).
    var byLine: String { mine ? "Agregaste" : addedBy.map { "Agregó \($0.at)" } ?? "Agregó alguien" }
}

/// `ExportState`: where one (party, you, service) export stands.
struct ExportState: Hashable, Decodable, Sendable {
    enum Status: String, Decodable, Sendable { case idle, inProgress = "in_progress", done }

    struct Current: Hashable, Decodable, Sendable {
        var titleID: String
        var title: String
        var artist: String?
        private enum CodingKeys: String, CodingKey { case titleId, title, artist }
        init(titleID: String, title: String, artist: String?) { self.titleID = titleID; self.title = title; self.artist = artist }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            titleID = try c.decodeIfPresent(String.self, forKey: .titleId) ?? ""
            title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
            artist = try c.decodeIfPresent(String.self, forKey: .artist)
        }
    }

    struct Playlist: Hashable, Decodable, Sendable {
        var id: String
        /// "Abrir en {svc}" — derived by the server; nil → no button.
        var url: URL?
        private enum CodingKeys: String, CodingKey { case id, url }
        init(id: String, url: URL?) { self.id = id; self.url = url }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            url = try c.decodeIfPresent(String.self, forKey: .url).flatMap(URL.init(string:))
        }
    }

    /// The provider of the request being decoded (`@TaskLocal`, like `LossyContext.endpoint`:
    /// bound with `withValue` around one request, never shared between concurrent ones).
    @TaskLocal static var requested: MusicProvider?

    var provider: MusicProvider
    var playlistName: String
    var status: Status
    var total: Int
    /// "N de M" = exported / total.
    var exported: Int
    /// The bar = processed / total.
    var processed: Int
    var current: Current?
    var playlist: Playlist?
    /// "No están en {svc}", party order.
    var missing: [ExportSong]
    var songs: [ExportSong]
    /// Another step of this export is running: call again in ~1 s.
    var busy: Bool

    init(provider: MusicProvider, playlistName: String, status: Status, total: Int, exported: Int, processed: Int,
         current: Current? = nil, playlist: Playlist? = nil, missing: [ExportSong] = [], songs: [ExportSong] = [],
         busy: Bool = false) {
        self.provider = provider; self.playlistName = playlistName; self.status = status; self.total = total
        self.exported = exported; self.processed = processed; self.current = current; self.playlist = playlist
        self.missing = missing; self.songs = songs; self.busy = busy
    }

    private enum CodingKeys: String, CodingKey {
        case provider, playlistName, status, total, exported, processed, current, playlist, missing, songs, busy
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // The app always knows which provider it asked about: a provider name this build can't
        // read must not fail the whole state, and falls back to the one REQUESTED
        // (`ExportState.requested`, bound by `LiveAPI.exportState` around the decode) — never to
        // Apple Music over a TIDAL export.
        provider = (try? c.decode(MusicProvider.self, forKey: .provider)) ?? Self.requested ?? .appleMusic
        playlistName = try c.decodeIfPresent(String.self, forKey: .playlistName) ?? ""
        // Same rule: an unknown status read as `idle` would offer "Exportar" over an export
        // that may be running or done. Absent = idle; unknown = a decoding error.
        status = try c.decodeIfPresent(Status.self, forKey: .status) ?? .idle
        total = try c.decodeIfPresent(Int.self, forKey: .total) ?? 0
        exported = try c.decodeIfPresent(Int.self, forKey: .exported) ?? 0
        processed = try c.decodeIfPresent(Int.self, forKey: .processed) ?? 0
        current = try c.decodeIfPresent(Current.self, forKey: .current)
        playlist = try c.decodeIfPresent(Playlist.self, forKey: .playlist)
        missing = try c.decodeIfPresent([ExportSong].self, forKey: .missing) ?? []
        songs = try c.decodeIfPresent([ExportSong].self, forKey: .songs) ?? []
        busy = try c.decodeIfPresent(Bool.self, forKey: .busy) ?? false
    }
}

/// `PUT /parties/{id}/exports/apple_music`: what MusicKit did (contract §6.1 step 6).
struct AppleMusicReport: Encodable, Sendable {
    var playlistId: String
    var replace: Bool
    /// titleIds that ARE in the playlist now (including the ones that already were).
    var added: [String]
    /// titleIds MusicKit couldn't find in the person's storefront.
    var missing: [String]
}

/// The export screen (design `isExport`) — one at a time, over everything (`RootView`).
struct PartyExportFlow: Equatable {
    enum Step: Equatable { case connect, progress, done, failed }

    let partyID: String
    let provider: MusicProvider
    var playlistName: String
    var step: Step
    var state: ExportState?
    /// The bar, drawn locally (Apple Music) or from the server (TIDAL).
    var processed = 0
    var total = 0
    /// "Buscando {current} en {svc}…"
    var current: String?
    /// A pause the service asked for ("TIDAL pidió una pausa…"), shown instead of "Buscando…".
    var pause: String?
    /// Why the connect step is back (permission denied, no subscription, TIDAL said no…).
    var note: String?
    /// Apple Music permission was denied: iOS won't ask again, the button opens Ajustes.
    var needsSettings = false
    /// The connect button is working (browser up, MusicKit asking).
    var busy = false
    /// "no se pudo exportar." body (the server's copy when it wrote one).
    var failure: String?
}

/// The export's copy, shared by the sheet and the screen (server `rules.ts` where it has one).
enum MusicExportCopy {
    static func title(_ step: PartyExportFlow.Step, _ p: MusicProvider) -> String {
        switch step {
        case .connect: return "conecta \(p.label.lowercased())"
        case .progress: return "pasando la colección"
        case .done: return "lista"
        case .failed: return "no se pudo exportar."
        }
    }

    static func connectBody(_ name: String) -> String {
        "kura solo crea la playlist «\(name)» en tu cuenta. No lee ni cambia tu biblioteca."
    }

    static func searching(_ title: String, _ p: MusicProvider) -> String { "Buscando \(title) en \(p.label)…" }

    /// `doneLine`: "N de M canciones ya están en tu playlist de {svc}."
    static func done(_ p: MusicProvider, exported: Int, total: Int) -> String {
        "\(exported) de \(total) canciones ya están en tu playlist de \(p.label)."
    }

    /// `SERVICE_FAILED_MESSAGE`.
    static func serviceFailed(_ p: MusicProvider) -> String {
        "\(p.label) dejó de responder a mitad del proceso. Tu colección sigue intacta en kura; al reintentar no se duplican canciones."
    }

    /// The same copy plus where it failed and what Apple said, so a screenshot tells the cause.
    static func serviceFailed(_ p: MusicProvider, stage: String, detail: String) -> String {
        "No pudimos terminar en \(p.label). Tu colección sigue intacta en kura; al reintentar no se duplican canciones.\n\nDetalle: \(stage) · \(detail)"
    }

    /// Where the playlist lives: Apple gives a private library playlist no link the app can open.
    static func appleWhere(_ name: String) -> String { "Está en tu Biblioteca › Playlists como «\(name)»." }

    /// MusicKit had no token, so Apple Music never saw the request.
    static func appleToken(_ issue: AppleMusicTokenIssue) -> String {
        switch issue {
        case .developer: return "Apple Music todavía no autoriza a kura en este iPhone. Suele tardar unos minutos después de activarlo; vuelve a intentarlo más tarde."
        case .signedOut: return "Inicia sesión en Apple Music (app Música) con tu Apple ID y vuelve a intentarlo."
        case .privacy: return "Abre la app Música una vez, acepta su aviso de privacidad y vuelve a intentarlo."
        case .user: return "Apple Music no confirmó tu cuenta. Abre la app Música, revisa tu sesión y vuelve a intentarlo."
        }
    }

    static let offline = "Sin conexión. Tu colección sigue intacta en kura; al reintentar no se duplican canciones."
    static func pause(_ p: MusicProvider) -> String { "\(p.label) pidió una pausa. Seguimos en unos segundos." }
    static func notConfigured(_ p: MusicProvider) -> String { "\(p.label) todavía no está disponible en kura" }
    /// `assertMusicExportLive` (503 `migration`).
    static let unavailable = "Exportar a otras apps todavía no está disponible. Vuelve a intentarlo más tarde."
    static let description = { (name: String) in "La colección de fiesta «\(name)», desde kura." }

    /// `kura://music/tidal/connected?ok=0&reason=…` and `complete`'s 409 (contract §4.1 copy).
    static func tidalReason(_ reason: String?) -> String {
        switch reason {
        case "denied": return "No diste permiso en TIDAL."
        case "unavailable": return "TIDAL todavía no está disponible en kura."
        case "rate_limited": return "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
        default: return "La conexión con TIDAL caducó. Vuelve a intentarlo."
        }
    }

    // Apple Music on this iPhone (MusicKit): permission and subscription.
    static let appleDenied = "kura no tiene permiso para usar Apple Music. Actívalo en Ajustes › Kura."
    static let appleRestricted = "Apple Music está restringido en este iPhone."
    static let appleNoSubscription = "Para crear la playlist necesitas una suscripción a Apple Music."
    static let appleLibraryOff = "Activa Sincronizar biblioteca en Ajustes › Música para que kura pueda crear la playlist."
}
