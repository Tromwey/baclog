import Foundation

// DEBUG only: the parties of the mock app (design `fiesta-app-v2`: "la fiesta de eric" with its
// eight songs, Caifanes and Thriller in the search). `MockAPI` is a value type, so the parties
// live in `MockPartyServer.shared` and a write sticks for the session. It computes each answer
// for the mock account (`MockData.me`) the way the server does (`viewer`, `mine`, `canRemove`,
// the add order blocked → solo ver → duplicado → tope).
#if DEBUG

final class MockPartyServer: @unchecked Sendable {
    static let shared = MockPartyServer()
    private let lock = NSLock()

    struct Song {
        var id: String
        var title: String
        var artist: String
        var album: String?
        var palette: [String]
        /// Handle; nil = "alguien".
        var by: String?
    }

    struct Room {
        var id: String
        var name: String
        var host: String
        var limit: Int?
        var songs: [Song]
        var members: Set<String>
        var blocked: Set<String>
        var token: String
        var active: Bool
    }

    /// The catalog the search answers from (the design's `CAT`).
    static let catalog: [String: Song] = {
        func s(_ id: String, _ t: String, _ a: String, _ al: String? = nil, _ c: [String]) -> (String, Song) {
            (id, Song(id: "00000000-0000-4000-8000-\(id.padding(toLength: 12, withPad: "0", startingAt: 0))", title: t, artist: a, album: al, palette: c, by: nil))
        }
        return Dictionary(uniqueKeysWithValues: [
            s("thriller", "Thriller", "Michael Jackson", "Thriller", ["#c4473b", "#211c28"]),
            s("llorona", "La Llorona", "Chavela Vargas", nil, ["#3a2923", "#e6d9bf"]),
            s("bidi", "Bidi Bidi Bom Bom", "Selena", nil, ["#6a2140", "#d8a340"]),
            s("toxic", "Toxic", "Britney Spears", nil, ["#e2c369", "#2d5a6d"]),
            s("tusa", "Tusa", "Karol G y Nicki Minaj", nil, ["#2a2440", "#e39aa7"]),
            s("watching", "Somebody's Watching Me", "Rockwell", nil, ["#e8e1cf", "#43503a"]),
            s("oye", "Oye mi amor", "Maná", nil, ["#efd8a7", "#3a6a8e"]),
            s("macabre", "Dance Macabre", "Ghost", nil, ["#d7c8a7", "#5a1f2b"]),
            s("negra", "La negra Tomasa", "Caifanes", "Caifanes", ["#e9e4d8", "#161616"]),
            s("afuera", "Afuera", "Caifanes", "El nervio del volcán", ["#1c1916", "#8c3b2a"]),
            s("viento", "Viento", "Caifanes", "El diablito", ["#2c2a26", "#b9a27a"]),
            s("avientame", "Aviéntame", "Caifanes", "El nervio del volcán", ["#e9d6b0", "#7b3326"]),
            s("nodejes", "No dejes que…", "Caifanes", "El silencio", ["#6b1e24", "#dcd3c4"]),
            s("thriller2", "Thriller", "Fall Out Boy", "From Under the Cork Tree", ["#d6d0c2", "#2b2b33"])
        ])
    }()

    static let ericID = "00000000-0000-4000-8000-0000000fe571"
    static let mineID = "00000000-0000-4000-8000-0000000fe572"
    static let ericToken = "EricFiesta31oct0"
    static let mineToken = "MarielHalloween1"

    private var rooms: [String: Room]
    /// `-kuraPartyUnavailable YES`: every call is the server's 503 (migration 0033 not applied).
    var unavailable: Bool { UserDefaults.standard.bool(forKey: "kuraPartyUnavailable") }

    private init() {
        func cat(_ k: String, by: String?) -> Song { var s = Self.catalog[k]!; s.by = by; return s }
        let eric = Room(id: Self.ericID, name: "la fiesta de eric", host: "eric", limit: 3,
                        songs: [cat("thriller", by: "ana"), cat("llorona", by: "eric"), cat("bidi", by: "ana"),
                                cat("toxic", by: "rodri"), cat("tusa", by: "vale"), cat("watching", by: "rodri"),
                                cat("oye", by: nil), cat("macabre", by: "vale")],
                        members: ["ana", "rodri", "vale", MockData.me.handle], blocked: [],
                        token: Self.ericToken, active: true)
        let mine = Room(id: Self.mineID, name: "noche de brujas", host: MockData.me.handle, limit: 3,
                        songs: [cat("negra", by: MockData.me.handle), cat("toxic", by: "rodri"), cat("tusa", by: "vale")],
                        members: ["rodri", "vale"], blocked: [], token: Self.mineToken, active: true)
        rooms = [eric.id: eric, mine.id: mine]
    }

    // MARK: Scenario knobs (DebugLaunch)

    func mutate(_ id: String, _ f: (inout Room) -> Void) { lock.withLock { if rooms[id] != nil { f(&rooms[id]!) } } }

    /// Adds the design's "mau" songs to eric's party as the mock account's own.
    func seedMine(_ keys: [String]) {
        mutate(Self.ericID) { r in
            for k in keys where !r.songs.contains(where: { $0.id == Self.catalog[k]!.id }) {
                var s = Self.catalog[k]!; s.by = MockData.me.handle; r.songs.append(s)
            }
        }
    }

    // MARK: Answers

    private var me: String { MockData.me.handle }

    private func person(_ h: String?) -> PartyPerson? {
        guard let h else { return nil }
        if h == me { return PartyPerson(handle: h, name: MockData.me.name) }
        return PartyPerson(handle: h, name: h)
    }

    func party(_ r: Room) -> Party {
        let host = r.host == me
        let mineCount = r.songs.filter { $0.by == me }.count
        let blocked = r.blocked.contains(me)
        let remaining: Int? = host ? nil : r.limit.map { max(0, $0 - mineCount) }
        let canAdd = !blocked && (host || r.limit.map { mineCount < $0 } ?? true)
        let songs = r.songs.map { s in
            PartySong(titleID: s.id, title: s.title, artist: s.artist, album: s.album, palette: s.palette,
                      addedBy: person(s.by), mine: s.by == me, byHost: s.by == r.host,
                      canRemove: host || (s.by == me && !blocked),
                      canBlockAuthor: host && s.by != nil && s.by != r.host)
        }
        var counts: [String?: Int] = [:]
        for s in r.songs { counts[s.by, default: 0] += 1 }
        let contributors = counts.sorted { a, b in
            if (a.key == nil) != (b.key == nil) { return a.key != nil }
            return a.value > b.value
        }.map { PartyContributor(person: person($0.key), isYou: $0.key == me, songCount: $0.value) }
        let invite = host ? PartyInvite(active: r.active, token: r.token,
                                        url: URL(string: "https://get-kura.app/f/\(r.token)"),
                                        createdAt: MockData.now.addingTimeInterval(-4 * 86_400)) : nil
        let blockedGuests = host ? r.blocked.sorted().map { PartyBlockedGuest(guestRef: "ref-\($0)", person: person($0), blockedAt: MockData.now) } : []
        return Party(id: r.id, name: r.name, perGuestLimit: r.limit, host: person(r.host),
                     viewer: PartyViewer(role: host ? .host : .guest, blocked: blocked, mineCount: host ? 0 : mineCount,
                                         remaining: remaining, canAdd: canAdd && r.limit != 0 || host),
                     songs: songs, contributors: contributors, guestCount: r.members.subtracting(r.blocked).count,
                     invite: invite, blockedGuests: blockedGuests, createdAt: MockData.now)
    }

    private func check() throws { if unavailable { throw KuraAPIError.unavailable } }

    private func room(_ id: String) throws -> Room {
        try check()
        guard let r = lock.withLock({ rooms[id] }), r.host == me || r.members.contains(me) else { throw KuraAPIError.notFound }
        return r
    }

    func list() throws -> [PartyCard] {
        try check()
        return lock.withLock { rooms.values }
            .filter { $0.host == me || $0.members.contains(me) }
            .sorted { $0.name < $1.name }
            .map { r in
                PartyCard(id: r.id, name: r.name, role: r.host == me ? .host : .guest, perGuestLimit: r.limit,
                          songCount: r.songs.count, peopleCount: Set(r.songs.compactMap(\.by)).count,
                          host: person(r.host), artworkURLs: r.songs.prefix(3).map { _ in nil },
                          palette: r.songs.first?.palette ?? [])
            }
    }

    func get(_ id: String) throws -> Party { party(try room(id)) }

    func create(name: String, limit: Int?) throws -> Party {
        try check()
        let id = UUID().uuidString.lowercased()
        let token = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16))
        let r = Room(id: id, name: name, host: me, limit: limit, songs: [], members: [], blocked: [], token: token, active: true)
        lock.withLock { rooms[id] = r }
        return party(r)
    }

    func update(_ id: String, name: String?, limit: Int??) throws -> Party {
        guard try room(id).host == me else { throw KuraAPIError.notFound }
        mutate(id) { r in
            if let name { r.name = name }
            if let limit { r.limit = limit }
        }
        return try get(id)
    }

    func delete(_ id: String) throws {
        guard try room(id).host == me else { throw KuraAPIError.notFound }
        _ = lock.withLock { rooms.removeValue(forKey: id) }
    }

    func rotate(_ id: String) throws -> Party {
        guard try room(id).host == me else { throw KuraAPIError.notFound }
        mutate(id) { r in r.token = String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16)); r.active = true }
        return try get(id)
    }

    func revoke(_ id: String) throws -> Party {
        guard try room(id).host == me else { throw KuraAPIError.notFound }
        mutate(id) { $0.active = false }
        return try get(id)
    }

    func search(_ id: String, _ q: String) throws -> [PartySongHit] {
        let r = try room(id)
        let f = q.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
        if f.contains("error") { throw KuraAPIError.unavailable }
        let keys = f.contains("thri") ? ["thriller", "thriller2", "watching"]
            : f.contains("caif") ? ["negra", "afuera", "viento", "avientame", "nodejes"] : []
        return keys.compactMap { Self.catalog[$0] }.map { s in
            let dup = r.songs.first { $0.id == s.id }
            return PartySongHit(titleID: s.id, title: s.title, artist: s.artist, album: s.album, palette: s.palette,
                                inParty: dup.map { PartySongHit.InParty(mine: $0.by == me, addedBy: person($0.by)) })
        }
    }

    func add(_ id: String, _ titleID: String) throws -> Party {
        let r = try room(id)
        guard let s = Self.catalog.values.first(where: { $0.id == titleID }) else { throw KuraAPIError.notFound }
        let host = r.host == me
        if r.blocked.contains(me) { throw KuraAPIError.forbidden(code: "blocked") }
        if r.limit == 0 && !host { throw KuraAPIError.forbidden(code: "view_only") }
        if let dup = r.songs.first(where: { $0.id == titleID }) {
            if dup.by == me { throw KuraAPIError.conflict(code: "duplicate_mine", message: "Ya la pusiste tú.") }
            throw KuraAPIError.conflict(code: "duplicate_other", message: "Ya está, la puso \(person(dup.by).atOrSomeone)")
        }
        if !host, let l = r.limit, r.songs.filter({ $0.by == me }).count >= l {
            throw KuraAPIError.conflict(code: "cap_reached", message: "Ya pusiste tus \(l).")
        }
        mutate(id) { var n = s; n.by = me; $0.songs.append(n) }
        return try get(id)
    }

    func remove(_ id: String, _ titleID: String) throws -> Party {
        let r = try room(id)
        if let s = r.songs.first(where: { $0.id == titleID }), r.host != me, s.by != me {
            throw KuraAPIError.forbidden(code: "not_yours")
        }
        mutate(id) { $0.songs.removeAll { $0.id == titleID } }
        return try get(id)
    }

    func block(_ id: String, _ titleID: String) throws -> Party {
        let r = try room(id)
        guard r.host == me else { throw KuraAPIError.notFound }
        guard let s = r.songs.first(where: { $0.id == titleID }), let by = s.by, by != me else {
            throw KuraAPIError.conflict(code: "not_blockable", message: "")
        }
        mutate(id) { $0.songs.removeAll { $0.id == titleID }; $0.blocked.insert(by) }
        return try get(id)
    }

    func unblock(_ id: String, _ ref: String) throws -> Party {
        mutate(id) { $0.blocked.remove(String(ref.dropFirst(4))) }
        return try get(id)
    }

    func preview(_ token: String) throws -> InvitePreview {
        try check()
        guard let r = lock.withLock({ rooms.values.first { $0.token == token && $0.active } }) else { throw KuraAPIError.notFound }
        let p = party(r)
        let joined = r.members.contains(me)
        return InvitePreview(token: token,
                             party: .init(id: r.id, name: r.name, perGuestLimit: r.limit, host: p.host,
                                          songs: p.songs.map { var s = $0; s.canRemove = false; s.canBlockAuthor = false; return s },
                                          contributors: p.contributors, guestCount: p.guestCount),
                             viewer: .init(role: r.host == me ? .host : joined ? .guest : nil, joined: joined, blocked: r.blocked.contains(me)))
    }

    func join(_ token: String) throws -> PartyJoin {
        try check()
        guard let r = lock.withLock({ rooms.values.first { $0.token == token && $0.active } }) else { throw KuraAPIError.notFound }
        if r.host == me { return PartyJoin(party: party(r), joined: .host) }
        let already = r.members.contains(me)
        mutate(r.id) { _ = $0.members.insert(me) }
        return PartyJoin(party: try get(r.id), joined: already ? .already : .new)
    }

    /// For the `invite` captures: the mock account is NOT yet a member of eric's party.
    func leaveEric() { mutate(Self.ericID) { $0.members.remove(MockData.me.handle) } }
}

extension MockAPI {
    private var parties_: MockPartyServer { .shared }
    private func partyWait() async { try? await Task.sleep(for: .milliseconds(450)) }
    private func partyWrite() async throws {
        try? await Task.sleep(for: .milliseconds(160))
        if failWrites { throw KuraAPIError.server("mock") }
    }

    func parties() async throws -> [PartyCard] { await partyWait(); return try parties_.list() }
    func createParty(name: String, perGuestLimit: Int?) async throws -> Party {
        try await partyWrite(); return try parties_.create(name: name, limit: perGuestLimit)
    }
    func party(id: String) async throws -> Party { await partyWait(); return try parties_.get(id) }
    func updateParty(id: String, name: String?, perGuestLimit: Int??) async throws -> Party {
        try await partyWrite(); return try parties_.update(id, name: name, limit: perGuestLimit)
    }
    func deleteParty(id: String) async throws { try await partyWrite(); try parties_.delete(id) }
    func rotatePartyInvite(id: String) async throws -> Party { try await partyWrite(); return try parties_.rotate(id) }
    func revokePartyInvite(id: String) async throws -> Party { try await partyWrite(); return try parties_.revoke(id) }
    func searchPartySongs(id: String, query: String) async throws -> [PartySongHit] {
        try? await Task.sleep(for: .milliseconds(700)); return try parties_.search(id, query)
    }
    func addPartySong(id: String, titleID: String, paletteHex: [String]?) async throws -> Party {
        try await partyWrite(); return try parties_.add(id, titleID)
    }
    func removePartySong(id: String, titleID: String) async throws -> Party {
        try await partyWrite(); return try parties_.remove(id, titleID)
    }
    func removeAndBlockPartyGuest(id: String, titleID: String) async throws -> Party {
        try await partyWrite(); return try parties_.block(id, titleID)
    }
    func fillPartySongPalette(id: String, titleID: String, hexes: [String]) async throws {}
    func unblockPartyGuest(id: String, guestRef: String) async throws -> Party {
        try await partyWrite(); return try parties_.unblock(id, guestRef)
    }
    func invitePreview(token: String) async throws -> InvitePreview { await partyWait(); return try parties_.preview(token) }
    func joinParty(token: String) async throws -> PartyJoin { try await partyWrite(); return try parties_.join(token) }
}

#endif
