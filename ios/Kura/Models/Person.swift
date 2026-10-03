import SwiftUI

// People: `Person`, their collections and marks, notifications, reportar/bloquear and the people pages.

// MARK: - People

struct Person: Identifiable, Hashable, Decodable {
    var id: String { handle }
    let handle: String
    var name: String
    var initials: String
    /// Featured obsession tones [oscuro, claro]. Empty → no obsession yet.
    var hexes: [String]
    var featuredTitleID: String? = nil
    /// Only on `GET /me/following|followers`: a followed profile that went private
    /// (its card is dimmed; `GET /people/{handle}` would be a 404). Mock: request flow.
    var isPrivate = false
    var followers = 0
    var followingCount = 0
    var stats = PersonStats()
    /// Titles they're obsessed with (profile strip).
    var obsessions: [String] = []
    /// Titles in common with you.
    var common: [String] = []
    var collections: [PersonCollection] = []
    /// Discovery line ("le obsesiona El viaje de Chihiro").
    var why: String? = nil
    var avatarURL: URL? = nil
    /// Whether you follow them (from `GET /people/{handle}`); nil when unknown.
    var isFollowing: Bool? = nil
    /// `GET /people/{handle}` only: you blocked them (the profile still opens, to unblock).
    /// Absent on every other payload — the store keeps the truth in `AppStore.blocked`.
    var isBlocked = false
    /// `GET /people/{handle}` only (absent on the LITE cards): the owner's setting for who sees
    /// their followers / following lists, and whether YOU can open them right now (false
    /// whenever there's a block). nil = unknown (a card from a list, an older server).
    var followListsVisibility: FollowListsVisibility? = nil
    var canSeeFollowLists: Bool? = nil
    /// Titles embedded in the payload (obsessions / common), registered by the store.
    var embeddedTitles: [Title] = []

    init(handle: String, name: String, initials: String, hexes: [String], featuredTitleID: String? = nil,
         isPrivate: Bool = false, followers: Int = 0, followingCount: Int = 0, stats: PersonStats = PersonStats(),
         obsessions: [String] = [], common: [String] = [], collections: [PersonCollection] = [], why: String? = nil) {
        self.handle = handle; self.name = name; self.initials = initials; self.hexes = hexes
        self.featuredTitleID = featuredTitleID; self.isPrivate = isPrivate; self.followers = followers
        self.followingCount = followingCount; self.stats = stats; self.obsessions = obsessions
        self.common = common; self.collections = collections; self.why = why
    }

    static func initials(of name: String) -> String {
        let chars = name.split(separator: " ").prefix(2).compactMap(\.first)
        return chars.isEmpty ? "k" : String(chars).lowercased()
    }

    private enum CodingKeys: String, CodingKey {
        case handle, username, name, displayName, initials, hexes, featuredTitleId, isPrivate, followers, followersCount,
             followingCount, following, stats, obsessions, common, collections, why, reason, avatarUrl, isFollowing, isBlocked,
             followListsVisibility, canSeeFollowLists
    }

    /// Lists of titles come either as ids or as embedded `Title` objects.
    private struct IDOrTitle: Decodable {
        let id: String
        let title: Title?
        init(from decoder: Decoder) throws {
            if let s = try? decoder.singleValueContainer().decode(String.self) {
                id = s; title = nil
            } else {
                let t = try Title(from: decoder)
                id = t.id; title = t
            }
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        handle = try c.decodeIfPresent(String.self, forKey: .handle) ?? c.decodeIfPresent(String.self, forKey: .username) ?? ""
        let n = try c.decodeIfPresent(String.self, forKey: .name) ?? c.decodeIfPresent(String.self, forKey: .displayName) ?? handle
        name = n
        initials = try c.decodeIfPresent(String.self, forKey: .initials) ?? Person.initials(of: n)
        hexes = try c.decodeIfPresent([String].self, forKey: .hexes) ?? []
        featuredTitleID = try c.decodeIfPresent(String.self, forKey: .featuredTitleId)
        isPrivate = try c.decodeIfPresent(Bool.self, forKey: .isPrivate) ?? false
        followers = try c.decodeIfPresent(Int.self, forKey: .followers) ?? c.decodeIfPresent(Int.self, forKey: .followersCount) ?? 0
        followingCount = try c.decodeIfPresent(Int.self, forKey: .followingCount) ?? c.decodeIfPresent(Int.self, forKey: .following) ?? 0
        stats = try c.decodeIfPresent(PersonStats.self, forKey: .stats) ?? PersonStats()
        let obs = try c.decodeIfPresent([IDOrTitle].self, forKey: .obsessions) ?? []
        let com = try c.decodeIfPresent([IDOrTitle].self, forKey: .common) ?? []
        obsessions = obs.map(\.id)
        common = com.map(\.id)
        embeddedTitles = (obs + com).compactMap(\.title)
        collections = try c.decodeIfPresent([PersonCollection].self, forKey: .collections) ?? []
        why = try c.decodeIfPresent(String.self, forKey: .why) ?? c.decodeIfPresent(String.self, forKey: .reason)
        avatarURL = KuraRuntime.resolve(try c.decodeIfPresent(String.self, forKey: .avatarUrl))
        isFollowing = try c.decodeIfPresent(Bool.self, forKey: .isFollowing)
        isBlocked = try c.decodeIfPresent(Bool.self, forKey: .isBlocked) ?? false
        // An unknown value from a newer server reads as "unknown", never as a decode failure.
        followListsVisibility = (try? c.decodeIfPresent(String.self, forKey: .followListsVisibility))
            .flatMap(FollowListsVisibility.init(rawValue:))
        canSeeFollowLists = try c.decodeIfPresent(Bool.self, forKey: .canSeeFollowLists)
    }
}

/// Who sees your followers / following lists (`followListsVisibility`, `PATCH /me`). The counts
/// are public whatever this says; only the LISTS follow it. The server's default is `private`.
enum FollowListsVisibility: String, CaseIterable, Hashable, Sendable {
    case `public`, mutuals, `private`

    /// Ajustes › privacidad (same words as the web).
    var label: String {
        switch self {
        case .public: return "Todos"
        case .mutuals: return "Seguidores mutuos"
        case .private: return "Solo yo"
        }
    }

    /// What someone who can't see the list reads — the server's 403 copy, word for word
    /// (`people/_lib/follow-lists.ts`).
    var deniedNote: String {
        switch self {
        case .mutuals: return "Solo sus seguidores mutuos pueden ver esta lista."
        case .public, .private: return "Esta persona mantiene privada esta lista."
        }
    }
}

struct PersonStats: Hashable, Decodable {
    var obsessed = 0
    var completed = 0
    var liked = 0
    var reviews = 0

    init(obsessed: Int = 0, completed: Int = 0, liked: Int = 0, reviews: Int = 0) {
        self.obsessed = obsessed; self.completed = completed; self.liked = liked; self.reviews = reviews
    }

    private enum CodingKeys: String, CodingKey { case obsessed, completed, liked, reviews }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        obsessed = try c.decodeIfPresent(Int.self, forKey: .obsessed) ?? 0
        completed = try c.decodeIfPresent(Int.self, forKey: .completed) ?? 0
        liked = try c.decodeIfPresent(Int.self, forKey: .liked) ?? 0
        reviews = try c.decodeIfPresent(Int.self, forKey: .reviews) ?? 0
    }
}

struct PersonCollection: Hashable, Identifiable, Decodable {
    var id: String { name }
    let name: String
    let titleIDs: [String]
    var privacy: Privacy = .publicAccess
    /// The backend id (for `GET /people/{handle}/collections/{id}`).
    var remoteID: String? = nil
    /// The fan's front (`coverTitleId`).
    var coverTitleID: String? = nil
    var vibe: String? = nil
    var pinned = false
    /// Up to three (`fanTitleIds`); without it, the front then the order (`FanOrder.fan`).
    var fanTitleIDs: [String] = []

    init(name: String, titleIDs: [String], privacy: Privacy = .publicAccess, remoteID: String? = nil,
         vibe: String? = nil, pinned: Bool = false, fanTitleIDs: [String]? = nil) {
        self.name = name; self.titleIDs = titleIDs; self.privacy = privacy; self.remoteID = remoteID
        self.vibe = vibe; self.pinned = pinned
        self.fanTitleIDs = fanTitleIDs ?? FanOrder.fan(titleIDs, cover: nil)
    }

    /// The id its public page answers to (the mock's people have no backend id: their name).
    var routeID: String { remoteID ?? name }

    var shownVibe: String? {
        guard let v = vibe?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else { return nil }
        return v
    }

    private enum CodingKeys: String, CodingKey { case id, name, titleIds, visibility, coverTitleId, vibe, pinned, fanTitleIds }

    /// `vibe`, `pinned`, `fanTitleIds` are new (curation contract): absent = none / false / derived.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        remoteID = try c.decodeIfPresent(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        titleIDs = try c.decodeIfPresent([String].self, forKey: .titleIds) ?? []
        privacy = try c.decodeIfPresent(String.self, forKey: .visibility).map(Privacy.init(wire:)) ?? .publicAccess
        coverTitleID = try c.decodeIfPresent(String.self, forKey: .coverTitleId)
        vibe = try c.decodeIfPresent(String.self, forKey: .vibe)
        pinned = try c.decodeIfPresent(Bool.self, forKey: .pinned) ?? false
        let fan = try c.decodeIfPresent([String].self, forKey: .fanTitleIds)
        fanTitleIDs = fan.map { Array($0.prefix(3)) } ?? FanOrder.fan(titleIDs, cover: coverTitleID)
    }
}

/// What someone you follow did with a title ("gente que sigues").
/// Wire (`GET /titles/{id}.following[]`): `{ handle, mark }`.
struct PeopleMark: Hashable, Decodable {
    let personID: String
    /// nil → waiting ("No puede esperar").
    let mark: Mark?
    var suffix: String? = nil
    /// The person, when the payload embeds it.
    var person: Person? = nil

    init(personID: String, mark: Mark?, suffix: String? = nil) {
        self.personID = personID; self.mark = mark; self.suffix = suffix
    }

    private enum CodingKeys: String, CodingKey { case handle, mark, suffix, person }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let p = try c.decodeIfPresent(Person.self, forKey: .person)
        personID = try c.decodeIfPresent(String.self, forKey: .handle) ?? p?.handle ?? ""
        mark = Mark.lenient(try c.decodeIfPresent(String.self, forKey: .mark))
        suffix = try c.decodeIfPresent(String.self, forKey: .suffix)
        person = p
    }
}

/// A creator (director, artist) — O7 ficha de persona.
struct Creator: Hashable, Identifiable {
    var id: String { name }
    let name: String
    let role: String
    let works: Int
    var initials: String {
        String(name.split(separator: " ").prefix(2).compactMap(\.first)).lowercased()
    }
}

// MARK: - Notifications (31a) — local only until the API has a model (§4, 501)

// ⚠️ Solo mock / no-op en live: `KNotification`, `NotificationKind` y `RequestState` solo existen
// en memoria. En live nada los llena (no hay `GET /me/notifications`), así que la campana del
// feed siempre abre vacía y sin punto; `AppStore.setRequest` / `markNotificationsRead` no llaman
// a la API. Haría falta en el servidor: tabla de notificaciones, lectura paginada, marcar leídas
// y — para `followRequest` — el modelo de solicitudes de seguimiento (hoy solo se siguen perfiles
// públicos). Los avisos que SÍ son reales en live son los push (`Push.swift`).

enum NotificationKind: Hashable {
    case followRequest(personID: String)
    case release(titleID: String, text: String)
    case newFollower(personID: String)
    case recap(text: String)
    case followers(ids: [String], more: Int)
}

enum RequestState: Hashable { case pending, approved, rejected }

struct KNotification: Identifiable, Hashable {
    let id: String
    let kind: NotificationKind
    let age: String
    var unread: Bool
    var thisWeek: Bool
}

// MARK: - Safety (reportar · bloquear, App Review 1.2)

/// What a report points at. A review carries its title so the sheet can drop
/// "Spoiler sin marcar" on albums (no spoiler switch there, like the web).
enum ReportTarget: Hashable {
    case person(handle: String)
    case review(id: String, authorHandle: String, titleID: String)

    var isReview: Bool { if case .review = self { return true }; return false }
}

/// One reason in the report sheet: `id` is the wire value, `label` the copy (same as the web).
struct ReportReason: Hashable, Identifiable {
    let id: String
    let label: String

    /// `POST /people/{handle}/report`.
    static let profile: [ReportReason] = [
        ReportReason(id: "spam", label: "Spam"),
        ReportReason(id: "impersonation", label: "Se hace pasar por otra persona"),
        ReportReason(id: "harassment", label: "Acoso"),
        ReportReason(id: "illegal_content", label: "Contenido ilegal"),
        ReportReason(id: "other", label: "Otro")
    ]

    /// `POST /reviews/{id}/report`.
    static let review: [ReportReason] = [
        ReportReason(id: "unmarked_spoiler", label: "Spoiler sin marcar"),
        ReportReason(id: "spam", label: "Spam"),
        ReportReason(id: "harassment", label: "Acoso"),
        ReportReason(id: "hate", label: "Odio o discriminación"),
        ReportReason(id: "illegal_content", label: "Contenido ilegal"),
        ReportReason(id: "off_topic", label: "No habla de la obra"),
        ReportReason(id: "other", label: "Otro")
    ]

    /// `details` on a profile report: at most 500 characters (server-checked too).
    static let detailsLimit = 500
}

/// A row of `GET /me/blocks`. `handle` (and `avatarUrl`) are null once the blocked account is no
/// longer public — the server then sends `name: "Perfil privado"` — so unblocking goes by `id`
/// (`DELETE /me/blocks/{handleOrId}` takes either).
struct BlockedAccount: Identifiable, Hashable, Decodable {
    let id: String
    let handle: String?
    var name: String
    var avatarURL: URL?

    init(id: String, handle: String?, name: String, avatarURL: URL? = nil) {
        self.id = id; self.handle = handle; self.name = name; self.avatarURL = avatarURL
    }

    /// What `DELETE /me/blocks/{…}` takes.
    var key: String { handle ?? id }

    /// For the seal (initials / photo): never registered in the store.
    var person: Person {
        var p = Person(handle: handle ?? "", name: name, initials: Person.initials(of: name), hexes: [])
        p.avatarURL = avatarURL
        return p
    }

    private enum CodingKeys: String, CodingKey { case id, handle, name, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        let h = try c.decodeIfPresent(String.self, forKey: .handle)
        handle = (h?.isEmpty ?? true) ? nil : h
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? h ?? ""
        avatarURL = KuraRuntime.resolve(try c.decodeIfPresent(String.self, forKey: .avatarUrl))
    }
}

struct PeoplePage: Decodable {
    var items: [Person]
    var nextCursor: String?
    /// `GET /people/{handle}/followers|following`: the rest of the list (private, no handle, a
    /// block with you) as a number, never as identities. Page 1 only (0 after). 0 elsewhere.
    var anonymousCount = 0
    /// The page had elements and this build could read none of them (a later page reads as empty
    /// instead of failing, `PageContract`): the list is NOT complete (`AppStore.allPeople`).
    var unreadable = false
    private struct Blank: Decodable {}
    init(items: [Person], nextCursor: String? = nil, anonymousCount: Int = 0) {
        self.items = items; self.nextCursor = nextCursor; self.anonymousCount = anonymousCount
    }
    private enum CodingKeys: String, CodingKey { case items, nextCursor, anonymousCount }
    init(from decoder: Decoder) throws {
        // `GET /people/suggestions` and `/people/search` return a bare array; the
        // owner lists return `{ items, nextCursor }`. Accept both.
        // Either way the list IS the page (`LossyPage`): a person this build can't read is
        // dropped, never the whole list.
        if (try? decoder.unkeyedContainer()) != nil {
            items = try LossyPage<Person>(from: decoder).items; nextCursor = nil
        } else {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            items = try c.lossyPage([Person].self, forKey: .items) ?? []
            nextCursor = try c.decodeIfPresent(String.self, forKey: .nextCursor)
            anonymousCount = try c.decodeIfPresent(Int.self, forKey: .anonymousCount) ?? 0
            if items.isEmpty, let raw = try? c.decodeIfPresent([Blank].self, forKey: .items), !raw.isEmpty { unreadable = true }
        }
    }
}

enum PeopleKind: Hashable {
    /// YOUR lists (`GET /me/following|followers`), whole.
    case following, followers, suggestions
    case search(String)
    /// Someone else's lists (`GET /people/{handle}/followers|following`), by their setting.
    case followersOf(String), followingOf(String)
}
