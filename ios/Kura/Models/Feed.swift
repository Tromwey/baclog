import SwiftUI

// The feed (`FeedEvent`, its page) and the Descubrir and recap payloads.

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
    var id: String
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
    /// `added` only: the collection's id — a burst joins by id (names aren't unique per user).
    var collectionID: String? = nil
    /// `.burst` only: when its OLDEST add happened (`at` is the newest), for the sitting gap.
    var oldestAt: Date? = nil

    enum Tier { case L, M, S }

    var tier: Tier {
        switch kind {
        case .reviewed, .suggestion: return .L
        // Single adds and "no puede esperar" used to be S (a smaller cover); every cover card —
        // add, burst, obsession, completion — is now one size.
        default: return .M
        }
    }

    init(id: String, authorID: String, kind: FeedKind, titleID: String? = nil, ageHours: Double, reviewID: String? = nil) {
        self.id = id; self.authorID = authorID; self.kind = kind; self.titleID = titleID; self.ageHours = ageHours; self.reviewID = reviewID
    }

    private enum CodingKeys: String, CodingKey {
        case id, kind, at, author, titleId, title, collectionId, collectionName, releaseDate, mark,
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
        case "added":
            kind = .added(collection: try c.decodeIfPresent(String.self, forKey: .collectionName) ?? "")
            collectionID = try c.decodeIfPresent(String.self, forKey: .collectionId)
        case "suggest":
            let s = try c.decodeIfPresent(Suggest.self, forKey: .suggest)
            kind = .suggestion(personID: authorID, reason: s?.reason ?? "", social: s?.common ?? "", titleIDs: s?.titleIds ?? [])
        default: kind = .added(collection: "")
        }
    }
}

// MARK: - Bursts

/// The app's half of the feed's card assembly — the same rule as the web's `groupIntoCards`
/// (src/modules/social/group.ts): consecutive adds by the same author to the SAME collection
/// (by id), each within `gap` of the run's previous add, fold into one `.burst` from the second
/// one on (threshold 2). "No puede esperar" adds, and any other event, break the run. `GET /feed`
/// sends loose events on purpose ("the app groups bursts itself"); without this every add of a
/// sitting was its own card.
enum FeedBursts {
    static let gap: TimeInterval = 6 * 3600

    /// Appends `events` (newest first, like the wire) to `feed`, folding as it goes. Works across
    /// pages: the next page's first add joins the burst the previous page ended with.
    static func append(_ events: [FeedEvent], to feed: inout [FeedEvent]) {
        for e in events {
            if let last = feed.last, let joined = join(last, e) { feed[feed.count - 1] = joined } else { feed.append(e) }
        }
    }

    private static func join(_ run: FeedEvent, _ e: FeedEvent) -> FeedEvent? {
        guard case .added = e.kind, let col = e.collectionID, let tid = e.titleID, let at = e.at,
              run.authorID == e.authorID, run.collectionID == col else { return nil }
        switch run.kind {
        case .added(let name):
            guard let first = run.titleID, let runAt = run.at, runAt.timeIntervalSince(at) <= gap else { return nil }
            var b = run
            b.id = "burst:\(run.id)"
            b.kind = .burst(collection: name, titleIDs: [first, tid])
            b.titleID = nil
            b.oldestAt = at
            return b
        case .burst(let name, let ids):
            guard let oldest = run.oldestAt, oldest.timeIntervalSince(at) <= gap, !ids.contains(tid) else { return nil }
            var b = run
            b.kind = .burst(collection: name, titleIDs: ids + [tid])
            b.oldestAt = at
            return b
        default:
            return nil
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
