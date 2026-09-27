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

    /// The choices the backend persists, in the one visibility vocabulary (founder, 2026-09-27):
    /// Solo yo · Con el link · En tu perfil — the same words in every sheet, in Ajustes and on the
    /// web. `.followers` is no longer offered (it was mock-only and saved as `link`).
    static var options: [Privacy] { [.onlyMe, .link, .publicAccess] }

    var label: String {
        switch self {
        case .publicAccess: return "En tu perfil"
        case .followers: return "Seguidores"
        case .onlyMe: return "Solo yo"
        case .link: return "Con el link"
        }
    }

    var note: String {
        switch self {
        case .publicAccess: return "Sale en tu perfil y la abre cualquiera con el link, con o sin cuenta."
        case .followers: return "Solo quien te sigue."
        case .onlyMe: return "Solo tú la ves. El link no abre para nadie más."
        case .link: return "La abre quien tenga el link. No sale en tu perfil."
        }
    }

    /// The undo toast after a visibility change: it says who sees it now, without ambiguity.
    var changedToast: String {
        switch self {
        case .publicAccess: return "Ahora está en tu perfil."
        case .onlyMe: return "Ahora solo tú la ves."
        case .link, .followers: return "Ahora la abre quien tenga el link."
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
    /// The collection's line (Newsreader italic under its name). `nil`/"" = none.
    var vibe: String? = nil
    /// The owner's MANUAL order (`backlog_item.position`, unplaced titles first, newest first).
    /// Before the curation contract the server sent `addedAt desc`, which reads the same.
    var titleIDs: [String]
    var privacy: Privacy
    /// One per account (`backlog.pinned_at`): pinning one unpins the rest.
    var pinned: Bool = false
    /// The cover the owner CHOSE (`backlog.cover_catalog_item_id`); nil = automatic (the order's
    /// first). A choice that left the collection is ignored, never shown (`AppStore.fan(of:)`).
    var chosenCoverTitleID: String? = nil
    /// The server's fan (≤ 3, `fanTitleIds`): the chosen cover, then the order. The app derives its
    /// own from `titleIDs` + `chosenCoverTitleID` (optimistic writes); this is the fallback for a
    /// collection whose titles haven't arrived, and the truth for someone else's.
    var fanTitleIDs: [String] = []
    /// Device-local (API.md §3): how THIS phone sorts and lays it out.
    var sort: SortMode = .manual
    var layout: CollectionLayout = .covers
    var createdAt: Date
    var addedAt: [String: Date] = [:]
    /// Titles embedded by the API (`GET /collections/{id}`), registered by the store.
    var embeddedTitles: [Title] = []
    var embeddedStates: [String: UserTitleState] = [:]

    init(id: String, name: String, vibe: String? = nil, titleIDs: [String], privacy: Privacy, pinned: Bool = false,
         chosenCoverTitleID: String? = nil, fanTitleIDs: [String] = [],
         sort: SortMode = .manual, layout: CollectionLayout = .covers, createdAt: Date, addedAt: [String: Date] = [:]) {
        self.id = id; self.name = name; self.vibe = vibe; self.titleIDs = titleIDs; self.privacy = privacy; self.pinned = pinned
        self.chosenCoverTitleID = chosenCoverTitleID; self.fanTitleIDs = fanTitleIDs
        self.sort = sort; self.layout = layout; self.createdAt = createdAt; self.addedAt = addedAt
    }

    var slug: String {
        let folded = name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "es"))
        return folded.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).joined(separator: "-")
    }

    /// The line to draw (a blank one is none).
    var shownVibe: String? {
        guard let v = vibe?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else { return nil }
        return v
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, vibe, titleIds, visibility, coverTitleId, chosenCoverTitleId, fanTitleIds, pinned
        case createdAt, addedAt, titles, states
    }

    /// Everything the curation contract added (`pinned`, `chosenCoverTitleId`, `fanTitleIds`,
    /// `vibe`) is `decodeIfPresent` with a default: the production server that doesn't send them
    /// yet decodes as "not pinned, automatic cover, fan derived on the device".
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        vibe = try c.decodeIfPresent(String.self, forKey: .vibe)
        privacy = try c.decodeIfPresent(String.self, forKey: .visibility).map(Privacy.init(wire:)) ?? .onlyMe
        pinned = try c.decodeIfPresent(Bool.self, forKey: .pinned) ?? false
        chosenCoverTitleID = try c.decodeIfPresent(String.self, forKey: .chosenCoverTitleId)
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        addedAt = try c.decodeIfPresent([String: Date].self, forKey: .addedAt) ?? [:]
        embeddedTitles = try c.decodeIfPresent([Title].self, forKey: .titles) ?? []
        embeddedStates = try c.decodeIfPresent([String: UserTitleState].self, forKey: .states) ?? [:]
        let ids = try c.decodeIfPresent([String].self, forKey: .titleIds)
        titleIDs = ids ?? embeddedTitles.map(\.id)
        // `coverTitleId` is the fan's front (before the contract: the newest with art). Without
        // `fanTitleIds`, the fan is that front, then the order.
        let front = try c.decodeIfPresent(String.self, forKey: .coverTitleId)
        let fan = try c.decodeIfPresent([String].self, forKey: .fanTitleIds)
        fanTitleIDs = fan.map { Array($0.prefix(3)) } ?? FanOrder.fan(titleIDs, cover: front)
    }
}

/// Colecciones formalizado — "el abanico es la colección": up to three titles, the chosen cover
/// first (when it's still a member), then the manual order. The twin of the web's `fanOf`
/// (`src/modules/backlog/fan.ts`); keep both in step.
enum FanOrder {
    static func fan(_ ordered: [String], cover: String?) -> [String] {
        var out: [String] = []
        if let cover, ordered.contains(cover) { out.append(cover) }
        for id in ordered where out.count < 3 && id != cover { out.append(id) }
        return out
    }

    /// The Revamp's lima ADN fallback is not a Kura colour: it never tints.
    static func kuraHexes(_ hexes: [String]) -> [String] {
        hexes.filter { $0.lowercased() != "#d8ff3e" }
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
