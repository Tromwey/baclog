import Foundation

// Colecciones de fiesta (contrato `.claude/knowledge/state/fiesta-contract.md` §5): a party IS a
// collection (`backlog`) with a `party` row, but on the wire it's its own family under
// `/api/v1/parties/**` and `/api/v1/invites/{token}` — never a `KCollection`, never a `Title`.
// A song is NOT a title: it has no `/titles/{id}`, no state, no palette route of its own
// (`PUT /parties/{id}/songs/{titleId}/palette` fills it). Every model is tolerant like the rest
// of the wire (`decodeIfPresent`, ISO dates through `KuraJSON.decoder`).

/// Someone in a party. `nil` where the wire allows it = "alguien" (private, no handle, blocked
/// with you, or a deleted account). User ids never travel.
struct PartyPerson: Hashable, Decodable {
    var handle: String
    var name: String
    var avatarURL: URL?

    init(handle: String, name: String, avatarURL: URL? = nil) {
        self.handle = handle; self.name = name; self.avatarURL = avatarURL
    }

    private enum CodingKeys: String, CodingKey { case handle, name, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        handle = try c.decodeIfPresent(String.self, forKey: .handle) ?? ""
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        avatarURL = KuraRuntime.resolve(try c.decodeIfPresent(String.self, forKey: .avatarUrl))
    }

    /// "@ana" — or the name when there's no handle (never happens on the wire, kept safe).
    var at: String { handle.isEmpty ? name : "@\(handle)" }

    // Its seal is `PartySeal` (a colour per handle, design `avatar(by)`), not `Seal`.
}

extension Optional where Wrapped == PartyPerson {
    /// "@ana" or "alguien".
    var atOrSomeone: String { self?.at ?? "alguien" }
}

/// A song in the party (playlist order: first added first).
struct PartySong: Identifiable, Hashable, Decodable {
    var id: String { titleID }
    let titleID: String
    var title: String
    var artist: String?
    var album: String?
    var artworkURL: URL?
    var previewURL: URL?
    var durationMs: Int?
    var appleMusicURL: URL?
    var palette: [String]
    var addedAt: Date?
    /// nil → "Agregó alguien".
    var addedBy: PartyPerson?
    /// → "Pusiste".
    var mine: Bool
    var byHost: Bool
    var canRemove: Bool
    var canBlockAuthor: Bool

    private enum CodingKeys: String, CodingKey {
        case titleId, title, artist, album, artworkUrl, previewUrl, durationMs, appleMusicUrl, palette, addedAt, addedBy,
             mine, byHost, canRemove, canBlockAuthor
    }

    init(titleID: String, title: String, artist: String?, album: String? = nil, artworkURL: URL? = nil,
         palette: [String] = [], addedBy: PartyPerson?, mine: Bool, byHost: Bool = false,
         canRemove: Bool = false, canBlockAuthor: Bool = false, addedAt: Date? = nil) {
        self.titleID = titleID; self.title = title; self.artist = artist; self.album = album
        self.artworkURL = artworkURL; self.previewURL = nil; self.durationMs = nil; self.appleMusicURL = nil
        self.palette = palette; self.addedAt = addedAt; self.addedBy = addedBy; self.mine = mine
        self.byHost = byHost; self.canRemove = canRemove; self.canBlockAuthor = canBlockAuthor
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        titleID = try c.decode(String.self, forKey: .titleId)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        artist = try c.decodeIfPresent(String.self, forKey: .artist).flatMap { $0.isEmpty ? nil : $0 }
        album = try c.decodeIfPresent(String.self, forKey: .album).flatMap { $0.isEmpty ? nil : $0 }
        artworkURL = try c.decodeIfPresent(String.self, forKey: .artworkUrl).flatMap(URL.init(string:))
        previewURL = try c.decodeIfPresent(String.self, forKey: .previewUrl).flatMap(URL.init(string:))
        durationMs = try c.decodeIfPresent(Int.self, forKey: .durationMs)
        appleMusicURL = try c.decodeIfPresent(String.self, forKey: .appleMusicUrl).flatMap(URL.init(string:))
        palette = try c.decodeIfPresent([String].self, forKey: .palette) ?? []
        addedAt = try c.decodeIfPresent(Date.self, forKey: .addedAt)
        addedBy = try c.decodeIfPresent(PartyPerson.self, forKey: .addedBy)
        mine = try c.decodeIfPresent(Bool.self, forKey: .mine) ?? false
        byHost = try c.decodeIfPresent(Bool.self, forKey: .byHost) ?? false
        canRemove = try c.decodeIfPresent(Bool.self, forKey: .canRemove) ?? false
        canBlockAuthor = try c.decodeIfPresent(Bool.self, forKey: .canBlockAuthor) ?? false
    }

    /// "Agregaste tú" · "Puso @ana" · "Agregó alguien" (the list's line under the artist).
    var byShort: String { mine ? "Agregaste tú" : addedBy.map { "Agregó \($0.at)" } ?? "Agregó alguien" }
    /// "Pusiste" · "Puso @ana" · "Agregó alguien" (the remove sheet).
    var byLong: String { mine ? "Agregaste" : addedBy.map { "Agregó \($0.at)" } ?? "Agregó alguien" }

    /// The song drawn with the shared cover components (`FanView`, `CoverView`): a record, 1:1.
    /// Never registered in `AppStore.titles` (a song is not a `Title`); the id carries a prefix so
    /// `fillPaletteIfNeeded` never sends it to `PUT /titles/{id}/palette`.
    var art: Title { PartySong.art(id: titleID, name: title, artist: artist, url: artworkURL, palette: palette) }

    static let artPrefix = "party-song:"
    static func isArt(_ id: String) -> Bool { id.hasPrefix(artPrefix) }

    static func art(id: String, name: String, artist: String?, url: URL?, palette: [String]) -> Title {
        Title(id: artPrefix + id, name: name, format: .album, creator: artist, palette: palette, coverURL: url)
    }
}

/// `viewer` of a `Party`: what YOU can do here.
struct PartyViewer: Hashable, Decodable {
    enum Role: String, Decodable { case host, guest }
    var role: Role
    var blocked: Bool
    var mineCount: Int
    /// nil = no cap (the host, or unlimited).
    var remaining: Int?
    var canAdd: Bool

    private enum CodingKeys: String, CodingKey { case role, blocked, mineCount, remaining, canAdd }

    init(role: Role, blocked: Bool = false, mineCount: Int = 0, remaining: Int?, canAdd: Bool) {
        self.role = role; self.blocked = blocked; self.mineCount = mineCount; self.remaining = remaining; self.canAdd = canAdd
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        role = (try? c.decode(Role.self, forKey: .role)) ?? .guest
        blocked = try c.decodeIfPresent(Bool.self, forKey: .blocked) ?? false
        mineCount = try c.decodeIfPresent(Int.self, forKey: .mineCount) ?? 0
        remaining = try c.decodeIfPresent(Int.self, forKey: .remaining)
        canAdd = try c.decodeIfPresent(Bool.self, forKey: .canAdd) ?? false
    }
}

struct PartyContributor: Hashable, Decodable {
    var person: PartyPerson?
    var isYou: Bool
    var songCount: Int

    private enum CodingKeys: String, CodingKey { case person, isYou, songCount }

    init(person: PartyPerson?, isYou: Bool = false, songCount: Int) {
        self.person = person; self.isYou = isYou; self.songCount = songCount
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        person = try c.decodeIfPresent(PartyPerson.self, forKey: .person)
        isYou = try c.decodeIfPresent(Bool.self, forKey: .isYou) ?? false
        songCount = try c.decodeIfPresent(Int.self, forKey: .songCount) ?? 0
    }
}

/// The party's link (host only). A revoked one keeps its token (it never works again).
struct PartyInvite: Hashable, Decodable {
    var active: Bool
    var token: String?
    var url: URL?
    var createdAt: Date?

    private enum CodingKeys: String, CodingKey { case active, token, url, createdAt }

    init(active: Bool, token: String?, url: URL?, createdAt: Date?) {
        self.active = active; self.token = token; self.url = url; self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        active = try c.decodeIfPresent(Bool.self, forKey: .active) ?? false
        token = try c.decodeIfPresent(String.self, forKey: .token)
        url = try c.decodeIfPresent(String.self, forKey: .url).flatMap(URL.init(string:))
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
    }

    /// `get-kura.app/f/AbCd…` — the link as the sheets print it (no scheme).
    var display: String {
        guard let url else { return "" }
        return (url.host ?? "") + url.path
    }
}

struct PartyBlockedGuest: Hashable, Decodable {
    var guestRef: String
    var person: PartyPerson?
    var blockedAt: Date?
}

/// `GET /parties/{id}` and every write's answer.
struct Party: Identifiable, Hashable, Decodable {
    let id: String
    var name: String
    /// 0 = solo ver · 1…5 · nil = ilimitadas.
    var perGuestLimit: Int?
    var createdAt: Date?
    var host: PartyPerson?
    var viewer: PartyViewer
    var songs: [PartySong]
    var contributors: [PartyContributor]
    var guestCount: Int
    var invite: PartyInvite?
    var blockedGuests: [PartyBlockedGuest]

    private enum CodingKeys: String, CodingKey {
        case id, name, perGuestLimit, createdAt, host, viewer, songs, contributors, guestCount, invite, blockedGuests
    }

    init(id: String, name: String, perGuestLimit: Int?, host: PartyPerson?, viewer: PartyViewer, songs: [PartySong],
         contributors: [PartyContributor] = [], guestCount: Int = 0, invite: PartyInvite? = nil,
         blockedGuests: [PartyBlockedGuest] = [], createdAt: Date? = nil) {
        self.id = id; self.name = name; self.perGuestLimit = perGuestLimit; self.host = host; self.viewer = viewer
        self.songs = songs; self.contributors = contributors; self.guestCount = guestCount; self.invite = invite
        self.blockedGuests = blockedGuests; self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        perGuestLimit = try c.decodeIfPresent(Int.self, forKey: .perGuestLimit)
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
        host = try c.decodeIfPresent(PartyPerson.self, forKey: .host)
        viewer = try c.decode(PartyViewer.self, forKey: .viewer)
        songs = try c.decodeIfPresent([PartySong].self, forKey: .songs) ?? []
        contributors = try c.decodeIfPresent([PartyContributor].self, forKey: .contributors) ?? []
        guestCount = try c.decodeIfPresent(Int.self, forKey: .guestCount) ?? 0
        invite = try c.decodeIfPresent(PartyInvite.self, forKey: .invite)
        blockedGuests = try c.decodeIfPresent([PartyBlockedGuest].self, forKey: .blockedGuests) ?? []
    }

    var isHost: Bool { viewer.role == .host }
    var mySongs: [PartySong] { songs.filter(\.mine) }
    /// The palette the page is tinted with: the first song that has one (the design tints from the
    /// first cover; one still gray falls to the next rather than leaving the page black).
    var tint: [String] { songs.first(where: { !$0.palette.isEmpty })?.palette ?? [] }
}

/// A row of `GET /parties` (host and guest, blocked included; newest first).
struct PartyCard: Identifiable, Hashable, Decodable {
    let id: String
    var name: String
    var role: PartyViewer.Role
    var perGuestLimit: Int?
    var songCount: Int
    var peopleCount: Int
    var host: PartyPerson?
    var artworkURLs: [URL?]
    var palette: [String]
    var updatedAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, name, role, perGuestLimit, songCount, peopleCount, host, artworkUrls, palette, updatedAt
    }

    init(id: String, name: String, role: PartyViewer.Role, perGuestLimit: Int?, songCount: Int, peopleCount: Int,
         host: PartyPerson?, artworkURLs: [URL?], palette: [String], updatedAt: Date? = nil) {
        self.id = id; self.name = name; self.role = role; self.perGuestLimit = perGuestLimit; self.songCount = songCount
        self.peopleCount = peopleCount; self.host = host; self.artworkURLs = artworkURLs; self.palette = palette
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        role = (try? c.decode(PartyViewer.Role.self, forKey: .role)) ?? .guest
        perGuestLimit = try c.decodeIfPresent(Int.self, forKey: .perGuestLimit)
        songCount = try c.decodeIfPresent(Int.self, forKey: .songCount) ?? 0
        peopleCount = try c.decodeIfPresent(Int.self, forKey: .peopleCount) ?? 0
        host = try c.decodeIfPresent(PartyPerson.self, forKey: .host)
        artworkURLs = (try c.decodeIfPresent([String?].self, forKey: .artworkUrls) ?? []).map { $0.flatMap(URL.init(string:)) }
        palette = try c.decodeIfPresent([String].self, forKey: .palette) ?? []
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt)
    }

    /// Up to three record covers for the fan (the card's palette on each while it loads).
    var fan: [Title] {
        artworkURLs.prefix(3).enumerated().map { i, url in
            PartySong.art(id: "\(id)-\(i)", name: name, artist: nil, url: url, palette: palette)
        }
    }

    /// "De fiesta · 8 canciones · 4 personas" (host) · "De fiesta · de @eric · colaboras" (guest).
    var meta: String {
        if role == .host {
            return "De fiesta · \(PartyCopy.songs(songCount)) · \(PartyCopy.people(peopleCount))"
        }
        return "De fiesta · de \(host.atOrSomeone) · colaboras"
    }
}

/// `GET /invites/{token}`: public preview (bearer optional → `viewer`).
struct InvitePreview: Hashable, Decodable {
    struct Summary: Hashable, Decodable {
        let id: String
        var name: String
        var perGuestLimit: Int?
        var host: PartyPerson?
        var songs: [PartySong]
        var contributors: [PartyContributor]
        var guestCount: Int

        private enum CodingKeys: String, CodingKey { case id, name, perGuestLimit, host, songs, contributors, guestCount }

        init(id: String, name: String, perGuestLimit: Int?, host: PartyPerson?, songs: [PartySong],
             contributors: [PartyContributor] = [], guestCount: Int = 0) {
            self.id = id; self.name = name; self.perGuestLimit = perGuestLimit; self.host = host; self.songs = songs
            self.contributors = contributors; self.guestCount = guestCount
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
            perGuestLimit = try c.decodeIfPresent(Int.self, forKey: .perGuestLimit)
            host = try c.decodeIfPresent(PartyPerson.self, forKey: .host)
            songs = try c.decodeIfPresent([PartySong].self, forKey: .songs) ?? []
            contributors = try c.decodeIfPresent([PartyContributor].self, forKey: .contributors) ?? []
            guestCount = try c.decodeIfPresent(Int.self, forKey: .guestCount) ?? 0
        }

        var tint: [String] { songs.first(where: { !$0.palette.isEmpty })?.palette ?? [] }
    }

    struct Viewer: Hashable, Decodable {
        var role: PartyViewer.Role?
        var joined: Bool
        var blocked: Bool

        private enum CodingKeys: String, CodingKey { case role, joined, blocked }

        init(role: PartyViewer.Role?, joined: Bool, blocked: Bool) {
            self.role = role; self.joined = joined; self.blocked = blocked
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            role = try? c.decodeIfPresent(PartyViewer.Role.self, forKey: .role)
            joined = try c.decodeIfPresent(Bool.self, forKey: .joined) ?? false
            blocked = try c.decodeIfPresent(Bool.self, forKey: .blocked) ?? false
        }
    }

    var token: String
    var party: Summary
    var viewer: Viewer?
}

/// `GET /parties/{id}/songs?q=` row.
struct PartySongHit: Identifiable, Hashable, Decodable {
    struct InParty: Hashable, Decodable {
        var mine: Bool
        var addedBy: PartyPerson?

        private enum CodingKeys: String, CodingKey { case mine, addedBy }

        init(mine: Bool, addedBy: PartyPerson?) { self.mine = mine; self.addedBy = addedBy }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            mine = try c.decodeIfPresent(Bool.self, forKey: .mine) ?? false
            addedBy = try c.decodeIfPresent(PartyPerson.self, forKey: .addedBy)
        }
    }

    var id: String { titleID }
    let titleID: String
    var title: String
    var artist: String?
    var album: String?
    var artworkURL: URL?
    var palette: [String]
    /// nil → "Agregar"; mine → "Ya la pusiste"; else → "Ya está · la puso @x".
    var inParty: InParty?

    private enum CodingKeys: String, CodingKey { case titleId, title, artist, album, artworkUrl, palette, inParty }

    init(titleID: String, title: String, artist: String?, album: String?, artworkURL: URL? = nil,
         palette: [String] = [], inParty: InParty? = nil) {
        self.titleID = titleID; self.title = title; self.artist = artist; self.album = album
        self.artworkURL = artworkURL; self.palette = palette; self.inParty = inParty
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        titleID = try c.decode(String.self, forKey: .titleId)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        artist = try c.decodeIfPresent(String.self, forKey: .artist).flatMap { $0.isEmpty ? nil : $0 }
        album = try c.decodeIfPresent(String.self, forKey: .album).flatMap { $0.isEmpty ? nil : $0 }
        artworkURL = try c.decodeIfPresent(String.self, forKey: .artworkUrl).flatMap(URL.init(string:))
        palette = try c.decodeIfPresent([String].self, forKey: .palette) ?? []
        inParty = try c.decodeIfPresent(InParty.self, forKey: .inParty)
    }

    /// "Caifanes · El nervio del volcán" (the search row's second line).
    var subtitle: String { [artist, album].compactMap { $0 }.joined(separator: " · ") }
    /// The third line when it's already in: "Ya la pusiste" · "Ya está · la puso @ana".
    var dupLine: String? {
        guard let inParty else { return nil }
        return inParty.mine ? "Ya la agregaste" : "Ya está · la agregó \(inParty.addedBy.atOrSomeone)"
    }
}

/// `POST /invites/{token}/join`.
struct PartyJoin: Decodable {
    enum Joined: String, Decodable { case new, already, host }
    var party: Party
    var joined: Joined

    private enum CodingKeys: String, CodingKey { case party, joined }

    init(party: Party, joined: Joined) { self.party = party; self.joined = joined }

    /// The join ALREADY happened on the server when this is decoded: a `joined` value this build
    /// doesn't know (or none) must not turn it into an error — it opens the party without the
    /// welcome sheet, like `already`.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        party = try c.decode(Party.self, forKey: .party)
        joined = (try? c.decode(Joined.self, forKey: .joined)) ?? .already
    }
}

/// The copy the screens share (design `fiesta-app-v2`).
enum PartyCopy {
    static func songs(_ n: Int) -> String { "\(n) \(n == 1 ? "canción" : "canciones")" }
    static func people(_ n: Int) -> String { "\(n) \(n == 1 ? "persona" : "personas")" }

    /// The stepper's values in order: solo ver, 1…5, ilimitadas (nil).
    static let limits: [Int?] = [0, 1, 2, 3, 4, 5, nil]
    static let defaultLimit: Int? = 3

    static func limitLabel(_ l: Int?) -> String {
        guard let l else { return "ilimitadas" }
        return l == 0 ? "solo podrán ver la colección" : String(l)
    }

    /// "cada invitado pone 3 canciones" (the hero's italic line).
    static func heroLine(_ l: Int?) -> String {
        guard let l else { return "cada invitado agrega las canciones que quiera" }
        if l == 0 { return "solo para ver y escuchar" }
        return "cada invitado agrega \(songs(l))"
    }

    /// "tus 3" / "tu canción" / "tus canciones".
    static func yours(_ l: Int?) -> String {
        guard let l, l > 0 else { return "tus canciones" }
        return l == 1 ? "tu canción" : "tus \(l)"
    }

    /// "sus 3" / "su canción" / "sus canciones" (the host's empty state).
    static func theirs(_ l: Int?) -> String {
        guard let l, l > 0 else { return "sus canciones" }
        return l == 1 ? "su canción" : "sus \(l)"
    }

    /// The copy for a server that doesn't have parties yet (`503 unavailable`, `MIGRATION_0033_LIVE`).
    static let unavailableTitle = "las fiestas llegan muy pronto"
    static let unavailableNote = "Todavía no están listas en kura. Vuelve a abrir este link en unos días; sigue siendo el mismo."

    /// The toast / search copy for the same 503 (a write or a search while parties are off).
    static let unavailable = "Las fiestas llegan muy pronto."
    /// A party that answered 404 after we had it (deleted, you left, a block with the host).
    static let gone = "Esa fiesta ya no está disponible"
    /// 409 `too_many_parties` when the server sends no message of its own.
    static let tooManyParties = "Ya tienes 20 fiestas. Borra alguna para crear otra."
    /// 429 on "Crear link nuevo".
    static let rotateLimited = "Creaste varios links seguidos. Espera un momento para crear otro."
    /// 429 on any other party write or read.
    static let rateLimited = "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
    /// "Entrar a la fiesta" (`POST /invites/{token}/join`) that failed for no reason of its own.
    static let joinFailed = "No se pudo entrar a la fiesta. Vuelve a intentarlo."
    static let left = "Saliste de la fiesta"

    static let deadTitle = "este link ya no funciona"
    static let deadNote = "Lo desactivaron o ya venció. Pide uno nuevo a quien te invitó y vuelve a abrirlo."
}
