import SwiftUI
import Observation
import UIKit

enum AppPhase: Hashable {
    case splash
    case onboarding
    case main
}

enum SheetStyle { case compact, tall }

enum DebugOverlay { case releaseNotification }

/// Every bottom sheet in the app. They are drawn by `SheetHost` (not the system
/// `.sheet`) so they match the frames: inset 8, radius 36, s2, scrim .62.
enum SheetRoute: Identifiable, Hashable {
    case newCollection(addingTitleID: String?, movingFrom: String? = nil)
    case collectionQuick(String)
    case more(String)
    case sort(String)
    case rename(String)
    case privacy(String)
    case share(String)
    case deleteCollection(String)
    case titleActions(titleID: String, collectionID: String)
    case moveTo(titleID: String, fromID: String)
    case complete(titleID: String, focusReview: Bool)
    case saveTo(String)
    case titleMore(String)
    case personOptions(String)
    case deleteAccount
    case addTitles(String)

    var id: String { String(describing: self) }

    var style: SheetStyle {
        if case .addTitles = self { return .tall }
        return .compact
    }

    var showsGrabber: Bool {
        if case .deleteCollection = self { return false }
        return true
    }
}

struct ToastModel: Identifiable, Equatable {
    enum Kind: Equatable { case undo, retry, info }
    let id = UUID()
    var text: String
    var kind: Kind
    var action: (() -> Void)?

    static func == (a: ToastModel, b: ToastModel) -> Bool { a.id == b.id }
}

enum LoadState { case loading, loaded }

@MainActor
@Observable
final class AppStore {
    // MARK: Dependencies
    @ObservationIgnored let api: KuraAPI
    @ObservationIgnored let prefs: LocalPrefs
    var now: Date

    // MARK: Phase / navigation
    var phase: AppPhase = .splash
    var tab: Tab = .collections
    var paths: [Tab: [Route]] = [:]
    var sheet: SheetRoute?
    var toast: ToastModel?
    var offline = false
    var loadState: LoadState = .loading

    // MARK: Account / session
    var me: Person
    var account: Me?
    /// Entrance flow (O1c/O1a): the email the code was sent to, busy flag, inline error.
    var authEmail = ""
    var authBusy = false
    var authError: String?

    // MARK: Data
    var people: [String: Person] = [:]
    var titles: [String: Title] = [:]
    /// Ids in the order we learned them (drives local search, "también de").
    var catalogOrder: [String] = []
    var collections: [KCollection] = []
    var userTitles: [String: UserTitleState] = [:]
    var following: Set<String> = []
    var reviews: [Review] = []
    var feed: [FeedEvent] = []
    var revealedSpoilers: Set<String> = []
    /// Last collection used in "guardar en" — preselected next time.
    var lastUsedCollectionID: String?
    /// `GET /titles/{id}.following` — what followed people did with a title.
    var titleActivity: [String: [PeopleMark]] = [:]

    // Per-screen loads
    var loadedCollections: Set<String> = []
    var loadedTitles: Set<String> = []
    var loadingTitles: Set<String> = []
    var missingTitles: Set<String> = []
    var loadedPeople: Set<String> = []
    var loadingPeople: Set<String> = []
    var missingPeople: Set<String> = []
    var peopleLists: [String: [Person]] = [:]
    var feedLoaded = false
    var feedLoading = false
    var feedCursor: String?
    var discover: DiscoverPayload?
    var discoverLoading = false
    var searchQuery = ""
    var searchResults: [SearchResult] = []
    var searchPeople: [Person] = []
    var searchLoading = false
    var searchError: KuraAPIError?
    var onboardingGrid: [Title] = []
    var onboardingPeople: [Person] = []
    var recapMonths: [RecapMonth]?
    var recaps: [String: RecapPayload] = [:]
    var recapLoading = false

    // Social / settings
    var requested: Set<String> = []
    var muted: Set<String> = []
    var notifications: [KNotification]
    var requestStates: [String: RequestState] = [:]
    var recentSearches: [String]
    var showCommon = true
    var notifyFollowers = true
    var notifyRecap = true
    var defaultPrivacy: Privacy = .onlyMe
    /// "Avísame cuando llegue" (E4) — titles you asked to be told about.
    var alerts: Set<String> = []
    /// Discover's search mode hides the dock (the keyboard owns the bottom).
    var dockHidden = false
    var recentlyViewed: [String]
    @ObservationIgnored var debugEmptyRecap = false
    @ObservationIgnored var debugEmptyFollowing = false
    var debugOverlay: DebugOverlay?
    @ObservationIgnored var debugDiscoverQuery: (text: String, submit: Bool)?

    // Settings the API owns (`PATCH /me`) — stored locally, patched on change.
    private var _profilePrivate = false
    private var _notifyReleases = true
    private var _musicApp = "Apple Music"

    var profilePrivate: Bool {
        get { _profilePrivate }
        set {
            guard _profilePrivate != newValue else { return }
            _profilePrivate = newValue
            patchMe(MePatch(isPublic: !newValue))
        }
    }

    var notifyReleases: Bool {
        get { _notifyReleases }
        set {
            guard _notifyReleases != newValue else { return }
            _notifyReleases = newValue
            patchMe(MePatch(notifyReleases: newValue))
        }
    }

    var musicApp: String {
        get { _musicApp }
        set {
            guard _musicApp != newValue else { return }
            _musicApp = newValue
            patchMe(MePatch(preferredService: AppStore.serviceWire(newValue)))
        }
    }

    /// `preferredService` on the wire: spotify | apple_music | youtube_music | tidal.
    static let services: [(name: String, wire: String)] = [("Apple Music", "apple_music"), ("Spotify", "spotify"),
                                                            ("YouTube Music", "youtube_music"), ("Tidal", "tidal")]
    static func serviceWire(_ name: String) -> String { services.first { $0.name == name }?.wire ?? "apple_music" }
    static func serviceName(_ wire: String) -> String { services.first { $0.wire == wire }?.name ?? "Apple Music" }

    func noteSearch(_ q: String) {
        recentSearches.removeAll { $0.caseInsensitiveCompare(q) == .orderedSame }
        recentSearches.insert(q, at: 0)
        if recentSearches.count > 6 { recentSearches.removeLast() }
        saveLocal()
    }

    func noteViewed(_ id: String) {
        recentlyViewed.removeAll { $0 == id }
        recentlyViewed.insert(id, at: 0)
        if recentlyViewed.count > 8 { recentlyViewed.removeLast() }
        saveLocal()
    }

    /// Onboarding picks (the three obsessions).
    var onboardingPicks: [String] = []
    var onboardingStep: OnboardingStep = .welcome

    // MARK: Launch options (DEBUG screenshots)
    @ObservationIgnored var holdSplash = false
    @ObservationIgnored var emptyLibrary = false
    @ObservationIgnored var keepLoading = false
    @ObservationIgnored var pendingSheet: SheetRoute?
    @ObservationIgnored var didBootstrap = false
    @ObservationIgnored var pendingListCollection: String?
    @ObservationIgnored var pendingAction: (() -> Void)?
    @ObservationIgnored var debugFeedAnchor: String?

    @ObservationIgnored private var toastTask: Task<Void, Never>?
    /// Collections created optimistically: local id → the server id once it exists.
    @ObservationIgnored private var pendingCollections: [String: Task<String, Error>] = [:]
    /// Removals waiting for the Deshacer window to close (5 s).
    @ObservationIgnored private var deferredWrites: [String: Task<Void, Never>] = [:]
    /// Titles with a write in flight (a read must not clobber the optimistic state).
    @ObservationIgnored private var inflight: [String: Int] = [:]
    @ObservationIgnored private var expiryObserver: NSObjectProtocol?

    init(api: KuraAPI = MockAPI(), now: Date = MockData.now) {
        self.api = api
        self.now = now
        let mock = KuraRuntime.usesMock
        prefs = LocalPrefs(enabled: !mock)
        me = mock ? MockData.me : Person(handle: "", name: "", initials: "k", hexes: [])
        notifications = mock ? MockData.notifications : []
        recentSearches = mock ? MockData.recentSearches : []
        recentlyViewed = mock ? ["chihiro", "ma", "severance", "mala", "pearl"] : []
        if mock {
            // The mock catalog/people are local and instant; the library arrives with latency.
            for t in MockData.titles { register(t) }
            for p in MockData.people { people[p.id] = p }
            defaultPrivacy = .followers
        } else {
            loadLocal()
        }
        expiryObserver = NotificationCenter.default.addObserver(forName: .kuraSessionExpired, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.sessionExpired() }
        }
    }

    // MARK: Registry

    /// Full title from any payload wins over a partial one already known.
    func register(_ t: Title) {
        if titles[t.id] == nil { catalogOrder.append(t.id) }
        titles[t.id] = t
    }

    /// A partial title (search result) never overwrites a fuller one.
    func registerPartial(_ t: Title) {
        guard titles[t.id] == nil else { return }
        register(t)
    }

    func register(_ p: Person) {
        var merged = p
        if let old = people[p.id] {
            if merged.hexes.isEmpty { merged.hexes = old.hexes }
            if merged.featuredTitleID == nil { merged.featuredTitleID = old.featuredTitleID }
            if merged.why == nil { merged.why = old.why }
            if merged.obsessions.isEmpty { merged.obsessions = old.obsessions }
            if merged.common.isEmpty { merged.common = old.common }
            if merged.collections.isEmpty { merged.collections = old.collections }
        }
        for t in merged.embeddedTitles { registerPartial(t) }
        people[p.id] = merged
        if let f = p.isFollowing {
            if f { following.insert(p.id) } else { following.remove(p.id) }
        }
    }

    private func applyMe(_ m: Me) {
        account = m
        var p = m.person
        if p.hexes.isEmpty, let id = p.featuredTitleID, let t = titles[id] { p.hexes = t.palette }
        me = p
        if !p.id.isEmpty { people[p.id] = p }
        _profilePrivate = !m.isPublic
        _notifyReleases = m.notifyReleases
        if let s = m.preferredService { _musicApp = AppStore.serviceName(s) }
    }

    /// Fetches the titles we don't know yet (`GET /titles?ids=`), ≤ 50 per call.
    func hydrateTitles(_ ids: some Sequence<String>) async {
        let missing = Array(Set(ids.filter { titles[$0] == nil && ExternalRef.parse(localID: $0) == nil }))
        guard !missing.isEmpty else { return }
        do {
            for t in try await api.titles(ids: missing) { register(t) }
        } catch {
            noteError(error)
        }
    }

    // MARK: Errors

    /// Maps any error to `KuraAPIError`, applies the global consequences
    /// (401 → entrance, transport → offline banner) and returns it.
    @discardableResult
    func noteError(_ error: Error) -> KuraAPIError {
        let e = (error as? KuraAPIError) ?? .server(String(describing: error))
        switch e {
        case .unauthorized: sessionExpired()
        case .offline: offline = true
        default: break
        }
        return e
    }

    private func online() { if offline { offline = false } }

    // MARK: Loading

    func bootstrap(emptyLibrary: Bool = false, keepLoading: Bool = false) async {
        loadState = .loading
        do {
            async let m = api.me()
            async let cols = api.collections()
            async let states = api.myTitles()
            async let fol = api.people(kind: .following, cursor: nil)
            let (account, library, myStates, followingPage) = try await (m, cols, states, fol)
            online()
            for p in followingPage.items { register(p) }
            following = Set(followingPage.items.map(\.id)).union(following)
            var merged = myStates
            for (id, s) in userTitles where merged[id] == nil { merged[id] = s }
            if emptyLibrary {
                collections = []
                userTitles = [:]
            } else {
                collections = library.map(applyLocal)
                for c in library { for t in c.embeddedTitles { register(t) } }
                userTitles = merged
                applyLocalEpisodes()
                lastUsedCollectionID = collections.first(where: \.pinned)?.id
            }
            applyMe(account)
            await hydrateTitles(collections.flatMap(\.titleIDs) + [account.featuredTitleID].compactMap { $0 })
            if me.hexes.isEmpty, let id = me.featuredTitleID, let t = titles[id] { me.hexes = t.palette }
            if !keepLoading { loadState = .loaded }
        } catch {
            let e = noteError(error)
            guard e != .unauthorized else { return }
            showToast(ToastModel(text: "No se pudo cargar", kind: .retry) { [weak self] in
                Task { await self?.bootstrap() }
            })
        }
    }

    /// `GET /collections/{id}` — the titles and your states for one collection.
    func loadCollection(_ id: String, force: Bool = false) async {
        guard force || !loadedCollections.contains(id), pendingCollections[id] == nil else { return }
        do {
            let d = try await api.collection(id: id)
            online()
            for t in d.titles { register(t) }
            for (tid, s) in d.states where inflight[tid, default: 0] == 0 {
                var merged = s
                merged.watchedEpisodes = userTitles[tid]?.watchedEpisodes ?? []
                userTitles[tid] = merged
            }
            if let i = collections.firstIndex(where: { $0.id == id }) {
                var c = applyLocal(d.collection)
                c.pinned = collections[i].pinned
                if pendingRemovals(in: id).isEmpty { collections[i] = c } else {
                    collections[i].name = c.name
                    collections[i].privacy = c.privacy
                }
            } else {
                collections.append(applyLocal(d.collection))
            }
            loadedCollections.insert(id)
        } catch {
            let e = noteError(error)
            if case .notFound = e { collections.removeAll { $0.id == id } }
        }
    }

    /// `GET /titles/{id}` — the full ficha: state, people you follow, reviews.
    func loadTitle(_ id: String, force: Bool = false) async {
        guard ExternalRef.parse(localID: id) == nil else { return }
        guard force || !loadedTitles.contains(id), !loadingTitles.contains(id) else { return }
        loadingTitles.insert(id)
        defer { loadingTitles.remove(id) }
        do {
            let d = try await api.title(id: id)
            online()
            register(d.title)
            if inflight[id, default: 0] == 0 {
                if let s = d.state {
                    var merged = s
                    merged.watchedEpisodes = userTitles[id]?.watchedEpisodes ?? []
                    userTitles[id] = merged
                } else if !isSaved(id) {
                    userTitles[id] = nil
                }
            }
            for pm in d.following { if let p = pm.person { register(p) } }
            titleActivity[id] = d.following
            for r in d.reviews { if let a = r.author { register(a) } }
            reviews.removeAll { $0.titleID == id && !(inflight[id, default: 0] > 0 && $0.authorID == me.id) }
            reviews.append(contentsOf: d.reviews.filter { r in !reviews.contains { $0.id == r.id } })
            missingTitles.remove(id)
            loadedTitles.insert(id)
        } catch {
            let e = noteError(error)
            if case .notFound = e { missingTitles.insert(id) }
        }
    }

    /// `GET /feed` + `GET /feed/suggestion`.
    func loadFeed(force: Bool = false) async {
        guard force || !feedLoaded, !feedLoading else { return }
        feedLoading = true
        defer { feedLoading = false }
        do {
            async let page = api.feed(cursor: nil)
            async let sug = api.feedSuggestion()
            var events = try await page.items.map(ingest)
            feedCursor = try await page.nextCursor
            if let s = try await sug {
                events.insert(ingest(s), at: min(3, events.count))
            }
            online()
            var ids: [String] = []
            for e in events {
                if let id = e.titleID { ids.append(id) }
                if case .burst(_, let more) = e.kind { ids += more }
                if case .suggestion(_, _, _, let more) = e.kind { ids += more }
            }
            await hydrateTitles(ids)
            feed = events
            feedLoaded = true
        } catch {
            noteError(error)
        }
    }

    func loadMoreFeed() async {
        guard let cursor = feedCursor, !feedLoading else { return }
        feedLoading = true
        defer { feedLoading = false }
        do {
            let page = try await api.feed(cursor: cursor)
            let events = page.items.map(ingest)
            feedCursor = page.nextCursor
            await hydrateTitles(events.compactMap(\.titleID))
            feed += events.filter { e in !feed.contains { $0.id == e.id } }
        } catch {
            noteError(error)
        }
    }

    /// Registers what the event embeds and derives the display fields.
    private func ingest(_ event: FeedEvent) -> FeedEvent {
        var e = event
        if let t = e.embeddedTitle { register(t) }
        if let p = e.embeddedAuthor { register(p) }
        if let r = e.embeddedReview, !reviews.contains(where: { $0.id == r.id }) { reviews.append(r) }
        if let at = e.at { e.ageHours = max(0, now.timeIntervalSince(at) / 3600) }
        if case .added(let col) = e.kind, let rd = e.releaseDate, rd > now {
            e.kind = .waitingAdd(collection: col, label: sentence(for: .day(KuraJSON.dayAtNoon(rd))))
        }
        return e
    }

    /// `GET /discover`.
    func loadDiscover(force: Bool = false) async {
        guard force || discover == nil, !discoverLoading else { return }
        discoverLoading = true
        defer { discoverLoading = false }
        do {
            let d = try await api.discover()
            online()
            for t in d.allTitles { register(t) }
            discover = d
        } catch {
            noteError(error)
        }
    }

    /// `GET /search` + `GET /people/search`, in parallel. Stale answers are dropped.
    func runSearch(_ q: String, kind: MediaFormat? = nil) async {
        let query = q.trimmingCharacters(in: .whitespaces)
        searchQuery = query
        guard !query.isEmpty else { searchResults = []; searchPeople = []; return }
        searchLoading = true
        searchError = nil
        defer { if searchQuery == query { searchLoading = false } }
        do {
            async let t = api.search(query, kind: kind)
            async let p = api.people(kind: .search(query), cursor: nil)
            let (results, page) = try await (t, p)
            guard searchQuery == query else { return }
            online()
            for r in results { registerPartial(r.title) }
            for person in page.items { register(person) }
            searchResults = results
            searchPeople = page.items
        } catch {
            guard searchQuery == query else { return }
            searchError = noteError(error)
            searchResults = []
            searchPeople = []
        }
    }

    func clearSearch() {
        searchQuery = ""
        searchResults = []
        searchPeople = []
        searchError = nil
        searchLoading = false
    }

    /// `GET /people/{handle}` (404 for private and nonexistent alike).
    func loadPerson(_ handle: String, force: Bool = false) async {
        guard handle != me.id, force || !loadedPeople.contains(handle), !loadingPeople.contains(handle) else { return }
        loadingPeople.insert(handle)
        defer { loadingPeople.remove(handle) }
        do {
            let p = try await api.person(handle: handle)
            online()
            register(p)
            await hydrateTitles(p.obsessions + p.common + p.collections.flatMap(\.titleIDs) + [p.featuredTitleID].compactMap { $0 })
            missingPeople.remove(handle)
            loadedPeople.insert(handle)
        } catch {
            let e = noteError(error)
            if case .notFound = e { missingPeople.insert(handle) }
        }
    }

    static func peopleListKey(of personID: String, following: Bool) -> String { "\(personID)|\(following ? "following" : "followers")" }

    /// Followers / following of someone. Only the owner's lists exist on the
    /// API (§4); another profile's list is empty on live and mock-only otherwise.
    func loadPeopleList(of personID: String, following: Bool) async {
        let key = AppStore.peopleListKey(of: personID, following: following)
        guard peopleLists[key] == nil else { return }
        do {
            let items: [Person]
            if personID == me.id {
                let page = try await api.people(kind: following ? .following : .followers, cursor: nil)
                items = page.items
                if following { self.following.formUnion(items.map(\.id)) }
            } else if let mock = api as? MockAPI {
                items = mock.peopleOf(personID, following: following)
            } else {
                items = []
            }
            online()
            for p in items { register(p) }
            peopleLists[key] = items
        } catch {
            noteError(error)
        }
    }

    func loadSuggestions() async {
        let key = "suggestions"
        guard peopleLists[key] == nil else { return }
        do {
            let page = try await api.people(kind: .suggestions, cursor: nil)
            for p in page.items { register(p) }
            peopleLists[key] = page.items
        } catch {
            noteError(error)
        }
    }

    /// `GET /recap/months` then `GET /recap/{era}` (the newest by default).
    func loadRecap(era: String? = nil) async {
        guard !recapLoading else { return }
        if let era, recaps[era] != nil { return }
        recapLoading = true
        defer { recapLoading = false }
        do {
            if recapMonths == nil { recapMonths = try await api.recapMonths() }
            guard let target = era ?? recapMonths?.first?.era else { return }
            if recaps[target] == nil {
                let r = try await api.recap(era: target)
                online()
                if let t = r.top { register(t) }
                for t in r.also { register(t) }
                recaps[target] = r
            }
        } catch {
            noteError(error)
        }
    }

    var currentRecap: RecapPayload? { recapMonths?.first.flatMap { recaps[$0.era] } }

    /// "recap de agosto" — the newest month, or the previous calendar month before it loads.
    var recapButtonLabel: String {
        if let m = recapMonths?.first { return "recap de \(m.label.split(separator: " ").first ?? "")" }
        let names = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        let m = cal.component(.month, from: now)
        return "recap de \(names[(m + 10) % 12])"
    }

    // MARK: Lookups

    func title(_ id: String) -> Title? { titles[id] }
    func person(_ id: String) -> Person? { id == me.id ? me : people[id] }
    func collection(_ id: String) -> KCollection? { collections.first { $0.id == id } }
    func mark(_ titleID: String) -> Mark? { userTitles[titleID]?.mark }
    func review(_ id: String?) -> Review? { id.flatMap { rid in reviews.first { $0.id == rid } } }
    func myReview(_ titleID: String) -> Review? { reviews.first { $0.titleID == titleID && $0.authorID == me.id } }

    /// Decorative covers for the entrance screens (never part of the live library).
    func decor(_ id: String) -> Title? { titles[id] ?? MockData.titles.first { $0.id == id } }

    /// Collections ordered for "tus colecciones": pinned first, then newest.
    var orderedCollections: [KCollection] {
        collections.sorted { a, b in
            if a.pinned != b.pinned { return a.pinned }
            if a.titleIDs.isEmpty != b.titleIDs.isEmpty { return !a.titleIDs.isEmpty }
            return a.createdAt > b.createdAt
        }
    }

    func titles(in c: KCollection, format: MediaFormat? = nil) -> [Title] {
        var list = c.titleIDs.compactMap { titles[$0] }
        if let format { list = list.filter { $0.format == format } }
        switch c.sort {
        case .manual:
            break
        case .recent:
            list.sort { savedDate($0.id, in: c) > savedDate($1.id, in: c) }
        case .title:
            list.sort { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .status:
            list.sort { (mark($0.id)?.rank ?? 9) < (mark($1.id)?.rank ?? 9) }
        case .year:
            list.sort { ($0.year ?? 0) > ($1.year ?? 0) }
        }
        return list
    }

    private func savedDate(_ titleID: String, in c: KCollection) -> Date {
        c.addedAt[titleID] ?? userTitles[titleID]?.savedAt ?? .distantPast
    }

    func coverTitle(of c: KCollection) -> Title? {
        if let id = c.coverTitleID, c.titleIDs.contains(id), let t = titles[id] { return t }
        return c.titleIDs.first.flatMap { titles[$0] }
    }

    func palette(of c: KCollection) -> [String]? { coverTitle(of: c)?.palette }

    func collectionsContaining(_ titleID: String) -> [KCollection] {
        orderedCollections.filter { $0.titleIDs.contains(titleID) }
    }

    func isSaved(_ titleID: String) -> Bool { !collectionsContaining(titleID).isEmpty }

    /// Reviews you wrote: the server count until the local list catches up.
    var reviewCount: Int { max(account?.stats.reviews ?? 0, reviews.filter { $0.authorID == me.id }.count) }

    // MARK: No puedo esperar

    private static let months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    var cal: Calendar { MockData.calendar }

    /// True while the title (or, for a series, its announced season) is not out.
    func isUnreleased(_ t: Title) -> Bool {
        guard let r = t.release else { return false }
        if t.upcomingSeason != nil { return false } // the show itself is out; the season waits
        return isUnreleased(r)
    }

    func isUnreleased(_ r: Release) -> Bool {
        switch r {
        case .day(let d): return cal.startOfDay(for: d) > cal.startOfDay(for: now)
        case .month(let y, let m):
            let c = cal.dateComponents([.year, .month], from: now)
            return (y, m) > (c.year ?? 0, c.month ?? 0)
        case .year(let y): return y > (cal.component(.year, from: now))
        case .unknown: return true
        }
    }

    /// The DS countdown: "14 h", "3 d", "16 oct", "oct 2026", "2027", "sin fecha", "hoy", "ya salió".
    func label(for r: Release) -> String {
        switch r {
        case .day(let d):
            let today = cal.startOfDay(for: now)
            let day = cal.startOfDay(for: d)
            if day < today { return "ya salió" }
            if day == today { return "hoy" }
            let days = cal.dateComponents([.day], from: today, to: day).day ?? 0
            let hours = Int((d.timeIntervalSince(now) / 3600).rounded(.up))
            if days <= 1 && hours <= 24 {
                return "\(max(hours, 1)) h"
            } else if days <= 7 {
                return "\(days) d"
            } else {
                let comps = cal.dateComponents([.year, .month, .day], from: d)
                var s = "\(comps.day ?? 0) \(Self.months[(comps.month ?? 1) - 1])"
                if comps.year != cal.component(.year, from: now) { s += " \(comps.year ?? 0)" }
                return s
            }
        case .month(let y, let m): return "\(Self.months[m - 1]) \(y)"
        case .year(let y): return "\(y)"
        case .unknown: return "sin fecha"
        }
    }

    func releaseLabel(_ t: Title, withSeason: Bool = false) -> String? {
        guard let r = t.release else { return nil }
        let base = label(for: r)
        if withSeason, let s = t.upcomingSeason { return "T\(s) · \(base)" }
        return base
    }

    /// Long form for sentences: "sale el 16 oct".
    func sentence(for r: Release) -> String {
        let text = label(for: r)
        switch text {
        case "ya salió", "hoy", "sin fecha": return text
        default:
            if text.hasSuffix(" h") || text.hasSuffix(" d") { return "sale en \(text)" }
            return "sale el \(text)"
        }
    }

    func releaseSentence(_ t: Title) -> String? {
        t.release.map(sentence(for:))
    }

    /// The automatic collection: announced titles you saved, until you complete them.
    var waitingTitles: [Title] {
        let saved = Set(collections.flatMap(\.titleIDs))
        let list = saved.compactMap { titles[$0] }.filter { $0.release != nil && mark($0.id) == nil }
        func key(_ t: Title) -> (Int, Date) {
            guard let r = t.release else { return (9, .distantFuture) }
            if !isUnreleased(t) && t.upcomingSeason == nil { return (0, .distantPast) }
            switch r {
            case .day(let d): return (1, d)
            case .month(let y, let m): return (2, cal.date(from: DateComponents(year: y, month: m)) ?? .distantFuture)
            case .year(let y): return (3, cal.date(from: DateComponents(year: y)) ?? .distantFuture)
            case .unknown: return (4, .distantFuture)
            }
        }
        return list.sorted { key($0) < key($1) }
    }

    // MARK: Toasts

    func showToast(_ t: ToastModel) {
        toastTask?.cancel()
        withAnimation(KMotion.short) { toast = t }
        let id = t.id
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.toast?.id == id else { return }
                withAnimation(KMotion.short) { self.toast = nil }
            }
        }
    }

    func undoToast(_ text: String, undo: @escaping () -> Void) {
        showToast(ToastModel(text: text, kind: .undo) { [weak self] in
            undo()
            withAnimation(KMotion.short) { self?.toast = nil }
        })
    }

    func dismissToast() { withAnimation(KMotion.short) { toast = nil } }

    /// Runs an API write; on failure offers "Reintentar" (with the error's own
    /// text when it says what to do). `onError` lets a caller revert its
    /// optimistic change for errors that a retry can't fix.
    private func sync(titleID: String? = nil,
                      onError: (@MainActor (KuraAPIError) -> Bool)? = nil,
                      _ op: @escaping @Sendable (KuraAPI) async throws -> Void) {
        let api = self.api
        if let titleID { inflight[titleID, default: 0] += 1 }
        Task { [weak self] in
            do {
                try await op(api)
                await MainActor.run { self?.online() }
            } catch {
                await MainActor.run {
                    guard let self else { return }
                    let e = self.noteError(error)
                    if let onError, onError(e) { return }
                    switch e {
                    case .unauthorized, .notFound, .unsupported:
                        return
                    default:
                        self.showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in
                            self?.sync(titleID: titleID, onError: onError, op)
                        })
                    }
                }
            }
            await MainActor.run { if let titleID, let self { self.inflight[titleID, default: 1] -= 1 } }
        }
    }

    private func patchMe(_ patch: MePatch) {
        sync { api in
            let m = try await api.updateMe(patch)
            await MainActor.run { [weak self] in self?.account = m }
        }
    }

    // MARK: Sheets & navigation

    func present(_ route: SheetRoute) {
        withAnimation(KMotion.sheetIn) { sheet = route }
    }

    func dismissSheet() {
        withAnimation(KMotion.sheetOut) { sheet = nil }
    }

    func path(_ tab: Tab) -> [Route] { paths[tab] ?? [] }

    func push(_ route: Route) {
        var p = paths[tab] ?? []
        p.append(route)
        paths[tab] = p
    }

    func pop() {
        var p = paths[tab] ?? []
        if !p.isEmpty { p.removeLast() }
        paths[tab] = p
    }

    func select(_ newTab: Tab) {
        if newTab == tab {
            paths[newTab] = [] // tapping the active tab pops to root
        }
        tab = newTab
    }

    // MARK: Collection writes

    /// The server id for a collection created optimistically (or the id itself).
    private func resolveCollectionID(_ id: String) async throws -> String {
        guard let task = pendingCollections[id] else { return id }
        return try await task.value
    }

    /// Swaps a temporary collection id for the one the server assigned.
    private func adopt(serverID: String, for localID: String) {
        guard serverID != localID else { return }
        if let i = collections.firstIndex(where: { $0.id == localID }) {
            let c = collections[i]
            var moved = KCollection(id: serverID, name: c.name, titleIDs: c.titleIDs, privacy: c.privacy, pinned: c.pinned,
                                    coverTitleID: c.coverTitleID, sort: c.sort, layout: c.layout, createdAt: c.createdAt, addedAt: c.addedAt)
            moved.embeddedTitles = c.embeddedTitles
            collections[i] = moved
        }
        if lastUsedCollectionID == localID { lastUsedCollectionID = serverID }
        for tab in Tab.allCases {
            paths[tab] = paths[tab]?.map { r in
                switch r {
                case .collection(localID): return .collection(serverID)
                case .reorder(localID): return .reorder(serverID)
                case .changeCover(localID): return .changeCover(serverID)
                default: return r
                }
            }
        }
        if case .more(localID) = sheet { sheet = .more(serverID) }
        if case .addTitles(localID) = sheet { sheet = .addTitles(serverID) }
        loadedCollections.insert(serverID)
    }

    @discardableResult
    func createCollection(name: String, privacy: Privacy, adding titleID: String? = nil) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalName = trimmed.isEmpty ? "colección nueva" : trimmed.lowercased()
        var c = KCollection(id: "c-\(UUID().uuidString.prefix(8))", name: finalName, titleIDs: [], privacy: privacy, createdAt: Date())
        if let titleID {
            c.titleIDs = [titleID]
            c.addedAt[titleID] = Date()
            ensureUserState(titleID)
        }
        collections.append(c)
        lastUsedCollectionID = c.id
        loadedCollections.insert(c.id)
        let localID = c.id
        let api = self.api
        let task = Task<String, Error> { [weak self] in
            let created = try await api.createCollection(name: finalName, privacy: privacy)
            await MainActor.run { self?.adopt(serverID: created.id, for: localID) }
            if let titleID {
                let r = try await api.createTitleMembership(collectionID: created.id, ref: TitleRef.from(localID: titleID))
                await MainActor.run { self?.absorb(r, localID: titleID) }
            }
            return created.id
        }
        pendingCollections[localID] = task
        Task { [weak self] in
            do {
                let sid = try await task.value
                await MainActor.run {
                    self?.pendingCollections[localID] = nil
                    self?.pendingCollections[sid] = nil
                    self?.online()
                }
            } catch {
                await MainActor.run {
                    guard let self else { return }
                    self.pendingCollections[localID] = nil
                    let e = self.noteError(error)
                    self.collections.removeAll { $0.id == localID }
                    if let titleID { self.gcUserState(titleID) }
                    self.showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in
                        self?.createCollection(name: finalName, privacy: privacy, adding: titleID)
                    })
                }
            }
        }
        return c.id
    }

    private func update(_ id: String, _ change: (inout KCollection) -> Void) {
        guard let i = collections.firstIndex(where: { $0.id == id }) else { return }
        change(&collections[i])
    }

    private func syncCollection(_ id: String, name: String? = nil, privacy: Privacy? = nil) {
        sync { [weak self] api in
            let sid = try await self?.resolveCollectionID(id) ?? id
            _ = try await api.updateCollection(id: sid, name: name, privacy: privacy)
        }
    }

    func rename(_ id: String, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let old = collection(id)?.name else { return }
        let new = trimmed.lowercased()
        update(id) { $0.name = new }
        syncCollection(id, name: new)
        undoToast("Renombrada") { [weak self] in
            self?.update(id) { $0.name = old }
            self?.syncCollection(id, name: old)
        }
    }

    func setPrivacy(_ id: String, _ p: Privacy) {
        guard let old = collection(id)?.privacy, old != p else { return }
        update(id) { $0.privacy = p }
        syncCollection(id, privacy: p)
        undoToast("Ahora la ve: \(p.label.lowercased())") { [weak self] in
            self?.update(id) { $0.privacy = old }
            self?.syncCollection(id, privacy: old)
        }
    }

    // Pinned, cover, sort, layout and manual order are device-local (§3: no model).

    func togglePin(_ id: String) {
        guard let c = collection(id) else { return }
        let pinned = !c.pinned
        update(id) { $0.pinned = pinned }
        saveLocal()
        undoToast(pinned ? "Fijada arriba" : "Ya no está fijada") { [weak self] in
            self?.update(id) { $0.pinned = !pinned }
            self?.saveLocal()
        }
    }

    func setCover(_ id: String, titleID: String) {
        let old = collection(id)?.coverTitleID
        update(id) { $0.coverTitleID = titleID }
        saveLocal()
        undoToast("Portada cambiada") { [weak self] in
            self?.update(id) { $0.coverTitleID = old }
            self?.saveLocal()
        }
    }

    func setSort(_ id: String, _ s: SortMode) { update(id) { $0.sort = s }; saveLocal() }
    func setLayout(_ id: String, _ l: CollectionLayout) { update(id) { $0.layout = l }; saveLocal() }

    func reorder(_ id: String, from: IndexSet, to: Int) {
        update(id) { c in
            c.titleIDs.move(fromOffsets: from, toOffset: to)
            c.sort = .manual
        }
        saveLocal()
    }

    func deleteCollection(_ id: String) {
        collections.removeAll { $0.id == id }
        for tab in Tab.allCases {
            paths[tab]?.removeAll { r in
                if case .collection(let cid) = r { return cid == id }
                return false
            }
        }
        for (key, task) in deferredWrites where key.hasSuffix("|\(id)") { task.cancel(); deferredWrites[key] = nil }
        sync { [weak self] api in
            let sid = try await self?.resolveCollectionID(id) ?? id
            try await api.deleteCollection(id: sid)
        }
        saveLocal()
        showToast(ToastModel(text: "Colección borrada", kind: .info))
    }

    // MARK: Title membership

    private func ensureUserState(_ titleID: String) {
        if userTitles[titleID] == nil { userTitles[titleID] = UserTitleState(savedAt: Date()) }
    }

    /// If a title is in no collection anymore its state goes with it.
    private func gcUserState(_ titleID: String) {
        if !isSaved(titleID) {
            userTitles[titleID] = nil
            reviews.removeAll { $0.titleID == titleID && $0.authorID == me.id }
        }
    }

    /// The membership response: the real (cached) title and the server state.
    private func absorb(_ r: MembershipResult, localID: String) {
        if r.title.id != localID { remapExternal(localID, to: r.title) } else { register(r.title) }
        if let s = r.state, inflight[r.title.id, default: 0] <= 1 {
            var merged = s
            merged.watchedEpisodes = userTitles[r.title.id]?.watchedEpisodes ?? []
            if let local = userTitles[r.title.id], local.mark != merged.mark, inflight[r.title.id, default: 0] > 0 { return }
            userTitles[r.title.id] = merged
        }
    }

    /// An external search result became a real catalog item: move everything over.
    private func remapExternal(_ localID: String, to real: Title) {
        register(real)
        titles[localID] = nil
        catalogOrder.removeAll { $0 == localID }
        for i in collections.indices {
            collections[i].titleIDs = collections[i].titleIDs.map { $0 == localID ? real.id : $0 }
            if let d = collections[i].addedAt.removeValue(forKey: localID) { collections[i].addedAt[real.id] = d }
            if collections[i].coverTitleID == localID { collections[i].coverTitleID = real.id }
        }
        if let s = userTitles.removeValue(forKey: localID), userTitles[real.id] == nil { userTitles[real.id] = s }
        recentlyViewed = recentlyViewed.map { $0 == localID ? real.id : $0 }
        onboardingPicks = onboardingPicks.map { $0 == localID ? real.id : $0 }
        for tab in Tab.allCases {
            paths[tab] = paths[tab]?.map { if case .title(localID) = $0 { return .title(real.id) } else { return $0 } }
        }
        switch sheet {
        case .saveTo(localID): sheet = .saveTo(real.id)
        case .complete(localID, let f): sheet = .complete(titleID: real.id, focusReview: f)
        case .titleMore(localID): sheet = .titleMore(real.id)
        default: break
        }
    }

    private func syncAdd(_ titleID: String, to collectionID: String) {
        sync(titleID: titleID) { [weak self] api in
            let cid = try await self?.resolveCollectionID(collectionID) ?? collectionID
            let r = try await api.createTitleMembership(collectionID: cid, ref: TitleRef.from(localID: titleID))
            await MainActor.run { self?.absorb(r, localID: titleID) }
        }
    }

    private func syncRemove(_ titleID: String, from collectionID: String) {
        sync(titleID: titleID) { [weak self] api in
            let cid = try await self?.resolveCollectionID(collectionID) ?? collectionID
            try await api.removeTitleMembership(collectionID: cid, titleID: titleID)
        }
    }

    /// Removals wait for the Deshacer window (5 s): undoing never round-trips,
    /// and the server keeps the title's state until the window closes.
    private func deferRemove(_ titleID: String, from collectionID: String) {
        let key = "\(titleID)|\(collectionID)"
        deferredWrites[key]?.cancel()
        deferredWrites[key] = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self else { return }
                self.deferredWrites[key] = nil
                self.syncRemove(titleID, from: collectionID)
            }
        }
    }

    /// Cancels a pending removal; true when there was one (nothing to re-add on the server).
    @discardableResult
    private func cancelRemove(_ titleID: String, from collectionID: String) -> Bool {
        let key = "\(titleID)|\(collectionID)"
        guard let t = deferredWrites[key] else { return false }
        t.cancel()
        deferredWrites[key] = nil
        return true
    }

    private func pendingRemovals(in collectionID: String) -> [String] {
        deferredWrites.keys.filter { $0.hasSuffix("|\(collectionID)") }.map { String($0.split(separator: "|")[0]) }
    }

    func add(_ titleID: String, to collectionID: String, toast: Bool = true) {
        guard let c = collection(collectionID), !c.titleIDs.contains(titleID) else { return }
        let hadState = userTitles[titleID]
        ensureUserState(titleID)
        update(collectionID) { $0.titleIDs.insert(titleID, at: 0); $0.addedAt[titleID] = Date() }
        lastUsedCollectionID = collectionID
        if !cancelRemove(titleID, from: collectionID) { syncAdd(titleID, to: collectionID) }
        if toast {
            undoToast("Agregado a \(c.name)") { [weak self] in
                self?.update(collectionID) { $0.titleIDs.removeAll { $0 == titleID } }
                self?.syncRemove(titleID, from: collectionID)
                if hadState == nil { self?.gcUserState(titleID) }
            }
        }
    }

    /// Silent inverse used by the add sheet's ✓ → + toggle.
    func removeSilently(_ titleID: String, from collectionID: String) {
        update(collectionID) { $0.titleIDs.removeAll { $0 == titleID } }
        syncRemove(titleID, from: collectionID)
        gcUserState(titleID)
    }

    func remove(_ titleID: String, from collectionID: String) {
        guard let c = collection(collectionID), let idx = c.titleIDs.firstIndex(of: titleID) else { return }
        let state = userTitles[titleID]
        let myReviews = reviews.filter { $0.titleID == titleID && $0.authorID == me.id }
        update(collectionID) { $0.titleIDs.remove(at: idx) }
        gcUserState(titleID)
        deferRemove(titleID, from: collectionID)
        undoToast("Quitado de \(c.name)") { [weak self] in
            guard let self else { return }
            self.cancelRemove(titleID, from: collectionID)
            self.update(collectionID) { $0.titleIDs.insert(titleID, at: min(idx, $0.titleIDs.count)) }
            if self.userTitles[titleID] == nil { self.userTitles[titleID] = state }
            for r in myReviews where !self.reviews.contains(r) { self.reviews.append(r) }
        }
    }

    func move(_ titleID: String, from fromID: String, to toID: String) {
        guard fromID != toID, let from = collection(fromID), let to = collection(toID),
              let idx = from.titleIDs.firstIndex(of: titleID) else { return }
        let alreadyThere = to.titleIDs.contains(titleID)
        update(fromID) { $0.titleIDs.remove(at: idx) }
        if !alreadyThere {
            update(toID) { $0.titleIDs.insert(titleID, at: 0); $0.addedAt[titleID] = Date() }
            if !cancelRemove(titleID, from: toID) { syncAdd(titleID, to: toID) }
        }
        deferRemove(titleID, from: fromID)
        lastUsedCollectionID = toID
        undoToast("Movido a \(to.name)") { [weak self] in
            guard let self else { return }
            self.cancelRemove(titleID, from: fromID)
            if !alreadyThere {
                self.update(toID) { $0.titleIDs.removeAll { $0 == titleID } }
                self.syncRemove(titleID, from: toID)
            }
            self.update(fromID) { $0.titleIDs.insert(titleID, at: min(idx, $0.titleIDs.count)) }
        }
    }

    /// "Guardar en": sets the exact membership of a title.
    func setMembership(_ titleID: String, collections ids: Set<String>) {
        let before = Set(collectionsContaining(titleID).map(\.id))
        guard before != ids else { return }
        let hadState = userTitles[titleID]
        if !ids.isEmpty { ensureUserState(titleID) }
        let added = ids.subtracting(before)
        let removed = before.subtracting(ids)
        for id in added {
            update(id) { $0.titleIDs.insert(titleID, at: 0); $0.addedAt[titleID] = Date() }
            if !cancelRemove(titleID, from: id) { syncAdd(titleID, to: id) }
        }
        for id in removed {
            update(id) { $0.titleIDs.removeAll { $0 == titleID } }
            deferRemove(titleID, from: id)
        }
        if let first = added.first { lastUsedCollectionID = first }
        if before.isEmpty && !ids.isEmpty, notifyReleases, let t = titles[titleID], isUnreleased(t) {
            ReleaseNotifier.schedule(t)
        }
        gcUserState(titleID)
        let text: String
        if ids.isEmpty {
            text = "Ya no está guardado"
        } else if ids.count == 1, let c = collection(ids.first!) {
            text = "Guardado en \(c.name)"
        } else {
            text = "Guardado en \(ids.count) colecciones"
        }
        undoToast(text) { [weak self] in
            guard let self else { return }
            for id in added {
                self.update(id) { $0.titleIDs.removeAll { $0 == titleID } }
                self.syncRemove(titleID, from: id)
            }
            for id in removed {
                self.cancelRemove(titleID, from: id)
                self.update(id) { $0.titleIDs.insert(titleID, at: 0) }
            }
            self.userTitles[titleID] = hadState
        }
    }

    // MARK: Reactions

    func setMark(_ titleID: String, _ mark: Mark?, haptic: Bool = true, preview: Bool = false) {
        let previous = userTitles[titleID]?.mark
        ensureUserState(titleID)
        userTitles[titleID]?.mark = mark
        if haptic {
            switch mark {
            case .obsessed: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case .liked: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            default: break
            }
        }
        sync(titleID: titleID, onError: { [weak self] e in
            // "Todavía no sale" is not retryable: revert and say so.
            if case .conflict(let code, _) = e, code == "not_released" {
                self?.userTitles[titleID]?.mark = previous
                self?.showToast(ToastModel(text: e.toast, kind: .info))
                return true
            }
            return false
        }) { [weak self] api in
            let s = try await api.setMark(titleID: titleID, mark: mark, preview: preview)
            await MainActor.run {
                guard let self, self.userTitles[titleID]?.mark == mark else { return }
                if let rid = s.reviewID { self.userTitles[titleID]?.reviewID = rid }
                self.userTitles[titleID]?.savedAt = s.savedAt
            }
        }
    }

    func publishReview(titleID: String, text: String, spoiler: Bool) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        ensureUserState(titleID)
        let mark = self.mark(titleID)
        let localID: String
        if let i = reviews.firstIndex(where: { $0.titleID == titleID && $0.authorID == me.id }) {
            reviews[i].text = trimmed
            reviews[i].spoiler = spoiler
            reviews[i].mark = mark
            localID = reviews[i].id
        } else {
            let r = Review(id: "r-\(UUID().uuidString.prefix(6))", authorID: me.id, titleID: titleID,
                           text: trimmed, mark: mark, spoiler: spoiler, date: Date())
            reviews.insert(r, at: 0)
            userTitles[titleID]?.reviewID = r.id
            localID = r.id
        }
        sync(titleID: titleID) { [weak self] api in
            let saved = try await api.saveReview(titleID: titleID, body: trimmed, hasSpoiler: spoiler)
            await MainActor.run {
                guard let self, let i = self.reviews.firstIndex(where: { $0.id == localID }) else { return }
                var r = saved
                r.author = nil
                let merged = Review(id: saved.id, authorID: self.me.id, titleID: titleID, text: self.reviews[i].text,
                                    mark: saved.mark ?? self.reviews[i].mark, spoiler: self.reviews[i].spoiler, date: saved.date)
                self.reviews[i] = merged
                self.userTitles[titleID]?.reviewID = saved.id
                self.revealedSpoilers.remove(localID)
            }
        }
    }

    func deleteReview(titleID: String) {
        let mine = reviews.filter { $0.titleID == titleID && $0.authorID == me.id }
        guard !mine.isEmpty else { return }
        reviews.removeAll { $0.titleID == titleID && $0.authorID == me.id }
        userTitles[titleID]?.reviewID = nil
        sync(titleID: titleID) { api in try await api.deleteReview(titleID: titleID) }
        undoToast("Reseña borrada") { [weak self] in
            guard let self else { return }
            self.reviews.append(contentsOf: mine)
            if let r = mine.first { self.publishReview(titleID: titleID, text: r.text, spoiler: r.spoiler) }
        }
    }

    /// Episodes are local (§4: `PUT …/episodes` → 501).
    func toggleEpisode(_ titleID: String, key: String) {
        ensureUserState(titleID)
        var set = userTitles[titleID]?.watchedEpisodes ?? []
        let watched = !set.contains(key)
        if watched { set.insert(key) } else { set.remove(key) }
        userTitles[titleID]?.watchedEpisodes = set
        UISelectionFeedbackGenerator().selectionChanged()
        saveLocal()
    }

    // MARK: Social

    func isFollowing(_ id: String) -> Bool { following.contains(id) }

    func toggleFollow(_ id: String) {
        let now = !following.contains(id)
        if now { following.insert(id) } else { following.remove(id) }
        if var p = people[id] { p.isFollowing = now; people[id] = p }
        me.followingCount = max(0, me.followingCount + (now ? 1 : -1))
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        sync { api in try await api.setFollowing(handle: id, following: now) }
    }

    /// Followed people who did something with this title.
    func followedMarks(for titleID: String) -> [(Person, PeopleMark)] {
        (titleActivity[titleID] ?? []).compactMap { pm in
            guard following.contains(pm.personID), let p = people[pm.personID] else { return nil }
            return (p, pm)
        }
    }

    /// Follow from a profile: public → follow; private → request (Solicitado).
    /// Tapping Siguiendo unfollows at once with Deshacer (no confirmation).
    func followFromProfile(_ id: String) {
        guard let p = people[id] else { return }
        if following.contains(id) {
            following.remove(id)
            me.followingCount = max(0, me.followingCount - 1)
            sync { api in try await api.setFollowing(handle: id, following: false) }
            undoToast("Dejaste de seguir a @\(p.handle)") { [weak self] in
                self?.following.insert(id)
                self?.me.followingCount += 1
                self?.sync { api in try await api.setFollowing(handle: id, following: true) }
            }
        } else if p.isPrivate {
            if requested.contains(id) { requested.remove(id) } else { requested.insert(id) }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } else {
            toggleFollow(id)
        }
    }

    func toggleMute(_ id: String) {
        guard let p = people[id] else { return }
        let now = !muted.contains(id)
        if now { muted.insert(id) } else { muted.remove(id) }
        saveLocal()
        undoToast(now ? "@\(p.handle) ya no sale en tu feed" : "@\(p.handle) vuelve a tu feed") { [weak self] in
            if now { self?.muted.remove(id) } else { self?.muted.insert(id) }
            self?.saveLocal()
        }
    }

    func creator(_ name: String) -> Creator {
        if KuraRuntime.usesMock, let c = MockData.creators[name] { return c }
        let works = catalogOrder.compactMap { titles[$0] }.filter { $0.creator == name }
        let isMusic = works.contains { $0.format == .album }
        return Creator(name: name, role: isMusic ? "artista" : "director", works: max(works.count, 1))
    }

    /// Visible feed: nobody you muted.
    var visibleFeed: [FeedEvent] { feed.filter { !muted.contains($0.authorID) } }

    func setRequest(_ notificationID: String, _ state: RequestState) {
        requestStates[notificationID] = state
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    func markNotificationsRead() {
        for i in notifications.indices { notifications[i].unread = false }
    }

    var hasUnread: Bool { notifications.contains(where: \.unread) }

    func toggleAlert(_ titleID: String) {
        if alerts.contains(titleID) { alerts.remove(titleID) } else {
            alerts.insert(titleID)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
        saveLocal()
    }

    /// 20f · Editar perfil: name via `PATCH /me`, handle via `PUT /me/username`
    /// (409 → "ya está tomado"); featured obsession and "en común" stay local.
    func saveProfile(name: String, handle: String, featured: String?, isPrivate: Bool, showCommon: Bool) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cleanHandle = handle.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" }
        let oldName = me.name
        let oldHandle = me.handle
        var updated = me
        if !cleanName.isEmpty { updated.name = cleanName; updated.initials = Person.initials(of: cleanName) }
        if let featured {
            updated.featuredTitleID = featured
            if let t = titles[featured] { updated.hexes = t.palette }
        }
        let newHandle = cleanHandle.isEmpty ? oldHandle : cleanHandle
        let handleChanged = newHandle != oldHandle
        if handleChanged {
            updated = Person(handle: newHandle, name: updated.name, initials: updated.initials, hexes: updated.hexes,
                             featuredTitleID: updated.featuredTitleID, isPrivate: updated.isPrivate,
                             followers: updated.followers, followingCount: updated.followingCount, stats: updated.stats)
            people[oldHandle] = nil
        }
        me = updated
        if !me.id.isEmpty { people[me.id] = me }
        profilePrivate = isPrivate
        self.showCommon = showCommon
        saveLocal()
        if !cleanName.isEmpty, cleanName != oldName { patchMe(MePatch(name: cleanName)) }
        if handleChanged {
            sync(onError: { [weak self] e in
                guard case .conflict = e else { return false }
                self?.showToast(ToastModel(text: "@\(newHandle) ya está tomado", kind: .info))
                return true
            }) { [weak self] api in
                let m = try await api.claimUsername(newHandle)
                await MainActor.run { self?.account = m }
            }
        }
        showToast(ToastModel(text: "Perfil actualizado", kind: .info))
    }

    /// C3 · the second irreversible action (typing your @ confirms it).
    func deleteAccount() {
        Task { [weak self] in
            guard let self else { return }
            do {
                try await api.deleteAccount()
                prefs.clear()
                signOut(message: "Tu cuenta se borró.")
            } catch {
                let e = noteError(error)
                showToast(ToastModel(text: e.toast, kind: .info))
            }
        }
    }

    // MARK: Counters (profile ribbon)

    func count(of mark: Mark) -> Int { userTitles.values.filter { $0.mark == mark }.count }
    var savedCount: Int { Set(collections.flatMap(\.titleIDs)).count }

    // MARK: Session

    /// After the splash: a stored token skips the entrance (refreshing it when
    /// it's about to expire); no token → entrance.
    func finishSplash() async {
        guard phase == .splash else { return }
        guard api.hasSession else {
            withAnimation(.easeInOut(duration: 0.2)) { phase = .onboarding }
            return
        }
        if api.needsRefresh {
            do {
                let m = try await api.refresh()
                applyMe(m)
                if !route(after: m) { return }
            } catch {
                let e = noteError(error)
                if e == .unauthorized { return }
                // Transport trouble: keep the token, try the library anyway.
            }
        }
        withAnimation(.easeInOut(duration: 0.2)) { phase = .main }
    }

    /// `POST auth/otp/request` — true when the code went out.
    func requestCode(email: String) async -> Bool {
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard e.contains("@"), e.contains(".") else { authError = "Revisa el correo."; return false }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            try await api.requestCode(email: e)
            authEmail = e
            return true
        } catch {
            authError = noteError(error).authText
            return false
        }
    }

    /// `POST auth/otp/verify` — stores the token and routes: username → picks → main.
    func verifyCode(_ code: String) async -> Bool {
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            let m = try await api.signIn(email: authEmail, code: code.trimmingCharacters(in: .whitespaces))
            applyMe(m)
            if route(after: m) { enterMain() }
            return true
        } catch {
            authError = noteError(error).authText
            return false
        }
    }

    /// Where a fresh session goes: no handle or no name → O1b; else the tabs.
    /// (`onboardingComplete` on `Me` is what decides; the picks only run inside
    /// a fresh onboarding, right after `POST /me/onboarding`.)
    @discardableResult
    private func route(after m: Me) -> Bool {
        if m.handle == nil || !m.onboarded {
            onboardingStep = .username
            withAnimation(KMotion.short) { phase = .onboarding }
            return false
        }
        return true
    }

    /// O1b · `PUT /me/username` + `POST /me/onboarding` (403 underage → 13 años).
    func submitUsername(handle: String, name: String, birthYear: Int?) async -> Bool {
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            var m = account
            if account?.handle != handle {
                m = try await api.claimUsername(handle)
                applyMe(m!)
            }
            let freshOnboarding = !(m?.onboarded ?? false)
            if freshOnboarding {
                guard let birthYear else { authError = "Falta tu año de nacimiento."; return false }
                m = try await api.completeOnboarding(name: name.trimmingCharacters(in: .whitespaces).lowercased(), birthYear: birthYear)
                applyMe(m!)
                onboardingStep = .pick
                Task { await loadOnboardingGrid() }
            } else {
                enterMain()
            }
            return true
        } catch {
            let e = noteError(error)
            if case .forbidden(let code) = e, code == "underage" {
                onboardingStep = .underage
                return false
            }
            if case .conflict = e { authError = "Ese usuario ya está tomado."; return false }
            if case .invalid(let fields, let msg) = e {
                authError = fields["username"] ?? fields["name"] ?? fields["birthYear"] ?? (msg.isEmpty ? "Revisa los datos." : msg)
                return false
            }
            authError = e.authText
            return false
        }
    }

    func checkUsername(_ handle: String) async -> UsernameStatus? {
        try? await api.checkUsername(handle)
    }

    func loadOnboardingGrid() async {
        guard onboardingGrid.isEmpty else { return }
        do {
            let g = try await api.onboardingGrid()
            for t in g { registerPartial(t) }
            onboardingGrid = g
        } catch {
            noteError(error)
        }
    }

    /// 32a · `POST /me/onboarding/picks` with the three obsessions.
    func submitPicks() async -> Bool {
        guard onboardingPicks.count == 3 else { return false }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            let c = try await api.onboardingPicks(onboardingPicks.map(TitleRef.from(localID:)))
            for t in c.embeddedTitles { register(t) }
            if !collections.contains(where: { $0.id == c.id }) { collections.append(applyLocal(c)) }
            for id in c.titleIDs { ensureUserState(id); userTitles[id]?.mark = .obsessed }
            if let first = c.titleIDs.first, let t = titles[first] { me.hexes = t.palette; me.featuredTitleID = first }
            onboardingStep = .people
            await loadOnboardingPeople()
            return true
        } catch {
            authError = noteError(error).authText
            return false
        }
    }

    func loadOnboardingPeople() async {
        guard onboardingPeople.isEmpty else { return }
        do {
            let list = try await api.onboardingPeople()
            for p in list { register(p) }
            onboardingPeople = list
        } catch {
            noteError(error)
        }
    }

    func finishOnboarding() {
        enterMain()
    }

    private func enterMain() {
        sheet = nil
        paths = [:]
        tab = .collections
        didBootstrap = false
        withAnimation(KMotion.short) { phase = .main }
    }

    /// Called once when the main UI first appears.
    func startIfNeeded() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        await bootstrap(emptyLibrary: emptyLibrary, keepLoading: keepLoading)
        if debugEmptyFollowing { following = [] }
        if let id = pendingListCollection, let i = collections.firstIndex(where: { $0.id == id }) {
            collections[i].layout = .list
        }
        if let action = pendingAction {
            pendingAction = nil
            try? await Task.sleep(for: .milliseconds(300))
            action()
        }
        if let s = pendingSheet {
            pendingSheet = nil
            try? await Task.sleep(for: .milliseconds(250))
            present(s)
        }
    }

    func signOut(message: String? = nil) {
        let api = self.api
        Task { try? await api.logout() }
        resetData()
        prefs.clear()
        withAnimation(KMotion.short) { phase = .onboarding }
        if let message { showToast(ToastModel(text: message, kind: .info)) }
    }

    /// A 401 anywhere: the token is already gone, back to the entrance.
    private func sessionExpired() {
        guard phase != .onboarding || didBootstrap else { return }
        resetData()
        withAnimation(KMotion.short) { phase = .onboarding }
        showToast(ToastModel(text: "Tu sesión terminó. Entra de nuevo.", kind: .info))
    }

    private func resetData() {
        sheet = nil
        onboardingStep = .welcome
        paths = [:]
        tab = .collections
        didBootstrap = false
        loadState = .loading
        account = nil
        me = KuraRuntime.usesMock ? MockData.me : Person(handle: "", name: "", initials: "k", hexes: [])
        collections = []
        userTitles = [:]
        following = []
        reviews = []
        feed = []
        feedLoaded = false
        feedCursor = nil
        discover = nil
        titleActivity = [:]
        loadedCollections = []
        loadedTitles = []
        missingTitles = []
        loadedPeople = []
        missingPeople = []
        peopleLists = [:]
        searchResults = []
        searchPeople = []
        onboardingPicks = []
        onboardingGrid = []
        onboardingPeople = []
        recapMonths = nil
        recaps = [:]
        requested = []
        muted = []
        alerts = []
        authEmail = ""
        authError = nil
        for (_, t) in deferredWrites { t.cancel() }
        deferredWrites = [:]
        pendingCollections = [:]
        if !KuraRuntime.usesMock {
            people = [:]
            titles = [:]
            catalogOrder = []
            recentSearches = []
            recentlyViewed = []
        }
    }

    // MARK: Local prefs (what the API marks unsupported)

    private var local = LocalPrefs.Payload()

    private func loadLocal() {
        local = prefs.load()
        recentSearches = local.recentSearches
        recentlyViewed = local.recentlyViewed
        alerts = Set(local.alerts)
        muted = Set(local.muted)
        showCommon = local.showCommon
        if let p = local.defaultPrivacy { defaultPrivacy = Privacy(rawValue: p) ?? .onlyMe }
    }

    private func applyLocal(_ c: KCollection) -> KCollection {
        guard let l = local.collections[c.id] else { return c }
        var out = c
        out.pinned = l.pinned
        out.coverTitleID = l.coverTitleID
        out.sort = l.sort
        out.layout = l.layout
        if let order = l.order {
            let known = order.filter { c.titleIDs.contains($0) }
            out.titleIDs = known + c.titleIDs.filter { !known.contains($0) }
        }
        return out
    }

    private func applyLocalEpisodes() {
        for (id, eps) in local.watchedEpisodes where userTitles[id] != nil {
            userTitles[id]?.watchedEpisodes = Set(eps)
        }
    }

    func saveLocal() {
        guard prefs.enabled else { return }
        var p = LocalPrefs.Payload()
        for c in collections {
            let entry = LocalPrefs.Collection(pinned: c.pinned, coverTitleID: c.coverTitleID, sort: c.sort, layout: c.layout,
                                              order: c.sort == .manual ? c.titleIDs : nil)
            if entry != LocalPrefs.Collection() { p.collections[c.id] = entry }
        }
        for (id, s) in userTitles where !s.watchedEpisodes.isEmpty { p.watchedEpisodes[id] = Array(s.watchedEpisodes).sorted() }
        p.recentSearches = recentSearches
        p.recentlyViewed = recentlyViewed
        p.alerts = Array(alerts).sorted()
        p.muted = Array(muted).sorted()
        p.showCommon = showCommon
        p.defaultPrivacy = defaultPrivacy.rawValue
        local = p
        prefs.save(p)
    }
}

private extension KuraAPIError {
    /// Inline text for the entrance screens.
    var authText: String {
        switch self {
        case .offline: return "Sin conexión. Revisa tu red e inténtalo de nuevo."
        case .rateLimited(let s):
            if let s { return "Espera \(s) s antes de pedir otro código." }
            return "Espera un momento antes de pedir otro código."
        case .invalid(let fields, let m):
            return fields["code"] ?? fields["email"] ?? (m.isEmpty ? "Revisa el código." : m)
        case .unauthorized, .notFound: return "El código no coincide o ya caducó."
        case .conflict(_, let m): return m.isEmpty ? "No se pudo completar." : m
        default: return "No se pudo entrar. Inténtalo de nuevo."
        }
    }
}
