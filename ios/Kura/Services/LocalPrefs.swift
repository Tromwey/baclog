import Foundation

/// What the API marks `unsupported` (API.md §3/§4) stays on the device, with
/// no sync UI: pinned, manual order, chosen cover, sort, layout, watched
/// episodes, plus the small conveniences (recent searches, recently viewed).
/// Disabled on the mock so the `-kuraScreen` captures stay deterministic.
struct LocalPrefs {
    struct Collection: Codable, Equatable {
        var pinned = false
        var coverTitleID: String? = nil
        var sort: SortMode = .manual
        var layout: CollectionLayout = .covers
        /// Manual order of title ids (only meaningful under `.manual`).
        var order: [String]? = nil
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
    private let key = "io.communeo.kura.local"
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

    func clear() {
        guard enabled else { return }
        defaults.removeObject(forKey: key)
    }
}
