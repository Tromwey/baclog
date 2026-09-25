import SwiftUI

// Titles: formats, marks, releases, the title and its parts, your state per title, reviews and the ficha payloads.

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
