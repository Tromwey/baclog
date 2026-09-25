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
    /// Ajustes › Inicio de sesión › Apple/Google conectada › "¿desconectar…?" (`DELETE /me/identities/{p}`).
    case unlinkIdentity(IdentityProvider)
    /// "¿te avisamos?" — Kura's own ask before iOS's permission prompt (once per install).
    case notificationsAsk

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
    case identities
}

/// Everything that belongs to ONE signed-in account (and the entrance that leads to it). Signing
/// out, a deleted account and a 401 all replace it whole (`AppStore.resetData` → `SessionData()`),
/// so nothing of account A can leak into account B because someone forgot to clear one field by
/// hand. **A new per-account field goes HERE, never as a stored property of `AppStore`**; the
/// store forwards it (`get` / `_modify` / `set`, so in-place mutation doesn't copy the collection).
/// It's its own `@Observable` class so views keep observing field by field, not the whole bag.
@MainActor
@Observable
final class SessionData {
    // Navigation (a new account starts at the root of Colecciones)
    var tab: Tab = .collections
    var paths: [Tab: [Route]] = [:]
    var sheet: SheetRoute?
    var sheetLocked = false
    var loadState: LoadState = .loading
    var dockHidden = false

    // Account / entrance
    var me = Person(handle: "", name: "", initials: "k", hexes: [])
    var account: Me?
    var authEmail = ""
    var authError: String?
    var suggestedName: String?
    var onboardingPicks: [String] = []
    var pendingSaveTitle: Title?

    // Data
    var people: [String: Person] = [:]
    var titles: [String: Title] = [:]
    var catalogOrder: [String] = []
    var collections: [KCollection] = []
    var userTitles: [String: UserTitleState] = [:]
    var following: Set<String> = []
    /// Reviews by title id, in display order (`reviewTitleIndex` finds one by its own id).
    var reviewsByTitle: [String: [Review]] = [:]
    var feed: [FeedEvent] = []
    var revealedSpoilers: Set<String> = []
    var lastUsedCollectionID: String?
    var titleActivity: [String: [PeopleMark]] = [:]

    // Per-screen loads
    var loadErrors: [LoadKey: KuraAPIError] = [:]
    var loadedCollections: Set<String> = []
    var loadedTitles: Set<String> = []
    var loadingTitles: Set<String> = []
    var missingTitles: Set<String> = []
    var reviewCursors: [String: String] = [:]
    var reviewsPaging: Set<String> = []
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
    var discover: DiscoverPayload?
    var discoverLoading = false
    var searchQuery = ""
    var searchResults: [SearchResult] = []
    var searchPeople: [Person] = []
    var searchLoading = false
    var searchError: KuraAPIError?
    var onboardingGrid: [Title] = []
    var onboardingGridError: KuraAPIError?
    var onboardingPeople: [Person] = []
    var onboardingPeopleLoaded = false
    var recapMonths: [RecapMonth]?
    var recaps: [String: RecapPayload] = [:]
    var recapLoading = false

    // Social / settings
    var requested: Set<String> = []
    var muted: Set<String> = []
    var blocked: Set<String> = []
    var blockedAccounts: [BlockedAccount]?
    var deviceSessions: [DeviceSession]?
    var identities: Identities?
    var identityBusy: IdentityProvider?
    var mergeEmail = ""
    var mergeProof: MergeProof?
    var mergeBusy = false
    var mergeError: String?
    var mergeRetryAt: Date?
    var reportedReviews: Set<String> = []
    var notifications: [KNotification] = []
    var requestStates: [String: RequestState] = [:]
    var recentSearches: [String] = []
    var showCommon = true
    var defaultPrivacy: Privacy = .onlyMe
    var alerts: Set<String> = []
    var recentlyViewed: [String] = []
    // `PATCH /me` settings, raw (the store's setters patch the server)
    var profilePrivate = false
    var notifyReleases = true
    var notifyRecap = true
    var notifyFollowers = true
    var musicApp = "Apple Music"

    // Bookkeeping nobody draws
    @ObservationIgnored var feedFollowingKey: Set<String> = []
    @ObservationIgnored var feedDirty = false
    @ObservationIgnored var pendingPush: Route?
    /// Collections created optimistically: local id → the POST that gives the server id.
    @ObservationIgnored var pendingCollections: [String: Task<String, Error>] = [:]
    /// Local id → server id, forever (an undo captured with the local id still finds it).
    @ObservationIgnored var collectionAliases: [String: String] = [:]
    /// Removals waiting for the Deshacer window to close.
    @ObservationIgnored var deferredWrites: [String: Task<Void, Never>] = [:]
    /// Titles with a write in flight (a read must not clobber the optimistic state).
    @ObservationIgnored var inflight: [String: Int] = [:]
    /// The last write queued per key (`AppStore.WriteKey`): the next one for the same key waits for it.
    @ObservationIgnored var writeChains: [String: (token: UUID, task: Task<Void, Never>)] = [:]
    /// What `LocalPrefs` holds for THIS account; `localDirty` = memory is ahead of it.
    @ObservationIgnored var local = LocalPrefs.Payload()
    @ObservationIgnored var localDirty = false
    /// Collections whose manual order the user set on this device (only those persist an order).
    @ObservationIgnored var reorderedCollections: Set<String> = []
    @ObservationIgnored var reviewTitleIndex: [String: String] = [:]
    @ObservationIgnored var derived = DerivedCache()

    /// Values recomputed only after what they depend on changed (see `AppStore` forwarders).
    struct DerivedCache {
        var ordered: [KCollection]?
        var indexByID: [String: Int]?
        var containing: [String: [Int]]?
        var libraryIDs: Set<String>?
        var waiting: [Title]?
        var titlesIn: [String: (collection: KCollection, list: [Title])] = [:]

        mutating func collectionsChanged() {
            ordered = nil; indexByID = nil; containing = nil; libraryIDs = nil; waiting = nil; titlesIn = [:]
        }
        mutating func statesChanged() { libraryIDs = nil; waiting = nil; titlesIn = [:] }
        mutating func titlesChanged() { waiting = nil; titlesIn = [:] }
    }

    /// Cancels every write and timer of this session (it's being replaced).
    func cancelAll() {
        for (_, t) in deferredWrites { t.cancel() }
        for (_, c) in writeChains { c.task.cancel() }
        for (_, t) in pendingCollections { t.cancel() }
        deferredWrites = [:]
        writeChains = [:]
        pendingCollections = [:]
    }
}

@MainActor
@Observable
final class AppStore {
    // MARK: Dependencies
    @ObservationIgnored let api: KuraAPI
    @ObservationIgnored let prefs: LocalPrefs
    /// The per-account state (see `SessionData`): replaced whole on every way out of a session.
    private(set) var s = SessionData()

    /// The store's clock. Mock: fixed (the captures read a known date). Live: advanced when the
    /// app comes to the foreground and each minute while it's active (`startClock`).
    var now: Date {
        get { clock }
        set { clock = newValue; s.derived.waiting = nil }
    }
    private var clock: Date
    @ObservationIgnored private var clockTask: Task<Void, Never>?
    @ObservationIgnored private var saveTask: Task<Void, Never>?

    // MARK: Phase / navigation
    var phase: AppPhase = .splash
    var tab: Tab { get { s.tab } set { s.tab = newValue } }
    var paths: [Tab: [Route]] { get { s.paths } _modify { yield &s.paths } set { s.paths = newValue } }
    var sheet: SheetRoute? { get { s.sheet } set { s.sheet = newValue } }
    /// A sheet mid-write (Completar + reseña): the scrim tap and the grabber drag don't close it,
    /// so the text and the outcome aren't lost behind the user's back.
    var sheetLocked: Bool { get { s.sheetLocked } set { s.sheetLocked = newValue } }
    var toast: ToastModel?
    var offline = false
    var loadState: LoadState { get { s.loadState } set { s.loadState = newValue } }

    // MARK: Account / session
    var me: Person { get { s.me } _modify { yield &s.me } set { s.me = newValue } }
    var account: Me? { get { s.account } set { s.account = newValue } }
    /// `POST auth/logout` in flight: the app waits for it before letting anyone sign in again
    /// (a late logout would revoke the NEW token too, it's account-wide).
    var signingOut = false
    /// Entrance flow (O1c/O1a): the email the code was sent to, busy flag, inline error.
    var authEmail: String { get { s.authEmail } set { s.authEmail = newValue } }
    var authBusy = false
    var authError: String? { get { s.authError } set { s.authError = newValue } }
    /// `GET /auth/providers`: which buttons the entrance paints. nil = not asked yet; a failure is
    /// `.emailOnly` (correo only, never a button that doesn't work) and is asked again next time.
    var authProviders: AuthProviders?
    @ObservationIgnored private var authProvidersStale = true
    /// The name Sign in with Apple handed over (first authorization only), to pre-fill O1b.
    var suggestedName: String? { get { s.suggestedName } set { s.suggestedName = newValue } }
    /// True when the entrance paints at least one of Apple / Google.
    var hasSocialSignIn: Bool { authProviders.map { $0.apple || $0.googleClientID != nil } ?? false }

    // MARK: Data
    var people: [String: Person] { get { s.people } _modify { yield &s.people } set { s.people = newValue } }
    var titles: [String: Title] {
        get { s.titles }
        _modify { yield &s.titles; s.derived.titlesChanged() }
        set { s.titles = newValue; s.derived.titlesChanged() }
    }
    /// Ids in the order we learned them (drives local search, "también de").
    var catalogOrder: [String] { get { s.catalogOrder } _modify { yield &s.catalogOrder } set { s.catalogOrder = newValue } }
    var collections: [KCollection] {
        get { s.collections }
        _modify { yield &s.collections; s.derived.collectionsChanged() }
        set { s.collections = newValue; s.derived.collectionsChanged() }
    }
    var userTitles: [String: UserTitleState] {
        get { s.userTitles }
        _modify { yield &s.userTitles; s.derived.statesChanged() }
        set { s.userTitles = newValue; s.derived.statesChanged() }
    }
    var following: Set<String> { get { s.following } _modify { yield &s.following } set { s.following = newValue } }
    var feed: [FeedEvent] { get { s.feed } _modify { yield &s.feed } set { s.feed = newValue } }
    var revealedSpoilers: Set<String> { get { s.revealedSpoilers } _modify { yield &s.revealedSpoilers } set { s.revealedSpoilers = newValue } }
    /// Last collection used in "guardar en" — preselected next time.
    var lastUsedCollectionID: String? { get { s.lastUsedCollectionID } set { s.lastUsedCollectionID = newValue } }
    /// `GET /titles/{id}.following` — what followed people did with a title.
    var titleActivity: [String: [PeopleMark]] { get { s.titleActivity } _modify { yield &s.titleActivity } set { s.titleActivity = newValue } }

    // Per-screen loads
    /// Failed reads by screen (see `LoadKey`); cleared when the same read succeeds.
    var loadErrors: [LoadKey: KuraAPIError] { get { s.loadErrors } _modify { yield &s.loadErrors } set { s.loadErrors = newValue } }
    var loadedCollections: Set<String> { get { s.loadedCollections } _modify { yield &s.loadedCollections } set { s.loadedCollections = newValue } }
    var loadedTitles: Set<String> { get { s.loadedTitles } _modify { yield &s.loadedTitles } set { s.loadedTitles = newValue } }
    var loadingTitles: Set<String> { get { s.loadingTitles } _modify { yield &s.loadingTitles } set { s.loadingTitles = newValue } }
    var missingTitles: Set<String> { get { s.missingTitles } _modify { yield &s.missingTitles } set { s.missingTitles = newValue } }
    /// `GET /titles/{id}.reviews.nextCursor` (and each "más reseñas" page after it).
    var reviewCursors: [String: String] { get { s.reviewCursors } _modify { yield &s.reviewCursors } set { s.reviewCursors = newValue } }
    var reviewsPaging: Set<String> { get { s.reviewsPaging } _modify { yield &s.reviewsPaging } set { s.reviewsPaging = newValue } }
    /// Someone else's public collections, by `publicKey(handle:id:)`; `states` are the owner's.
    var publicCollections: [String: CollectionDetail] { get { s.publicCollections } _modify { yield &s.publicCollections } set { s.publicCollections = newValue } }
    var missingPublicCollections: Set<String> { get { s.missingPublicCollections } _modify { yield &s.missingPublicCollections } set { s.missingPublicCollections = newValue } }
    var avatarBusy: Bool { get { s.avatarBusy } set { s.avatarBusy = newValue } }
    var loadedPeople: Set<String> { get { s.loadedPeople } _modify { yield &s.loadedPeople } set { s.loadedPeople = newValue } }
    var loadingPeople: Set<String> { get { s.loadingPeople } _modify { yield &s.loadingPeople } set { s.loadingPeople = newValue } }
    var missingPeople: Set<String> { get { s.missingPeople } _modify { yield &s.missingPeople } set { s.missingPeople = newValue } }
    var peopleLists: [String: [Person]] { get { s.peopleLists } _modify { yield &s.peopleLists } set { s.peopleLists = newValue } }
    var feedLoaded: Bool { get { s.feedLoaded } set { s.feedLoaded = newValue } }
    var feedLoading: Bool { get { s.feedLoading } set { s.feedLoading = newValue } }
    var feedCursor: String? { get { s.feedCursor } set { s.feedCursor = newValue } }
    /// The followed set the feed was built from — a follow/unfollow makes it stale.
    private var feedFollowingKey: Set<String> { get { s.feedFollowingKey } set { s.feedFollowingKey = newValue } }
    /// A block/unblock changes whose activity the server returns, without touching `following`'s
    /// meaning for the feed key: the next visit re-reads the feed.
    private var feedDirty: Bool { get { s.feedDirty } set { s.feedDirty = newValue } }
    var feedStale: Bool { feedLoaded && (feedDirty || feedFollowingKey != following) }
    var discover: DiscoverPayload? { get { s.discover } set { s.discover = newValue } }
    var discoverLoading: Bool { get { s.discoverLoading } set { s.discoverLoading = newValue } }
    var searchQuery: String { get { s.searchQuery } set { s.searchQuery = newValue } }
    var searchResults: [SearchResult] { get { s.searchResults } set { s.searchResults = newValue } }
    var searchPeople: [Person] { get { s.searchPeople } _modify { yield &s.searchPeople } set { s.searchPeople = newValue } }
    var searchLoading: Bool { get { s.searchLoading } set { s.searchLoading = newValue } }
    var searchError: KuraAPIError? { get { s.searchError } set { s.searchError = newValue } }
    var onboardingGrid: [Title] { get { s.onboardingGrid } set { s.onboardingGrid = newValue } }
    /// `GET /onboarding/pool` failed (503 when every provider is down): the grid offers Reintentar.
    var onboardingGridError: KuraAPIError? { get { s.onboardingGridError } set { s.onboardingGridError = newValue } }
    var onboardingPeople: [Person] { get { s.onboardingPeople } _modify { yield &s.onboardingPeople } set { s.onboardingPeople = newValue } }
    var onboardingPeopleLoaded: Bool { get { s.onboardingPeopleLoaded } set { s.onboardingPeopleLoaded = newValue } }
    var recapMonths: [RecapMonth]? { get { s.recapMonths } set { s.recapMonths = newValue } }
    var recaps: [String: RecapPayload] { get { s.recaps } _modify { yield &s.recaps } set { s.recaps = newValue } }
    var recapLoading: Bool { get { s.recapLoading } set { s.recapLoading = newValue } }

    // Social / settings
    /// ⚠️ Solo mock / no-op en live: "Solicitado" en un perfil privado. `followFromProfile` solo
    /// lo cambia en memoria y NUNCA llama a la API — el servidor solo deja seguir perfiles públicos
    /// (`user_follow` es unilateral, F3.10) y no existe el modelo de solicitudes. Para que sea real
    /// haría falta en el servidor: tabla de solicitudes, `POST/DELETE /me/follow-requests/{handle}`,
    /// aprobar/rechazar del lado del dueño y su notificación.
    var requested: Set<String> { get { s.requested } _modify { yield &s.requested } set { s.requested = newValue } }
    var muted: Set<String> { get { s.muted } _modify { yield &s.muted } set { s.muted = newValue } }
    /// Handles you blocked (from `GET /people/{handle}.isBlocked`, `GET /me/blocks` and your own
    /// blocks). The server already hides their content; this hides what was cached before.
    var blocked: Set<String> { get { s.blocked } _modify { yield &s.blocked } set { s.blocked = newValue } }
    /// `GET /me/blocks` for Ajustes › Cuentas bloqueadas; nil until it loads.
    var blockedAccounts: [BlockedAccount]? { get { s.blockedAccounts } _modify { yield &s.blockedAccounts } set { s.blockedAccounts = newValue } }
    /// `GET /me/sessions` for Ajustes › Sesiones activas; nil until it loads.
    var deviceSessions: [DeviceSession]? { get { s.deviceSessions } _modify { yield &s.deviceSessions } set { s.deviceSessions = newValue } }
    /// `GET /me/identities` for Ajustes › Inicio de sesión; nil until it loads.
    var identities: Identities? { get { s.identities } _modify { yield &s.identities } set { s.identities = newValue } }
    /// The provider whose Conectar / Desconectar is in flight (its row shows a spinner).
    var identityBusy: IdentityProvider? { get { s.identityBusy } set { s.identityBusy = newValue } }
    /// Fusionar otra cuenta: the other account's email (code path), the proof once it's yours,
    /// the busy flag and the inline error of the chooser / code screens.
    var mergeEmail: String { get { s.mergeEmail } set { s.mergeEmail = newValue } }
    var mergeProof: MergeProof? { get { s.mergeProof } set { s.mergeProof = newValue } }
    var mergeBusy: Bool { get { s.mergeBusy } set { s.mergeBusy = newValue } }
    var mergeError: String? { get { s.mergeError } set { s.mergeError = newValue } }
    /// A 429 on `merge/otp/request` (60 s cooldown or 3 codes/hour per email): no new code before this.
    var mergeRetryAt: Date? { get { s.mergeRetryAt } set { s.mergeRetryAt = newValue } }
    /// Reviews you reported this session: the card folds to "Gracias. La revisamos." (like the web).
    var reportedReviews: Set<String> { get { s.reportedReviews } _modify { yield &s.reportedReviews } set { s.reportedReviews = newValue } }
    /// ⚠️ Solo mock / no-op en live: la campana del feed (31a). En live siempre está vacía — la API
    /// no tiene modelo de notificaciones (§4, 501), así que nada la llena y `hasUnread` es false.
    /// Haría falta en el servidor: tabla de notificaciones (seguidor nuevo, estreno, recap,
    /// solicitudes), `GET /me/notifications` paginado y `POST /me/notifications/read`.
    var notifications: [KNotification] { get { s.notifications } _modify { yield &s.notifications } set { s.notifications = newValue } }
    /// ⚠️ Solo mock / no-op en live: estado local de aprobar/rechazar una solicitud (ver `setRequest`).
    var requestStates: [String: RequestState] { get { s.requestStates } _modify { yield &s.requestStates } set { s.requestStates = newValue } }
    var recentSearches: [String] { get { s.recentSearches } _modify { yield &s.recentSearches } set { s.recentSearches = newValue } }
    var showCommon: Bool { get { s.showCommon } set { s.showCommon = newValue } }
    var defaultPrivacy: Privacy { get { s.defaultPrivacy } set { s.defaultPrivacy = newValue } }
    /// "Avísame cuando llegue" (E4) — titles you asked to be told about.
    var alerts: Set<String> { get { s.alerts } _modify { yield &s.alerts } set { s.alerts = newValue } }
    /// Discover's search mode hides the dock (the keyboard owns the bottom).
    var dockHidden: Bool { get { s.dockHidden } set { s.dockHidden = newValue } }
    var recentlyViewed: [String] { get { s.recentlyViewed } _modify { yield &s.recentlyViewed } set { s.recentlyViewed = newValue } }
    @ObservationIgnored var debugEmptyRecap = false
    @ObservationIgnored var debugFailHydrate = false
    @ObservationIgnored var debugEmptyFollowing = false
    var debugOverlay: DebugOverlay?
    @ObservationIgnored var debugDiscoverQuery: (text: String, submit: Bool)?
    /// DEBUG: Ajustes opens scrolled to this section (`-kuraScreen notifysettings`).
    @ObservationIgnored var debugSettingsAnchor: String?

    // Settings the API owns (`PATCH /me`) — stored in the session, patched on change.
    private var _profilePrivate: Bool { get { s.profilePrivate } set { s.profilePrivate = newValue } }
    private var _notifyReleases: Bool { get { s.notifyReleases } set { s.notifyReleases = newValue } }
    private var _notifyRecap: Bool { get { s.notifyRecap } set { s.notifyRecap = newValue } }
    private var _notifyFollowers: Bool { get { s.notifyFollowers } set { s.notifyFollowers = newValue } }
    private var _musicApp: String { get { s.musicApp } set { s.musicApp = newValue } }

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
    var onboardingPicks: [String] { get { s.onboardingPicks } _modify { yield &s.onboardingPicks } set { s.onboardingPicks = newValue } }
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
    var pendingSaveTitle: Title? { get { s.pendingSaveTitle } set { s.pendingSaveTitle = newValue } }

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
    var pendingPush: Route? { get { s.pendingPush } set { s.pendingPush = newValue } }
    @ObservationIgnored var debugFeedAnchor: String?

    @ObservationIgnored private var toastTask: Task<Void, Never>?
    /// Collections created optimistically: local id → the server id once it exists.
    private var pendingCollections: [String: Task<String, Error>] { get { s.pendingCollections } _modify { yield &s.pendingCollections } set { s.pendingCollections = newValue } }
    /// Removals waiting for the Deshacer window to close (5 s).
    private var deferredWrites: [String: Task<Void, Never>] { get { s.deferredWrites } _modify { yield &s.deferredWrites } set { s.deferredWrites = newValue } }
    /// Titles with a write in flight (a read must not clobber the optimistic state).
    private var inflight: [String: Int] { get { s.inflight } _modify { yield &s.inflight } set { s.inflight = newValue } }
    @ObservationIgnored private var expiryObserver: NSObjectProtocol?
    @ObservationIgnored private var pathMonitor: NWPathMonitor?
    @ObservationIgnored private var pathSatisfied = true

    /// `KuraApp` hands both in: `LiveAPI` + `Date()` in live, `MockAPI` + `MockData.now` for the captures.
    init(api: KuraAPI, now: Date) {
        self.api = api
        self.clock = now
        let mock = KuraRuntime.usesMock
        prefs = LocalPrefs(enabled: !mock)
        #if DEBUG
        if mock { seedMock() } else { loadLocal() }
        #else
        loadLocal()
        #endif
        expiryObserver = NotificationCenter.default.addObserver(forName: .kuraSessionExpired, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.sessionExpired() }
        }
        if !mock { watchConnectivity() }
    }

    #if DEBUG
    /// The mock account (a fresh `SessionData` after a sign-out too): its catalog and people are
    /// local and instant; the library arrives with latency (`MockAPI`).
    private func seedMock() {
        me = MockData.me
        notifications = MockData.notifications
        recentSearches = MockData.recentSearches
        recentlyViewed = ["chihiro", "ma", "severance", "mala", "pearl"]
        for t in MockData.titles { register(t) }
        for p in MockData.people { people[p.id] = p }
        defaultPrivacy = .followers
    }
    #endif

    // MARK: Clock

    /// The scene came to the foreground: catch the clock up at once ("hoy", "14 h", "ya salió"
    /// were frozen while the app slept) and keep it moving each minute while it's active.
    func sceneBecameActive() {
        tickClock()
        startClock()
    }

    /// The scene left the foreground: stop the minute timer and write what's pending to disk.
    func sceneWentInactive() {
        clockTask?.cancel()
        clockTask = nil
        flushLocal()
    }

    /// Live only — the mock's clock is fixed (captures) or set by `DebugLaunch`.
    private func startClock() {
        guard !KuraRuntime.usesMock, clockTask == nil else { return }
        clockTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled else { return }
                self?.tickClock()
            }
        }
    }

    /// Moves `now` to the real time, but only when the minute changed: every view that reads a
    /// countdown re-renders on each assignment, so no sub-minute churn.
    private func tickClock() {
        guard !KuraRuntime.usesMock else { return }
        let real = Date()
        if Int(real.timeIntervalSince1970 / 60) != Int(clock.timeIntervalSince1970 / 60) { now = real }
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

    // MARK: Reads bound to their session

    /// A read that started in one session and answers in another is dropped whole: its data, and
    /// its 401 from a revoked bearer, belong to the old account (the same rule as `sync`'s
    /// `self.s === session`). Every `load*` captures `let session = s` first, calls
    /// `try check(session)` after each await and opens its `catch` with `guard s === session`.
    private struct StaleSession: Error {}

    private func check(_ session: SessionData) throws {
        if s !== session { throw StaleSession() }
    }

    /// Fetches the titles we don't know yet (`GET /titles?ids=`), ≤ 50 per call. A failure is
    /// recorded on `key` (the screen that needed them) so it says "incompleto · Reintentar"
    /// instead of drawing an empty shelf as if it were the truth.
    @discardableResult
    func hydrateTitles(_ ids: some Sequence<String>, for key: LoadKey) async -> Bool {
        let missing = Array(Set(ids.filter { titles[$0] == nil && ExternalRef.parse(localID: $0) == nil }))
        guard !missing.isEmpty else { return true }
        let session = s
        do {
            #if DEBUG
            if debugFailHydrate { throw KuraAPIError.server("hydrate simulado (-kuraFailHydrate)") }
            #endif
            let fetched = try await api.titles(ids: missing)
            try check(session)
            for t in fetched { register(t) }
            return true
        } catch {
            guard s === session else { return false }
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
        let session = s
        if await hydrateTitles(libraryIDs, for: .library), s === session { online() }
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
        let session = s
        do {
            async let m = api.me()
            async let cols = api.collections()
            async let states = api.myTitles()
            async let fol = allPeople(.following)
            let (account, library, myStates, followed) = try await (m, cols, states, fol)
            try check(session)
            loaded(.library)
            for p in followed { register(p) }
            following = Set(followed.map(\.id)).union(following)
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
            // Still AWAITED before `.loaded`: the collection cards and "no puedo esperar" draw only
            // the titles they know (`titles(in:)` drops the missing ones), so flipping to `.loaded`
            // first would paint half-empty cards and the "Faltan títulos" strip for a beat.
            await hydrateTitles(Array(libraryIDs) + [account.featuredTitleID].compactMap { $0 }, for: .library)
            try check(session)
            if me.hexes.isEmpty, let id = me.featuredTitleID, let t = titles[id] { me.hexes = t.palette }
            if !keepLoading { loadState = .loaded }
        } catch {
            guard s === session else { return }
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
        let id = canonicalCollectionID(id)
        guard force || !loadedCollections.contains(id), pendingCollections[id] == nil else { return }
        let session = s
        do {
            let d = try await api.collection(id: id)
            try check(session)
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
            guard s === session else { return }
            let e = fail(.collection(id), error)
            if case .notFound = e { collections.removeAll { $0.id == id } }
        }
    }

    /// `GET /titles/{id}` — the full ficha: state, people you follow, reviews.
    func loadTitle(_ id: String, force: Bool = false) async {
        guard ExternalRef.parse(localID: id) == nil else { return }
        guard force || !loadedTitles.contains(id), !loadingTitles.contains(id) else { return }
        loadingTitles.insert(id)
        let session = s
        defer { session.loadingTitles.remove(id) }
        do {
            let d = try await api.title(id: id)
            try check(session)
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
            // Your optimistic review survives a read that raced its write; the rest is the server's.
            let writing = inflight[id, default: 0] > 0
            let kept = reviewList(id).filter { writing && $0.authorID == me.id }
            let keptIDs = Set(kept.map(\.id))
            setReviews(id, kept + d.reviews.filter { !keptIDs.contains($0.id) })
            reviewCursors[id] = d.reviewsCursor
            missingTitles.remove(id)
            loadedTitles.insert(id)
        } catch {
            guard s === session else { return }
            let e = fail(.title(id), error)
            if case .notFound = e { missingTitles.insert(id) }
        }
    }

    /// "Más reseñas": `GET /titles/{id}/reviews?cursor=` after `reviewCursors[id]` (pages of 10;
    /// your own review never comes back here — it's pinned in the ficha).
    func loadMoreReviews(_ id: String) async {
        guard let cursor = reviewCursors[id], !reviewsPaging.contains(id) else { return }
        reviewsPaging.insert(id)
        let session = s
        defer { session.reviewsPaging.remove(id) }
        do {
            let page = try await api.moreReviews(titleID: id, cursor: cursor)
            try check(session)
            loaded(.moreReviews(id))
            for r in page.items { if let a = r.author { register(a) } }
            let known = Set(reviewList(id).map(\.id))
            setReviews(id, reviewList(id) + page.items.filter { !known.contains($0.id) })
            reviewCursors[id] = page.nextCursor
        } catch {
            guard s === session else { return }
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
        let session = s
        defer { session.feedLoading = false }
        do {
            async let page = api.feed(cursor: nil)
            async let sug = api.feedSuggestion()
            let (first, suggestion) = try await (page, sug)
            try check(session)
            var events = first.items.map(ingest)
            feedCursor = first.nextCursor
            if let suggestion {
                events.insert(ingest(suggestion), at: min(3, events.count))
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
            try check(session)
            feed = events
            feedLoaded = true
            feedFollowingKey = following
            feedDirty = false
        } catch {
            guard s === session else { return }
            fail(.feed, error)
        }
    }

    /// Next page when the stack nears its end. A failure doesn't retry on its own
    /// (every card appearing would hammer the API): the end of the stack offers Reintentar.
    /// A page can bring nothing you'd see (all muted, blocked or already there) while the cursor
    /// goes on: then the stack's last card never appears again to ask for more and the feed stalls.
    /// So one call keeps paging — at most `maxFeedPagesPerCall` — until something visible arrives.
    private static let maxFeedPagesPerCall = 3

    func loadMoreFeed(retry: Bool = false) async {
        guard feedCursor != nil, !feedLoading, retry || loadErrors[.feedMore] == nil else { return }
        feedLoading = true
        let session = s
        defer { session.feedLoading = false }
        var pages = 0
        while let cursor = feedCursor, pages < Self.maxFeedPagesPerCall {
            pages += 1
            do {
                let page = try await api.feed(cursor: cursor)
                try check(session)
                loaded(.feedMore)
                let events = page.items.map(ingest)
                feedCursor = page.nextCursor
                await hydrateTitles(events.compactMap(\.titleID), for: .feedMore)
                try check(session)
                let known = Set(feed.map(\.id))
                let fresh = events.filter { !known.contains($0.id) }
                feed += fresh
                if fresh.contains(where: isVisible) { return }
            } catch {
                guard s === session else { return }
                fail(.feedMore, error)
                return
            }
        }
    }

    /// Registers what the event embeds and derives the display fields.
    private func ingest(_ event: FeedEvent) -> FeedEvent {
        var e = event
        if let t = e.embeddedTitle { register(t) }
        if let p = e.embeddedAuthor { register(p) }
        if let r = e.embeddedReview, review(r.id) == nil { setReviews(r.titleID, reviewList(r.titleID) + [r]) }
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
        let session = s
        defer { session.discoverLoading = false }
        do {
            let d = try await api.discover()
            try check(session)
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
            guard s === session else { return }
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
        let session = s
        defer { if session.searchQuery == query { session.searchLoading = false } }
        do {
            async let t = api.search(query, kind: kind)
            async let p = api.people(kind: .search(query), cursor: nil)
            let (results, page) = try await (t, p)
            try check(session)
            guard searchQuery == query else { return }
            online()
            for r in results { registerPartial(r.title) }
            for person in page.items { register(person) }
            searchResults = results
            searchPeople = page.items
        } catch {
            guard s === session, searchQuery == query else { return }
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
        let session = s
        defer { session.loadingPeople.remove(handle) }
        do {
            let p = try await api.person(handle: handle)
            try check(session)
            loaded(.person(handle))
            register(p)
            // Only this read says whether you blocked them; every other payload is silent.
            if p.isBlocked { blocked.insert(handle) } else { blocked.remove(handle) }
            await hydrateTitles(p.obsessions + p.common + p.collections.flatMap(\.titleIDs) + [p.featuredTitleID].compactMap { $0 },
                                for: .person(handle))
            try check(session)
            missingPeople.remove(handle)
            loadedPeople.insert(handle)
        } catch {
            guard s === session else { return }
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
        let session = s
        do {
            let d = try await api.personCollection(handle: handle, id: id)
            try check(session)
            loaded(.publicCollection(key))
            for t in d.titles { register(t) }
            missingPublicCollections.remove(key)
            publicCollections[key] = d
        } catch {
            guard s === session else { return }
            let e = fail(.publicCollection(key), error)
            if case .notFound = e {
                missingPublicCollections.insert(key)
                publicCollections[key] = nil
            }
        }
    }

    static func peopleListKey(of personID: String, following: Bool) -> String { "\(personID)|\(following ? "following" : "followers")" }

    /// Upper bound for walking one of your own lists (`me/following`, `me/followers`): 30 per page,
    /// so 1 500 people — past that the list is cut rather than looping on a server that misbehaves.
    private static let maxPeoplePages = 50

    /// Every page of one of YOUR lists (`GET /me/following` · `/me/followers`), until `nextCursor`
    /// is nil. `following` needs all of it: it decides Seguir/Siguiendo on every row of the app.
    private func allPeople(_ kind: PeopleKind) async throws -> [Person] {
        var out: [Person] = []
        var seen: Set<String> = []
        var cursor: String?
        for _ in 0..<Self.maxPeoplePages {
            let page = try await api.people(kind: kind, cursor: cursor)
            for p in page.items where seen.insert(p.id).inserted { out.append(p) }
            guard let next = page.nextCursor, next != cursor else { break }
            cursor = next
        }
        return out
    }

    /// Followers / following of someone. Your own lists come whole (every page, `allPeople`).
    ///
    /// ⚠️ Solo mock / no-op en live para OTRA persona: la API solo expone las listas de su dueño
    /// (§4 — "las listas solo las ve su dueño", F3.10), así que en live esto guarda `[]` y la
    /// pantalla dice "Solo @… ve su lista." (los conteos sí son públicos). Para que sea real haría
    /// falta en el servidor una ruta `GET /people/{handle}/followers|following` con el gate
    /// `publicAuthor` + `notBlockedWith` por fila y una decisión de producto sobre exponerlas.
    func loadPeopleList(of personID: String, following: Bool) async {
        let key = AppStore.peopleListKey(of: personID, following: following)
        guard peopleLists[key] == nil else { return }
        let session = s
        do {
            let items: [Person]
            if personID == me.id {
                items = try await allPeople(following ? .following : .followers)
                try check(session)
                if following { self.following.formUnion(items.map(\.id)) }
            } else {
                #if DEBUG
                items = (api as? MockAPI)?.peopleOf(personID, following: following) ?? []
                #else
                items = []
                #endif
            }
            loaded(.peopleList(key))
            for p in items { register(p) }
            peopleLists[key] = items
        } catch {
            guard s === session else { return }
            fail(.peopleList(key), error)
        }
    }

    /// `GET /recap/months` then `GET /recap/{era}` (the newest by default).
    func loadRecap(era: String? = nil) async {
        guard !recapLoading else { return }
        if let era, recaps[era] != nil { return }
        recapLoading = true
        let session = s
        defer { session.recapLoading = false }
        do {
            if recapMonths == nil {
                let months = try await api.recapMonths()
                try check(session)
                recapMonths = months
            }
            loaded(.recap)
            guard let target = era ?? recapMonths?.first?.era else { return }
            if recaps[target] == nil {
                let r = try await api.recap(era: target)
                try check(session)
                loaded(.recap)
                if let t = r.top { register(t) }
                for t in r.also { register(t) }
                recaps[target] = r
            }
        } catch {
            guard s === session else { return }
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
        let session = s
        do {
            let months = try await api.recapMonths()
            try check(session)
            recapMonths = months
        } catch {
            guard s === session else { return }
            noteError(error) // the button keeps "tu recap"; the recap screen has its own error state
        }
    }

    // MARK: Lookups

    func title(_ id: String) -> Title? { titles[id] }
    func person(_ id: String) -> Person? { id == me.id ? me : people[id] }
    /// A collection by id — a local id adopted by the server still finds it (`collectionAliases`).
    func collection(_ id: String) -> KCollection? {
        let cols = collections // observed: a view that asks re-renders when any collection changes
        let key = canonicalCollectionID(id)
        if s.derived.indexByID == nil {
            s.derived.indexByID = Dictionary(cols.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { a, _ in a })
        }
        return s.derived.indexByID?[key].map { cols[$0] }
    }
    func mark(_ titleID: String) -> Mark? { userTitles[titleID]?.mark }
    func review(_ id: String?) -> Review? {
        guard let id else { return nil }
        let byTitle = s.reviewsByTitle // observed
        guard let tid = s.reviewTitleIndex[id] else { return nil }
        return byTitle[tid]?.first { $0.id == id }
    }
    func myReview(_ titleID: String) -> Review? { reviewList(titleID).first { $0.authorID == me.id } }

    // MARK: Reviews storage (by title; `reviewTitleIndex` = review id → title id)

    private func reviewList(_ titleID: String) -> [Review] { s.reviewsByTitle[titleID] ?? [] }

    /// Replaces a title's reviews (in display order) and keeps the id index in step.
    private func setReviews(_ titleID: String, _ list: [Review]) {
        for r in reviewList(titleID) where s.reviewTitleIndex[r.id] == titleID { s.reviewTitleIndex[r.id] = nil }
        for r in list { s.reviewTitleIndex[r.id] = titleID }
        s.reviewsByTitle[titleID] = list.isEmpty ? nil : list
    }

    private func removeReviews(of titleID: String, where drop: (Review) -> Bool) {
        let list = reviewList(titleID)
        guard list.contains(where: drop) else { return }
        setReviews(titleID, list.filter { !drop($0) })
    }

    /// Decorative covers for the entrance screens (never part of the live library). The mock's
    /// catalog has them registered (`titles`); live falls back to `WelcomeArt`, a fixed art source.
    func decor(_ id: String) -> Title? { titles[id] ?? WelcomeArt.title(id) }

    /// Collections ordered for "tus colecciones": pinned first, then newest. Cached until
    /// `collections` changes (every card, row and sheet asks, several times per frame).
    var orderedCollections: [KCollection] {
        let cols = collections
        if let o = s.derived.ordered { return o }
        let o = cols.sorted { a, b in
            if a.pinned != b.pinned { return a.pinned }
            if a.titleIDs.isEmpty != b.titleIDs.isEmpty { return !a.titleIDs.isEmpty }
            return a.createdAt > b.createdAt
        }
        s.derived.ordered = o
        return o
    }

    /// A collection's titles, filtered and sorted. Cached per (collection, format) until titles,
    /// states or that collection change (a sort by name is `localizedCompare` n·log n per render).
    func titles(in c: KCollection, format: MediaFormat? = nil) -> [Title] {
        _ = (titles, userTitles) // observed
        let key = "\(c.id)|\(format?.rawValue ?? "*")"
        if let hit = s.derived.titlesIn[key], hit.collection == c { return hit.list }
        let list = sortedTitles(in: c, format: format)
        s.derived.titlesIn[key] = (c, list)
        return list
    }

    private func sortedTitles(in c: KCollection, format: MediaFormat?) -> [Title] {
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

    /// The collections a title is in, in `orderedCollections` order. One index (title → positions)
    /// built once per change of `collections`, instead of a sort + scan on every call.
    func collectionsContaining(_ titleID: String) -> [KCollection] {
        let ordered = orderedCollections
        if s.derived.containing == nil {
            var index: [String: [Int]] = [:]
            for (i, c) in ordered.enumerated() { for t in Set(c.titleIDs) { index[t, default: []].append(i) } }
            s.derived.containing = index
        }
        return (s.derived.containing?[titleID] ?? []).map { ordered[$0] }
    }

    /// In at least one collection ("Guardado"). Not the same as being in your library: a mark from
    /// an unsaved ficha creates your state with no collection (see `libraryIDs`).
    func isSaved(_ titleID: String) -> Bool { !collectionsContaining(titleID).isEmpty }

    /// Your library: every title with your state (`GET /me/titles`, in a collection or not) plus the
    /// memberships whose state hasn't landed yet. Counts, "no puedo esperar" and hydration read
    /// THIS, never `collections` alone.
    var libraryIDs: Set<String> {
        let (states, cols) = (userTitles, collections)
        if let ids = s.derived.libraryIDs { return ids }
        let ids = Set(states.keys).union(cols.flatMap(\.titleIDs))
        s.derived.libraryIDs = ids
        return ids
    }

    /// Reviews you wrote: the server count until the local list catches up.
    var reviewCount: Int {
        let mine = s.reviewsByTitle.values.reduce(0) { n, list in n + list.filter { $0.authorID == me.id }.count }
        return max(account?.stats.reviews ?? 0, mine)
    }

    // MARK: No puedo esperar

    private static let months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    /// Release days are read on Mexico City's calendar (`KCalendar`), in live and mock alike.
    var cal: Calendar { KCalendar.kura }

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
    /// Cached until titles, states, collections or the clock change (both the tab root and the
    /// automatic collection ask on every render).
    var waitingTitles: [Title] {
        _ = (titles, userTitles, collections, now) // observed
        if let w = s.derived.waiting { return w }
        let w = computeWaitingTitles()
        s.derived.waiting = w
        return w
    }

    private func computeWaitingTitles() -> [Title] {
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
    ///
    /// `key` serializes writes to the same thing (`WriteKey`): each `sync` is its own `Task`, so a
    /// Guardar → Deshacer (or follow → unfollow) could otherwise reach the server in the reverse
    /// order and leave it in the state the user undid. A write with a key waits for the previous
    /// one with that key (success or failure) before it goes out.
    ///
    /// Everything is bound to the session that queued it: once the account changes (sign-out, 401),
    /// its late failures and "Reintentar" never surface — a retry would run the old account's write
    /// with the new account's token.
    private func sync(key: String? = nil,
                      titleID: String? = nil,
                      onError: (@MainActor (KuraAPIError) -> Bool)? = nil,
                      _ op: @escaping @Sendable (KuraAPI) async throws -> Void) {
        let api = self.api
        let session = s
        if let titleID { session.inflight[titleID, default: 0] += 1 }
        let previous = key.flatMap { session.writeChains[$0]?.task }
        let token = UUID()
        let task = Task { [weak self] in
            await previous?.value
            var failure: Error?
            if Task.isCancelled {
                failure = CancellationError()
            } else {
                do { try await op(api) } catch { failure = error }
            }
            defer {
                if let titleID { session.inflight[titleID, default: 1] -= 1 }
                if let key, session.writeChains[key]?.token == token { session.writeChains[key] = nil }
            }
            guard let self, self.s === session else { return }
            guard let failure else { self.online(); return }
            let e = self.noteError(failure)
            if let onError, onError(e) { return }
            switch e {
            case .unauthorized, .notFound, .unsupported, .cancelled:
                return
            default:
                self.showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in
                    self?.sync(key: key, titleID: titleID, onError: onError, op)
                })
            }
        }
        if let key { session.writeChains[key] = (token, task) }
    }

    /// Keys for `sync(key:)` — writes that contradict each other share one.
    private enum WriteKey {
        static func membership(_ titleID: String, _ collectionID: String) -> String { "m|\(titleID)|\(collectionID)" }
        static func collection(_ id: String) -> String { "c|\(id)" }
        static func mark(_ titleID: String) -> String { "mark|\(titleID)" }
        static func review(_ titleID: String) -> String { "review|\(titleID)" }
        static func follow(_ handle: String) -> String { "follow|\(handle)" }
        static let username = "me|username"
        static let mePatch = "me|patch"
    }

    private func patchMe(_ patch: MePatch) {
        sync(key: WriteKey.mePatch) { api in
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
        if let sid = s.collectionAliases[id] { return sid }
        guard let task = pendingCollections[id] else { return id }
        return try await task.value
    }

    /// The id a collection has NOW: a local id already adopted maps to the server's (forever, so
    /// a Deshacer or a sheet that captured the local id keeps working after the swap).
    private func canonicalCollectionID(_ id: String) -> String { s.collectionAliases[id] ?? id }

    /// Swaps a temporary collection id for the one the server assigned.
    private func adopt(serverID: String, for localID: String) {
        guard serverID != localID else { return }
        s.collectionAliases[localID] = serverID
        // Pending removals and write queues keyed by the local id follow it to the server id, so
        // `cancelRemove` and the per-key ordering still match what's queued.
        let suffix = "|\(localID)"
        for (k, t) in deferredWrites where k.hasSuffix(suffix) {
            deferredWrites[k] = nil
            deferredWrites[String(k.dropLast(suffix.count)) + "|\(serverID)"] = t
        }
        for (k, c) in s.writeChains where k.hasSuffix(suffix) {
            s.writeChains[k] = nil
            s.writeChains[String(k.dropLast(suffix.count)) + "|\(serverID)"] = c
        }
        if s.reorderedCollections.remove(localID) != nil { s.reorderedCollections.insert(serverID) }
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
        let session = s
        // The POST alone: once it answered, the collection EXISTS on the server. The first title's
        // membership is a separate write (below) whose Reintentar retries only the membership
        // against the server id — never the POST again, which would leave a duplicate collection.
        let task = Task<String, Error> { [weak self] in
            let created = try await api.createCollection(name: finalName, privacy: privacy)
            if let self, self.s === session { self.adopt(serverID: created.id, for: localID) }
            return created.id
        }
        pendingCollections[localID] = task
        Task { [weak self] in
            do {
                let sid = try await task.value
                guard let self, self.s === session else { return }
                self.pendingCollections[localID] = nil
                self.online()
                // Only if it's still there: a quick Quitar before the POST answered wins.
                if let titleID, self.collection(sid)?.titleIDs.contains(titleID) == true {
                    self.syncAdd(titleID, to: sid)
                }
            } catch {
                guard let self, self.s === session else { return }
                self.pendingCollections[localID] = nil
                let e = self.noteError(error)
                self.collections.removeAll { $0.id == localID }
                if let titleID { self.gcUserState(titleID) }
                guard e != .cancelled, e != .unauthorized else { return }
                self.showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in
                    self?.createCollection(name: finalName, privacy: privacy, adding: titleID)
                })
            }
        }
        return c.id
    }

    private func update(_ id: String, _ change: (inout KCollection) -> Void) {
        let id = canonicalCollectionID(id)
        guard let i = collections.firstIndex(where: { $0.id == id }) else { return }
        change(&collections[i])
    }

    private func syncCollection(_ id: String, name: String? = nil, privacy: Privacy? = nil) {
        sync(key: WriteKey.collection(canonicalCollectionID(id))) { [weak self] api in
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
        s.reorderedCollections.insert(canonicalCollectionID(id))
        update(id) { c in
            c.titleIDs.move(fromOffsets: from, toOffset: to)
            c.sort = .manual
        }
        saveLocal()
    }

    func deleteCollection(_ id: String) {
        let id = canonicalCollectionID(id)
        collections.removeAll { $0.id == id }
        for tab in Tab.allCases {
            paths[tab]?.removeAll { r in
                if case .collection(let cid) = r { return cid == id }
                return false
            }
        }
        for (key, task) in deferredWrites where key.hasSuffix("|\(id)") { task.cancel(); deferredWrites[key] = nil }
        s.reorderedCollections.remove(id)
        sync(key: WriteKey.collection(id)) { [weak self] api in
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
            let mine = me.id
            removeReviews(of: titleID) { $0.authorID == mine }
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
        sync(key: WriteKey.membership(titleID, canonicalCollectionID(collectionID)), titleID: titleID) { [weak self] api in
            let store = self
            let cid = try await store?.resolveCollectionID(collectionID) ?? collectionID
            let r = try await api.createTitleMembership(collectionID: cid, ref: TitleRef.from(localID: titleID))
            await MainActor.run { store?.absorb(r, localID: titleID) }
        }
    }

    private func syncRemove(_ titleID: String, from collectionID: String) {
        sync(key: WriteKey.membership(titleID, canonicalCollectionID(collectionID)), titleID: titleID) { [weak self] api in
            let cid = try await self?.resolveCollectionID(collectionID) ?? collectionID
            try await api.removeTitleMembership(collectionID: cid, titleID: titleID)
        }
    }

    /// Removals wait for the Deshacer window (`undoWindow`, 5 s / 15 s with VoiceOver): undoing never round-trips,
    /// and the server keeps the title's state until the window closes.
    private func deferRemove(_ titleID: String, from collectionID: String) {
        let key = removalKey(titleID, collectionID)
        deferredWrites[key]?.cancel()
        let window = Self.undoWindow
        deferredWrites[key] = Task { [weak self] in
            try? await Task.sleep(for: window)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self else { return }
                // Recomputed: `adopt` may have moved the entry to the server id meanwhile.
                self.deferredWrites[self.removalKey(titleID, collectionID)] = nil
                self.syncRemove(titleID, from: collectionID)
            }
        }
    }

    /// `deferredWrites` key: title + the collection's CURRENT id (see `adopt`).
    private func removalKey(_ titleID: String, _ collectionID: String) -> String {
        "\(titleID)|\(canonicalCollectionID(collectionID))"
    }

    /// Cancels a pending removal; true when there was one (nothing to re-add on the server).
    @discardableResult
    private func cancelRemove(_ titleID: String, from collectionID: String) -> Bool {
        let key = removalKey(titleID, collectionID)
        guard let t = deferredWrites[key] else { return false }
        t.cancel()
        deferredWrites[key] = nil
        return true
    }

    private func pendingRemovals(in collectionID: String) -> [String] {
        let collectionID = canonicalCollectionID(collectionID)
        return deferredWrites.keys.filter { $0.hasSuffix("|\(collectionID)") }.map { String($0.split(separator: "|")[0]) }
    }

    func add(_ titleID: String, to collectionID: String, toast: Bool = true) {
        let collectionID = canonicalCollectionID(collectionID)
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
        let collectionID = canonicalCollectionID(collectionID)
        update(collectionID) { $0.titleIDs.removeAll { $0 == titleID } }
        syncRemove(titleID, from: collectionID)
        gcUserState(titleID)
    }

    func remove(_ titleID: String, from collectionID: String) {
        let collectionID = canonicalCollectionID(collectionID)
        guard let c = collection(collectionID), let idx = c.titleIDs.firstIndex(of: titleID) else { return }
        let state = userTitles[titleID]
        let myReviews = reviewList(titleID).filter { $0.authorID == me.id }
        update(collectionID) { $0.titleIDs.remove(at: idx) }
        gcUserState(titleID)
        deferRemove(titleID, from: collectionID)
        undoToast("Quitado de \(c.name)") { [weak self] in
            guard let self else { return }
            self.cancelRemove(titleID, from: collectionID)
            self.update(collectionID) { $0.titleIDs.insert(titleID, at: min(idx, $0.titleIDs.count)) }
            if self.userTitles[titleID] == nil { self.userTitles[titleID] = state }
            let back = myReviews.filter { self.review($0.id) == nil }
            if !back.isEmpty { self.setReviews(titleID, self.reviewList(titleID) + back) }
        }
    }

    func move(_ titleID: String, from fromID: String, to toID: String) {
        let fromID = canonicalCollectionID(fromID), toID = canonicalCollectionID(toID)
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
        let ids = Set(ids.map(canonicalCollectionID))
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
        sync(key: WriteKey.mark(titleID), titleID: titleID, onError: { [weak self] e in
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
        let session = s
        defer { session.inflight[titleID, default: 1] -= 1 }
        // In line behind any `setMark` still queued for this title (`WriteKey.mark`), and ahead of
        // whatever comes after it: the order the user tapped is the order the server sees.
        let key = WriteKey.mark(titleID)
        let previous = session.writeChains[key]?.task
        let api = self.api
        let call = Task { () async throws -> UserTitleState in
            await previous?.value
            try Task.checkCancellation()
            return try await api.setMark(titleID: titleID, mark: mark, preview: preview)
        }
        let token = UUID()
        session.writeChains[key] = (token, Task { _ = try? await call.value })
        defer { if session.writeChains[key]?.token == token { session.writeChains[key] = nil } }
        do {
            let ack = try await call.value
            guard s === session else { return .cancelled }
            online()
            if userTitles[titleID]?.mark == mark {
                if let rid = ack.reviewID { userTitles[titleID]?.reviewID = rid }
                userTitles[titleID]?.savedAt = ack.savedAt
                if loadedTitles.contains(titleID) { Task { await loadTitle(titleID, force: true) } }
            }
            return nil
        } catch {
            guard s === session else { return .cancelled }
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
        var list = reviewList(titleID)
        let previous = list.first(where: { $0.authorID == me.id })
        let previousReviewID = userTitles[titleID]?.reviewID
        if let i = list.firstIndex(where: { $0.authorID == me.id }) {
            list[i].text = trimmed
            list[i].spoiler = spoiler
            list[i].mark = mark
            localID = list[i].id
        } else {
            let r = Review(id: "r-\(UUID().uuidString.prefix(6))", authorID: me.id, titleID: titleID,
                           text: trimmed, mark: mark, spoiler: spoiler, date: Date())
            list.insert(r, at: 0)
            userTitles[titleID]?.reviewID = r.id
            localID = r.id
        }
        setReviews(titleID, list)
        sync(key: WriteKey.review(titleID), titleID: titleID, onError: { [weak self] e in
            // No reaction on the server (`obsessed || verdict != null`): the review never existed
            // there. Put back what was before and say the real rule — never a "Reintentar" that
            // can only fail again.
            guard case .conflict(let code, _) = e, code == "reaction_required", let self else { return false }
            var list = self.reviewList(titleID)
            if let i = list.firstIndex(where: { $0.id == localID }) {
                if let previous { list[i] = previous } else { list.remove(at: i) }
                self.setReviews(titleID, list)
            }
            self.userTitles[titleID]?.reviewID = previousReviewID
            self.showToast(ToastModel(text: e.toast, kind: .info))
            return true
        }) { [weak self] api in
            let store = self
            let saved = try await api.saveReview(titleID: titleID, body: trimmed, hasSpoiler: spoiler)
            await MainActor.run {
                guard let self = store else { return }
                var list = self.reviewList(titleID)
                guard let i = list.firstIndex(where: { $0.id == localID }) else { return }
                list[i] = Review(id: saved.id, authorID: self.me.id, titleID: titleID, text: list[i].text,
                                 mark: saved.mark ?? list[i].mark, spoiler: list[i].spoiler, date: saved.date)
                self.setReviews(titleID, list)
                self.userTitles[titleID]?.reviewID = saved.id
                self.revealedSpoilers.remove(localID)
            }
        }
    }

    func deleteReview(titleID: String) {
        let me = self.me.id
        let mine = reviewList(titleID).filter { $0.authorID == me }
        guard !mine.isEmpty else { return }
        removeReviews(of: titleID) { $0.authorID == me }
        userTitles[titleID]?.reviewID = nil
        sync(key: WriteKey.review(titleID), titleID: titleID) { api in try await api.deleteReview(titleID: titleID) }
        undoToast("Reseña borrada") { [weak self] in
            guard let self else { return }
            self.setReviews(titleID, self.reviewList(titleID) + mine.filter { self.review($0.id) == nil })
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
        KHaptic.impact(.light)
        setFollow(id, !following.contains(id))
    }

    /// Followed people who did something with this title. `GET /titles/{id}.following` already
    /// returns only people you follow, but that answer is as old as the last load: filtering by
    /// `following` (complete — every page of `me/following`) makes an unfollow take the person
    /// out of "gente que sigues" at once, and a Deshacer puts them back.
    func followedMarks(for titleID: String) -> [(Person, PeopleMark)] {
        (titleActivity[titleID] ?? []).compactMap { pm in
            guard following.contains(pm.personID), let p = people[pm.personID] else { return nil }
            return (p, pm)
        }
    }

    /// Follow from a profile: public → follow; private → "Solicitado" (see `requested`: ⚠️ no-op
    /// en live). Tapping Siguiendo unfollows at once with Deshacer (no confirmation).
    func followFromProfile(_ id: String) {
        guard let p = people[id], !blocked.contains(id) else { return }
        if following.contains(id) {
            setFollow(id, false)
            undoToast("Dejaste de seguir a @\(p.handle)") { [weak self] in self?.setFollow(id, true) }
        } else if p.isPrivate {
            // ⚠️ Solo mock / no-op en live: nunca llama a la API (el servidor solo deja seguir
            // perfiles públicos y no hay modelo de solicitudes). Ver `requested`.
            if requested.contains(id) { requested.remove(id) } else { requested.insert(id) }
            KHaptic.impact(.light)
        } else {
            toggleFollow(id)
        }
    }

    /// The one follow write: optimistic (`following`, `people[id].isFollowing`, your count), then
    /// `PUT/DELETE /me/following/{handle}` in order per handle. A failure puts it all back — unless
    /// a later tap already changed it again (that write is queued behind this one): a 404 says the
    /// profile isn't there to follow; anything retryable offers Reintentar.
    private func setFollow(_ id: String, _ on: Bool) {
        guard following.contains(id) != on else { return }
        applyFollow(id, on)
        sync(key: WriteKey.follow(id), onError: { [weak self] e in
            guard let self else { return true }
            guard self.following.contains(id) == on else { return true }
            self.applyFollow(id, !on)
            switch e {
            case .cancelled, .unauthorized:
                break
            case .notFound:
                self.showToast(ToastModel(text: "Ese perfil ya no está disponible.", kind: .info))
            default:
                self.showToast(ToastModel(text: e.toast, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    self?.setFollow(id, on)
                })
            }
            return true
        }) { api in try await api.setFollowing(handle: id, following: on) }
    }

    private func applyFollow(_ id: String, _ on: Bool) {
        if on { following.insert(id) } else { following.remove(id) }
        if var p = people[id] { p.isFollowing = on; people[id] = p }
        me.followingCount = max(0, me.followingCount + (on ? 1 : -1))
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
        reviewList(titleID).filter { !blocked.contains($0.authorID) }
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
        for tid in Array(s.reviewsByTitle.keys) { removeReviews(of: tid) { $0.authorID == handle } }
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
        let session = s
        do {
            let items = try await api.blocks()
            try check(session)
            loaded(.blocks)
            blocked.formUnion(items.compactMap(\.handle))
            blockedAccounts = items
        } catch {
            guard s === session else { return }
            fail(.blocks, error)
        }
    }

    func creator(_ name: String) -> Creator {
        #if DEBUG
        if KuraRuntime.usesMock, let c = MockData.creators[name] { return c }
        #endif
        let works = catalogOrder.compactMap { titles[$0] }.filter { $0.creator == name }
        let isMusic = works.contains { $0.format == .album }
        return Creator(name: name, role: isMusic ? "artista" : "director", works: max(works.count, 1))
    }

    /// Visible feed: nobody you muted.
    var visibleFeed: [FeedEvent] { feed.filter(isVisible) }

    private func isVisible(_ e: FeedEvent) -> Bool {
        if muted.contains(e.authorID) || blocked.contains(e.authorID) { return false }
        if case .suggestion(let pid, _, _, _) = e.kind, blocked.contains(pid) { return false }
        return true
    }

    /// ⚠️ Solo mock / no-op en live: aprobar o rechazar una solicitud de seguimiento (31a) solo
    /// cambia `requestStates` en memoria — no hay solicitudes en el servidor (solo se siguen
    /// perfiles públicos) y en live la lista `notifications` está siempre vacía, así que nadie
    /// llega aquí. Haría falta: el modelo de solicitudes y `PUT /me/follow-requests/{id}`.
    func setRequest(_ notificationID: String, _ state: RequestState) {
        requestStates[notificationID] = state
        KHaptic.impact(.light)
    }

    /// ⚠️ Solo mock / no-op en live: marca leídas las notificaciones locales; en live no hay
    /// ninguna (ver `notifications`) y nada se avisa al servidor. Haría falta
    /// `POST /me/notifications/read` una vez exista el modelo.
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
            updated = Self.rehandled(updated, newHandle)
            people[oldHandle] = nil
        }
        me = updated
        if !me.id.isEmpty { people[me.id] = me }
        profilePrivate = isPrivate
        self.showCommon = showCommon
        saveLocal()
        if !cleanName.isEmpty, cleanName != oldName { patchMe(MePatch(name: cleanName)) }
        if handleChanged {
            sync(key: WriteKey.username, onError: { [weak self] e in
                // Taken (409) or rejected (400): the server kept the old handle, so the app does too.
                let text: String
                switch e {
                case .conflict: text = "@\(newHandle) ya está tomado"
                case .invalid(let fields, let m): text = fields["username"] ?? (m.isEmpty ? "Ese @ no se puede usar." : m)
                default: return false
                }
                self?.revertHandle(from: newHandle, to: oldHandle)
                self?.showToast(ToastModel(text: text, kind: .info))
                return true
            }) { [weak self] api in
                let store = self
                let m = try await api.claimUsername(newHandle)
                await MainActor.run { store?.account = m }
            }
        }
        showToast(ToastModel(text: "Perfil actualizado", kind: .info))
    }

    /// The same person under another handle (`Person.handle` is its identity, so it's rebuilt).
    private static func rehandled(_ p: Person, _ handle: String) -> Person {
        var out = Person(handle: handle, name: p.name, initials: p.initials, hexes: p.hexes,
                         featuredTitleID: p.featuredTitleID, isPrivate: p.isPrivate,
                         followers: p.followers, followingCount: p.followingCount, stats: p.stats)
        out.avatarURL = p.avatarURL
        return out
    }

    /// `PUT /me/username` refused the new handle: `me` and `people` go back to the old one (the
    /// rest of the edit — name, featured — stays, it went through `PATCH /me` on its own).
    private func revertHandle(from newHandle: String, to oldHandle: String) {
        guard me.handle == newHandle else { return }
        me = Self.rehandled(me, oldHandle)
        people[newHandle] = nil
        if !oldHandle.isEmpty { people[oldHandle] = me }
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
            let idToken = try await googleIDToken(clientID: clientID)
            finishSignIn(try await api.signInWithGoogle(idToken: idToken))
        } catch {
            socialSignInFailed(error, provider: "Google")
        }
    }

    /// The browser round trip for Google's `id_token` (sign-in and Conectar share it).
    /// The mock never opens accounts.google.com: the captures stay offline and deterministic.
    private func googleIDToken(clientID: String) async throws -> String {
        #if DEBUG
        if KuraRuntime.usesMock { return "mock.id.token" }
        #endif
        return try await GoogleOAuth.idToken(clientID: clientID)
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

    /// iOS's answer about alerts, for Ajustes (re-read when the app comes back to the foreground:
    /// the only way out of `denied` is the iPhone's own Ajustes).
    var notificationStatus: NotificationPermission.Status = .allowed
    /// DEBUG: `-kuraNotif undetermined|denied` fakes the answer in the mock.
    @ObservationIgnored var debugNotificationStatus: NotificationPermission.Status?

    func refreshNotificationStatus() async {
        if let s = debugNotificationStatus { notificationStatus = s; return }
        guard !KuraRuntime.usesMock else { return }
        notificationStatus = await NotificationPermission.status()
    }

    /// Once per install, after the tabs are up: if iOS hasn't been asked yet, Kura's own sheet says
    /// what the notices are before the system prompt. Never over another sheet or a tapped push.
    func offerNotificationsIfNeeded() async {
        await refreshNotificationStatus()
        guard notificationStatus == .undetermined, !NotificationPermission.didOfferPrompt,
              sheet == nil, pendingSheet == nil else { return }
        try? await Task.sleep(for: .milliseconds(900))
        guard sheet == nil, phase == .main else { return }
        NotificationPermission.didOfferPrompt = true
        present(.notificationsAsk)
    }

    /// "Activar avisos" (the sheet or Ajustes): iOS's prompt, then the APNs token if allowed.
    func enableNotifications() async {
        if debugNotificationStatus != nil { debugNotificationStatus = .allowed }
        if !KuraRuntime.usesMock, await NotificationPermission.requestIfUndetermined() {
            NotificationPermission.registerForRemote()
        }
        await refreshNotificationStatus()
    }

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
            await refreshNotificationStatus()
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

    // MARK: Inicio de sesión (identities) and Fusionar otra cuenta

    /// `GET /me/identities` (+ `auth/providers` for Google's client id, which the flow needs).
    func loadIdentities() async {
        async let providers: Void = loadAuthProviders()
        let session = s
        do {
            let v = try await api.identities()
            try check(session)
            loaded(.identities)
            withAnimation(KMotion.fade) { identities = v }
        } catch {
            guard s === session else { return }
            fail(.identities, error)
        }
        await providers
    }

    /// Google can only run with the iOS client id from `auth/providers`.
    func canRun(_ p: IdentityProvider) -> Bool {
        switch p {
        case .apple: return true
        case .google: return authProviders?.googleClientID != nil
        }
    }

    /// The provider's own sheet, then `POST /me/identities/{p}`. `linked_elsewhere` goes straight
    /// to the merge confirmation for that account. `fromMerge`: started on Fusionar otra cuenta,
    /// where a plain link (that Apple/Google had no other account) is news worth saying.
    func connect(_ p: IdentityProvider, fromMerge: Bool = false) async {
        guard identityBusy == nil, !mergeBusy, canRun(p) else { return }
        identityBusy = p
        let outcome: LinkOutcome
        do {
            switch p {
            case .apple:
                #if DEBUG
                let credential = KuraRuntime.usesMock
                    ? AppleCredential(identityToken: "mock.apple.token", rawNonce: "mock", authorizationCode: nil, givenName: nil, familyName: nil)
                    : try await AppleAuthorization.credential()
                #else
                let credential = try await AppleAuthorization.credential()
                #endif
                outcome = try await api.linkApple(credential)
            case .google:
                let idToken = try await googleIDToken(clientID: authProviders?.googleClientID ?? "")
                outcome = try await api.linkGoogle(idToken: idToken)
            }
        } catch {
            identityBusy = nil
            identityFailed(error, provider: p)
            return
        }
        identityBusy = nil
        online()
        switch outcome {
        case .linked:
            setLinked(p, true)
            KHaptic.impact(.light)
            showToast(ToastModel(text: fromMerge
                ? "Ese \(p.label) no tenía otra cuenta en kura: quedó conectado a esta."
                : "\(p.label) conectada. Ya puedes entrar con \(p.label).", kind: .info))
        case .mergeable(let proof):
            mergeProof = proof
            push(.mergeConfirm)
        }
    }

    private func setLinked(_ p: IdentityProvider, _ linked: Bool) {
        guard let i = identities?.providers.firstIndex(where: { $0.provider == p }) else { return }
        withAnimation(KMotion.fade) { identities?.providers[i].linked = linked }
    }

    private func identityFailed(_ error: Error, provider p: IdentityProvider) {
        if let a = error as? AppleAuthorization.Failure {
            if a == .rejected { showToast(ToastModel(text: "Apple no respondió. Inténtalo de nuevo.", kind: .info)) }
            return
        }
        if let g = error as? GoogleOAuth.Failure {
            switch g {
            case .cancelled: return
            case .offline:
                offline = true
                showToast(ToastModel(text: "Sin conexión. Revisa tu red e inténtalo de nuevo.", kind: .info))
            case .rejected:
                showToast(ToastModel(text: "Google no respondió. Inténtalo de nuevo.", kind: .info))
            }
            return
        }
        let e = noteError(error)
        let text: String
        switch e {
        case .cancelled, .unauthorized: return
        case .conflict(let code, _) where code == "provider_already_linked":
            text = "Ya tienes otra cuenta de \(p.label) conectada. Desconéctala primero."
        case .forbidden(let code) where code == "proof_rejected":
            text = "\(p.label) no confirmó esa cuenta. Inténtalo de nuevo."
        case .unavailable: text = "\(p.label) no responde ahora. Prueba en un rato."
        case .offline: text = "Sin conexión. Revisa tu red e inténtalo de nuevo."
        case .rateLimited: text = "Demasiados intentos. Espera un momento."
        default: text = "No se pudo conectar \(p.label). Inténtalo de nuevo."
        }
        showToast(ToastModel(text: text, kind: .info))
    }

    /// Why Apple can't be disconnected (the row, the 409 toast and the sheet say the same).
    static let lastWayInText = "Tu correo es el privado de Apple: sin Apple no te quedaría cómo entrar. Conecta Google antes."

    /// `DELETE /me/identities/{p}`. 409 `last_way_in`: Apple is the only real way in (relay email).
    @discardableResult
    func disconnect(_ p: IdentityProvider) async -> Bool {
        guard identityBusy == nil else { return false }
        identityBusy = p
        defer { identityBusy = nil }
        do {
            try await api.unlinkIdentity(p)
            online()
            setLinked(p, false)
            KHaptic.impact(.light)
            showToast(ToastModel(text: "Desconectaste \(p.label). Sigues entrando con tu correo.", kind: .info))
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized: return false
            case .notFound:
                setLinked(p, false)
                return true
            case .conflict(let c, _) where c == "last_way_in":
                showToast(ToastModel(text: Self.lastWayInText, kind: .info))
                return false
            default:
                let text = e == .offline ? "Sin conexión. \(p.label) sigue conectada." : "No se pudo desconectar \(p.label)."
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.disconnect(p) }
                })
                return false
            }
        }
    }

    /// Fusionar › correo: `POST /me/merge/otp/request` (204 whether or not the account exists).
    func requestMergeCode(email: String) async -> Bool {
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard e.contains("@"), e.contains(".") else { mergeError = "Revisa el correo."; return false }
        let own = (identities?.email ?? account?.email ?? "").lowercased()
        guard e != own else { mergeError = "Ese es el correo de esta cuenta. Escribe el de la otra."; return false }
        guard !mergeBusy else { return false }
        mergeBusy = true
        mergeError = nil
        defer { mergeBusy = false }
        do {
            try await api.requestMergeCode(email: e)
            online()
            mergeEmail = e
            mergeRetryAt = nil
            return true
        } catch {
            let err = noteError(error)
            if case .rateLimited(let s) = err { mergeRetryAt = Date().addingTimeInterval(TimeInterval(max(s ?? 60, 1))) }
            mergeError = mergeText(err)
            return false
        }
    }

    /// Fusionar › código: `POST /me/merge/otp/verify` → the confirmation screen.
    func verifyMergeCode(_ code: String) async {
        guard !mergeBusy else { return }
        mergeBusy = true
        mergeError = nil
        defer { mergeBusy = false }
        do {
            mergeProof = try await api.verifyMergeCode(email: mergeEmail, code: code)
            online()
            push(.mergeConfirm)
        } catch {
            let e = noteError(error)
            if case .forbidden(let c) = e, c == "proof_rejected" {
                mergeError = "Ese código no sirve. Revísalo o pide otro."
            } else {
                mergeError = mergeText(e)
            }
        }
    }

    private func mergeText(_ e: KuraAPIError) -> String? {
        switch e {
        case .cancelled, .unauthorized: return nil
        case .offline: return "Sin conexión. Revisa tu red e inténtalo de nuevo."
        case .rateLimited(let s):
            guard let s, s > 0 else { return "Demasiados intentos. Espera un momento." }
            if s < 90 { return "Espera \(s) s para pedir otro código." }
            let min = Int((Double(s) / 60).rounded(.up))
            return "Ya pediste varios códigos para ese correo. Intenta en \(min) min."
        case .invalid(_, let m) where !m.isEmpty: return m
        case .invalid: return "Revisa el correo."
        default: return "Algo falló de nuestro lado. Inténtalo de nuevo."
        }
    }

    /// `POST /me/merge`: the other account folds into this one. On success everything that
    /// depends on the account is read again from the returned `Me`, and Ajustes comes back.
    func confirmMerge() async {
        guard let proof = mergeProof, !mergeBusy else { return }
        mergeBusy = true
        mergeError = nil
        sheetLocked = true
        defer { mergeBusy = false; sheetLocked = false }
        let m: Me
        do {
            m = try await api.merge(token: proof.mergeToken)
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized: return
            case .forbidden(let c) where c == "underage":
                mergeProof = nil
                popToSettings()
                showToast(ToastModel(text: "Una de las dos cuentas es de alguien menor de 13. No se pueden juntar.", kind: .info))
            case .conflict(let c, _) where c == "merge_token_invalid":
                mergeProof = nil
                popToSettings(keeping: .mergeAccount)
                showToast(ToastModel(text: "Pasaron más de 10 minutos. Vuelve a probar que la otra cuenta es tuya.", kind: .info))
            case .offline:
                showToast(ToastModel(text: "Sin conexión. No se movió nada.", kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.confirmMerge() }
                })
            default:
                showToast(ToastModel(text: "No se pudo fusionar. No se movió nada.", kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.confirmMerge() }
                })
            }
            return
        }
        online()
        let moved = proof.source.display
        mergeProof = nil
        mergeEmail = ""
        applyMe(m)
        popToSettings()
        KHaptic.impact(.medium)
        showToast(ToastModel(text: "Listo. Todo lo de \(moved) ya está aquí.", kind: .info))
        await reloadAfterMerge()
    }

    /// Everything read for the old shape of the account goes stale: library, feed, people,
    /// recap, Ajustes' lists. The library re-bootstraps; the rest reloads on its next visit.
    private func reloadAfterMerge() async {
        feed = []
        feedLoaded = false
        feedCursor = nil
        feedDirty = false
        discover = nil
        loadedCollections = []
        loadedPeople = []
        peopleLists = [:]
        recapMonths = nil
        recaps = [:]
        blockedAccounts = nil
        deviceSessions = nil
        identities = nil
        await bootstrap()
        await loadIdentities()
    }

    /// Back to Ajustes in the current tab (optionally leaving one screen on top of it).
    private func popToSettings(keeping extra: Route? = nil) {
        var p = paths[tab] ?? []
        if let i = p.lastIndex(of: .settings) {
            p = Array(p.prefix(through: i))
            if let extra { p.append(extra) }
            paths[tab] = p
        }
    }

    // MARK: Sesiones activas

    func loadSessions() async {
        let session = s
        do {
            let items = try await api.sessions()
            try check(session)
            loaded(.sessions)
            // This device first, then the most recently seen.
            deviceSessions = items.sorted {
                if $0.current != $1.current { return $0.current }
                return ($0.lastSeenAt ?? .distantPast) > ($1.lastSeenAt ?? .distantPast)
            }
        } catch {
            guard s === session else { return }
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
        let session = s
        do {
            let g = try await api.onboardingGrid()
            try check(session)
            for t in g { registerPartial(t) }
            onboardingGrid = g
        } catch {
            guard s === session else { return }
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
        let session = s
        do {
            let list = try await api.onboardingPeople()
            try check(session)
            loaded(.onboardingPeople)
            for p in list { register(p) }
            onboardingPeople = list
            onboardingPeopleLoaded = true
        } catch {
            guard s === session else { return }
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
        // Whatever this device holds for the account that just came in (every exit clears it,
        // so after a sign-in this is normally empty — never the previous account's).
        flushLocal()
        loadLocal()
        withAnimation(KMotion.short) { phase = .main }
    }

    /// Called once when the main UI first appears.
    func startIfNeeded() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        await bootstrap(emptyLibrary: emptyLibrary, keepLoading: keepLoading)
        refreshPushRegistration()
        Task { await offerNotificationsIfNeeded() }
        if let route = pendingPush {
            pendingPush = nil
            if path(tab).last != route { push(route) }
        }
        if debugEmptyFollowing { following = []; me.followingCount = 0 }
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
        endSession()
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
    ///
    /// Same cleanup as a sign-out, prefs on disk included (decision, 2026-09-25): on a shared
    /// iPhone whoever signs in next must not inherit the muted list, the "avísame" alerts or the
    /// watched episodes. The cost: re-entering the SAME account after an expiry starts those local
    /// conveniences over (the server-side library is untouched).
    private func sessionExpired(message: String = "Tu sesión terminó. Entra de nuevo.") {
        // A sign-out in flight already cleared the token: the 401s it causes aren't news.
        guard !signingOut else { return }
        guard phase != .onboarding || didBootstrap else { return }
        endSession()
        withAnimation(KMotion.short) { phase = .onboarding }
        showToast(ToastModel(text: message, kind: .info))
    }

    /// Every way out of a session (sign-out, deleted account, 401) ends here.
    private func endSession() {
        resetData()
        prefs.clear()
        clearWebSession()
        // This install's token is no longer the server's for any account we know of: release
        // notices fall back to local ones on the next save, and none of the old account's stay queued.
        PushRegistration.markUnregistered()
        ReleaseNotifier.cancelAll()
    }

    /// Drops the whole `SessionData` (every per-account field, by construction) and cancels what
    /// it had in flight. What lives outside it is reset by hand right here.
    private func resetData() {
        s.cancelAll()
        saveTask?.cancel()
        saveTask = nil
        s = SessionData()
        // A "Reintentar" of the old account must not survive into the next one.
        toastTask?.cancel()
        toast = nil
        #if DEBUG
        if KuraRuntime.usesMock { seedMock() }
        #endif
        onboardingStep = entryStep
        didBootstrap = false
        authProvidersStale = true
        AvatarStore.shared.clear()
    }

    // MARK: Local prefs (what the API marks unsupported)

    private var local: LocalPrefs.Payload { get { s.local } _modify { yield &s.local } set { s.local = newValue } }

    private func loadLocal() {
        local = prefs.load()
        s.localDirty = false
        s.reorderedCollections = []
        recentSearches = local.recentSearches
        recentlyViewed = local.recentlyViewed
        alerts = Set(local.alerts)
        muted = Set(local.muted)
        showCommon = local.showCommon
        if let p = local.defaultPrivacy { defaultPrivacy = Privacy(rawValue: p) ?? .onlyMe }
    }

    private func applyLocal(_ c: KCollection) -> KCollection {
        syncLocalIfDirty()
        guard let l = local.collections[c.id] else { return c }
        var out = c
        out.pinned = l.pinned
        out.coverTitleID = l.coverTitleID
        out.sort = l.sort
        out.layout = l.layout
        if let order = l.order {
            let present = Set(c.titleIDs)
            let known = order.filter { present.contains($0) }
            let placed = Set(known)
            out.titleIDs = known + c.titleIDs.filter { !placed.contains($0) }
        }
        return out
    }

    private func applyLocalEpisodes() {
        syncLocalIfDirty()
        for (id, eps) in local.watchedEpisodes where userTitles[id] != nil {
            userTitles[id]?.watchedEpisodes = Set(eps)
        }
    }

    /// Something device-local changed. Memory is the truth right away; the disk write is debounced
    /// (0.5 s) so a burst — `noteViewed` on every ficha, a drag reorder — is one write, off the tap.
    /// `sceneWentInactive` flushes early; an exit cancels it (the prefs are cleared anyway).
    func saveLocal() {
        guard prefs.enabled else { return }
        s.localDirty = true
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            self?.flushLocal()
        }
    }

    /// Writes the pending prefs now (no-op when nothing changed).
    func flushLocal() {
        saveTask?.cancel()
        saveTask = nil
        guard prefs.enabled, s.localDirty else { return }
        local = currentLocalPayload()
        s.localDirty = false
        prefs.save(local)
    }

    /// Rebuilds `local` from memory when memory is ahead of it (a read — `applyLocal` — must see
    /// the latest pin/cover/sort before the debounced write lands). Stays dirty: the disk still lags.
    private func syncLocalIfDirty() {
        guard s.localDirty else { return }
        local = currentLocalPayload()
    }

    private func currentLocalPayload() -> LocalPrefs.Payload {
        var p = LocalPrefs.Payload()
        for c in collections {
            // A manual order is only persisted for collections the user actually reordered here
            // (or that already had one saved): freezing the server's order for every collection
            // would push titles added on the web to the end.
            let keepsOrder = c.sort == .manual && (s.reorderedCollections.contains(c.id) || local.collections[c.id]?.order != nil)
            let entry = LocalPrefs.Collection(pinned: c.pinned, coverTitleID: c.coverTitleID, sort: c.sort, layout: c.layout,
                                              order: keepsOrder ? c.titleIDs : nil)
            if entry != LocalPrefs.Collection() { p.collections[c.id] = entry }
        }
        for (id, state) in userTitles where !state.watchedEpisodes.isEmpty { p.watchedEpisodes[id] = Array(state.watchedEpisodes).sorted() }
        p.recentSearches = recentSearches
        p.recentlyViewed = recentlyViewed
        p.alerts = Array(alerts).sorted()
        p.muted = Array(muted).sorted()
        p.showCommon = showCommon
        p.defaultPrivacy = defaultPrivacy.rawValue
        return p
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
