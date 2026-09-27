import Foundation

/// What the API marks `unsupported` (API.md §3/§4) stays on the device, with
/// no sync UI: sort, layout, watched episodes, plus the small conveniences
/// (recent searches, recently viewed). Pinned, manual order and chosen cover
/// moved to the server (curation contract, 2026-09-27): what an older build
/// left here is read ONCE (`legacy*`), uploaded and dropped (`AppStore+LocalPrefs`
/// › `migrateLegacyCuration`). Disabled on the mock so the `-kuraScreen`
/// captures stay deterministic.
struct LocalPrefs {
    struct Collection: Codable, Equatable {
        var sort: SortMode = .manual
        var layout: CollectionLayout = .covers
        /// Read-only leftovers of the device-local curation (older builds). Never written again
        /// once migrated: `nil` encodes as nothing.
        var legacyPinned: Bool? = nil
        var legacyCoverTitleID: String? = nil
        var legacyOrder: [String]? = nil

        var hasLegacy: Bool { legacyPinned == true || legacyCoverTitleID != nil || legacyOrder != nil }

        init(sort: SortMode = .manual, layout: CollectionLayout = .covers) {
            self.sort = sort; self.layout = layout
        }

        private enum CodingKeys: String, CodingKey {
            case sort, layout
            case legacyPinned = "pinned", legacyCoverTitleID = "coverTitleID", legacyOrder = "order"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            sort = (try? c.decodeIfPresent(SortMode.self, forKey: .sort)) ?? .manual
            layout = (try? c.decodeIfPresent(CollectionLayout.self, forKey: .layout)) ?? .covers
            legacyPinned = try? c.decodeIfPresent(Bool.self, forKey: .legacyPinned)
            legacyCoverTitleID = try? c.decodeIfPresent(String.self, forKey: .legacyCoverTitleID)
            legacyOrder = try? c.decodeIfPresent([String].self, forKey: .legacyOrder)
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(sort, forKey: .sort)
            try c.encode(layout, forKey: .layout)
            try c.encodeIfPresent(legacyPinned, forKey: .legacyPinned)
            try c.encodeIfPresent(legacyCoverTitleID, forKey: .legacyCoverTitleID)
            try c.encodeIfPresent(legacyOrder, forKey: .legacyOrder)
        }
    }

    struct Payload: Codable, Equatable {
        var collections: [String: Collection] = [:]
        var watchedEpisodes: [String: [String]] = [:]
        var recentSearches: [String] = []
        var recentlyViewed: [String] = []
        var alerts: [String] = []
        var muted: [String] = []
        var showCommon = true
        var defaultPrivacy: String? = nil
    }

    let enabled: Bool
    private let key = "com.tromwey.kura.local"
    private let defaults: UserDefaults

    init(enabled: Bool, defaults: UserDefaults = .standard) {
        self.enabled = enabled
        self.defaults = defaults
    }

    func load() -> Payload {
        guard enabled, let data = defaults.data(forKey: key),
              let p = try? JSONDecoder().decode(Payload.self, from: data) else { return Payload() }
        return p
    }

    func save(_ p: Payload) {
        guard enabled, let data = try? JSONEncoder().encode(p) else { return }
        defaults.set(data, forKey: key)
    }

    /// Set once the device-local pins/covers/orders of an older build reached the server (or there
    /// were none). Not cleared on sign-out: after the migration nothing writes those keys again.
    var curationMigrated: Bool {
        get { enabled ? defaults.bool(forKey: migratedKey) : true }
        nonmutating set { if enabled { defaults.set(newValue, forKey: migratedKey) } }
    }
    private var migratedKey: String { "\(key).curationMigrated" }

    func clear() {
        guard enabled else { return }
        defaults.removeObject(forKey: key)
    }
}
