import SwiftUI

// Collections: privacy, sort, layout, `KCollection` and its detail payload.

// MARK: - Collections

/// Who sees a collection. Wire (`visibility`): `private` | `link` | `profile`.
/// `.followers` is what the K1a/K1b frames ask for but the model doesn't have
/// yet (API.md §7.4): it's only offered on the mock and encodes as `link`.
///
/// ⚠️ Solo mock / no-op en live: `.followers` ("Seguidores") no se ofrece en live (`options`) y,
/// si llegara al cable, se guarda como `link` — cualquiera con el link la vería, no "solo quien te
/// sigue". Para que sea real haría falta en el servidor un tercer valor de visibilidad por
/// colección y gatear cada lectura cross-user de `backlog` por `user_follow` (viewer → dueño).
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
