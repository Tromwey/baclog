import SwiftUI

// MARK: - Wire conventions (API.md §1)
//
// Every model that comes over the wire is `Decodable` and TOLERANT: unknown keys
// are ignored (Swift's default), anything §3 marks optional or nonexistent is
// read with `decodeIfPresent`, and dates go through `KuraJSON.decoder`, which
// accepts ISO 8601 with and without fractional seconds. Request bodies are
// separate `Encodable` structs (see `LiveAPI.swift`) so the read models never
// need to round-trip.

enum KuraJSON {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let dateOnly: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate, .withDashSeparatorInDate]
        return f
    }()

    static func date(from s: String) -> Date? {
        withFraction.date(from: s) ?? plain.date(from: s) ?? dateOnly.date(from: s)
    }

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            guard let d = date(from: s) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Fecha ISO 8601 inválida: \(s)")
            }
            return d
        }
        return d
    }()

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    /// A calendar day pinned to 12:00 UTC so `startOfDay` lands on the same
    /// date in every time zone the app can run in (the backend sends release
    /// days as UTC midnight, which is "yesterday" in Mexico City).
    static func utcNoon(year: Int, month: Int, day: Int) -> Date? {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c.date(from: DateComponents(year: year, month: month, day: day, hour: 12))
    }

    static func utcComponents(_ d: Date) -> DateComponents {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c.dateComponents([.year, .month, .day], from: d)
    }

    static func dayAtNoon(_ d: Date) -> Date {
        let c = utcComponents(d)
        return utcNoon(year: c.year ?? 1970, month: c.month ?? 1, day: c.day ?? 1) ?? d
    }

    /// "12,4 k" / "48,7 k" / "214" — the ribbon format the frames use.
    static func count(_ n: Int) -> String {
        if n >= 1_000_000 { return trimmed(Double(n) / 1_000_000) + " M" }
        if n >= 1_000 { return trimmed(Double(n) / 1_000) + " k" }
        return String(n)
    }

    private static func trimmed(_ v: Double) -> String {
        let s = String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
        return s.hasSuffix(",0") ? String(s.dropLast(2)) : s
    }
}

/// Runtime switches that a model needs before the store exists.
enum KuraRuntime {
    /// True when the app runs on `MockAPI` (`-kuraScreen` / `-kuraMock`).
    nonisolated(unsafe) static var usesMock = false
    /// Origin of `KURA_API_BASE` (no `/api/v1`): relative `avatarUrl`s resolve against it.
    nonisolated(unsafe) static var apiOrigin: URL?
    /// The session's bearer, for requests outside `APIClient` (profile photos on
    /// `/api/avatar`, which serve a private account's photo only to its owner).
    nonisolated(unsafe) static var bearer: @Sendable () -> String? = { nil }

    /// `avatarUrl` may come relative (`/api/avatar/{key}`).
    static func resolve(_ raw: String?) -> URL? {
        guard let raw, !raw.isEmpty else { return nil }
        if raw.hasPrefix("/") { return URL(string: raw, relativeTo: apiOrigin)?.absoluteURL }
        return URL(string: raw)
    }
}

// MARK: - Formats

enum MediaFormat: String, CaseIterable, Identifiable, Hashable, Codable {
    case film, series, album

    var id: String { rawValue }

    /// Segmented / chip label ("Cine").
    var label: String {
        switch self {
        case .film: return "Cine"
        case .series: return "Series"
        case .album: return "Música"
        }
    }

    /// Section name inside a collection (Newsreader, lowercase).
    var sectionName: String {
        switch self {
        case .film: return "cine"
        case .series: return "series"
        case .album: return "música"
        }
    }

    /// Singular for meta lines ("Cine · 2001").
    var metaLabel: String {
        switch self {
        case .film: return "Cine"
        case .series: return "Serie"
        case .album: return "Álbum"
        }
    }

    var symbol: String {
        switch self {
        case .film: return "film"
        case .series: return "tv"
        case .album: return "music.note"
        }
    }

    /// width / height — póster 2:3, disco 1:1.
    var aspect: CGFloat { self == .album ? 1 : 2.0 / 3.0 }
}

// MARK: - Marks (your reaction / state)

/// The per-title state. `liked` and `obsessed` imply completed; `completed`
/// is "Solo completo". `nil` means saved without a state.
enum Mark: String, CaseIterable, Hashable, Codable {
    case liked, obsessed, completed

    var glyph: Glyph {
        switch self {
        case .liked: return .thumb
        case .obsessed: return .flame
        case .completed: return .check
        }
    }

    /// First person — for what's yours.
    var myLabel: String {
        switch self {
        case .liked: return "Me gusta"
        case .obsessed: return "Me obsesiona"
        case .completed: return "Completo"
        }
    }

    /// Third person — for others.
    var theirLabel: String {
        switch self {
        case .liked: return "Le gusta"
        case .obsessed: return "Le obsesiona"
        case .completed: return "Completo"
        }
    }

    /// Order used by "Ordenar · Estado".
    var rank: Int {
        switch self {
        case .obsessed: return 0
        case .liked: return 1
        case .completed: return 2
        }
    }

    /// `PublicMark` (feed, reviews, "gente que sigues") adds `disliked`, which
    /// Kura has no glyph for: it reads as completed. Unknown strings → nil.
    static func lenient(_ raw: String?) -> Mark? {
        guard let raw else { return nil }
        if raw == "disliked" { return .completed }
        return Mark(rawValue: raw)
    }
}

// MARK: - Release ("no puedo esperar")

/// Only for announced titles. Drives the automatic "no puedo esperar" collection.
/// Wire: `{ kind: "day"|"month"|"year"|"unknown", date? }`.
enum Release: Hashable, Decodable {
    case day(Date)
    case month(year: Int, month: Int)
    case year(Int)
    case unknown

    private enum CodingKeys: String, CodingKey { case kind, date }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? "unknown"
        let date = try c.decodeIfPresent(Date.self, forKey: .date)
        let comps = date.map(KuraJSON.utcComponents)
        switch kind {
        case "day":
            if let date { self = .day(KuraJSON.dayAtNoon(date)) } else { self = .unknown }
        case "month":
            if let y = comps?.year, let m = comps?.month { self = .month(year: y, month: m) } else { self = .unknown }
        case "year":
            if let y = comps?.year { self = .year(y) } else { self = .unknown }
        default:
            self = .unknown
        }
    }
}

// MARK: - Title

struct Track: Hashable, Identifiable, Decodable {
    var id: Int { number }
    let number: Int
    let name: String
    var isNew: Bool = false
    var available: Bool = true

    init(number: Int, name: String, isNew: Bool = false, available: Bool = true) {
        self.number = number; self.name = name; self.isNew = isNew; self.available = available
    }

    private enum CodingKeys: String, CodingKey { case number, name, title, isNew, available }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        number = try c.decodeIfPresent(Int.self, forKey: .number) ?? 0
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? c.decodeIfPresent(String.self, forKey: .title) ?? ""
        isNew = try c.decodeIfPresent(Bool.self, forKey: .isNew) ?? false
        available = try c.decodeIfPresent(Bool.self, forKey: .available) ?? true
    }
}

/// Episode list — mock only (the wire has no episodes, §4 → 501).
struct Season: Hashable, Identifiable, Decodable {
    var id: Int { number }
    let number: Int
    let episodes: [String]
}

/// Wire `seriesStatus { kind: ended|airing, seasons }`.
struct SeriesStatus: Hashable, Decodable {
    let kind: String
    let seasons: Int
    private enum CodingKeys: String, CodingKey { case kind, seasons }
    init(kind: String, seasons: Int) { self.kind = kind; self.seasons = seasons }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? "ended"
        seasons = try c.decodeIfPresent(Int.self, forKey: .seasons) ?? 0
    }
}

struct WatchOption: Hashable, Identifiable, Decodable {
    var id: String { name }
    let short: String
    let name: String
    let kind: String
    /// Deep link from JustWatch / the preferred music service, when the API has one.
    var url: URL? = nil
    /// Theatrical row ("En cines"): its label is computed from the release date.
    var isCinema: Bool { short == "cine" }

    init(short: String, name: String, kind: String, url: URL? = nil) {
        self.short = short; self.name = name; self.kind = kind; self.url = url
    }

    private enum CodingKeys: String, CodingKey { case short, name, provider, kind, url }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let n = try c.decodeIfPresent(String.self, forKey: .name) ?? c.decodeIfPresent(String.self, forKey: .provider) ?? ""
        name = n
        short = try c.decodeIfPresent(String.self, forKey: .short) ?? String(n.lowercased().prefix(3))
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? ""
        url = try c.decodeIfPresent(String.self, forKey: .url).flatMap(URL.init(string:))
    }
}

/// Ribbon counts. Strings because the frames show "12,4 k"; anything the API
/// doesn't have (`liked`, `saved`, `waiting`) is "—" / nil and the ribbon skips it.
struct TitleCounts: Hashable, Decodable {
    var obsessed: String
    var liked: String
    var completed: String
    var waiting: String? = nil
    var saved: String

    init(obsessed: String, liked: String, completed: String, waiting: String? = nil, saved: String) {
        self.obsessed = obsessed; self.liked = liked; self.completed = completed; self.waiting = waiting; self.saved = saved
    }

    private enum CodingKeys: String, CodingKey { case obsessed, liked, completed, waiting, saved }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func s(_ k: CodingKeys) throws -> String? { try c.decodeIfPresent(Int.self, forKey: k).map(KuraJSON.count) }
        obsessed = try s(.obsessed) ?? "—"
        liked = try s(.liked) ?? "—"
        completed = try s(.completed) ?? "—"
        waiting = try s(.waiting)
        saved = try s(.saved) ?? "—"
    }
}

struct Title: Identifiable, Hashable, Decodable {
    let id: String
    var name: String
    var format: MediaFormat
    var year: Int?
    /// `byline` on the wire (`String | null`): studio/network on video (often null), artist on music.
    /// Never "" — an empty byline decodes to nil so no "·" is left hanging.
    var creator: String?
    /// "125 min", "2 temporadas", "18 canciones".
    var detail: String? = nil
    var palette: [String]
    var coverURL: URL?
    var synopsis: String? = nil
    /// Set for announced titles (saved before release).
    var release: Release? = nil
    /// Series: announced next season number.
    var upcomingSeason: Int? = nil
    var tracks: [Track] = []
    var trackCount: Int? = nil
    var seasons: [Season] = []
    var counts: TitleCounts? = nil
    var watch: [WatchOption] = []
    var musicLink: String? = nil
    /// Line under "dónde ver" (e.g. "Todavía no está en streaming en México.").
    var watchNote: String? = nil
    /// E4 · not available here: where it is instead.
    var watchElsewhere: String? = nil
    /// Search results not yet cached by the backend carry this instead of a real id.
    var externalRef: ExternalRef? = nil
    var genre: String? = nil
    var seriesStatus: SeriesStatus? = nil

    var lowerCreator: String? { creator?.lowercased() }
    /// The creator's last word ("Miyazaki") for tight meta lines; nil when there's no creator.
    var creatorShort: String? { creator?.split(separator: " ").last.map(String.init) }
    var isExternal: Bool { externalRef != nil }
    /// `GET /titles/{id}` filled the detail fields (summary payloads don't).
    var isDetailed: Bool { synopsis != nil || counts != nil || !watch.isEmpty || !tracks.isEmpty }

    init(id: String, name: String, format: MediaFormat, year: Int? = nil, creator: String?, detail: String? = nil,
         palette: [String], coverURL: URL? = nil, synopsis: String? = nil, release: Release? = nil,
         upcomingSeason: Int? = nil, tracks: [Track] = [], trackCount: Int? = nil, seasons: [Season] = [],
         counts: TitleCounts? = nil, watch: [WatchOption] = [], musicLink: String? = nil,
         watchNote: String? = nil, watchElsewhere: String? = nil, externalRef: ExternalRef? = nil) {
        self.id = id; self.name = name; self.format = format; self.year = year; self.creator = creator
        self.detail = detail; self.palette = palette; self.coverURL = coverURL; self.synopsis = synopsis
        self.release = release; self.upcomingSeason = upcomingSeason; self.tracks = tracks; self.trackCount = trackCount
        self.seasons = seasons; self.counts = counts; self.watch = watch; self.musicLink = musicLink
        self.watchNote = watchNote; self.watchElsewhere = watchElsewhere; self.externalRef = externalRef
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, title, format, year, creator, byline, detail, palette, coverUrl, synopsis, overview, release,
             upcomingSeason, tracks, trackCount, seasons, counts, watch, musicLink, watchNote, watchElsewhere, externalRef,
             genre, seriesStatus
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        externalRef = try c.decodeIfPresent(ExternalRef.self, forKey: .externalRef)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? externalRef?.localID ?? UUID().uuidString
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? c.decodeIfPresent(String.self, forKey: .title) ?? ""
        format = try c.decodeIfPresent(MediaFormat.self, forKey: .format) ?? .film
        year = try c.decodeIfPresent(Int.self, forKey: .year)
        let byline = try c.decodeIfPresent(String.self, forKey: .creator) ?? c.decodeIfPresent(String.self, forKey: .byline)
        creator = byline.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
        detail = try c.decodeIfPresent(String.self, forKey: .detail)
        palette = try c.decodeIfPresent([String].self, forKey: .palette) ?? []
        coverURL = try c.decodeIfPresent(String.self, forKey: .coverUrl).flatMap(URL.init(string:))
        synopsis = try c.decodeIfPresent(String.self, forKey: .synopsis) ?? c.decodeIfPresent(String.self, forKey: .overview)
        release = try c.decodeIfPresent(Release.self, forKey: .release)
        upcomingSeason = try c.decodeIfPresent(Int.self, forKey: .upcomingSeason)
        tracks = try c.decodeIfPresent([Track].self, forKey: .tracks) ?? []
        trackCount = try c.decodeIfPresent(Int.self, forKey: .trackCount)
        seasons = try c.decodeIfPresent([Season].self, forKey: .seasons) ?? []
        counts = try c.decodeIfPresent(TitleCounts.self, forKey: .counts)
        // `watch` is "one JustWatch option" — accept a single object or an array.
        if let one = try? c.decodeIfPresent(WatchOption.self, forKey: .watch) {
            watch = [one]
        } else {
            watch = try c.decodeIfPresent([WatchOption].self, forKey: .watch) ?? []
        }
        musicLink = try c.decodeIfPresent(String.self, forKey: .musicLink)
        watchNote = try c.decodeIfPresent(String.self, forKey: .watchNote)
        watchElsewhere = try c.decodeIfPresent(String.self, forKey: .watchElsewhere)
        genre = try c.decodeIfPresent(String.self, forKey: .genre)
        seriesStatus = try c.decodeIfPresent(SeriesStatus.self, forKey: .seriesStatus)
        if detail == nil, let s = seriesStatus, s.seasons > 0 {
            detail = s.seasons == 1 ? "1 temporada" : "\(s.seasons) temporadas"
        }
    }
}

/// `{ source: "tmdb"|"itunes", externalId }` — a catalog item the backend
/// hasn't cached yet. Saving it sends the ref; the response carries the real id.
struct ExternalRef: Hashable, Codable {
    let source: String
    let externalId: String

    /// Stable local id until the backend gives us a real one.
    var localID: String { "ext:\(source):\(externalId)" }

    static func parse(localID: String) -> ExternalRef? {
        let parts = localID.split(separator: ":", maxSplits: 2).map(String.init)
        guard parts.count == 3, parts[0] == "ext" else { return nil }
        return ExternalRef(source: parts[1], externalId: parts[2])
    }
}

/// How a title is named when writing: by id, or by external ref (§4 PUT membership).
enum TitleRef: Hashable, Encodable {
    case id(String)
    case external(source: String, externalId: String)

    /// The local id → the right ref (external ids are prefixed `ext:`).
    static func from(localID: String) -> TitleRef {
        if let e = ExternalRef.parse(localID: localID) { return .external(source: e.source, externalId: e.externalId) }
        return .id(localID)
    }

    var isExternal: Bool { if case .external = self { return true } else { return false } }

    private enum CodingKeys: String, CodingKey { case id, externalRef }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .id(let id): try c.encode(id, forKey: .id)
        case .external(let s, let e): try c.encode(ExternalRef(source: s, externalId: e), forKey: .externalRef)
        }
    }
}

/// `GET /search` item: a partial `Title` plus, for uncached items, `externalRef`.
struct SearchResult: Identifiable, Hashable, Decodable {
    let title: Title
    var id: String { title.id }
    var ref: TitleRef { TitleRef.from(localID: title.id) }

    init(title: Title) { self.title = title }
    init(from decoder: Decoder) throws { title = try Title(from: decoder) }
}

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
             followingCount, following, stats, obsessions, common, collections, why, reason, avatarUrl, isFollowing
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

/// The signed-in account (`GET /me`). Superset of `Person`: `handle` is nil
/// until claimed, plus the settings the API owns.
struct Me: Hashable, Decodable {
    var handle: String?
    var name: String
    var initials: String
    var hexes: [String]
    var featuredTitleID: String?
    var followers: Int
    var followingCount: Int
    var stats: PersonStats
    var email: String?
    var preferredService: String?
    var notifyReleases: Bool
    var isPublic: Bool
    var avatarURL: URL?
    var isFounder: Bool
    /// `onboardingComplete` — `name` is set; the app skips the onboarding. Absent → assumed done.
    var onboarded: Bool

    var person: Person {
        var p = Person(handle: handle ?? "", name: name, initials: initials, hexes: hexes, featuredTitleID: featuredTitleID,
                       isPrivate: !isPublic, followers: followers, followingCount: followingCount, stats: stats)
        p.avatarURL = avatarURL
        return p
    }

    init(person p: Person, email: String? = nil, preferredService: String? = nil, notifyReleases: Bool = true,
         isPublic: Bool = true, onboarded: Bool = true) {
        handle = p.handle.isEmpty ? nil : p.handle
        name = p.name; initials = p.initials; hexes = p.hexes; featuredTitleID = p.featuredTitleID
        followers = p.followers; followingCount = p.followingCount; stats = p.stats
        self.email = email; self.preferredService = preferredService; self.notifyReleases = notifyReleases
        self.isPublic = isPublic; avatarURL = p.avatarURL; isFounder = false; self.onboarded = onboarded
    }

    private enum CodingKeys: String, CodingKey {
        case handle, username, name, displayName, initials, hexes, featuredTitleId, followers, followersCount, followingCount,
             stats, email, preferredService, notifyReleases, isPublic, avatarUrl, isFounder, onboardingComplete
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let h = try c.decodeIfPresent(String.self, forKey: .handle) ?? c.decodeIfPresent(String.self, forKey: .username)
        handle = (h?.isEmpty ?? true) ? nil : h
        let n = try c.decodeIfPresent(String.self, forKey: .name) ?? c.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        name = n
        initials = try c.decodeIfPresent(String.self, forKey: .initials) ?? Person.initials(of: n.isEmpty ? (handle ?? "k") : n)
        hexes = try c.decodeIfPresent([String].self, forKey: .hexes) ?? []
        featuredTitleID = try c.decodeIfPresent(String.self, forKey: .featuredTitleId)
        followers = try c.decodeIfPresent(Int.self, forKey: .followers) ?? c.decodeIfPresent(Int.self, forKey: .followersCount) ?? 0
        followingCount = try c.decodeIfPresent(Int.self, forKey: .followingCount) ?? 0
        stats = try c.decodeIfPresent(PersonStats.self, forKey: .stats) ?? PersonStats()
        email = try c.decodeIfPresent(String.self, forKey: .email)
        preferredService = try c.decodeIfPresent(String.self, forKey: .preferredService)
        notifyReleases = try c.decodeIfPresent(Bool.self, forKey: .notifyReleases) ?? true
        isPublic = try c.decodeIfPresent(Bool.self, forKey: .isPublic) ?? true
        avatarURL = KuraRuntime.resolve(try c.decodeIfPresent(String.self, forKey: .avatarUrl))
        isFounder = try c.decodeIfPresent(Bool.self, forKey: .isFounder) ?? false
        onboarded = try c.decodeIfPresent(Bool.self, forKey: .onboardingComplete) ?? !n.isEmpty
    }
}

struct PersonCollection: Hashable, Identifiable, Decodable {
    var id: String { name }
    let name: String
    let titleIDs: [String]
    var privacy: Privacy = .publicAccess
    /// The backend id (for `GET /people/{handle}/collections/{id}`).
    var remoteID: String? = nil
    var coverTitleID: String? = nil

    init(name: String, titleIDs: [String], privacy: Privacy = .publicAccess, remoteID: String? = nil) {
        self.name = name; self.titleIDs = titleIDs; self.privacy = privacy; self.remoteID = remoteID
    }

    private enum CodingKeys: String, CodingKey { case id, name, titleIds, visibility, coverTitleId }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        remoteID = try c.decodeIfPresent(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        titleIDs = try c.decodeIfPresent([String].self, forKey: .titleIds) ?? []
        privacy = try c.decodeIfPresent(String.self, forKey: .visibility).map(Privacy.init(wire:)) ?? .publicAccess
        coverTitleID = try c.decodeIfPresent(String.self, forKey: .coverTitleId)
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

// MARK: - Reviews

struct Review: Identifiable, Hashable, Decodable {
    let id: String
    let authorID: String
    let titleID: String
    var text: String
    var mark: Mark?
    var spoiler: Bool
    var date: Date
    /// The author, when embedded.
    var author: Person? = nil

    init(id: String, authorID: String, titleID: String, text: String, mark: Mark?, spoiler: Bool, date: Date) {
        self.id = id; self.authorID = authorID; self.titleID = titleID; self.text = text
        self.mark = mark; self.spoiler = spoiler; self.date = date
    }

    /// Own review only: moderation hid it (edits don't un-hide).
    var hidden = false

    private enum CodingKeys: String, CodingKey {
        case id, authorHandle, author, titleId, catalogItemId, body, text, mark, hasSpoiler, spoiler, createdAt, hidden
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let a = try c.decodeIfPresent(Person.self, forKey: .author)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        authorID = try c.decodeIfPresent(String.self, forKey: .authorHandle) ?? a?.handle ?? ""
        titleID = try c.decodeIfPresent(String.self, forKey: .titleId) ?? c.decodeIfPresent(String.self, forKey: .catalogItemId) ?? ""
        text = try c.decodeIfPresent(String.self, forKey: .body) ?? c.decodeIfPresent(String.self, forKey: .text) ?? ""
        mark = Mark.lenient(try c.decodeIfPresent(String.self, forKey: .mark))
        spoiler = try c.decodeIfPresent(Bool.self, forKey: .hasSpoiler) ?? c.decodeIfPresent(Bool.self, forKey: .spoiler) ?? false
        date = try c.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        hidden = try c.decodeIfPresent(Bool.self, forKey: .hidden) ?? false
        author = a
    }
}

// MARK: - Collections

/// Who sees a collection. Wire (`visibility`): `private` | `link` | `profile`.
/// `.followers` is what the K1a/K1b frames ask for but the model doesn't have
/// yet (API.md §7.4): it's only offered on the mock and encodes as `link`.
enum Privacy: String, CaseIterable, Identifiable, Hashable {
    case publicAccess, followers, onlyMe, link
    var id: String { rawValue }

    /// The choices the current backend can persist.
    static var options: [Privacy] {
        KuraRuntime.usesMock ? [.publicAccess, .followers, .onlyMe] : [.publicAccess, .link, .onlyMe]
    }

    var label: String {
        switch self {
        case .publicAccess: return "Pública"
        case .followers: return "Seguidores"
        case .onlyMe: return "Solo yo"
        case .link: return "Con link"
        }
    }

    var note: String {
        switch self {
        case .publicAccess: return "En tu perfil y con el link, con o sin cuenta."
        case .followers: return "Solo quien te sigue."
        case .onlyMe: return "No aparece en tu perfil."
        case .link: return "Quien tenga el link la ve; no aparece en tu perfil."
        }
    }

    var symbol: String {
        switch self {
        case .publicAccess: return "globe"
        case .followers: return "person.2.fill"
        case .onlyMe: return "lock.fill"
        case .link: return "link"
        }
    }

    var wire: String {
        switch self {
        case .publicAccess: return "profile"
        case .onlyMe: return "private"
        case .link, .followers: return "link"
        }
    }

    init(wire: String) {
        switch wire {
        case "profile", "public": self = .publicAccess
        case "link": self = .link
        case "followers": self = .followers
        default: self = .onlyMe
        }
    }
}

enum SortMode: String, CaseIterable, Identifiable, Hashable, Codable {
    case manual, recent, title, status, year
    var id: String { rawValue }
    var label: String {
        switch self {
        case .manual: return "Manual"
        case .recent: return "Recientes"
        case .title: return "Título"
        case .status: return "Estado"
        case .year: return "Año"
        }
    }
    var note: String? { self == .manual ? "arrastrar" : nil }
}

enum CollectionLayout: String, Hashable, Codable {
    case covers, list
}

struct KCollection: Identifiable, Hashable, Decodable {
    let id: String
    var name: String
    var titleIDs: [String]
    var privacy: Privacy
    /// Local (device) — the API has no model for these (§3).
    var pinned: Bool = false
    var coverTitleID: String? = nil
    var sort: SortMode = .manual
    var layout: CollectionLayout = .covers
    var createdAt: Date
    var addedAt: [String: Date] = [:]
    /// Titles embedded by the API (`GET /collections/{id}`), registered by the store.
    var embeddedTitles: [Title] = []
    var embeddedStates: [String: UserTitleState] = [:]

    init(id: String, name: String, titleIDs: [String], privacy: Privacy, pinned: Bool = false, coverTitleID: String? = nil,
         sort: SortMode = .manual, layout: CollectionLayout = .covers, createdAt: Date, addedAt: [String: Date] = [:]) {
        self.id = id; self.name = name; self.titleIDs = titleIDs; self.privacy = privacy; self.pinned = pinned
        self.coverTitleID = coverTitleID; self.sort = sort; self.layout = layout; self.createdAt = createdAt; self.addedAt = addedAt
    }

    var slug: String {
        let folded = name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "es"))
        return folded.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).joined(separator: "-")
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, titleIds, visibility, coverTitleId, createdAt, addedAt, titles, states
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        privacy = try c.decodeIfPresent(String.self, forKey: .visibility).map(Privacy.init(wire:)) ?? .onlyMe
        coverTitleID = try c.decodeIfPresent(String.self, forKey: .coverTitleId)
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        addedAt = try c.decodeIfPresent([String: Date].self, forKey: .addedAt) ?? [:]
        embeddedTitles = try c.decodeIfPresent([Title].self, forKey: .titles) ?? []
        embeddedStates = try c.decodeIfPresent([String: UserTitleState].self, forKey: .states) ?? [:]
        let ids = try c.decodeIfPresent([String].self, forKey: .titleIds)
        titleIDs = ids ?? embeddedTitles.map(\.id)
    }
}

// MARK: - Per-user title state

struct UserTitleState: Hashable, Decodable {
    var mark: Mark? = nil
    var savedAt: Date
    var reviewID: String? = nil
    /// Series progress: "T2E3" keys. Local only (§4: episodes → 501).
    var watchedEpisodes: Set<String> = []

    init(mark: Mark? = nil, savedAt: Date, reviewID: String? = nil, watchedEpisodes: Set<String> = []) {
        self.mark = mark; self.savedAt = savedAt; self.reviewID = reviewID; self.watchedEpisodes = watchedEpisodes
    }

    private enum CodingKeys: String, CodingKey { case mark, savedAt, reviewId }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        mark = Mark.lenient(try c.decodeIfPresent(String.self, forKey: .mark))
        savedAt = try c.decodeIfPresent(Date.self, forKey: .savedAt) ?? Date()
        reviewID = try c.decodeIfPresent(String.self, forKey: .reviewId)
    }
}

// MARK: - Feed

enum FeedKind: Hashable {
    case obsessed
    case completed(Mark?)
    case reviewed
    case added(collection: String)
    /// A waiting add: "No puede esperar · sale el 17 jul".
    case waitingAdd(collection: String, label: String)
    case burst(collection: String, titleIDs: [String])
    case suggestion(personID: String, reason: String, social: String, titleIDs: [String])
}

struct FeedEvent: Identifiable, Hashable, Decodable {
    let id: String
    let authorID: String
    var kind: FeedKind
    var titleID: String? = nil
    var ageHours: Double
    var reviewID: String? = nil
    /// Wire timestamp; `ageHours` is derived from it against the store's clock.
    var at: Date? = nil
    /// `added` events for unreleased titles carry it (→ `.waitingAdd` in the store).
    var releaseDate: Date? = nil
    var embeddedTitle: Title? = nil
    var embeddedAuthor: Person? = nil
    var embeddedReview: Review? = nil

    enum Tier { case L, M, S }

    var tier: Tier {
        switch kind {
        case .reviewed: return .L
        case .added, .waitingAdd: return .S
        default: return .M
        }
    }

    init(id: String, authorID: String, kind: FeedKind, titleID: String? = nil, ageHours: Double, reviewID: String? = nil) {
        self.id = id; self.authorID = authorID; self.kind = kind; self.titleID = titleID; self.ageHours = ageHours; self.reviewID = reviewID
    }

    private enum CodingKeys: String, CodingKey {
        case id, kind, at, author, titleId, title, collectionName, releaseDate, mark,
             reviewId, reviewBody, hasSpoiler, suggest
    }

    private struct Suggest: Decodable {
        let reason: String?
        let common: String?
        let titleIds: [String]?
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        let author = try c.decodeIfPresent(Person.self, forKey: .author)
        embeddedAuthor = author
        authorID = author?.handle ?? ""
        embeddedTitle = try c.decodeIfPresent(Title.self, forKey: .title)
        titleID = try c.decodeIfPresent(String.self, forKey: .titleId) ?? embeddedTitle?.id
        at = try c.decodeIfPresent(Date.self, forKey: .at)
        ageHours = 0
        releaseDate = try c.decodeIfPresent(Date.self, forKey: .releaseDate)
        let mark = Mark.lenient(try c.decodeIfPresent(String.self, forKey: .mark))
        let rid = try c.decodeIfPresent(String.self, forKey: .reviewId)
        reviewID = rid
        if let rid, let body = try c.decodeIfPresent(String.self, forKey: .reviewBody), let tid = titleID {
            embeddedReview = Review(id: rid, authorID: authorID, titleID: tid, text: body, mark: mark,
                                    spoiler: try c.decodeIfPresent(Bool.self, forKey: .hasSpoiler) ?? false, date: at ?? Date())
        }
        let type = try c.decodeIfPresent(String.self, forKey: .kind) ?? ""
        switch type {
        case "obsessed": kind = .obsessed
        case "completed": kind = .completed(mark == .completed ? nil : mark)
        case "reviewed": kind = .reviewed
        case "added": kind = .added(collection: try c.decodeIfPresent(String.self, forKey: .collectionName) ?? "")
        case "suggest":
            let s = try c.decodeIfPresent(Suggest.self, forKey: .suggest)
            kind = .suggestion(personID: authorID, reason: s?.reason ?? "", social: s?.common ?? "", titleIDs: s?.titleIds ?? [])
        default: kind = .added(collection: "")
        }
    }
}

// MARK: - Pages and payloads (§4)

struct FeedPage: Decodable {
    var items: [FeedEvent]
    var nextCursor: String?
    init(items: [FeedEvent], nextCursor: String? = nil) { self.items = items; self.nextCursor = nextCursor }
    private enum CodingKeys: String, CodingKey { case items, nextCursor }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = try c.decodeIfPresent([FeedEvent].self, forKey: .items) ?? []
        nextCursor = try c.decodeIfPresent(String.self, forKey: .nextCursor)
    }
}

struct PeoplePage: Decodable {
    var items: [Person]
    var nextCursor: String?
    init(items: [Person], nextCursor: String? = nil) { self.items = items; self.nextCursor = nextCursor }
    private enum CodingKeys: String, CodingKey { case items, nextCursor }
    init(from decoder: Decoder) throws {
        // `GET /people/suggestions` and `/people/search` return a bare array; the
        // owner lists return `{ items, nextCursor }`. Accept both.
        if let list = try? decoder.singleValueContainer().decode([Person].self) {
            items = list; nextCursor = nil
        } else {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            items = try c.decodeIfPresent([Person].self, forKey: .items) ?? []
            nextCursor = try c.decodeIfPresent(String.self, forKey: .nextCursor)
        }
    }
}

enum PeopleKind: Hashable {
    case following, followers, suggestions
    case search(String)
}

/// `GET /collections/{id}` — the collection with its titles and your states.
struct CollectionDetail: Decodable {
    var collection: KCollection
    var titles: [Title]
    var states: [String: UserTitleState]

    init(collection: KCollection, titles: [Title], states: [String: UserTitleState]) {
        self.collection = collection; self.titles = titles; self.states = states
    }

    private enum CodingKeys: String, CodingKey { case collection, titles, states }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Either `{ collection, titles, states }` or the collection fields at the root.
        if let inner = try c.decodeIfPresent(KCollection.self, forKey: .collection) {
            collection = inner
        } else {
            collection = try KCollection(from: decoder)
        }
        titles = try c.decodeIfPresent([Title].self, forKey: .titles) ?? collection.embeddedTitles
        states = try c.decodeIfPresent([String: UserTitleState].self, forKey: .states) ?? collection.embeddedStates
    }
}

/// `{ items: [Review], nextCursor }` — the reviews block of `GET /titles/{id}`
/// and the page of "más reseñas" (`GET /titles/{id}/reviews?cursor=`).
struct ReviewPage: Decodable {
    var items: [Review]
    var nextCursor: String?
    init(items: [Review], nextCursor: String? = nil) { self.items = items; self.nextCursor = nextCursor }
    init(from decoder: Decoder) throws {
        if let list = try? decoder.singleValueContainer().decode([Review].self) { items = list; nextCursor = nil; return }
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = try c.decode([Review].self, forKey: .items)
        nextCursor = try c.decodeIfPresent(String.self, forKey: .nextCursor)
    }
    private enum CodingKeys: String, CodingKey { case items, nextCursor }
}

/// `GET /titles/{id}`.
struct TitleDetail: Decodable {
    var title: Title
    var state: UserTitleState?
    var following: [PeopleMark]
    var reviews: [Review]
    var reviewsCursor: String?
    var collections: [String]

    init(title: Title, state: UserTitleState?, following: [PeopleMark], reviews: [Review], collections: [String]) {
        self.title = title; self.state = state; self.following = following; self.reviews = reviews; self.collections = collections
    }

    private enum CodingKeys: String, CodingKey { case title, state, following, reviews, collections }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let inner = try c.decodeIfPresent(Title.self, forKey: .title) {
            title = inner
        } else {
            title = try Title(from: decoder)
        }
        state = try c.decodeIfPresent(UserTitleState.self, forKey: .state)
        following = try c.decodeIfPresent([PeopleMark].self, forKey: .following) ?? []
        let page = try c.decodeIfPresent(ReviewPage.self, forKey: .reviews)
        reviews = page?.items ?? []
        reviewsCursor = page?.nextCursor
        collections = try c.decodeIfPresent([String].self, forKey: .collections) ?? []
    }
}

/// `PUT /collections/{id}/titles/{titleId}` → `{ title, state }`.
struct MembershipResult: Decodable {
    let title: Title
    let state: UserTitleState?
    init(title: Title, state: UserTitleState?) { self.title = title; self.state = state }
    private enum CodingKeys: String, CodingKey { case title, state }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = try c.decode(Title.self, forKey: .title)
        state = try c.decodeIfPresent(UserTitleState.self, forKey: .state)
    }
}

/// `GET /discover`.
struct DiscoverPayload: Decodable {
    struct Recommended: Decodable, Hashable {
        let title: Title
        let reason: String
        let seedTitleID: String?
        init(title: Title, reason: String, seedTitleID: String? = nil) { self.title = title; self.reason = reason; self.seedTitleID = seedTitleID }
        private enum CodingKeys: String, CodingKey { case title, reason, seedTitleId }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = try c.decode(Title.self, forKey: .title)
            reason = try c.decodeIfPresent(String.self, forKey: .reason) ?? ""
            seedTitleID = try c.decodeIfPresent(String.self, forKey: .seedTitleId)
        }
    }
    struct Trending: Decodable, Hashable {
        let title: Title
        let saves: Int
        init(title: Title, saves: Int) { self.title = title; self.saves = saves }
        private enum CodingKeys: String, CodingKey { case title, saves }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = try c.decode(Title.self, forKey: .title)
            saves = try c.decodeIfPresent(Int.self, forKey: .saves) ?? 0
        }
    }
    struct Upcoming: Decodable, Hashable {
        let title: Title
        let releaseDate: Date?
        init(title: Title, releaseDate: Date? = nil) { self.title = title; self.releaseDate = releaseDate }
        private enum CodingKeys: String, CodingKey { case title, releaseDate }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = try c.decode(Title.self, forKey: .title)
            releaseDate = try c.decodeIfPresent(Date.self, forKey: .releaseDate)
        }
    }

    var recommended: [Recommended]
    var trending: [Trending]
    var upcoming: [Upcoming]

    init(recommended: [Recommended], trending: [Trending], upcoming: [Upcoming]) {
        self.recommended = recommended; self.trending = trending; self.upcoming = upcoming
    }

    private enum CodingKeys: String, CodingKey { case recommended, trending, upcoming }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        recommended = try c.decodeIfPresent([Recommended].self, forKey: .recommended) ?? []
        trending = try c.decodeIfPresent([Trending].self, forKey: .trending) ?? []
        upcoming = try c.decodeIfPresent([Upcoming].self, forKey: .upcoming) ?? []
    }

    var allTitles: [Title] { recommended.map(\.title) + trending.map(\.title) + upcoming.map(\.title) }
}

/// `GET /recap/months` item.
struct RecapMonth: Hashable, Identifiable, Decodable {
    let era: String
    let label: String
    var id: String { era }
    init(era: String, label: String) { self.era = era; self.label = label }
    private enum CodingKeys: String, CodingKey { case era, label }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        era = try c.decode(String.self, forKey: .era)
        label = try c.decodeIfPresent(String.self, forKey: .label) ?? era
    }
}

/// `GET /recap/{era}`.
struct RecapPayload: Hashable, Decodable {
    struct Stats: Hashable, Decodable {
        var completed = 0
        var obsessed = 0
        var reviews = 0
        var saved = 0
        var hours: Int? = nil
        init(completed: Int = 0, obsessed: Int = 0, reviews: Int = 0, saved: Int = 0, hours: Int? = nil) {
            self.completed = completed; self.obsessed = obsessed; self.reviews = reviews; self.saved = saved; self.hours = hours
        }
        private enum CodingKeys: String, CodingKey { case completed, obsessed, obsessions, reviews, saved, hours }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            completed = try c.decodeIfPresent(Int.self, forKey: .completed) ?? 0
            obsessed = try c.decodeIfPresent(Int.self, forKey: .obsessed) ?? c.decodeIfPresent(Int.self, forKey: .obsessions) ?? 0
            reviews = try c.decodeIfPresent(Int.self, forKey: .reviews) ?? 0
            saved = try c.decodeIfPresent(Int.self, forKey: .saved) ?? 0
            hours = try c.decodeIfPresent(Int.self, forKey: .hours)
        }
    }

    /// "2026-08" — not on the wire (`GET /recap/{era}` answers only the body); `LiveAPI` fills it.
    var era: String
    /// "agosto"
    var month: String
    var year: Int
    var stats: Stats
    var top: Title?
    var also: [Title]

    static let monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

    init(era: String, month: String, year: Int, stats: Stats, top: Title?, also: [Title]) {
        self.era = era; self.month = month; self.year = year; self.stats = stats; self.top = top; self.also = also
    }

    /// Sets `era` (and the month/year it implies) on a payload that came without it.
    mutating func adopt(era e: String, label: String?) {
        era = e
        let parts = e.split(separator: "-")
        year = Int(parts.first ?? "") ?? year
        let m = Int(parts.count > 1 ? parts[1] : "") ?? 0
        month = label?.split(separator: " ").first.map(String.init) ?? ((1...12).contains(m) ? RecapPayload.monthNames[m - 1] : e)
    }

    private enum CodingKeys: String, CodingKey { case era, label, stats, top, also }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        era = ""
        month = ""
        year = 0
        stats = try c.decodeIfPresent(Stats.self, forKey: .stats) ?? Stats()
        top = try c.decodeIfPresent(Title.self, forKey: .top)
        also = try c.decodeIfPresent([Title].self, forKey: .also) ?? []
        if let e = try c.decodeIfPresent(String.self, forKey: .era) {
            adopt(era: e, label: try c.decodeIfPresent(String.self, forKey: .label))
        }
    }
}

enum UsernameStatus: String, Decodable {
    case free, taken, invalid
}

/// `POST auth/otp/verify` / `POST auth/refresh` → `{ token, user }`.
struct AuthSession: Decodable {
    let token: String
    let user: Me
}

// MARK: - Navigation

enum Tab: String, CaseIterable, Identifiable, Hashable {
    case collections, discover, feed, profile
    var id: String { rawValue }
    var label: String {
        switch self {
        case .collections: return "Colecciones"
        case .discover: return "Descubrir"
        case .feed: return "Feed"
        case .profile: return "Perfil"
        }
    }
}

enum Route: Hashable {
    case collection(String)
    case title(String)
    case reorder(String)
    case changeCover(String)
    case automatic
    case person(String)
    /// Someone else's public collection (`GET /people/{handle}/collections/{id}`), read-only.
    case publicCollection(handle: String, id: String)
    case followers(String, showFollowing: Bool)
    case creator(String)
    case notifications
    case recap
    case recapHistory
    case recapShare
    case settings
    case settingsPrivacy
    case musicApp
    case editProfile
    /// K1d / K1e — how your profile looks to someone who doesn't follow you.
    case profileAsStranger
}

enum OnboardingStep: Hashable {
    case welcome, signup, username, pick, people, login
    /// Correo → código (O1c/O1a against `auth/otp/*`).
    case email, code
    /// `POST /me/onboarding` answered `403 underage`.
    case underage
}
