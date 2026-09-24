import SwiftUI

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
}

// MARK: - Release ("no puedo esperar")

/// Only for announced titles. Drives the automatic "no puedo esperar" collection.
enum Release: Hashable {
    case day(Date)
    case month(year: Int, month: Int)
    case year(Int)
    case unknown
}

// MARK: - Title

struct Track: Hashable, Identifiable {
    var id: Int { number }
    let number: Int
    let name: String
    var isNew: Bool = false
    var available: Bool = true
}

struct Season: Hashable, Identifiable {
    var id: Int { number }
    let number: Int
    let episodes: [String]
}

struct WatchOption: Hashable, Identifiable {
    var id: String { name }
    let short: String
    let name: String
    let kind: String
}

struct TitleCounts: Hashable {
    var obsessed: String
    var liked: String
    var completed: String
    var waiting: String? = nil
    var saved: String
}

struct Title: Identifiable, Hashable {
    let id: String
    var name: String
    var format: MediaFormat
    var year: Int?
    var creator: String
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

    var lowerCreator: String { creator.lowercased() }
}

// MARK: - People

struct Person: Identifiable, Hashable {
    var id: String { handle }
    let handle: String
    var name: String
    var initials: String
    /// Featured obsession tones [oscuro, claro]. Empty → no obsession yet.
    var hexes: [String]
    var featuredTitleID: String? = nil
}

// MARK: - Reviews

struct Review: Identifiable, Hashable {
    let id: String
    let authorID: String
    let titleID: String
    var text: String
    var mark: Mark?
    var spoiler: Bool
    var date: Date
}

// MARK: - Collections

enum Privacy: String, CaseIterable, Identifiable, Hashable {
    case publicAccess, followers, onlyMe
    var id: String { rawValue }

    var label: String {
        switch self {
        case .publicAccess: return "Pública"
        case .followers: return "Seguidores"
        case .onlyMe: return "Solo yo"
        }
    }

    var note: String {
        switch self {
        case .publicAccess: return "En tu perfil y con el link, con o sin cuenta."
        case .followers: return "Solo quien te sigue."
        case .onlyMe: return "No aparece en tu perfil."
        }
    }

    var symbol: String {
        switch self {
        case .publicAccess: return "globe"
        case .followers: return "person.2.fill"
        case .onlyMe: return "lock.fill"
        }
    }
}

enum SortMode: String, CaseIterable, Identifiable, Hashable {
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

enum CollectionLayout: Hashable {
    case covers, list
}

struct KCollection: Identifiable, Hashable {
    let id: String
    var name: String
    var titleIDs: [String]
    var privacy: Privacy
    var pinned: Bool = false
    var coverTitleID: String? = nil
    var sort: SortMode = .manual
    var layout: CollectionLayout = .covers
    var createdAt: Date
    var addedAt: [String: Date] = [:]

    var slug: String {
        let folded = name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "es"))
        return folded.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).joined(separator: "-")
    }
}

// MARK: - Per-user title state

struct UserTitleState: Hashable {
    var mark: Mark? = nil
    var savedAt: Date
    var reviewID: String? = nil
    /// Series progress: "T2E3" keys.
    var watchedEpisodes: Set<String> = []
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

struct FeedEvent: Identifiable, Hashable {
    let id: String
    let authorID: String
    let kind: FeedKind
    var titleID: String? = nil
    var ageHours: Double
    var reviewID: String? = nil

    enum Tier { case L, M, S }

    var tier: Tier {
        switch kind {
        case .reviewed: return .L
        case .added, .waitingAdd: return .S
        default: return .M
        }
    }
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
}

enum OnboardingStep: Hashable {
    case welcome, signup, username, pick, people, login
}
