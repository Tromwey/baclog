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
    /// `bootstrap` put the server's collections and states in memory. Until then the pins, covers,
    /// orders and watched episodes on disk are the truth (memory has nothing to rebuild them from).
    @ObservationIgnored var libraryLoaded = false
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

    /// A `sync` key with its collection id made current (`collectionAliases`): once `adopt` moved a
    /// chain to the server id, the enqueue, the cleanup and a Reintentar captured with the local id
    /// all have to find it there (`m|título|colección`, `c|colección`; other keys pass through).
    func canonicalWriteKey(_ key: String) -> String {
        guard let bar = key.lastIndex(of: "|") else { return key }
        guard let serverID = collectionAliases[String(key[key.index(after: bar)...])] else { return key }
        return String(key[..<bar]) + "|" + serverID
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
    @ObservationIgnored var saveTask: Task<Void, Never>?

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
    @ObservationIgnored var authProvidersStale = true
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
    var feedFollowingKey: Set<String> { get { s.feedFollowingKey } set { s.feedFollowingKey = newValue } }
    /// A block/unblock changes whose activity the server returns, without touching `following`'s
    /// meaning for the feed key: the next visit re-reads the feed.
    var feedDirty: Bool { get { s.feedDirty } set { s.feedDirty = newValue } }
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

    // MARK: Push
    /// iOS's answer about alerts, for Ajustes (re-read when the app comes back to the foreground:
    /// the only way out of `denied` is the iPhone's own Ajustes).
    var notificationStatus: NotificationPermission.Status = .allowed
    /// DEBUG: `-kuraNotif undetermined|denied` fakes the answer in the mock.
    @ObservationIgnored var debugNotificationStatus: NotificationPermission.Status?

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
    var pendingCollections: [String: Task<String, Error>] { get { s.pendingCollections } _modify { yield &s.pendingCollections } set { s.pendingCollections = newValue } }
    /// Removals waiting for the Deshacer window to close (5 s).
    var deferredWrites: [String: Task<Void, Never>] { get { s.deferredWrites } _modify { yield &s.deferredWrites } set { s.deferredWrites = newValue } }
    /// Titles with a write in flight (a read must not clobber the optimistic state).
    var inflight: [String: Int] { get { s.inflight } _modify { yield &s.inflight } set { s.inflight = newValue } }
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

    func applyMe(_ m: Me) {
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

    func check(_ session: SessionData) throws {
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

    func online() { if offline { offline = false } }

    func loadError(_ key: LoadKey) -> KuraAPIError? { loadErrors[key] }

    /// Records a failed read for its screen (not 404/401/cancel, which have their own shapes).
    @discardableResult
    func fail(_ key: LoadKey, _ error: Error) -> KuraAPIError {
        let e = noteError(error)
        switch e {
        case .cancelled, .unauthorized, .notFound: break
        default: loadErrors[key] = e
        }
        return e
    }

    func loaded(_ key: LoadKey) {
        if loadErrors[key] != nil { loadErrors[key] = nil }
        online()
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

    func reviewList(_ titleID: String) -> [Review] { s.reviewsByTitle[titleID] ?? [] }

    /// Replaces a title's reviews (in display order) and keeps the id index in step.
    func setReviews(_ titleID: String, _ list: [Review]) {
        for r in reviewList(titleID) where s.reviewTitleIndex[r.id] == titleID { s.reviewTitleIndex[r.id] = nil }
        for r in list { s.reviewTitleIndex[r.id] = titleID }
        s.reviewsByTitle[titleID] = list.isEmpty ? nil : list
    }

    func removeReviews(of titleID: String, where drop: (Review) -> Bool) {
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
    func sync(key: String? = nil,
                      titleID: String? = nil,
                      onError: (@MainActor (KuraAPIError) -> Bool)? = nil,
                      _ op: @escaping @Sendable (KuraAPI) async throws -> Void) {
        let api = self.api
        let session = s
        let key = key.map(session.canonicalWriteKey)
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
                // Re-canonicalized: an `adopt` while this ran moved the chain to the server id.
                if let key {
                    let now = session.canonicalWriteKey(key)
                    if session.writeChains[now]?.token == token { session.writeChains[now] = nil }
                }
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
    enum WriteKey {
        static func membership(_ titleID: String, _ collectionID: String) -> String { "m|\(titleID)|\(collectionID)" }
        static func collection(_ id: String) -> String { "c|\(id)" }
        static func mark(_ titleID: String) -> String { "mark|\(titleID)" }
        static func review(_ titleID: String) -> String { "review|\(titleID)" }
        static func follow(_ handle: String) -> String { "follow|\(handle)" }
        static let username = "me|username"
        static let mePatch = "me|patch"
    }

    func patchMe(_ patch: MePatch) {
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

    func enterMain() {
        sheet = nil
        paths = [:]
        tab = .collections
        didBootstrap = false
        // Whatever this device holds for the account that just came in (every exit clears it,
        // so after a sign-in this is normally empty — never the previous account's). Not in the
        // mock: its prefs are off, so the "disk" is an empty payload that would wipe the seed.
        if prefs.enabled {
            flushLocal()
            loadLocal()
        }
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
    func leaveSession(message: String?) {
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
    func sessionExpired(message: String = "Tu sesión terminó. Entra de nuevo.") {
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

}

extension KuraAPIError {
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
