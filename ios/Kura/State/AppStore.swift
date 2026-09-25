import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

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
    /// Reasons for reporting a profile or a review (`ReportTarget`).
    case report(ReportTarget)
    /// "¿bloquear a @…?" — what blocking does, then `PUT /me/blocks/{handle}`.
    case block(String)
    case deleteAccount
    case addTitles(String)
    /// Ajustes › Sesiones activas › "Cerrar sesión" on another device (`DELETE /me/sessions/{id}`).
    case revokeSession(DeviceSession)

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

enum LoadState: Equatable { case loading, loaded, failed }

/// A per-screen read that can fail. A 404 is not a load error (the screen
/// shows its "ya no existe" shape); everything else — offline, 5xx, 429 — is,
/// and the screen offers Reintentar until a retry succeeds.
enum LoadKey: Hashable {
    case library
    case collection(String)
    case title(String)
    case feed
    case feedMore
    case discover
    case person(String)
    case peopleList(String)
    case recap
    case onboardingPeople
    case publicCollection(String)
    case moreReviews(String)
    case blocks
    case sessions
}

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
    /// A sheet mid-write (Completar + reseña): the scrim tap and the grabber drag don't close it,
    /// so the text and the outcome aren't lost behind the user's back.
    var sheetLocked = false
    var toast: ToastModel?
    var offline = false
    var loadState: LoadState = .loading

    // MARK: Account / session
    var me: Person
    var account: Me?
    /// `POST auth/logout` in flight: the app waits for it before letting anyone sign in again
    /// (a late logout would revoke the NEW token too, it's account-wide).
    var signingOut = false
    /// Entrance flow (O1c/O1a): the email the code was sent to, busy flag, inline error.
    var authEmail = ""
    var authBusy = false
    var authError: String?
    /// `GET /auth/providers`: which buttons the entrance paints. nil = not asked yet; a failure is
    /// `.emailOnly` (correo only, never a button that doesn't work) and is asked again next time.
    var authProviders: AuthProviders?
    @ObservationIgnored private var authProvidersStale = true
    /// The name Sign in with Apple handed over (first authorization only), to pre-fill O1b.
    var suggestedName: String?
    /// True when the entrance paints at least one of Apple / Google.
    var hasSocialSignIn: Bool { authProviders.map { $0.apple || $0.googleClientID != nil } ?? false }

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
    /// Failed reads by screen (see `LoadKey`); cleared when the same read succeeds.
    var loadErrors: [LoadKey: KuraAPIError] = [:]
    var loadedCollections: Set<String> = []
    var loadedTitles: Set<String> = []
    var loadingTitles: Set<String> = []
    var missingTitles: Set<String> = []
    /// `GET /titles/{id}.reviews.nextCursor` (and each "más reseñas" page after it).
    var reviewCursors: [String: String] = [:]
    var reviewsPaging: Set<String> = []
    /// Someone else's public collections, by `publicKey(handle:id:)`; `states` are the owner's.
    var publicCollections: [String: CollectionDetail] = [:]
    var missingPublicCollections: Set<String> = []
    var avatarBusy = false
    var loadedPeople: Set<String> = []
    var loadingPeople: Set<String> = []
    var missingPeople: Set<String> = []
    var peopleLists: [String: [Person]] = [:]
    var feedLoaded = false
    var feedLoading = false
    var feedCursor: String?
    /// The followed set the feed was built from — a follow/unfollow makes it stale.
    @ObservationIgnored private var feedFollowingKey: Set<String> = []
    /// A block/unblock changes whose activity the server returns, without touching `following`'s
    /// meaning for the feed key: the next visit re-reads the feed.
    @ObservationIgnored private var feedDirty = false
    var feedStale: Bool { feedLoaded && (feedDirty || feedFollowingKey != following) }
    var discover: DiscoverPayload?
    var discoverLoading = false
    var searchQuery = ""
    var searchResults: [SearchResult] = []
    var searchPeople: [Person] = []
    var searchLoading = false
    var searchError: KuraAPIError?
    var onboardingGrid: [Title] = []
    /// `GET /onboarding/pool` failed (503 when every provider is down): the grid offers Reintentar.
    var onboardingGridError: KuraAPIError?
    var onboardingPeople: [Person] = []
    var onboardingPeopleLoaded = false
    var recapMonths: [RecapMonth]?
    var recaps: [String: RecapPayload] = [:]
    var recapLoading = false

    // Social / settings
    var requested: Set<String> = []
    var muted: Set<String> = []
    /// Handles you blocked (from `GET /people/{handle}.isBlocked`, `GET /me/blocks` and your own
    /// blocks). The server already hides their content; this hides what was cached before.
    var blocked: Set<String> = []
    /// `GET /me/blocks` for Ajustes › Cuentas bloqueadas; nil until it loads.
    var blockedAccounts: [BlockedAccount]?
    /// `GET /me/sessions` for Ajustes › Sesiones activas; nil until it loads.
    var deviceSessions: [DeviceSession]?
    /// Reviews you reported this session: the card folds to "Gracias. La revisamos." (like the web).
    var reportedReviews: Set<String> = []
    var notifications: [KNotification]
    var requestStates: [String: RequestState] = [:]
    var recentSearches: [String]
    var showCommon = true
    var defaultPrivacy: Privacy = .onlyMe
    /// "Avísame cuando llegue" (E4) — titles you asked to be told about.
    var alerts: Set<String> = []
    /// Discover's search mode hides the dock (the keyboard owns the bottom).
    var dockHidden = false
    var recentlyViewed: [String]
    @ObservationIgnored var debugEmptyRecap = false
    @ObservationIgnored var debugFailHydrate = false
    @ObservationIgnored var debugEmptyFollowing = false
    var debugOverlay: DebugOverlay?
    @ObservationIgnored var debugDiscoverQuery: (text: String, submit: Bool)?
    /// DEBUG: Ajustes opens scrolled to this section (`-kuraScreen notifysettings`).
    @ObservationIgnored var debugSettingsAnchor: String?

    // Settings the API owns (`PATCH /me`) — stored locally, patched on change.
    private var _profilePrivate = false
    private var _notifyReleases = true
    private var _notifyRecap = true
    private var _notifyFollowers = true
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
            if newValue { askNotificationsIfNeeded() }
        }
    }

    /// "Nuevos seguidores" — push when someone new follows you (`PATCH /me { notifyFollowers }`).
    /// Turning it on is also a moment to ask for notification permission (never on a cold open).
    var notifyFollowers: Bool {
        get { _notifyFollowers }
        set {
            guard _notifyFollowers != newValue else { return }
            _notifyFollowers = newValue
            patchMe(MePatch(notifyFollowers: newValue))
            if newValue { askNotificationsIfNeeded() }
        }
    }

    /// "Correo del recap mensual" — the monthly recap email (`notify_recap`), off = unsubscribed.
    var notifyRecap: Bool {
        get { _notifyRecap }
        set {
            guard _notifyRecap != newValue else { return }
            _notifyRecap = newValue
            patchMe(MePatch(notifyRecap: newValue))
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

    /// The welcome (13) is a first-launch screen, not the door every time: once it's been
    /// passed — or anyone has signed in on this device — the entrance starts at O1a.
    var welcomeSeen: Bool {
        get { UserDefaults.standard.bool(forKey: "kura.welcomeSeen") }
        set { UserDefaults.standard.set(newValue, forKey: "kura.welcomeSeen") }
    }
    var entryStep: OnboardingStep { welcomeSeen ? .signup : .welcome }

    /// The title a shared web link was about, when the app was installed/opened from it.
    /// O1a only says "Para guardar <título>…" when this is set; nil for everyone else.
    /// (Nothing sets it yet: it waits on universal links / deferred deep linking.)
    var pendingSaveTitle: Title?

    // MARK: Launch options (DEBUG screenshots)
    @ObservationIgnored var holdSplash = false
    @ObservationIgnored var emptyLibrary = false
    @ObservationIgnored var keepLoading = false
    @ObservationIgnored var pendingSheet: SheetRoute?
    @ObservationIgnored var didBootstrap = false
    @ObservationIgnored var pendingListCollection: String?
    @ObservationIgnored var pendingAction: (() -> Void)?
    /// A notification tapped before the tabs were up (cold start, splash, entrance): opened once
    /// the library has loaded.
    @ObservationIgnored var pendingPush: Route?
    @ObservationIgnored var debugFeedAnchor: String?

    @ObservationIgnored private var toastTask: Task<Void, Never>?
    /// Collections created optimistically: local id → the server id once it exists.
    @ObservationIgnored private var pendingCollections: [String: Task<String, Error>] = [:]
    /// Removals waiting for the Deshacer window to close (5 s).
    @ObservationIgnored private var deferredWrites: [String: Task<Void, Never>] = [:]
    /// Titles with a write in flight (a read must not clobber the optimistic state).
    @ObservationIgnored private var inflight: [String: Int] = [:]
    /// A write on this title is still on its way to the server.
    func isInflight(_ titleID: String) -> Bool { inflight[titleID, default: 0] > 0 }
    @ObservationIgnored private var expiryObserver: NSObjectProtocol?
    @ObservationIgnored private var pathMonitor: NWPathMonitor?
    @ObservationIgnored private var pathSatisfied = true

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
        if !mock { watchConnectivity() }
    }

    /// The network came back: drop the offline strip and retry a launch that failed.
    private func watchConnectivity() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            let ok = path.status == .satisfied
            Task { @MainActor in self?.connectivityChanged(ok) }
        }
        monitor.start(queue: DispatchQueue(label: "com.tromwey.kura.path"))
        pathMonitor = monitor
    }

    private func connectivityChanged(_ satisfied: Bool) {
        defer { pathSatisfied = satisfied }
        guard satisfied, !pathSatisfied else { return }
        offline = false
        // Screens that said "sin conexión." stop saying it and the visible tab reloads.
        let wasOffline = loadErrors.filter { $0.value == .offline }.map(\.key)
        for k in wasOffline { loadErrors[k] = nil }
        guard phase == .main else { return }
        if loadState == .failed { Task { await bootstrap() }; return }
        Task { await reloadVisible(after: Set(wasOffline)) }
    }

    /// After reconnecting: re-run the reads of what's on screen that failed offline.
    private func reloadVisible(after keys: Set<LoadKey>) async {
        if let route = path(tab).last {
            switch route {
            case .title(let id) where keys.contains(.title(id)): await loadTitle(id, force: true)
            case .collection(let id) where keys.contains(.collection(id)): await loadCollection(id, force: true)
            case .person(let h) where keys.contains(.person(h)): await loadPerson(h, force: true)
            case .publicCollection(let h, let id) where keys.contains(.publicCollection(AppStore.publicKey(handle: h, id: id))):
                await loadPublicCollection(handle: h, id: id, force: true)
            case .recap where keys.contains(.recap): await loadRecap()
            default: break
            }
            return
        }
        switch tab {
        case .feed where keys.contains(.feed): await loadFeed(force: true)
        case .discover where keys.contains(.discover): await loadDiscover(force: true)
        case .collections where keys.contains(.library): await retryLibraryTitles()
        default: break
        }
    }

    // MARK: Registry

    /// Full title from any payload wins over a partial one already known.
    func register(_ t: Title) {
        guard let old = titles[t.id] else {
            catalogOrder.append(t.id)
            titles[t.id] = t
            return
        }
        // Summary payloads (`GET /titles?ids=`, discover, feed, people) carry no detail: they must
        // never erase what `GET /titles/{id}` brought, or the ficha loses its synopsis/tracks/dónde
        // ver. They DO carry `release` (every summary since 4b, API.md §3), and the newest one wins:
        // a date TMDB/iTunes moved must replace the old one (a stale "hoy" would send `preview`).
        // Only a payload without `release` keeps the one we had.
        var merged = t
        if !t.isDetailed && old.isDetailed {
            merged = old
            merged.name = t.name
            merged.format = t.format
            merged.year = t.year ?? old.year
            merged.creator = t.creator ?? old.creator
            if !t.palette.isEmpty { merged.palette = t.palette }
            merged.coverURL = t.coverURL ?? old.coverURL
        }
        merged.release = t.release ?? old.release
        titles[t.id] = merged
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
        welcomeSeen = true
        var p = m.person
        if p.hexes.isEmpty, let id = p.featuredTitleID, let t = titles[id] { p.hexes = t.palette }
        me = p
        if !p.id.isEmpty { people[p.id] = p }
        _profilePrivate = !m.isPublic
        _notifyReleases = m.notifyReleases
        _notifyRecap = m.notifyRecap
        _notifyFollowers = m.notifyFollowers
        if let s = m.preferredService { _musicApp = AppStore.serviceName(s) }
    }

    /// Fetches the titles we don't know yet (`GET /titles?ids=`), ≤ 50 per call. A failure is
    /// recorded on `key` (the screen that needed them) so it says "incompleto · Reintentar"
    /// instead of drawing an empty shelf as if it were the truth.
    @discardableResult
    func hydrateTitles(_ ids: some Sequence<String>, for key: LoadKey) async -> Bool {
        let missing = Array(Set(ids.filter { titles[$0] == nil && ExternalRef.parse(localID: $0) == nil }))
        guard !missing.isEmpty else { return true }
        do {
            #if DEBUG
            if debugFailHydrate { throw KuraAPIError.server("hydrate simulado (-kuraFailHydrate)") }
            #endif
            for t in try await api.titles(ids: missing) { register(t) }
            return true
        } catch {
            fail(key, error)
            return false
        }
    }

    /// Titles of your library that `GET /titles?ids=` couldn't bring at launch.
    var libraryIncomplete: Bool {
        loadState == .loaded && libraryIDs.contains { titles[$0] == nil && ExternalRef.parse(localID: $0) == nil }
    }

    /// Reintentar on a launch whose library arrived but whose titles didn't.
    func retryLibraryTitles() async {
        loadErrors[.library] = nil
        if await hydrateTitles(libraryIDs, for: .library) { online() }
    }

    // MARK: Errors

    /// Maps any error to `KuraAPIError`, applies the global consequences
    /// (401 → entrance, transport → offline banner) and returns it.
    @discardableResult
    func noteError(_ error: Error) -> KuraAPIError {
        if error is CancellationError { return .cancelled }
        let e = (error as? KuraAPIError) ?? .server(String(describing: error))
        switch e {
        case .unauthorized: sessionExpired()
        case .offline: offline = true
        default: break
        }
        return e
    }

    private func online() { if offline { offline = false } }

    func loadError(_ key: LoadKey) -> KuraAPIError? { loadErrors[key] }

    /// Records a failed read for its screen (not 404/401/cancel, which have their own shapes).
    @discardableResult
    private func fail(_ key: LoadKey, _ error: Error) -> KuraAPIError {
        let e = noteError(error)
        switch e {
        case .cancelled, .unauthorized, .notFound: break
        default: loadErrors[key] = e
        }
        return e
    }

    private func loaded(_ key: LoadKey) {
        if loadErrors[key] != nil { loadErrors[key] = nil }
        online()
    }

    // MARK: Loading

    func bootstrap(emptyLibrary: Bool = false, keepLoading: Bool = false) async {
        loadState = .loading
        loadErrors[.library] = nil
        do {
            async let m = api.me()
            async let cols = api.collections()
            async let states = api.myTitles()
            async let fol = api.people(kind: .following, cursor: nil)
            let (account, library, myStates, followingPage) = try await (m, cols, states, fol)
            loaded(.library)
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
            await hydrateTitles(Array(libraryIDs) + [account.featuredTitleID].compactMap { $0 }, for: .library)
            if me.hexes.isEmpty, let id = me.featuredTitleID, let t = titles[id] { me.hexes = t.palette }
            if !keepLoading { loadState = .loaded }
        } catch {
            // The launch failed (offline, 5xx): the collections tab shows the error with
            // Reintentar instead of a skeleton that never ends. 401 already went to the entrance.
            let e = fail(.library, error)
            if e == .unauthorized { return }
            if e == .cancelled {
                // The task went away mid-launch: never leave the skeleton up for good. Let the
                // next appearance start over, and meanwhile show Reintentar.
                didBootstrap = false
                guard phase == .main else { return }
                loadErrors[.library] = .server("cancelado")
                loadState = .failed
                return
            }
            if loadErrors[.library] == nil { loadErrors[.library] = e }
            loadState = .failed
        }
    }

    /// `GET /collections/{id}` — the titles and your states for one collection.
    func loadCollection(_ id: String, force: Bool = false) async {
        guard force || !loadedCollections.contains(id), pendingCollections[id] == nil else { return }
        do {
            let d = try await api.collection(id: id)
            loaded(.collection(id))
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
            let e = fail(.collection(id), error)
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
            loaded(.title(id))
            loadErrors[.moreReviews(id)] = nil
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
            reviewCursors[id] = d.reviewsCursor
            missingTitles.remove(id)
            loadedTitles.insert(id)
        } catch {
            let e = fail(.title(id), error)
            if case .notFound = e { missingTitles.insert(id) }
        }
    }

    /// "Más reseñas": `GET /titles/{id}/reviews?cursor=` after `reviewCursors[id]` (pages of 10;
    /// your own review never comes back here — it's pinned in the ficha).
    func loadMoreReviews(_ id: String) async {
        guard let cursor = reviewCursors[id], !reviewsPaging.contains(id) else { return }
        reviewsPaging.insert(id)
        defer { reviewsPaging.remove(id) }
        do {
            let page = try await api.moreReviews(titleID: id, cursor: cursor)
            loaded(.moreReviews(id))
            for r in page.items { if let a = r.author { register(a) } }
            reviews.append(contentsOf: page.items.filter { r in !reviews.contains { $0.id == r.id } })
            reviewCursors[id] = page.nextCursor
        } catch {
            switch fail(.moreReviews(id), error) {
            case .notFound:
                // The title itself is gone: nothing more to page.
                reviewCursors[id] = nil
            case .invalid:
                // The server rejected the cursor: retrying it would loop. Start over from the ficha.
                reviewCursors[id] = nil
                loadErrors[.moreReviews(id)] = nil
                await loadTitle(id, force: true)
            default:
                break // keeps the button; the ficha says it failed
            }
        }
    }

    /// `GET /feed` + `GET /feed/suggestion`.
    func loadFeed(force: Bool = false) async {
        guard force || !feedLoaded, !feedLoading else { return }
        feedLoading = true
        loadErrors[.feed] = nil
        defer { feedLoading = false }
        do {
            async let page = api.feed(cursor: nil)
            async let sug = api.feedSuggestion()
            var events = try await page.items.map(ingest)
            feedCursor = try await page.nextCursor
            if let s = try await sug {
                events.insert(ingest(s), at: min(3, events.count))
            }
            loaded(.feed)
            loadErrors[.feedMore] = nil
            var ids: [String] = []
            for e in events {
                if let id = e.titleID { ids.append(id) }
                if case .burst(_, let more) = e.kind { ids += more }
                if case .suggestion(_, _, _, let more) = e.kind { ids += more }
            }
            await hydrateTitles(ids, for: .feed)
            feed = events
            feedLoaded = true
            feedFollowingKey = following
            feedDirty = false
        } catch {
            fail(.feed, error)
        }
    }

    /// Next page when the stack nears its end. A failure doesn't retry on its own
    /// (every card appearing would hammer the API): the end of the stack offers Reintentar.
    func loadMoreFeed(retry: Bool = false) async {
        guard let cursor = feedCursor, !feedLoading, retry || loadErrors[.feedMore] == nil else { return }
        feedLoading = true
        defer { feedLoading = false }
        do {
            let page = try await api.feed(cursor: cursor)
            loaded(.feedMore)
            let events = page.items.map(ingest)
            feedCursor = page.nextCursor
            await hydrateTitles(events.compactMap(\.titleID), for: .feedMore)
            feed += events.filter { e in !feed.contains { $0.id == e.id } }
        } catch {
            fail(.feedMore, error)
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
            loaded(.discover)
            for t in d.allTitles { register(t) }
            // `upcoming` = your library's titles with a release day still ahead (web's
            // `getLibraryUpcoming`). Its summaries carry no `release`, so seed the day here:
            // it's what "no puedo esperar" and the clock labels read.
            for u in d.upcoming {
                if let rd = u.releaseDate, titles[u.title.id]?.release == nil {
                    titles[u.title.id]?.release = .day(KuraJSON.dayAtNoon(rd))
                }
            }
            discover = d
        } catch {
            fail(.discover, error)
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
            loaded(.person(handle))
            register(p)
            // Only this read says whether you blocked them; every other payload is silent.
            if p.isBlocked { blocked.insert(handle) } else { blocked.remove(handle) }
            await hydrateTitles(p.obsessions + p.common + p.collections.flatMap(\.titleIDs) + [p.featuredTitleID].compactMap { $0 },
                                for: .person(handle))
            missingPeople.remove(handle)
            loadedPeople.insert(handle)
        } catch {
            let e = fail(.person(handle), error)
            if case .notFound = e { missingPeople.insert(handle) }
        }
    }

    static func publicKey(handle: String, id: String) -> String { "\(handle)|\(id)" }

    /// `GET /people/{handle}/collections/{id}` — read-only. 404 for private and
    /// nonexistent alike (the screen never says which). The owner's `states` stay
    /// with the collection; they never touch your `userTitles`.
    func loadPublicCollection(handle: String, id: String, force: Bool = false) async {
        let key = AppStore.publicKey(handle: handle, id: id)
        guard force || publicCollections[key] == nil else { return }
        do {
            let d = try await api.personCollection(handle: handle, id: id)
            loaded(.publicCollection(key))
            for t in d.titles { register(t) }
            missingPublicCollections.remove(key)
            publicCollections[key] = d
        } catch {
            let e = fail(.publicCollection(key), error)
            if case .notFound = e {
                missingPublicCollections.insert(key)
                publicCollections[key] = nil
            }
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
            loaded(.peopleList(key))
            for p in items { register(p) }
            peopleLists[key] = items
        } catch {
            fail(.peopleList(key), error)
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
            loaded(.recap)
            guard let target = era ?? recapMonths?.first?.era else { return }
            if recaps[target] == nil {
                let r = try await api.recap(era: target)
                loaded(.recap)
                if let t = r.top { register(t) }
                for t in r.also { register(t) }
                recaps[target] = r
            }
        } catch {
            fail(.recap, error)
        }
    }

    var currentRecap: RecapPayload? { recapMonths?.first.flatMap { recaps[$0.era] } }

    /// "recap de agosto" — the newest month, or the previous calendar month before it loads.
    /// "recap de septiembre" once the months arrive; "tu recap" before; nil (no button)
    /// when there's no month with activity yet.
    var recapButtonLabel: String? {
        guard let months = recapMonths else { return "tu recap" }
        guard let m = months.first else { return nil }
        return "recap de \(m.label.split(separator: " ").first ?? "")"
    }

    /// `GET /recap/months` alone (the profile button); the month itself loads in the recap.
    func loadRecapMonths() async {
        guard recapMonths == nil, !recapLoading else { return }
        do {
            recapMonths = try await api.recapMonths()
        } catch {
            noteError(error) // the button keeps "tu recap"; the recap screen has its own error state
        }
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

    /// In at least one collection ("Guardado"). Not the same as being in your library: a mark from
    /// an unsaved ficha creates your state with no collection (see `libraryIDs`).
    func isSaved(_ titleID: String) -> Bool { !collectionsContaining(titleID).isEmpty }

    /// Your library: every title with your state (`GET /me/titles`, in a collection or not) plus the
    /// memberships whose state hasn't landed yet. Counts, "no puedo esperar" and hydration read
    /// THIS, never `collections` alone.
    var libraryIDs: Set<String> { Set(userTitles.keys).union(collections.flatMap(\.titleIDs)) }

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

    /// Release day on the Mexico City calendar ("hoy"): the server compares the stored instant,
    /// so for a few hours it still says "upcoming" and a mark needs `preview: true`.
    func isReleaseDay(_ t: Title) -> Bool {
        guard case .day(let d)? = t.release else { return false }
        return cal.startOfDay(for: d) == cal.startOfDay(for: now)
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
            if case .day = r { return "sale el \(text)" }
            return "sale en \(text)" // "sale en oct 2026" / "sale en 2027"
        }
    }

    /// The first moment of the release period, on the Mexico City calendar (nil = no date).
    func releaseStart(_ r: Release) -> Date? {
        switch r {
        case .day(let d): return cal.startOfDay(for: d)
        case .month(let y, let m): return cal.date(from: DateComponents(year: y, month: m, day: 1))
        case .year(let y): return cal.date(from: DateComponents(year: y, month: 1, day: 1))
        case .unknown: return nil
        }
    }

    func releaseSentence(_ t: Title) -> String? {
        t.release.map(sentence(for:))
    }

    /// The automatic collection: announced titles you saved, until you complete them.
    /// Once out, a title stays ("ya salió") only if you saved it while it was still announced
    /// (or while we don't know yet when you saved it):
    /// the wire sends `release` for every dated title, past or future, so without this an old
    /// album you never completed would land here the moment you opened its ficha.
    var waitingTitles: [Title] {
        let list = libraryIDs.compactMap { titles[$0] }.filter { t in
            guard let r = t.release, mark(t.id) == nil else { return false }
            if isUnreleased(t) || t.upcomingSeason != nil { return true }
            guard let out = releaseStart(r) else { return false }
            // No `savedAt` yet (your library state hasn't arrived): "don't know yet", so it stays
            // instead of silently dropping out until `me/titles` answers.
            guard let savedAt = userTitles[t.id]?.savedAt else { return true }
            return savedAt < out
        }
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

    // MARK: Public links (yours)

    /// Said instead of a link while your profile is private: every public URL would 404.
    static let privateProfileShareNote = "Tu perfil es privado. Hazlo público en Ajustes para compartirlo."

    /// Your profile — nil while it's private.
    var myProfileLink: URL? {
        profilePrivate ? nil : PublicLinks.profile(me.handle)
    }

    /// One of your collections — nil while your profile is private, the collection is "Solo yo",
    /// or it's still a local id waiting for the server's.
    func myCollectionLink(_ c: KCollection) -> URL? {
        guard !profilePrivate, c.privacy != .onlyMe, pendingCollections[c.id] == nil else { return nil }
        return PublicLinks.collection(me.handle, id: c.id)
    }

    /// A title "as sent by you" (`/{handle}/item/{id}`) — nil while your profile is private.
    func myItemLink(_ titleID: String) -> URL? {
        profilePrivate ? nil : PublicLinks.item(me.handle, titleID: titleID)
    }

    // MARK: Toasts

    /// How long a toast (and the Deshacer behind it) stays: 5 s, or 15 s with VoiceOver
    /// running — reaching the button by swiping takes longer than a glance. `deferRemove`
    /// waits exactly this long, so an undo that's still on screen can always be honored.
    static var undoWindow: Duration {
        UIAccessibility.isVoiceOverRunning ? .seconds(15) : .seconds(5)
    }

    func showToast(_ t: ToastModel) {
        toastTask?.cancel()
        withAnimation(KMotion.short) { toast = t }
        // VoiceOver doesn't see a view slide in: say it.
        var said = AttributedString(t.action == nil ? t.text : "\(t.text). \(t.kind == .retry ? "Reintentar" : "Deshacer") disponible")
        said.accessibilitySpeechAnnouncementPriority = .high
        AccessibilityNotification.Announcement(said).post()
        let id = t.id
        let window = Self.undoWindow
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: window)
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
                    case .unauthorized, .notFound, .unsupported, .cancelled:
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

    func dismissSheet(animation: Animation = KMotion.sheetOut) {
        withAnimation(animation) { sheet = nil }
    }

    /// Scrim tap / grabber drag / VoiceOver escape: ignored while the sheet is mid-write
    /// (`sheetLocked`). `animation` lets a drag hand its velocity to the dismissal.
    /// Returns false when the sheet stays.
    @discardableResult
    func dismissSheetInteractively(animation: Animation = KMotion.sheetOut) -> Bool {
        guard !sheetLocked else { return false }
        dismissSheet(animation: animation)
        return true
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

    /// A title leaving its LAST collection loses its state too: the server GCs `user_item` on that
    /// remove (`removeTitleFromBacklog`). Deleting a whole collection doesn't, and neither does a
    /// title marked without ever being saved: those stay in `libraryIDs` with no collection.
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
            let store = self
            let cid = try await store?.resolveCollectionID(collectionID) ?? collectionID
            let r = try await api.createTitleMembership(collectionID: cid, ref: TitleRef.from(localID: titleID))
            await MainActor.run { store?.absorb(r, localID: titleID) }
        }
    }

    private func syncRemove(_ titleID: String, from collectionID: String) {
        sync(titleID: titleID) { [weak self] api in
            let cid = try await self?.resolveCollectionID(collectionID) ?? collectionID
            try await api.removeTitleMembership(collectionID: cid, titleID: titleID)
        }
    }

    /// Removals wait for the Deshacer window (`undoWindow`, 5 s / 15 s with VoiceOver): undoing never round-trips,
    /// and the server keeps the title's state until the window closes.
    private func deferRemove(_ titleID: String, from collectionID: String) {
        let key = "\(titleID)|\(collectionID)"
        deferredWrites[key]?.cancel()
        let window = Self.undoWindow
        deferredWrites[key] = Task { [weak self] in
            try? await Task.sleep(for: window)
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
        // An `ext:` search result isn't in the catalog until it's saved: nothing to mark yet.
        if ExternalRef.parse(localID: titleID) != nil { askToSaveFirst(titleID); return }
        let previous = userTitles[titleID]?.mark
        let hadState = userTitles[titleID] != nil
        ensureUserState(titleID)
        userTitles[titleID]?.mark = mark
        if haptic {
            switch mark {
            case .obsessed: KHaptic.impact(.medium)
            case .liked: KHaptic.impact(.light)
            default: break
            }
        }
        sync(titleID: titleID, onError: { [weak self] e in
            guard let self else { return true }
            // Neither is retryable. The optimistic state goes: an unsaved title leaves the library
            // it had just entered; a saved one gets its previous mark back.
            let revert = {
                if hadState { self.userTitles[titleID]?.mark = previous } else if !self.isSaved(titleID) { self.userTitles[titleID] = nil }
            }
            // "Todavía no sale": say so.
            if case .conflict(let code, _) = e, code == "not_released" {
                revert()
                self.showToast(ToastModel(text: e.toast, kind: .info))
                return true
            }
            // The catalog doesn't know this id (a mark on an unsaved title now CREATES your state,
            // so a 404 means the title itself is gone).
            if case .notFound = e {
                revert()
                self.showToast(ToastModel(text: AppStore.unknownTitleNote, kind: .info))
                return true
            }
            return false
        }) { [weak self] api in
            let store = self
            let s = try await api.setMark(titleID: titleID, mark: mark, preview: preview)
            await MainActor.run {
                guard let self = store, self.userTitles[titleID]?.mark == mark else { return }
                if let rid = s.reviewID { self.userTitles[titleID]?.reviewID = rid }
                self.userTitles[titleID]?.savedAt = s.savedAt
                // The ficha's "obsesionados / completos" are server aggregates (formatted "12,4 k"):
                // re-read them instead of guessing +1/−1.
                if self.loadedTitles.contains(titleID) { Task { await self.loadTitle(titleID, force: true) } }
                // Marked from a ficha you hadn't saved: the mark stands on its own (the title is in
                // your library, in no collection); "Guardar en…" is only a suggestion.
                if mark != nil { self.suggestSaving(titleID) }
            }
        }
    }

    /// "No encontramos este título": `PUT mark` answered 404 for a catalog id.
    static let unknownTitleNote = "No encontramos este título. Búscalo de nuevo."

    /// After a mark on a title in no collection: open "Guardar en…" as a suggestion. Closing it
    /// without choosing leaves the title marked and out of every collection. Never over another sheet.
    func suggestSaving(_ titleID: String) {
        guard mark(titleID) != nil, !isSaved(titleID), sheet == nil else { return }
        present(.saveTo(titleID))
    }

    /// An `ext:` result has no catalog id to mark yet: save it first (the membership PUT materializes it).
    private func askToSaveFirst(_ titleID: String) {
        showToast(ToastModel(text: "Guárdala en una colección para marcarla", kind: .info))
        // After the caller's own dismiss (the complete sheet closes right after calling setMark).
        Task { @MainActor [weak self] in self?.present(.saveTo(titleID)) }
    }

    /// Completar + reseña in one go: the server refuses a review before a reaction
    /// (`409 reaction_required`), so the mark is AWAITED here and the caller sends the review only
    /// on `nil`. Optimistic like `setMark`; on failure the mark is reverted and the error returned
    /// (the sheet keeps the text; a 404 is `unknownTitleNote`). An `ext:` result can't be marked
    /// before it's saved: that opens "guardar en" and returns `.notFound`. The caller suggests
    /// "Guardar en…" after the review (`suggestSaving`), so a sheet it's about to close doesn't eat it.
    func setMarkConfirmed(_ titleID: String, _ mark: Mark?, preview: Bool) async -> KuraAPIError? {
        if ExternalRef.parse(localID: titleID) != nil { askToSaveFirst(titleID); return .notFound }
        let hadState = userTitles[titleID]
        ensureUserState(titleID)
        userTitles[titleID]?.mark = mark
        inflight[titleID, default: 0] += 1
        defer { inflight[titleID, default: 1] -= 1 }
        do {
            let s = try await api.setMark(titleID: titleID, mark: mark, preview: preview)
            online()
            if userTitles[titleID]?.mark == mark {
                if let rid = s.reviewID { userTitles[titleID]?.reviewID = rid }
                userTitles[titleID]?.savedAt = s.savedAt
                if loadedTitles.contains(titleID) { Task { await loadTitle(titleID, force: true) } }
            }
            return nil
        } catch {
            let e = noteError(error)
            if hadState != nil { userTitles[titleID]?.mark = hadState?.mark } else if !isSaved(titleID) { userTitles[titleID] = nil }
            return e
        }
    }

    func publishReview(titleID: String, text: String, spoiler: Bool) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        ensureUserState(titleID)
        let mark = self.mark(titleID)
        let localID: String
        let previous = reviews.first(where: { $0.titleID == titleID && $0.authorID == me.id })
        let previousReviewID = userTitles[titleID]?.reviewID
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
        sync(titleID: titleID, onError: { [weak self] e in
            // No reaction on the server (`obsessed || verdict != null`): the review never existed
            // there. Put back what was before and say the real rule — never a "Reintentar" that
            // can only fail again.
            guard case .conflict(let code, _) = e, code == "reaction_required", let self else { return false }
            if let i = self.reviews.firstIndex(where: { $0.id == localID }) {
                if let previous { self.reviews[i] = previous } else { self.reviews.remove(at: i) }
            }
            self.userTitles[titleID]?.reviewID = previousReviewID
            self.showToast(ToastModel(text: e.toast, kind: .info))
            return true
        }) { [weak self] api in
            let store = self
            let saved = try await api.saveReview(titleID: titleID, body: trimmed, hasSpoiler: spoiler)
            await MainActor.run {
                guard let self = store, let i = self.reviews.firstIndex(where: { $0.id == localID }) else { return }
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
        KHaptic.select()
        saveLocal()
    }

    // MARK: Social

    func isFollowing(_ id: String) -> Bool { following.contains(id) }

    func toggleFollow(_ id: String) {
        let now = !following.contains(id)
        if now { following.insert(id) } else { following.remove(id) }
        if var p = people[id] { p.isFollowing = now; people[id] = p }
        me.followingCount = max(0, me.followingCount + (now ? 1 : -1))
        KHaptic.impact(.light)
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
        guard let p = people[id], !blocked.contains(id) else { return }
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
            KHaptic.impact(.light)
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

    // MARK: Safety (reportar · bloquear)

    func isBlocked(_ handle: String) -> Bool { blocked.contains(handle) }

    /// Reviews to show for a title: nobody you blocked (the server already filters; this covers
    /// what was cached before the block).
    func visibleReviews(_ titleID: String) -> [Review] {
        reviews.filter { $0.titleID == titleID && !blocked.contains($0.authorID) }
    }

    /// Sends a report and says "Gracias" only once the server answered 204. A failure offers
    /// Reintentar with the same reason (nothing is lost); a 404 means it's already gone.
    @discardableResult
    func report(_ target: ReportTarget, reason: String, details: String? = nil) async -> Bool {
        do {
            switch target {
            case .person(let handle):
                try await api.reportPerson(handle: handle, reason: reason, details: details)
            case .review(let id, _, _):
                try await api.reportReview(id: id, reason: reason)
            }
            online()
            if case .review(let id, _, _) = target { reportedReviews.insert(id) }
            KHaptic.impact(.light)
            showToast(ToastModel(text: target.isReview ? "Gracias. La revisamos." : "Gracias. Lo revisamos.", kind: .info))
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized:
                break
            case .notFound:
                showToast(ToastModel(text: target.isReview ? "Esa reseña ya no existe." : "Ese perfil ya no existe.", kind: .info))
            default:
                let text = e == .offline ? "Sin conexión. No se envió tu reporte."
                    : (e.isRateLimit ? e.toast : "No se pudo enviar tu reporte.")
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.report(target, reason: reason, details: details) }
                })
            }
            return false
        }
    }

    /// `PUT /me/blocks/{handle}`; the local state changes only after the 204 (the server
    /// drops the follows both ways — the app mirrors it, it doesn't guess ahead).
    @discardableResult
    func block(_ handle: String) async -> Bool {
        do {
            try await api.block(handle: handle)
            online()
            applyBlock(handle)
            KHaptic.impact(.medium)
            showToast(ToastModel(text: "Bloqueaste a @\(handle).", kind: .info))
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized:
                break
            case .notFound:
                showToast(ToastModel(text: "@\(handle) ya no existe.", kind: .info))
            default:
                let text = e == .offline ? "Sin conexión. No se bloqueó a @\(handle)." : "No se pudo bloquear a @\(handle)."
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.block(handle) }
                })
            }
            return false
        }
    }

    /// Mirrors the server's block: no follow either way, and nothing of theirs left on screen.
    private func applyBlock(_ handle: String) {
        blocked.insert(handle)
        let wasFollowing = following.remove(handle) != nil
        if wasFollowing { me.followingCount = max(0, me.followingCount - 1) }
        if var p = people[handle] {
            p.isBlocked = true
            p.isFollowing = false
            if wasFollowing { p.followers = max(0, p.followers - 1) }
            people[handle] = p
        }
        requested.remove(handle)
        feed.removeAll { e in
            if e.authorID == handle { return true }
            if case .suggestion(let pid, _, _, _) = e.kind { return pid == handle }
            return false
        }
        reviews.removeAll { $0.authorID == handle }
        for (k, v) in titleActivity { titleActivity[k] = v.filter { $0.personID != handle } }
        for (k, v) in peopleLists { peopleLists[k] = v.filter { $0.id != handle } }
        searchPeople.removeAll { $0.id == handle }
        onboardingPeople.removeAll { $0.id == handle }
        feedDirty = true
        if var list = blockedAccounts, !list.contains(where: { $0.handle == handle }) {
            let p = people[handle]
            list.insert(BlockedAccount(id: handle, handle: handle, name: p?.name ?? handle, avatarURL: p?.avatarURL), at: 0)
            blockedAccounts = list
        }
    }

    /// `DELETE /me/blocks/{handleOrId}`. Follows don't come back (the block removed them);
    /// their activity and reviews do, on the next read of each screen.
    @discardableResult
    func unblock(_ key: String, handle: String?) async -> Bool {
        let shown = handle.map { "@\($0)" } ?? "esta cuenta"
        do {
            try await api.unblock(key)
            online()
            if let handle {
                blocked.remove(handle)
                if var p = people[handle] { p.isBlocked = false; people[handle] = p }
            }
            blockedAccounts?.removeAll { $0.key == key || $0.id == key }
            feedDirty = true
            loadedTitles.removeAll() // fichas re-read their reviews on the next visit
            KHaptic.impact(.light)
            showToast(ToastModel(text: "Desbloqueaste a \(shown).", kind: .info))
            if let handle, people[handle] != nil { await loadPerson(handle, force: true) }
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized:
                break
            case .notFound:
                // Nothing to undo on the server: the list just catches up.
                if let handle { blocked.remove(handle) }
                blockedAccounts?.removeAll { $0.key == key || $0.id == key }
            default:
                let text = e == .offline ? "Sin conexión. No se desbloqueó a \(shown)." : "No se pudo desbloquear a \(shown)."
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.unblock(key, handle: handle) }
                })
            }
            return false
        }
    }

    /// `GET /me/blocks` (Ajustes › Cuentas bloqueadas), on every visit.
    func loadBlocks() async {
        do {
            let items = try await api.blocks()
            loaded(.blocks)
            blocked.formUnion(items.compactMap(\.handle))
            blockedAccounts = items
        } catch {
            fail(.blocks, error)
        }
    }

    func creator(_ name: String) -> Creator {
        if KuraRuntime.usesMock, let c = MockData.creators[name] { return c }
        let works = catalogOrder.compactMap { titles[$0] }.filter { $0.creator == name }
        let isMusic = works.contains { $0.format == .album }
        return Creator(name: name, role: isMusic ? "artista" : "director", works: max(works.count, 1))
    }

    /// Visible feed: nobody you muted.
    var visibleFeed: [FeedEvent] {
        feed.filter { e in
            if muted.contains(e.authorID) || blocked.contains(e.authorID) { return false }
            if case .suggestion(let pid, _, _, _) = e.kind, blocked.contains(pid) { return false }
            return true
        }
    }

    func setRequest(_ notificationID: String, _ state: RequestState) {
        requestStates[notificationID] = state
        KHaptic.impact(.light)
    }

    func markNotificationsRead() {
        for i in notifications.indices { notifications[i].unread = false }
    }

    var hasUnread: Bool { notifications.contains(where: \.unread) }

    func toggleAlert(_ titleID: String) {
        if alerts.contains(titleID) { alerts.remove(titleID) } else {
            alerts.insert(titleID)
            KHaptic.impact(.light)
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
            let avatar = updated.avatarURL
            updated = Person(handle: newHandle, name: updated.name, initials: updated.initials, hexes: updated.hexes,
                             featuredTitleID: updated.featuredTitleID, isPrivate: updated.isPrivate,
                             followers: updated.followers, followingCount: updated.followingCount, stats: updated.stats)
            updated.avatarURL = avatar
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
                let store = self
                let m = try await api.claimUsername(newHandle)
                await MainActor.run { store?.account = m }
            }
        }
        showToast(ToastModel(text: "Perfil actualizado", kind: .info))
    }

    /// 20f · Cambiar foto: square crop + 512 px + JPEG on the device (the server only
    /// re-checks size and sniffs magic bytes, AGENTS.md F3.11), then `PUT /me/avatar`.
    func uploadAvatar(_ picked: UIImage) async {
        guard !avatarBusy else { return }
        guard let (data, preview) = AvatarEncoder.encode(picked) else {
            showToast(ToastModel(text: "Esa imagen no se pudo leer. Prueba con otra.", kind: .info))
            return
        }
        avatarBusy = true
        defer { avatarBusy = false }
        do {
            let m = try await api.uploadAvatar(data, contentType: "image/jpeg")
            if let url = m.avatarURL { AvatarStore.shared.prime(url, preview) }
            adoptAvatar(from: m)
            online()
            showToast(ToastModel(text: "Foto actualizada", kind: .info))
        } catch {
            let e = noteError(error)
            guard e != .unauthorized, e != .cancelled else { return }
            let text: String
            if case .invalid(_, let m) = e, !m.isEmpty { text = m } else { text = e == .offline ? "Sin conexión. La foto no se subió." : "No se pudo subir la foto" }
            showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                Task { await self?.uploadAvatar(picked) }
            })
        }
    }

    /// Only the photo changes: `applyMe` would replace `me` whole and undo a featured
    /// obsession / tint chosen locally or a name PATCH still in flight.
    private func adoptAvatar(from m: Me) {
        account = m
        me.avatarURL = m.avatarURL
        if !me.id.isEmpty { people[me.id]?.avatarURL = m.avatarURL }
    }

    func removeAvatar() async {
        guard !avatarBusy, me.avatarURL != nil else { return }
        avatarBusy = true
        defer { avatarBusy = false }
        do {
            adoptAvatar(from: try await api.deleteAvatar())
            showToast(ToastModel(text: "Foto quitada", kind: .info))
        } catch {
            let e = noteError(error)
            guard e != .unauthorized, e != .cancelled else { return }
            showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in Task { await self?.removeAvatar() } })
        }
    }

    /// C3 · the second irreversible action (typing your @ confirms it).
    func deleteAccount() {
        Task { [weak self] in
            guard let self else { return }
            do {
                try await api.deleteAccount()
            } catch {
                // Only a 204 confirms the deletion. A 401 is a revoked/expired bearer (logout on
                // another device, token past `exp`) on an account that is still ALIVE: say so and
                // send them to sign in again — never "Tu cuenta se borró.".
                let e = error is CancellationError ? .cancelled : ((error as? KuraAPIError) ?? .server(String(describing: error)))
                switch e {
                case .cancelled:
                    return
                case .unauthorized:
                    api.forgetSession()
                    sessionExpired(message: "Tu sesión terminó. Entra de nuevo para borrar tu cuenta.")
                default:
                    if e == .offline { offline = true }
                    let text = e == .offline ? "Sin conexión. Tu cuenta sigue aquí." : "No se pudo borrar tu cuenta."
                    showToast(ToastModel(text: text, kind: .retry) { [weak self] in self?.deleteAccount() })
                }
                return
            }
            await leaveDeletedAccount()
        }
    }

    /// After a 204 on `DELETE /me`: forget the token, local prefs, avatar cache, the web
    /// session of the in-app browser and every loaded resource, and go back to the welcome.
    /// No `POST auth/logout`: the account is gone, there's nothing left to revoke.
    private func leaveDeletedAccount() async {
        api.forgetSession()
        leaveSession(message: "Tu cuenta se borró.")
    }

    // MARK: Counters (profile ribbon)

    func count(of mark: Mark) -> Int { userTitles.values.filter { $0.mark == mark }.count }
    var savedCount: Int { libraryIDs.count }

    // MARK: Session

    /// After the splash: a stored token skips the entrance (refreshing it when
    /// it's about to expire); no token → entrance.
    /// `minimumHold`: the splash's brand beat. It runs concurrently with the refresh
    /// (never added on top of it); nothing leaves the splash before it's over.
    func finishSplash(minimumHold: Duration = .zero) async {
        guard phase == .splash else { return }
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: minimumHold)
        func hold() async { try? await Task.sleep(until: deadline, clock: clock) }
        guard api.hasSession else {
            // The entrance's buttons depend on it: ask during the brand beat, not after it.
            async let providers: Void = loadAuthProviders()
            await hold()
            await providers
            onboardingStep = entryStep
            withAnimation(KMotion.fade) { phase = .onboarding }
            return
        }
        if api.needsRefresh {
            let result: Result<Me, Error>
            do { result = .success(try await api.refresh()) } catch { result = .failure(error) }
            await hold()
            switch result {
            case .success(let m):
                applyMe(m)
                if !route(after: m) { return }
            case .failure(let error):
                let e = noteError(error)
                if e == .unauthorized { return }
                // Transport trouble: keep the token, try the library anyway.
            }
        }
        await hold()
        withAnimation(KMotion.fade) { phase = .main }
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
            finishSignIn(m)
            return true
        } catch {
            authError = noteError(error).authText
            return false
        }
    }

    /// The one path after ANY sign-in (código, Apple, Google): token already stored by the API,
    /// then O1b if the account isn't set up, else the tabs.
    private func finishSignIn(_ m: Me) {
        applyMe(m)
        if route(after: m) { enterMain() }
    }

    // MARK: Sign in with Apple / Google

    /// `GET /auth/providers`. Failure → correo only (and asked again on the next entrance).
    func loadAuthProviders() async {
        guard authProvidersStale else { return }
        do {
            let p = try await api.authProviders()
            authProvidersStale = false
            withAnimation(KMotion.fade) { authProviders = p }
        } catch {
            if case .cancelled = noteError(error) { return }
            authProviders = .emailOnly
        }
    }

    /// `POST /auth/apple` with what `SignInWithAppleButton` returned.
    func signInWithApple(_ credential: AppleCredential) async {
        guard !authBusy, !signingOut else { return }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            // The server ignores `fullName`: it only pre-fills "tu nombre" on O1b (Apple sends it once).
            let given = [credential.givenName, credential.familyName].compactMap { $0 }.joined(separator: " ")
            suggestedName = given.isEmpty ? nil : given.lowercased()
            finishSignIn(try await api.signInWithApple(credential))
        } catch {
            socialSignInFailed(error, provider: "Apple")
        }
    }

    /// Google: the browser round trip (PKCE) for an `id_token`, then `POST /auth/google`.
    func signInWithGoogle() async {
        guard !authBusy, !signingOut, let clientID = authProviders?.googleClientID else { return }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            // The mock never opens accounts.google.com: the captures stay offline and deterministic.
            let idToken = KuraRuntime.usesMock ? "mock.id.token" : try await GoogleOAuth.idToken(clientID: clientID)
            finishSignIn(try await api.signInWithGoogle(idToken: idToken))
        } catch {
            socialSignInFailed(error, provider: "Google")
        }
    }

    /// Cancelling is silent; `403 underage` is the same screen as the code path; everything else is
    /// an honest toast (the entrance has no inline error line under the buttons).
    func socialSignInFailed(_ error: Error, provider: String) {
        if let g = error as? GoogleOAuth.Failure {
            switch g {
            case .cancelled: return
            case .offline:
                offline = true
                showToast(ToastModel(text: "Sin conexión. Revisa tu red e inténtalo de nuevo.", kind: .info))
            case .rejected:
                showToast(ToastModel(text: "No se pudo entrar con Google. Inténtalo de nuevo.", kind: .info))
            }
            return
        }
        let e = noteError(error)
        let text: String
        switch e {
        case .cancelled: return
        case .forbidden(let code) where code == "underage":
            onboardingStep = .underage
            return
        case .unavailable: text = "\(provider) no responde ahora. Entra con tu correo o prueba en un rato."
        case .offline: text = "Sin conexión. Revisa tu red e inténtalo de nuevo."
        case .rateLimited: text = "Demasiados intentos. Espera un momento."
        case .conflict(_, let m) where !m.isEmpty: text = m
        case .invalid(_, let m) where !m.isEmpty: text = m
        default: text = "No se pudo entrar con \(provider). Inténtalo de nuevo."
        }
        showToast(ToastModel(text: text, kind: .info))
    }

    // MARK: Push

    /// After the tabs come up with a session: if notifications are ALREADY allowed, ask APNs for
    /// the token (every launch, as Apple recommends: it can rotate). Never asks for permission.
    func refreshPushRegistration() {
        guard !KuraRuntime.usesMock else { return }
        Task {
            if await NotificationPermission.isAllowed() { NotificationPermission.registerForRemote() }
        }
    }

    /// A switch turned back on in Ajustes: the one other moment Kura asks (if it never did).
    private func askNotificationsIfNeeded() {
        guard !KuraRuntime.usesMock else { return }
        Task {
            if await NotificationPermission.requestIfUndetermined() { NotificationPermission.registerForRemote() }
        }
    }

    /// APNs answered with this install's token → `PUT /me/devices/{token}` (idempotent). Once the
    /// server has it, release notices come as push: the pending local ones are removed.
    func didReceivePushToken(_ hex: String) {
        PushRegistration.store(token: hex)
        guard api.hasSession, phase == .main else { return }
        let api = self.api
        Task {
            do {
                try await api.registerDevice(pushToken: hex, environment: PushRegistration.environment)
                PushRegistration.markRegistered()
                ReleaseNotifier.cancelAll()
            } catch {
                // Not the user's problem right now: the next launch registers again.
                KuraLog.api.error("push register failed: \(String(describing: error), privacy: .public)")
            }
        }
    }

    /// A tapped notification: the release's ficha or the new follower's profile, on top of the
    /// current tab. Before the tabs are up it waits for `startIfNeeded`.
    func openPush(_ d: PushDestination) {
        let route: Route
        switch d {
        case .title(let id): route = .title(id)
        case .person(let handle): route = .person(handle)
        }
        guard phase == .main, didBootstrap, loadState != .loading else {
            pendingPush = route
            return
        }
        if sheet != nil { dismissSheet() }
        if path(tab).last != route { push(route) }
    }

    // MARK: Sesiones activas

    func loadSessions() async {
        do {
            let items = try await api.sessions()
            loaded(.sessions)
            // This device first, then the most recently seen.
            deviceSessions = items.sorted {
                if $0.current != $1.current { return $0.current }
                return ($0.lastSeenAt ?? .distantPast) > ($1.lastSeenAt ?? .distantPast)
            }
        } catch {
            fail(.sessions, error)
        }
    }

    /// `DELETE /me/sessions/{id}` → that device lands on the entrance on its next call (its 401).
    @discardableResult
    func revokeSession(_ s: DeviceSession) async -> Bool {
        do {
            try await api.revokeSession(id: s.id)
            online()
            withAnimation(KMotion.fade) { deviceSessions?.removeAll { $0.id == s.id } }
            KHaptic.impact(.light)
            showToast(ToastModel(text: "Cerraste la sesión en \(s.title).", kind: .info))
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized:
                return false
            case .notFound:
                // Already gone (signed out there, or expired): the list just catches up.
                withAnimation(KMotion.fade) { deviceSessions?.removeAll { $0.id == s.id } }
                return true
            default:
                let text = e == .offline ? "Sin conexión. La sesión sigue abierta." : "No se pudo cerrar esa sesión."
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.revokeSession(s) }
                })
                return false
            }
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
        onboardingGridError = nil
        do {
            let g = try await api.onboardingGrid()
            for t in g { registerPartial(t) }
            onboardingGrid = g
        } catch {
            let e = noteError(error)
            if e != .cancelled { onboardingGridError = e }
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

    func loadOnboardingPeople(force: Bool = false) async {
        guard force || !onboardingPeopleLoaded else { return }
        do {
            let list = try await api.onboardingPeople()
            loaded(.onboardingPeople)
            for p in list { register(p) }
            onboardingPeople = list
            onboardingPeopleLoaded = true
        } catch {
            fail(.onboardingPeople, error)
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
        refreshPushRegistration()
        if let route = pendingPush {
            pendingPush = nil
            if path(tab).last != route { push(route) }
        }
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

    /// Cerrar sesión. `global` (Ajustes) = `POST auth/logout`, which revokes every bearer of the
    /// account: it's AWAITED before leaving (a logout landing after a new sign-in would revoke
    /// the new token too), and if the server didn't confirm it the local session ends anyway but
    /// the user is told the other devices may still be in. `global: false` only forgets this
    /// device's token — for an account just created here (Volver in onboarding, underage), which
    /// must never sign out other devices.
    func signOut(global: Bool = true, message: String? = nil) {
        guard !signingOut else { return }
        guard global else {
            api.forgetSession()
            leaveSession(message: message)
            return
        }
        signingOut = true
        let api = self.api
        Task { [weak self] in
            var confirmed = true
            do { try await api.logout() } catch { confirmed = false }
            guard let self else { return }
            self.signingOut = false
            self.leaveSession(message: confirmed
                ? message
                : "No pudimos cerrar tu sesión en otros dispositivos. Vuelve a entrar y prueba de nuevo.")
        }
    }

    /// The common exit: nothing of the old account stays on the device.
    private func leaveSession(message: String?) {
        resetData()
        prefs.clear()
        clearWebSession()
        withAnimation(KMotion.short) { phase = .onboarding }
        if let message { showToast(ToastModel(text: message, kind: .info)) }
    }

    /// The `SFSafariViewController` jar (its own, not Safari's) keeps the Auth.js cookie the
    /// recap-card handoff left: without this, the web stays signed in as the old account after
    /// the app signs out.
    private func clearWebSession() {
        SFSafariViewController.DataStore.default.clearWebsiteData {
            KuraLog.api.info("web session cleared (SFSafariViewController data store)")
        }
    }

    /// A 401 anywhere: the token is already gone, back to the entrance.
    private func sessionExpired(message: String = "Tu sesión terminó. Entra de nuevo.") {
        // A sign-out in flight already cleared the token: the 401s it causes aren't news.
        guard !signingOut else { return }
        guard phase != .onboarding || didBootstrap else { return }
        resetData()
        clearWebSession()
        withAnimation(KMotion.short) { phase = .onboarding }
        showToast(ToastModel(text: message, kind: .info))
    }

    private func resetData() {
        sheet = nil
        sheetLocked = false
        onboardingStep = entryStep
        pendingSaveTitle = nil
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
        onboardingPeopleLoaded = false
        loadErrors = [:]
        reviewCursors = [:]
        publicCollections = [:]
        missingPublicCollections = []
        AvatarStore.shared.clear()
        recapMonths = nil
        recaps = [:]
        requested = []
        muted = []
        blocked = []
        blockedAccounts = nil
        deviceSessions = nil
        pendingPush = nil
        authProvidersStale = true
        suggestedName = nil
        reportedReviews = []
        feedDirty = false
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

/// The on-device half of F3.11: center square crop, 512 px, JPEG under the
/// server's 400 KB cap (`AVATAR_MAX_BYTES`). Returns the bytes and the decoded
/// preview (to seed `AvatarStore` so the new photo shows without a round trip).
enum AvatarEncoder {
    static let side: CGFloat = 512
    static let maxBytes = 400 * 1024

    static func encode(_ image: UIImage) -> (Data, UIImage)? {
        let px = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        guard px.width > 0, px.height > 0 else { return nil }
        let crop = min(px.width, px.height)
        let target = min(side, crop)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let out = UIGraphicsImageRenderer(size: CGSize(width: target, height: target), format: format).image { _ in
            // Scale so the short side fills `target`, centered (draw() honors the orientation).
            let k = target / crop
            let w = px.width * k, h = px.height * k
            image.draw(in: CGRect(x: (target - w) / 2, y: (target - h) / 2, width: w, height: h))
        }
        for q in [0.85, 0.75, 0.6, 0.45] {
            if let d = out.jpegData(compressionQuality: q), d.count <= maxBytes { return (d, out) }
        }
        return nil
    }
}
