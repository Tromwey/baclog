import Foundation

// DEBUG only: "Llévala a otra app" in the mock app. `MockMusicServer` answers like the server
// (export-contract §5–§8) over the mock parties; `MockAppleMusicLibrary` plays MusicKit and
// `MockTidalAuthorizer` the TIDAL consent sheet. Knobs (launch arguments):
//
//   -kuraMusic off|none|apple|tidal   off = the 503 of MIGRATION_0034_LIVE · none = both
//                                     "Próximamente" · apple / tidal = only that one on (default both)
//   -kuraTidalConnected YES           TIDAL already linked (default: "conecta tidal.")
//   -kuraExportFail YES               the 2nd TIDAL step / Apple Music chunk fails once (503 service_failed)
//   -kuraAppleAuth denied             MusicKit permission denied ("Abrir Ajustes")
//   -kuraTidalDenied YES              TIDAL answers kura://music/tidal/connected?ok=0&reason=denied
//
// "Somebody's Watching Me" has no Apple Music id in the mock (missing there); "Oye mi amor" isn't
// in TIDAL.
#if DEBUG

final class MockMusicServer: @unchecked Sendable {
    static let shared = MockMusicServer()
    private let lock = NSLock()

    private struct Export {
        var outcomes: [String: ExportSong.State] = [:]
        var playlist: ExportState.Playlist?
        var failedOnce = false
    }
    private var exports: [String: Export] = [:]
    private var tidalLinked = UserDefaults.standard.bool(forKey: "kuraTidalConnected")
    private var steps = 0

    private var mode: String { UserDefaults.standard.string(forKey: "kuraMusic") ?? "all" }

    static func appleID(_ titleID: String, _ title: String) -> String? {
        title == "Somebody's Watching Me" ? nil
            : "14" + String(titleID.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFF_FFFF })
    }

    static func inTidal(_ title: String) -> Bool { title != "Oye mi amor" }

    private func check() throws { if mode == "off" { throw KuraAPIError.unavailable } }

    func services() throws -> MusicServices {
        try check()
        let apple = mode == "all" || mode == "apple", tidal = mode == "all" || mode == "tidal"
        return lock.withLock {
            MusicServices(appleMusic: .init(available: apple, reason: apple ? nil : "not_configured"),
                          tidal: .init(available: tidal, connected: tidalLinked && tidal, reason: tidal ? nil : "not_configured"))
        }
    }

    func link() throws -> MusicServices { try check(); lock.withLock { tidalLinked = true }; return try services() }
    func unlink() throws { try check(); lock.withLock { tidalLinked = false } }

    private func key(_ id: String, _ p: MusicProvider) -> String { id + "|" + p.rawValue }

    private func songs(_ id: String) throws -> (Party, [PartySong]) {
        let p = try MockPartyServer.shared.get(id)
        return (p, p.songs)
    }

    private func state(_ id: String, _ p: MusicProvider) throws -> ExportState {
        let (party, songs) = try self.songs(id)
        let e = lock.withLock { exports[key(id, p)] } ?? Export()
        let list = songs.map { s in
            ExportSong(titleID: s.titleID, title: s.title, artist: s.artist, album: s.album, artworkURL: s.artworkURL,
                       appleMusicID: Self.appleID(s.titleID, s.title), state: e.outcomes[s.titleID] ?? .pending,
                       addedBy: s.addedBy, mine: s.mine)
        }
        let processed = list.filter { $0.state != .pending }.count
        let exported = list.filter { $0.state == .added }.count
        let started = lock.withLock { exports[key(id, p)] != nil }
        let status: ExportState.Status = !started ? .idle : processed == list.count ? .done : .inProgress
        let current = list.first { $0.state == .pending }.map { ExportState.Current(titleID: $0.titleID, title: $0.title, artist: $0.artist) }
        return ExportState(provider: p, playlistName: party.name, status: status, total: list.count, exported: exported,
                           processed: processed, current: current, playlist: e.playlist,
                           missing: list.filter { $0.state == .missing }, songs: list)
    }

    func get(_ id: String, _ p: MusicProvider) throws -> ExportState { try check(); return try state(id, p) }

    func start(_ id: String, _ p: MusicProvider) throws -> ExportState {
        try check()
        if p == .tidal, !(lock.withLock { tidalLinked }) {
            throw KuraAPIError.conflict(code: "not_connected", message: "Conecta tu cuenta de TIDAL para pasar la colección.")
        }
        _ = try songs(id)
        lock.withLock {
            var e = exports[key(id, p)] ?? Export()
            for (k, v) in e.outcomes where v == .missing { e.outcomes[k] = nil }   // D6: re-queue the missing
            exports[key(id, p)] = e
        }
        return try state(id, p)
    }

    func step(_ id: String) throws -> ExportState {
        try check()
        let k = key(id, .tidal)
        let fail = lock.withLock { () -> Bool in
            steps += 1
            guard UserDefaults.standard.bool(forKey: "kuraExportFail"), steps == 2, exports[k]?.failedOnce == false else { return false }
            exports[k]?.failedOnce = true
            return true
        }
        if fail {
            throw KuraAPIError.serviceUnavailable(reason: "service_failed", message: MusicExportCopy.serviceFailed(.tidal))
        }
        let (_, songs) = try self.songs(id)
        lock.withLock {
            var e = exports[k] ?? Export()
            let pending = songs.filter { e.outcomes[$0.titleID] == nil }.prefix(3)
            for s in pending { e.outcomes[s.titleID] = Self.inTidal(s.title) ? .added : .missing }
            if e.playlist == nil, e.outcomes.values.contains(.added) {
                e.playlist = .init(id: "mock-tidal", url: URL(string: "https://tidal.com/playlist/mock-tidal"))
            }
            exports[k] = e
        }
        return try state(id, .tidal)
    }

    func report(_ id: String, _ r: AppleMusicReport) throws -> ExportState {
        try check()
        let k = key(id, .appleMusic)
        let conflict = lock.withLock { () -> Bool in
            var e = exports[k] ?? Export()
            if let current = e.playlist?.id, current != r.playlistId, !r.replace { return true }
            if r.replace || e.playlist == nil {
                if r.replace { e.outcomes = [:] }
                e.playlist = .init(id: r.playlistId, url: URL(string: "https://music.apple.com/library/playlist/\(r.playlistId)"))
            }
            for t in r.missing where e.outcomes[t] != .added { e.outcomes[t] = .missing }
            for t in r.added { e.outcomes[t] = .added }
            exports[k] = e
            return false
        }
        if conflict {
            throw KuraAPIError.conflict(code: "playlist_exists", message: "Ya hay una playlist de esta fiesta en tu Apple Music. Vuelve a cargar y seguimos en esa.")
        }
        return try state(id, .appleMusic)
    }

    /// For the captures: an export already finished (done with missing songs).
    func finish(_ id: String, _ p: MusicProvider) {
        guard let (_, songs) = try? songs(id) else { return }
        lock.withLock {
            var e = Export()
            for s in songs {
                let there = p == .tidal ? Self.inTidal(s.title) : Self.appleID(s.titleID, s.title) != nil
                e.outcomes[s.titleID] = there ? .added : .missing
            }
            e.playlist = p == .tidal ? .init(id: "mock-tidal", url: URL(string: "https://tidal.com/playlist/mock-tidal"))
                : .init(id: "p.mock", url: URL(string: "https://music.apple.com/library/playlist/p.mock"))
            exports[key(id, p)] = e
        }
    }

    func exportState(_ id: String, _ p: MusicProvider) -> ExportState? { try? state(id, p) }
}

/// MusicKit, played: permission per `-kuraAppleAuth`, a library in memory, the "watching" song
/// missing, and `-kuraExportFail` on the 2nd chunk.
final class MockAppleMusicLibrary: AppleMusicLibrary, @unchecked Sendable {
    static let shared = MockAppleMusicLibrary()
    private let lock = NSLock()
    private var status: AppleMusicAuthorization =
        UserDefaults.standard.string(forKey: "kuraAppleAuth") == "denied" ? .denied : .notDetermined
    private var playlists: [String: Set<String>] = [:]
    private var chunks = 0
    private var failed = false

    var authorization: AppleMusicAuthorization { lock.withLock { status } }

    func requestAuthorization() async -> AppleMusicAuthorization {
        try? await Task.sleep(for: .milliseconds(400))
        return lock.withLock {
            if status == .notDetermined { status = .authorized }
            return status
        }
    }

    func checkCapabilities() async throws {}

    func resolve(_ songs: [ExportSong]) async throws -> [String: String] {
        try? await Task.sleep(for: .milliseconds(350))
        let fail = lock.withLock { () -> Bool in
            chunks += 1
            guard UserDefaults.standard.bool(forKey: "kuraExportFail"), chunks == 2, !failed else { return false }
            failed = true
            return true
        }
        if fail { throw AppleMusicFailure.service }
        var out: [String: String] = [:]
        for s in songs { if let id = s.appleMusicID { out[s.titleID] = id } }
        return out
    }

    func playlistCatalogIDs(_ playlistID: String) async throws -> Set<String>? {
        lock.withLock { playlists[playlistID] ?? (playlistID == "p.mock" ? [] : nil) }
    }

    func createPlaylist(name: String, description: String) async throws -> String {
        let id = "p.\(UUID().uuidString.prefix(8))"
        lock.withLock { playlists[id] = [] }
        return id
    }

    func add(_ catalogIDs: [String], to playlistID: String) async throws {
        try? await Task.sleep(for: .milliseconds(250))
        lock.withLock { playlists[playlistID, default: []].formUnion(catalogIDs) }
    }
}

/// TIDAL's consent sheet, played: yes (or `-kuraTidalDenied YES`) after a beat.
struct MockTidalAuthorizer: TidalAuthorizer {
    @MainActor func authorize(_ url: URL) async throws -> URL {
        try await Task.sleep(for: .milliseconds(600))
        if UserDefaults.standard.bool(forKey: "kuraTidalDenied") {
            return URL(string: "kura://music/tidal/connected?ok=0&reason=denied")!
        }
        return URL(string: "kura://music/tidal/authorized?ref=i" + String(repeating: "a", count: 43))!
    }
}

extension MockAPI {
    private var music: MockMusicServer { .shared }
    private func musicWait() async { try? await Task.sleep(for: .milliseconds(300)) }

    func musicServices() async throws -> MusicServices { await musicWait(); return try music.services() }
    func startTidalAuth() async throws -> URL {
        await musicWait(); _ = try music.services()
        return URL(string: "https://login.tidal.com/authorize?mock=1")!
    }
    func completeTidalAuth(ref: String) async throws -> MusicServices { await musicWait(); return try music.link() }
    func disconnectTidal() async throws { await musicWait(); try music.unlink() }
    func partyExport(id: String, provider: MusicProvider) async throws -> ExportState { await musicWait(); return try music.get(id, provider) }
    func startPartyExport(id: String, provider: MusicProvider) async throws -> ExportState {
        await musicWait(); return try music.start(id, provider)
    }
    func stepTidalExport(id: String) async throws -> ExportState {
        try? await Task.sleep(for: .milliseconds(700)); return try music.step(id)
    }
    func reportAppleMusicExport(id: String, report: AppleMusicReport) async throws -> ExportState {
        await musicWait(); return try music.report(id, report)
    }
}

#endif
