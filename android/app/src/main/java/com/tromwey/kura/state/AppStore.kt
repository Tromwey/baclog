package com.tromwey.kura.state

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.PendingRevokes
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.KuraApi
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.data.api.MePatch
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.BlockedAccount
import com.tromwey.kura.data.models.CollectionDetail
import com.tromwey.kura.data.models.DeviceSession
import com.tromwey.kura.data.models.DiscoverCreatorsPayload
import com.tromwey.kura.data.models.DiscoverFormatPayload
import com.tromwey.kura.data.models.DiscoverPayload
import com.tromwey.kura.data.models.ExternalRef
import com.tromwey.kura.data.models.FanOrder
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FollowListsVisibility
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KNotification
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.PeopleMark
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.PersonCollection
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.PublicLinks
import com.tromwey.kura.data.models.RecapMonth
import com.tromwey.kura.data.models.RecapPayload
import com.tromwey.kura.data.models.ReportTarget
import com.tromwey.kura.data.models.RequestState
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.SearchResult
import com.tromwey.kura.data.models.SortMode
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.UserTitleState
import com.tromwey.kura.data.models.WelcomeArt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

// The app's one store — the Kotlin twin of `ios/Kura/State/AppStore.swift`. Same names (Kotlin
// casing: `Id`, not `ID`), same semantics, one file per theme with the iOS suffix
// (`AppStoreLoading.kt` = `AppStore+Loading.swift`) so a change ports both ways.
//
// CONVENTION (observable state): every observable field is a Compose `mutableStateOf` holding an
// IMMUTABLE value (`Map`, `Set`, `List`, data classes) — Swift's value semantics: a mutation builds a
// new value, an "undo" captures the old one by reference. Screens read the store's properties
// directly (no `collect`); Compose recomposes on change. No `StateFlow` today: nothing needs one.
// What nobody draws (write queues, timers, caches) is plain Kotlin, like iOS `@ObservationIgnored`.
//
// The file is split by theme (a pure move, 2026-10-01): `SessionData.kt` (the per-account state),
// `AppStoreToasts.kt` (toasts, Deshacer/Reintentar and `sync`, the optimistic-write queue) and
// `AppStoreNavigation.kt` (sheets, tabs and pages) hold what used to live here; they are extensions, so a
// screen imports them like every other `AppStore<Tema>.kt` function.
//
// Threading: everything runs on the `scope` handed in (Main.immediate in the app, a test dispatcher
// in the JVM tests). Nothing in here touches the Android framework: platform services arrive through
// `StorePlatform` and `AppStore.create(context)` (AppStoreFactory.kt) is the only place with a Context.

enum class AppPhase { Splash, Onboarding, Main }

enum class LoadState { Loading, Loaded, Failed }

/** What `AppStore.boundWrite` came back with. */
sealed interface BoundWrite<out T> {
    data class Ok<T>(val value: T) : BoundWrite<T>
    data class Failed(val error: KuraApiError) : BoundWrite<Nothing>
    /** The session changed while the write was in flight: the caller drops it whole. */
    data object Stale : BoundWrite<Nothing>
}

/**
 * A per-screen read that can fail. A 404 is not a load error (the screen shows its "ya no existe"
 * shape); everything else — offline, 5xx, 429 — is, and the screen offers Reintentar.
 */
sealed interface LoadKey {
    data object Library : LoadKey
    data class Collection(val id: String) : LoadKey
    data class TitleKey(val id: String) : LoadKey
    data object Feed : LoadKey
    data object FeedMore : LoadKey
    data object Discover : LoadKey
    /** A format page of Descubrir (`AppStore.formatKey`) whose first read failed. */
    data class DiscoverFormat(val format: MediaFormat, val time: Int?) : LoadKey
    data class PersonKey(val handle: String) : LoadKey
    data class PeopleList(val key: String) : LoadKey
    /** The next page of someone's followers / following failed (the list shows a Reintentar strip). */
    data class PeopleMore(val personId: String, val following: Boolean) : LoadKey
    data object Recap : LoadKey
    data object OnboardingPeople : LoadKey
    data class PublicCollection(val key: String) : LoadKey
    data class MoreReviews(val id: String) : LoadKey
    data object Blocks : LoadKey
    data object Sessions : LoadKey
    data object Identities : LoadKey
    // Fiestas (`AppStoreParties.kt`)
    data object Parties : LoadKey
    data class PartyKey(val id: String) : LoadKey
    data class Invite(val token: String) : LoadKey
}

/** Side effects the UI plays (the store never touches a `View`): haptics and TalkBack announcements. */
sealed interface StoreEvent {
    data class Haptic(val kind: StoreHaptic) : StoreEvent
    /** What a toast says, for `announceForAccessibility` (TalkBack doesn't see a view slide in). */
    data class Announce(val text: String) : StoreEvent
}

/** iOS `KHaptic.play(…)` cases the store fires. The design system maps them (`KHaptic`). */
sealed interface StoreHaptic {
    data object Tap : StoreHaptic
    data object Selection : StoreHaptic
    data object Success : StoreHaptic
    /** A failed write (every Reintentar toast): the app's one `error` haptic. */
    data object Error : StoreHaptic
    data class Reaction(val mark: Mark?) : StoreHaptic
}

/** Someone else's followers / following list, beyond its rows. */
data class PeopleListMeta(
    val nextCursor: String? = null,
    /** People counted but not listed ("y N personas más"): someone else's `anonymousCount`, or on YOUR
     *  lists the server's `privateCount` (followers/followees without a public handle). */
    val anonymous: Int = 0,
    val denied: String? = null,
    val loadingMore: Boolean = false,
)

/**
 * The platform services the store needs without depending on Android. `AndroidStorePlatform`
 * (AppStoreFactory.kt) is the live one; tests and the mock use `InMemoryStorePlatform`.
 */
interface StorePlatform {
    /** TalkBack is exploring by touch: toasts (and their Deshacer) live 15 s instead of 5 s. */
    val screenReaderOn: Boolean get() = false
    /** The welcome (13) was passed on this device (iOS `UserDefaults` `kura.welcomeSeen`). */
    var welcomeSeen: Boolean
    /** On-device cover palette (`CoverPalette.extract`); `[]` on any failure. */
    suspend fun extractPalette(url: String): List<String> = emptyList()
    /** A saved announced title: schedule its local release notice (iOS `ReleaseNotifier.schedule`). */
    fun scheduleReleaseNotice(title: Title) {}
    /** Every way out of a session: no notice of the old account stays queued. */
    fun cancelReleaseNotices() {}
    /** Drops the in-app browser's web session (the recap handoff's Auth.js cookie). */
    fun clearWebSession() {}
    /** Drops cached profile photos (iOS `AvatarStore.shared.clear()`). */
    fun clearAvatarCache() {}
    /** Drops what the account exported to share (the recap cards in `cache/recap/`). */
    fun clearExports() {}
}

open class InMemoryStorePlatform(override var welcomeSeen: Boolean = false) : StorePlatform

/**
 * The store. Build it with `AppStore.create(context)` (AppStoreFactory.kt) — one per process, held by
 * `KuraApp`. Tests build it directly with a fake `KuraApi`.
 *
 * @param expiries `ApiClient.sessionExpired` (a 401 on any call): the store goes back to the entrance.
 * @param seed debug/mock only: fills a fresh session (also after a sign-out), like iOS `seedMock()`.
 * @param pendingRevokes sign-outs the server never confirmed (encrypted on the device), retried on the
 *   next launch and when the network comes back (`AppStoreSignOut.kt`).
 */
class AppStore(
    val api: KuraApi,
    val session: Session,
    val prefs: LocalPrefs,
    private val clock: () -> Instant = Instant::now,
    scope: CoroutineScope,
    val platform: StorePlatform = InMemoryStorePlatform(),
    private val expiries: Flow<Unit> = emptyFlow(),
    private val seed: (AppStore.() -> Unit)? = null,
    val pendingRevokes: PendingRevokes = PendingRevokes(InMemoryTokenStore()),
) {
    /** A supervisor child of the given scope: one failed write never cancels the store. */
    internal val scope: CoroutineScope = CoroutineScope(scope.coroutineContext + SupervisorJob(scope.coroutineContext[Job]))

    // MARK: Cover palettes (catalog facts, not per account — see AppStorePalette.kt)
    internal val paletteAttempts = HashSet<String>()
    internal val unsentPalettes = HashMap<String, List<String>>()
    internal var paletteSendQueue: Job? = null

    /** The per-account state: replaced whole on every way out of a session. */
    internal var s by mutableStateOf(SessionData())
        private set

    private val _events = MutableSharedFlow<StoreEvent>(extraBufferCapacity = 32, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    /** Haptics and announcements for the UI to play (`KuraRoot` collects it once). */
    val events: SharedFlow<StoreEvent> = _events.asSharedFlow()

    internal fun haptic(kind: StoreHaptic) { _events.tryEmit(StoreEvent.Haptic(kind)) }

    /** What a toast says, for TalkBack (`AppStoreToasts.kt`). */
    internal fun announce(text: String) { _events.tryEmit(StoreEvent.Announce(text)) }

    /** The store's clock. Live: advanced when the app comes to the foreground and each minute while it's
     *  active (`sceneBecameActive`). Tests and the mock: whatever `clock` says (fixed). */
    var now: Instant by mutableStateOf(clock())

    private var clockJob: Job? = null
    internal var saveJob: Job? = null

    // MARK: Phase / navigation
    var phase by mutableStateOf(AppPhase.Splash)
    var tab: Tab get() = s.tab; set(v) { s.tab = v }
    var paths: Map<Tab, List<Route>> get() = s.paths; set(v) { s.paths = v }
    var sheet: SheetRoute? get() = s.sheet; set(v) { s.sheet = v }
    /** A sheet mid-write (Completar + reseña): the scrim tap and the handle drag don't close it. */
    var sheetLocked: Boolean get() = s.sheetLocked; set(v) { s.sheetLocked = v }
    var toast by mutableStateOf<ToastModel?>(null)
        internal set
    var offline by mutableStateOf(false)
        internal set
    var loadState: LoadState get() = s.loadState; internal set(v) { s.loadState = v }

    // MARK: Account / session
    var me: Person get() = s.me; internal set(v) { s.me = v }
    var account: Me? get() = s.account; internal set(v) { s.account = v }
    /** `POST auth/logout` in flight: nobody signs in again until it answered. */
    var signingOut by mutableStateOf(false)
        internal set
    /** Entrance flow (O1c/O1a): the email the code was sent to, busy flag, inline error. */
    var authEmail: String get() = s.authEmail; set(v) { s.authEmail = v }
    var authBusy by mutableStateOf(false)
        internal set
    var authError: String? get() = s.authError; set(v) { s.authError = v }
    /** When "Enviar otro código" works again (the server allows one code per email every 60 s). */
    var codeResendAt by mutableStateOf<Instant?>(null)
        internal set
    /** O1c was opened by a `429` on `auth/otp/request`: the code that already went out (valid 10 min) is
     *  the one to type — after Volver, or after the process died on the code screen. */
    var codeAlreadySent by mutableStateOf(false)
        internal set

    /** The real clock, for second-by-second countdowns (`now` only moves each minute). */
    fun realNow(): Instant = clock()
    /** `GET /auth/providers`. null = not asked yet; a failure is `EMAIL_ONLY`. */
    var authProviders by mutableStateOf<AuthProviders?>(null)
        internal set
    internal var authProvidersStale = true
    /** Pre-fills O1b's name (Apple sends it once; nothing on Android fills it today). */
    var suggestedName: String? get() = s.suggestedName; set(v) { s.suggestedName = v }
    /** True when the entrance paints Google: the server announced ANDROID's client id (the iOS one
     *  can't sign in from here). Apple never exists on Android (BRIEF). */
    val hasSocialSignIn: Boolean get() = authProviders?.googleAndroidClientId != null

    // MARK: Data
    val people: Map<String, Person> get() = s.people
    val titles: Map<String, Title> get() = s.titles
    /** Ids in the order we learned them (drives local search, "también de"). */
    val catalogOrder: List<String> get() = s.catalogOrder
    val collections: List<KCollection> get() = s.collections
    val userTitles: Map<String, UserTitleState> get() = s.userTitles
    val following: Set<String> get() = s.following
    val feed: List<FeedEvent> get() = s.feed
    var revealedSpoilers: Set<String> get() = s.revealedSpoilers; set(v) { s.revealedSpoilers = v }
    /** Last collection used in "guardar en" — preselected next time. */
    var lastUsedCollectionId: String? get() = s.lastUsedCollectionId; set(v) { s.lastUsedCollectionId = v }
    /** `GET /titles/{id}.following` — what followed people did with a title. */
    val titleActivity: Map<String, List<PeopleMark>> get() = s.titleActivity

    // Per-screen loads
    val loadErrors: Map<LoadKey, KuraApiError> get() = s.loadErrors
    val loadedCollections: Set<String> get() = s.loadedCollections
    val loadedTitles: Set<String> get() = s.loadedTitles
    val loadingTitles: Set<String> get() = s.loadingTitles
    val missingTitles: Set<String> get() = s.missingTitles
    val reviewCursors: Map<String, String> get() = s.reviewCursors
    val reviewsPaging: Set<String> get() = s.reviewsPaging
    val publicCollections: Map<String, CollectionDetail> get() = s.publicCollections
    val missingPublicCollections: Set<String> get() = s.missingPublicCollections
    val avatarBusy: Boolean get() = s.avatarBusy
    val loadedPeople: Set<String> get() = s.loadedPeople
    val loadingPeople: Set<String> get() = s.loadingPeople
    val missingPeople: Set<String> get() = s.missingPeople
    val peopleLists: Map<String, List<Person>> get() = s.peopleLists
    val peopleListMeta: Map<String, PeopleListMeta> get() = s.peopleListMeta
    val feedLoaded: Boolean get() = s.feedLoaded
    val feedLoading: Boolean get() = s.feedLoading
    val feedCursor: String? get() = s.feedCursor
    /** The feed was built from another followed set, or a block/unblock happened since. */
    val feedStale: Boolean get() = s.feedLoaded && (s.feedDirty || s.feedFollowingKey != following)
    val discover: DiscoverPayload? get() = s.discover
    val discoverLoading: Boolean get() = s.discoverLoading
    val discoverCreators: DiscoverCreatorsPayload? get() = s.discoverCreators
    val discoverCreatorsLoading: Boolean get() = s.discoverCreatorsLoading
    val discoverFormats: Map<String, DiscoverFormatPayload> get() = s.discoverFormats
    val searchQuery: String get() = s.searchQuery
    val searchResults: List<SearchResult> get() = s.searchResults
    val searchPeople: List<Person> get() = s.searchPeople
    val searchLoading: Boolean get() = s.searchLoading
    val searchError: KuraApiError? get() = s.searchError
    val onboardingGrid: List<Title> get() = s.onboardingGrid
    /** `GET /onboarding/pool` failed (503 when every provider is down): the grid offers Reintentar. */
    val onboardingGridError: KuraApiError? get() = s.onboardingGridError
    val onboardingPeople: List<Person> get() = s.onboardingPeople
    val onboardingPeopleLoaded: Boolean get() = s.onboardingPeopleLoaded
    val recapMonths: List<RecapMonth>? get() = s.recapMonths
    val recaps: Map<String, RecapPayload> get() = s.recaps
    val recapLoading: Boolean get() = s.recapLoading

    // Social / settings
    /** ⚠️ Solo mock / no-op en live: "Solicitado" en un perfil privado (ver `followFromProfile`). */
    val requested: Set<String> get() = s.requested
    val muted: Set<String> get() = s.muted
    /** Handles you blocked (from `GET /people/{handle}.isBlocked`, `GET /me/blocks` and your own blocks). */
    val blocked: Set<String> get() = s.blocked
    /** `GET /me/blocks` for Ajustes › Cuentas bloqueadas; null until it loads. */
    val blockedAccounts: List<BlockedAccount>? get() = s.blockedAccounts
    /** Reviews you reported this session: the card folds to "Gracias. La revisamos.". */
    val reportedReviews: Set<String> get() = s.reportedReviews
    /** ⚠️ Solo mock / no-op en live: la campana del feed. En live siempre está vacía (no hay
     *  `GET /me/notifications`); `hasUnread` es false. */
    val notifications: List<KNotification> get() = s.notifications
    /** ⚠️ Solo mock / no-op en live: aprobar/rechazar una solicitud (ver `setRequest`). */
    val requestStates: Map<String, RequestState> get() = s.requestStates
    val recentSearches: List<String> get() = s.recentSearches
    /** "Mostrar en común" — device-local, persisted on change. */
    var showCommon: Boolean
        get() = s.showCommon
        set(v) {
            if (s.showCommon == v) return
            s.showCommon = v
            saveLocal()
        }

    /** Privacy a new collection starts with — device-local, persisted on change. */
    var defaultPrivacy: Privacy
        get() = s.defaultPrivacy
        set(v) {
            if (s.defaultPrivacy == v) return
            s.defaultPrivacy = v
            saveLocal()
        }
    /** "Avísame cuando llegue" (E4) — titles you asked to be told about. */
    val alerts: Set<String> get() = s.alerts
    /** Discover's search mode hides the dock (the keyboard owns the bottom). */
    var dockHidden: Boolean get() = s.dockHidden; set(v) { s.dockHidden = v }
    val heroResets: Map<Tab, Int> get() = s.heroResets
    val recentlyViewed: List<String> get() = s.recentlyViewed

    // DEBUG launch options (`DebugLaunch`), never set in release.
    var emptyLibrary = false
    var keepLoading = false
    var debugFailHydrate = false
    var debugEmptyFollowing = false
    var pendingSheet: SheetRoute? = null
    var pendingListCollection: String? = null
    var pendingAction: (() -> Unit)? = null
    internal var didBootstrap = false

    // Settings the API owns (`PATCH /me`) — stored in the session, patched on change. Optimistic: a
    // refused PATCH puts this write's old value back (only if it's still showing, see `patchSetting`).
    var profilePrivate: Boolean
        get() = s.profilePrivate
        set(v) {
            val old = s.profilePrivate
            if (old == v) return
            s.profilePrivate = v
            patchSetting(MePatch(isPublic = !v), "No se pudo cambiar la privacidad de tu perfil.",
                stillMine = { s.profilePrivate == v }, revert = { s.profilePrivate = old })
        }

    var notifyReleases: Boolean
        get() = s.notifyReleases
        set(v) {
            val old = s.notifyReleases
            if (old == v) return
            s.notifyReleases = v
            patchSetting(MePatch(notifyReleases = v), "No se pudo cambiar el aviso de estrenos.",
                stillMine = { s.notifyReleases == v }, revert = { s.notifyReleases = old })
            // Turning a notice on is the moment to ask the phone for permission (iOS does the same).
            if (v) askNotificationsIfNeeded()
        }

    /** "Nuevos seguidores" — push when someone new follows you (`PATCH /me { notifyFollowers }`). */
    var notifyFollowers: Boolean
        get() = s.notifyFollowers
        set(v) {
            val old = s.notifyFollowers
            if (old == v) return
            s.notifyFollowers = v
            patchSetting(MePatch(notifyFollowers = v), "No se pudo cambiar el aviso de seguidores.",
                stillMine = { s.notifyFollowers == v }, revert = { s.notifyFollowers = old })
            if (v) askNotificationsIfNeeded()
        }

    /** "Quién ve tus seguidores y seguidos". Optimistic; a refusal puts the old value back. */
    var followListsVisibility: FollowListsVisibility
        get() = s.followListsVisibility
        set(v) {
            val old = s.followListsVisibility
            if (old == v) return
            s.followListsVisibility = v
            patchSetting(MePatch(followListsVisibility = v.rawValue), "No se pudo cambiar quién ve tus listas.",
                stillMine = { s.followListsVisibility == v }, revert = { s.followListsVisibility = old })
        }

    /** "Correo del recap mensual" (`notify_recap`), off = unsubscribed. */
    var notifyRecap: Boolean
        get() = s.notifyRecap
        set(v) {
            val old = s.notifyRecap
            if (old == v) return
            s.notifyRecap = v
            patchSetting(MePatch(notifyRecap = v), "No se pudo cambiar el correo del recap.",
                stillMine = { s.notifyRecap == v }, revert = { s.notifyRecap = old })
        }

    var musicApp: String
        get() = s.musicApp
        set(v) {
            val old = s.musicApp
            if (old == v) return
            s.musicApp = v
            patchSetting(MePatch(preferredService = serviceWire(v)), "No se pudo cambiar tu app de música.",
                stillMine = { s.musicApp == v }, revert = { s.musicApp = old })
        }

    fun noteSearch(q: String) {
        val list = s.recentSearches.filterNot { it.equals(q, ignoreCase = true) }
        s.recentSearches = (listOf(q) + list).take(6)
        saveLocal()
    }

    /** Forgets one recent search (the ✕ on its row). */
    fun forgetSearch(q: String) {
        val list = s.recentSearches.filterNot { it.equals(q, ignoreCase = true) }
        if (list.size == s.recentSearches.size) return
        s.recentSearches = list
        saveLocal()
    }

    /** "Borrar" on the recent searches. */
    fun clearRecentSearches() {
        if (s.recentSearches.isEmpty()) return
        s.recentSearches = emptyList()
        saveLocal()
    }

    /**
     * Work that must outlive the screen that started it (Completar + reseña keeps going when the sheet
     * closes): runs on the store's scope, for the life of the process. A failure other than cancellation
     * goes through `noteError` (401 → entrance, transport → offline strip) instead of crashing; the store's
     * own functions never throw, so that's only for what the block adds.
     */
    fun launch(block: suspend () -> Unit): Job = scope.launch {
        try {
            block()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            noteError(e)
        }
    }

    fun noteViewed(id: String) {
        s.recentlyViewed = (listOf(id) + s.recentlyViewed.filter { it != id }).take(8)
        saveLocal()
    }

    /** Onboarding picks (the three obsessions). */
    var onboardingPicks: List<String> get() = s.onboardingPicks; set(v) { s.onboardingPicks = v }
    var onboardingStep by mutableStateOf(OnboardingStep.Welcome)

    /** The welcome is a first-launch screen: once passed (or anyone signed in here) the entrance starts at O1a. */
    var welcomeSeen: Boolean
        get() = platform.welcomeSeen
        set(v) { platform.welcomeSeen = v }

    /** A party link (`/f/{token}`) waiting for the account to be ready (iOS `DeepLinkInbox.pending =
     *  .invite`). Outside the session on purpose: it outlives the sign-in that it waits for.
     *  `openPendingInvite()` (AppStoreParties.kt) opens it once the tabs are up. */
    var pendingInvite: String? = null

    /** The invite landing (`get-kura.app/f/{token}`) over every phase; null = not showing. */
    var inviteLanding by mutableStateOf<String?>(null)

    /** O1b ran for a new account with a party link waiting: its "ya estás dentro." is the new one. */
    var partyJustOnboarded = false

    /** A party link waiting for a sign-in: the entrance skips the welcome and O1b skips "elige 3". */
    val invitePending: Boolean get() = pendingInvite != null

    val entryStep: OnboardingStep get() = if (welcomeSeen || invitePending) OnboardingStep.Signup else OnboardingStep.Welcome

    /** What `MainActivity` handed back after a process death (`AppStoreSavedState.kt`): applied once
     *  the same account is back in the tabs. Outside the session: it waits for it. */
    internal var restoredState: SavedState? = null

    /** A notification tapped before the tabs were up: opened once the library has loaded. */
    var pendingPush: Route? get() = s.pendingPush; set(v) { s.pendingPush = v }

    internal var toastJob: Job? = null
    /** While `sync` runs a caller's revert for a write Reintentar can't fix (`onboarding_required`):
     *  the revert happens, its toast and its `pendingRetries` don't. */
    internal var revertOnly = false
    /** The error `sync` is handing to a caller's `onError` right now: `retryToast` queues the write
     *  only when trying again can fix it (`KuraApiError.canRetry`). */
    internal var failing: KuraApiError? = null
    /** The `GET /me` that follows a `403 onboarding_required` (one at a time). */
    internal var onboardingRecheck: Job? = null
    internal var pathSatisfied = true

    // MARK: Clock

    /** The app came to the foreground: catch the clock up and keep it moving each minute. */
    fun sceneBecameActive() {
        tickClock()
        if (clockJob != null) return
        clockJob = scope.launch {
            while (true) {
                delay(60.seconds)
                tickClock()
            }
        }
    }

    /** The app left the foreground: stop the minute timer and write what's pending to disk. */
    fun sceneWentInactive() {
        clockJob?.cancel()
        clockJob = null
        flushLocal()
    }

    /** Moves `now` only when the minute changed (every countdown re-renders on each assignment). */
    private fun tickClock() {
        val real = clock()
        if (real.epochSecond / 60 != now.epochSecond / 60) now = real
    }

    /** The network came and went (`ConnectivityManager` callback, wired by the factory). Coming back
     *  drops the offline strip and retries what failed offline. */
    fun connectivityChanged(satisfied: Boolean) {
        val was = pathSatisfied
        pathSatisfied = satisfied
        if (!satisfied || was) return
        offline = false
        // A sign-out that didn't reach the server (this phone or everywhere): now it can.
        retryPendingRevokesSoon()
        // Every write that failed for the network (already reverted on screen, waiting in the retry
        // queue — whether or not its notice is the toast up right now): re-applied and sent again, in order.
        if (phase == AppPhase.Main) resendPendingRetries()
        val wasOffline = s.loadErrors.filterValues { it is KuraApiError.Offline }.keys
        s.loadErrors = s.loadErrors - wasOffline
        if (phase != AppPhase.Main) return
        if (loadState == LoadState.Failed) {
            scope.launch { bootstrap() }
            return
        }
        scope.launch { reloadVisible(wasOffline) }
    }

    private suspend fun reloadVisible(keys: Set<LoadKey>) {
        val route = path(tab).lastOrNull()
        if (route != null) {
            when (route) {
                is Route.TitleRoute -> if (LoadKey.TitleKey(route.id) in keys) loadTitle(route.id, force = true)
                is Route.Collection -> if (LoadKey.Collection(route.id) in keys) loadCollection(route.id, force = true)
                is Route.PersonRoute -> if (LoadKey.PersonKey(route.handle) in keys) loadPerson(route.handle, force = true)
                is Route.PublicCollection ->
                    if (LoadKey.PublicCollection(publicKey(route.handle, route.id)) in keys) loadPublicCollection(route.handle, route.id, force = true)
                is Route.Recap -> if (LoadKey.Recap in keys) loadRecap()
                else -> Unit
            }
            return
        }
        when (tab) {
            Tab.Feed -> if (LoadKey.Feed in keys) loadFeed(force = true)
            Tab.Discover -> {
                if (LoadKey.Discover in keys) loadDiscover(force = true)
                for (k in keys) if (k is LoadKey.DiscoverFormat) loadDiscoverFormat(k.format, k.time)
            }
            Tab.Collections -> if (LoadKey.Library in keys) retryLibraryTitles()
            else -> Unit
        }
    }

    // MARK: Registry

    /** Full title from any payload wins over a partial one already known. */
    fun register(t: Title) {
        val old = s.titles[t.id]
        if (old == null) s.catalogOrder = s.catalogOrder + t.id
        s.titles = s.titles + (t.id to merged(old, t))
    }

    /** Many at once (one map copy): `register` for every payload that brings a list. */
    fun registerAll(list: Collection<Title>) {
        if (list.isEmpty()) return
        val titles = s.titles.toMutableMap()
        val added = ArrayList<String>()
        for (t in list) {
            val old = titles[t.id]
            if (old == null && t.id !in added) added.add(t.id)
            titles[t.id] = merged(old, t)
        }
        if (added.isNotEmpty()) s.catalogOrder = s.catalogOrder + added
        s.titles = titles
    }

    /**
     * Summary payloads (`GET /titles?ids=`, discover, feed, people) carry no detail: they never erase
     * what `GET /titles/{id}` brought. They DO carry `release`, and the newest wins. A palette only
     * ever fills (first-writer-wins on the server).
     */
    private fun merged(old: Title?, t: Title): Title {
        if (old == null) return t
        var m = t
        if (!t.isDetailed && old.isDetailed) {
            m = old.copy(
                name = t.name,
                format = t.format,
                year = t.year ?: old.year,
                creator = t.creator ?: old.creator,
                palette = t.palette.ifEmpty { old.palette },
                coverUrl = t.coverUrl ?: old.coverUrl,
            )
        }
        m = m.copy(release = t.release ?: old.release)
        if (m.palette.isEmpty()) m = m.copy(palette = old.palette)
        return m
    }

    /** A partial title (search result) never overwrites a fuller one. */
    fun registerPartial(t: Title) {
        if (s.titles[t.id] != null) return
        register(t)
    }

    fun register(p: Person) {
        var m = p
        val old = s.people[p.id]
        if (old != null) {
            m = m.copy(
                hexes = m.hexes.ifEmpty { old.hexes },
                featuredTitleId = m.featuredTitleId ?: old.featuredTitleId,
                why = m.why ?: old.why,
                obsessions = m.obsessions.ifEmpty { old.obsessions },
                common = m.common.ifEmpty { old.common },
                collections = m.collections.ifEmpty { old.collections },
                // Only `GET /people/{handle}` knows these; a LITE card from a list says nothing.
                followListsVisibility = m.followListsVisibility ?: old.followListsVisibility,
                canSeeFollowLists = m.canSeeFollowLists ?: old.canSeeFollowLists,
            )
        }
        for (t in m.embeddedTitles) registerPartial(t)
        s.people = s.people + (p.id to m)
        p.isFollowing?.let { f -> s.following = if (f) s.following + p.id else s.following - p.id }
    }

    fun applyMe(m: Me) {
        account = m
        welcomeSeen = true
        var p = m.person
        if (p.hexes.isEmpty()) p.featuredTitleId?.let { s.titles[it] }?.let { p = p.copy(hexes = it.palette) }
        me = p
        if (p.id.isNotEmpty()) s.people = s.people + (p.id to p)
        s.profilePrivate = !m.isPublic
        s.notifyReleases = m.notifyReleases
        s.notifyRecap = m.notifyRecap
        s.notifyFollowers = m.notifyFollowers
        s.followListsVisibility = m.followListsVisibility
        m.preferredService?.let { s.musicApp = serviceName(it) }
    }

    // MARK: Reads bound to their session

    /** A read that started in one session and answers in another is dropped whole. Every `load*`
     *  captures `val session = s` first, calls `check(session)` after each suspension and opens its
     *  `catch` with `if (s !== session) return`. */
    internal class StaleSession : Exception()

    internal fun check(session: SessionData) {
        if (s !== session) throw StaleSession()
    }

    // MARK: Writes bound to their session

    /**
     * A write awaited in place (not queued by `sync`: block, report, avatar, onboarding…), bound to the
     * session that sent it. The answer of an old session is `Stale` — no state, no toast, no
     * Reintentar — and its error never reaches `noteError`, so the 401 of a revoked bearer can't expire
     * the new session.
     */
    suspend fun <T> boundWrite(op: suspend () -> T): BoundWrite<T> {
        val session = s
        return try {
            val value = op()
            if (s !== session) BoundWrite.Stale else {
                online()
                BoundWrite.Ok(value)
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            if (s !== session) BoundWrite.Stale else BoundWrite.Failed(noteError(e) ?: KuraApiError.Server("cancelado"))
        }
    }

    /** Runs `apply` only while `session` is still the current one (a `sync` op's post-await writes). */
    internal inline fun on(session: SessionData, apply: () -> Unit) {
        if (s === session) apply()
    }

    /**
     * Fetches the titles we don't know yet (`GET /titles?ids=`). A failure is recorded on `key` so the
     * screen says "incompleto · Reintentar" instead of drawing an empty shelf as the truth.
     */
    suspend fun hydrateTitles(ids: Iterable<String>, key: LoadKey): Boolean {
        val missing = ids.filter { s.titles[it] == null && ExternalRef.parse(it) == null }.distinct()
        if (missing.isEmpty()) return true
        val session = s
        return try {
            if (debugFailHydrate) throw KuraApiError.Server("hydrate simulado (kuraFailHydrate)")
            val fetched = api.titles(missing)
            check(session)
            registerAll(fetched)
            true
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            if (s !== session) return false
            fail(key, e)
            false
        }
    }

    /** Titles of your library that `GET /titles?ids=` couldn't bring at launch. */
    val libraryIncomplete: Boolean
        get() = loadState == LoadState.Loaded && libraryIds.any { s.titles[it] == null && ExternalRef.parse(it) == null }

    /** Reintentar on a launch whose library arrived but whose titles didn't. */
    suspend fun retryLibraryTitles() {
        s.loadErrors = s.loadErrors - LoadKey.Library
        val session = s
        if (hydrateTitles(libraryIds, LoadKey.Library) && s === session) online()
    }

    // MARK: Errors

    /**
     * Maps any error to `KuraApiError`, applies the global consequences (401 → entrance, transport →
     * offline strip) and returns it. `null` = a cancellation (iOS `.cancelled`): nothing to say.
     */
    fun noteError(error: Throwable): KuraApiError? {
        if (error is CancellationException) return null
        // Anything that isn't a mapped API error is a bug in the app (a NPE in an op, a bad cast…): the
        // person sees the generic failure, the log gets the stack.
        if (error !is KuraApiError) KuraLog.e("KuraStore", "bug no mapeado", error)
        val e = error as? KuraApiError ?: KuraApiError.Server(error.toString())
        when (e) {
            KuraApiError.Unauthorized -> sessionExpired()
            KuraApiError.Offline -> {
                offline = true
                // A request died on the transport while the system still said "connected" (a captive
                // portal, a dead route): the path is NOT good, so the next "validated" from the system
                // counts as a reconnection and retries what failed (`connectivityChanged`). A TIMEOUT
                // is not that: the path works, the server was slow — lowering it would make the next
                // capabilities callback replay every pending write for nothing.
                if (!api.lastOfflineTimedOut) pathSatisfied = false
            }
            else -> Unit
        }
        return e
    }

    fun online() {
        if (offline) offline = false
    }

    fun loadError(key: LoadKey): KuraApiError? = s.loadErrors[key]

    /** Records a failed read for its screen (not 404/401/cancel, which have their own shapes). */
    internal fun fail(key: LoadKey, error: Throwable): KuraApiError? {
        val e = noteError(error) ?: return null
        when (e) {
            KuraApiError.Unauthorized, KuraApiError.NotFound -> Unit
            else -> s.loadErrors = s.loadErrors + (key to e)
        }
        return e
    }

    internal fun loaded(key: LoadKey) {
        if (s.loadErrors.containsKey(key)) s.loadErrors = s.loadErrors - key
        online()
    }

    internal fun setLoadError(key: LoadKey, e: KuraApiError?) {
        s.loadErrors = if (e == null) s.loadErrors - key else s.loadErrors + (key to e)
    }

    // MARK: Lookups

    fun title(id: String): Title? = s.titles[id]
    fun person(id: String): Person? = if (id == me.id) me else s.people[id]

    /** A collection by id — a local id adopted by the server still finds it (`collectionAliases`). */
    fun collection(id: String): KCollection? {
        val cols = collections // observed
        val key = canonicalCollectionId(id)
        val index = s.indexMemo.get(cols) {
            val m = HashMap<String, Int>()
            cols.forEachIndexed { i, c -> m.putIfAbsent(c.id, i) }
            m
        }
        return index[key]?.let { cols[it] }
    }

    fun mark(titleId: String): Mark? = s.userTitles[titleId]?.mark

    fun review(id: String?): Review? {
        id ?: return null
        val byTitle = s.reviewsByTitle // observed
        val tid = s.reviewTitleIndex[id] ?: return null
        return byTitle[tid]?.firstOrNull { it.id == id }
    }

    fun myReview(titleId: String): Review? = reviewList(titleId).firstOrNull { it.authorId == me.id }

    // MARK: Reviews storage (by title; `reviewTitleIndex` = review id → title id)

    fun reviewList(titleId: String): List<Review> = s.reviewsByTitle[titleId] ?: emptyList()

    /** Replaces a title's reviews (in display order) and keeps the id index in step. */
    fun setReviews(titleId: String, list: List<Review>) {
        for (r in reviewList(titleId)) if (s.reviewTitleIndex[r.id] == titleId) s.reviewTitleIndex.remove(r.id)
        for (r in list) s.reviewTitleIndex[r.id] = titleId
        s.reviewsByTitle = if (list.isEmpty()) s.reviewsByTitle - titleId else s.reviewsByTitle + (titleId to list)
    }

    fun removeReviews(titleId: String, drop: (Review) -> Boolean) {
        val list = reviewList(titleId)
        if (list.none(drop)) return
        setReviews(titleId, list.filterNot(drop))
    }

    /** Decorative covers for the entrance screens (never part of the live library). */
    fun decor(id: String): Title? = s.titles[id] ?: WelcomeArt.title(id)

    /** "Tus colecciones": pinned first, then non-empty, then newest. Cached until `collections` changes. */
    val orderedCollections: List<KCollection>
        get() {
            val cols = collections
            return s.orderedMemo.get(cols) {
                cols.sortedWith(
                    compareByDescending<KCollection> { it.pinned }
                        .thenByDescending { it.titleIds.isNotEmpty() }
                        .thenByDescending { it.createdAt },
                )
            }
        }

    /** A collection's titles, filtered and sorted (iOS `titles(in:format:)`). Cached per (collection,
     *  format) until titles, states or that collection change. */
    fun titlesIn(c: KCollection, format: MediaFormat? = null): List<Title> {
        val titles = s.titles
        val states = s.userTitles // observed
        val memo = s.titlesInMemo.getOrPut("${c.id}|${format?.rawValue ?: "*"}") { Memo() }
        return memo.get(c, titles, states) { sortedTitles(c, format, titles) }
    }

    private fun sortedTitles(c: KCollection, format: MediaFormat?, titles: Map<String, Title>): List<Title> {
        var list = c.titleIds.mapNotNull { titles[it] }
        if (format != null) list = list.filter { it.format == format }
        return when (c.sort) {
            SortMode.Manual -> list
            SortMode.Recent -> list.sortedByDescending { savedDate(it.id, c) }
            SortMode.Title -> {
                val collator = java.text.Collator.getInstance(com.tromwey.kura.data.models.KCalendar.locale)
                list.sortedWith { a, b -> collator.compare(a.name, b.name) }
            }
            SortMode.Status -> list.sortedBy { mark(it.id)?.rank ?: 9 }
            SortMode.Year -> list.sortedByDescending { it.year ?: 0 }
        }
    }

    private fun savedDate(titleId: String, c: KCollection): Instant =
        c.addedAt[titleId] ?: s.userTitles[titleId]?.savedAt ?: Instant.MIN

    /** The collection's fan (≤ 3, front first): the chosen cover when still a member, then the MANUAL order. */
    fun fan(c: KCollection): List<Title> {
        val known = c.titleIds.filter { s.titles[it] != null }
        val ids = if (known.isEmpty()) c.fanTitleIds else FanOrder.fan(known, c.chosenCoverTitleId)
        return ids.mapNotNull { s.titles[it] }
    }

    /** Someone else's collection: the server's fan is the truth. */
    fun fan(pc: PersonCollection): List<Title> {
        val ids = pc.fanTitleIds.ifEmpty { FanOrder.fan(pc.titleIds, pc.coverTitleId) }
        return ids.mapNotNull { s.titles[it] }
    }

    fun coverTitle(c: KCollection): Title? = fan(c).firstOrNull()

    /** The two tones a collection tints with. Empty = no colour. */
    fun hexes(c: KCollection): List<String> = fanHexes(fan(c), c.titleIds.mapNotNull { s.titles[it] })

    /** `hexes(c)`, null without colour. */
    fun palette(c: KCollection): List<String>? = hexes(c).ifEmpty { null }

    /** The collections a title is in, in `orderedCollections` order. */
    fun collectionsContaining(titleId: String): List<KCollection> {
        val ordered = orderedCollections
        val index = s.containingMemo.get(ordered) {
            val m = HashMap<String, MutableList<Int>>()
            ordered.forEachIndexed { i, c -> for (t in c.titleIds.toSet()) m.getOrPut(t) { ArrayList() }.add(i) }
            m
        }
        return (index[titleId] ?: emptyList()).map { ordered[it] }
    }

    /** In at least one collection ("Guardado"). Not the same as being in your library. */
    fun isSaved(titleId: String): Boolean = collectionsContaining(titleId).isNotEmpty()

    /** Your library: every title with your state plus the memberships whose state hasn't landed yet.
     *  Counts, "no puedo esperar" and hydration read THIS, never `collections` alone. */
    val libraryIds: Set<String>
        get() {
            val states = s.userTitles
            val cols = s.collections
            return s.libraryMemo.get(states, cols) { states.keys + cols.flatMap { it.titleIds } }
        }

    /** Reviews you wrote: the server count until the local list catches up. */
    val reviewCount: Int
        get() {
            val mine = s.reviewsByTitle.values.sumOf { list -> list.count { it.authorId == me.id } }
            return maxOf(account?.stats?.reviews ?: 0, mine)
        }

    // MARK: Public links (yours)

    /** Your profile — null while it's private. */
    val myProfileLink: String? get() = if (profilePrivate) null else PublicLinks.profile(me.handle)

    /** One of your collections — null while your profile is private, it's "Solo yo", or still a local id. */
    fun myCollectionLink(c: KCollection): String? {
        if (profilePrivate || c.privacy == Privacy.OnlyMe || s.pendingCollections.containsKey(c.id)) return null
        return PublicLinks.collection(me.handle, c.id)
    }

    /** A title "as sent by you" — null while your profile is private. */
    fun myItemLink(titleId: String): String? = if (profilePrivate) null else PublicLinks.item(me.handle, titleId)

    /** Keys for `sync(key)` — writes that contradict each other share one. */
    object WriteKey {
        fun membership(titleId: String, collectionId: String) = "m|$titleId|$collectionId"
        fun collection(id: String) = "c|$id"
        /** Every pin write: one pinned per account, so a pin on A and one on B contradict each other. */
        const val PIN = "pin"
        fun mark(titleId: String) = "mark|$titleId"
        fun review(titleId: String) = "review|$titleId"
        fun follow(handle: String) = "follow|$handle"
        /** "Quitar de tus colecciones" (`DELETE /me/titles/{id}`). */
        fun library(titleId: String) = "library|$titleId"
        const val USERNAME = "me|username"
        const val ME_PATCH = "me|patch"
    }

    fun enterMain() {
        dismissSheet()
        s.paths = emptyMap()
        tab = restoredTab() ?: Tab.Collections
        didBootstrap = false
        // Whatever this device holds for the account that just came in (every exit clears it).
        if (prefs.enabled) {
            flushLocal()
            loadLocal()
        }
        phase = AppPhase.Main
    }

    /** Called once when the main UI first appears. */
    suspend fun startIfNeeded() {
        if (didBootstrap) return
        didBootstrap = true
        bootstrap(emptyLibrary = emptyLibrary, keepLoading = keepLoading)
        // The pages that were open when the system killed the process (now that the library is here).
        applyRestoredState()
        // Push (iOS `refreshPushRegistration()` + `offerNotificationsIfNeeded()`) runs from
        // `watchPushOnMain` (AppStorePush.kt), wired by `AppStore.create`, once this bootstrap is done.
        pendingPush?.let { route ->
            pendingPush = null
            if (path(tab).lastOrNull() != route) push(route)
        }
        // Links that arrived before the tabs open from `KuraRoot.PendingLinks` → `openPendingLink()`
        // (AppStoreLinks.kt) once this bootstrap landed.
        if (debugEmptyFollowing) {
            s.following = emptySet()
            me = me.copy(followingCount = 0)
        }
        pendingListCollection?.let { id ->
            s.collections = s.collections.map { if (it.id == id) it.copy(layout = com.tromwey.kura.data.models.CollectionLayout.List) else it }
        }
        pendingAction?.let { action ->
            pendingAction = null
            delay(300.milliseconds)
            action()
        }
        pendingSheet?.let { route ->
            pendingSheet = null
            delay(250.milliseconds)
            present(route)
        }
    }

    /**
     * Cerrar sesión. `global` (Ajustes) = `POST auth/logout`, which revokes every bearer of the account:
     * AWAITED before leaving; if the server didn't confirm it, the local session ends anyway, this
     * install's push token comes off with the old bearer (best effort) and the logout is queued
     * (`pendingRevokes`) until the network is back. `global = false` (an account just created here:
     * Volver in onboarding, underage) leaves at once and revokes THIS session on the server in the
     * background (`AppStoreSignOut.kt`); "Cerrar sesión en este teléfono" awaits it:
     * `signOutThisDevice()`.
     */
    fun signOut(global: Boolean = true, message: String? = null) {
        if (signingOut) return
        if (!global) {
            val bearer = session.token
            val sid = session.sid
            api.forgetSession()
            leaveSession(message)
            if (bearer != null) scope.launch { revokeInBackground(bearer, sid) }
            return
        }
        signingOut = true
        val bearer = session.token
        scope.launch {
            val confirmed = try {
                api.logout()
                true
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                false
            }
            if (!confirmed && bearer != null) {
                releasePushToken(bearer)
                pendingRevokes.add(com.tromwey.kura.data.PendingRevoke(bearer = bearer, global = true))
            }
            signingOut = false
            leaveSession(if (confirmed) message else GLOBAL_SIGN_OUT_QUEUED)
        }
    }

    /** The common exit: nothing of the old account stays on the device. */
    fun leaveSession(message: String?) {
        endSession()
        phase = AppPhase.Onboarding
        message?.let { showToast(ToastModel(it, ToastModel.Kind.Info)) }
    }

    /**
     * A 401 anywhere: the token is already gone, back to the entrance. Same cleanup as a sign-out, prefs
     * on disk included (learning 2026-09-25-ios-sesion-caducada-no-limpia-prefs-ni-push).
     */
    fun sessionExpired(message: String = "Tu sesión terminó. Entra de nuevo.") {
        // A sign-out in flight already cleared the token: the 401s it causes aren't news.
        if (signingOut) return
        if (phase == AppPhase.Onboarding && !didBootstrap) return
        endSession()
        phase = AppPhase.Onboarding
        showToast(ToastModel(message, ToastModel.Kind.Info))
    }

    /** Every way out of a session (sign-out, deleted account, 401) ends here. */
    private fun endSession() {
        resetData()
        disk { prefs.clear() }
        platform.clearWebSession()
        platform.clearExports()
        // Also marks this install's push token unregistered (`AndroidStorePlatform`), like iOS.
        platform.cancelReleaseNotices()
    }

    /** Drops the whole `SessionData` and cancels what it had in flight. */
    private fun resetData() {
        s.cancelAll()
        saveJob?.cancel()
        saveJob = null
        s = SessionData()
        // A "Reintentar" of the old account must not survive into the next one.
        toastJob?.cancel()
        toast = null
        seed?.invoke(this)
        onboardingStep = entryStep
        didBootstrap = false
        authProvidersStale = true
        platform.clearAvatarCache()
    }

    // MARK: Disk (LocalPrefs is async: one serial queue so a load after a clear sees it cleared)

    private var diskTail: Job? = null

    internal fun disk(op: suspend () -> Unit): Job {
        val previous = diskTail
        val job = scope.launch(start = CoroutineStart.LAZY) {
            previous?.join()
            try {
                op()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                // Memory stays the truth and the next save tries again — but it leaves a trace.
                KuraLog.w("KuraPrefs", "disco: ${e.javaClass.simpleName}")
            }
        }
        diskTail = job
        job.start()
        return job
    }

    // Last in the class body: every property above is initialized before it runs.
    init {
        seed?.invoke(this)
        if (seed == null) loadLocal()
        this.scope.launch { expiries.collect { sessionExpired() } }
    }

    companion object {
        /** Said instead of a link while your profile is private: every public URL would 404. */
        const val PRIVATE_PROFILE_SHARE_NOTE = "Tu perfil es privado. Hazlo público en Ajustes para compartirlo."

        /** A global sign-out the server didn't confirm: queued, retried when the network is back. */
        const val GLOBAL_SIGN_OUT_QUEUED = "No pudimos cerrar tu sesión en otros dispositivos; lo intentamos al reconectar."

        /** "Cerrar sesión en este teléfono" the server didn't confirm: same queue. */
        const val DEVICE_SIGN_OUT_QUEUED = "No pudimos cerrar tu sesión en el servidor; lo intentamos al reconectar."

        /** "No encontramos este título": `PUT mark` answered 404 for a catalog id. */
        const val UNKNOWN_TITLE_NOTE = "No encontramos este título. Búscalo de nuevo."

        /** A collection write answered 404 (deleted from another device): the change was put back. */
        const val GONE_COLLECTION_NOTE = "Esa colección ya no existe. No se guardó el cambio."

        /** Saving a title answered 404: the collection or the title is gone; it left the collection again. */
        const val GONE_SAVE_NOTE = "No se pudo guardar: esa colección o ese título ya no existe."

        /** A write the server can't take (404 / 501) and that Reintentar wouldn't fix. */
        const val NOT_SAVED_NOTE = "No se pudo guardar. Lo que ves volvió a como estaba."

        /** Name ≤ 40 when WRITING (the server still accepts 60 for old names); frase ≤ 80 (server limit). */
        const val COLLECTION_NAME_LIMIT = 40
        const val COLLECTION_VIBE_LIMIT = 80

        /** ≤ 12 palette PUTs a minute, of the API's 60 writes/min shared with real actions. */
        val PALETTE_SEND_GAP: Duration = 5.seconds

        /** `preferredService` on the wire. */
        val services: List<Pair<String, String>> = listOf(
            "Apple Music" to "apple_music", "Spotify" to "spotify", "YouTube Music" to "youtube_music", "Tidal" to "tidal",
        )

        fun serviceWire(name: String): String = services.firstOrNull { it.first == name }?.second ?: "apple_music"
        fun serviceName(wire: String): String = services.firstOrNull { it.second == wire }?.first ?: "Apple Music"

        /** The two tones of a fan: its front cover when it has a palette, else the first ordered one that does. */
        fun fanHexes(fan: List<Title>, ordered: List<Title> = emptyList()): List<String> {
            val lead = fan.firstOrNull { it.palette.isNotEmpty() } ?: ordered.firstOrNull { it.palette.isNotEmpty() }
            return FanOrder.kuraHexes(lead?.palette ?: emptyList())
        }

        fun publicKey(handle: String, id: String) = "$handle|$id"

        fun peopleListKey(personId: String, following: Boolean) = "$personId|${if (following) "following" else "followers"}"

        fun formatKey(format: MediaFormat, time: Int?): String =
            if (format == MediaFormat.Film) "film:${time ?: 1}" else format.rawValue

        /** A fresh local id for an optimistic object (`c-1a2b3c4d`). */
        internal fun localId(prefix: String, length: Int = 8) = "$prefix-${UUID.randomUUID().toString().take(length)}"
    }
}

/** Inline text for the entrance screens. */
val KuraApiError.authText: String
    get() = when (this) {
        KuraApiError.Offline -> "Sin conexión. Revisa tu red y vuelve a intentarlo."
        is KuraApiError.RateLimited ->
            retryAfter?.takeIf { it > 0 }?.let { "Demasiados intentos seguidos. Espera ${waitText(it)} y vuelve a intentarlo." }
                ?: "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
        is KuraApiError.Invalid -> fields["code"] ?: fields["email"] ?: message.ifEmpty { "Revisa el código." }
        KuraApiError.CodeLocked -> "Se intentó demasiadas veces. Pide otro código más tarde."
        KuraApiError.Unauthorized, KuraApiError.NotFound -> "El código es incorrecto o ya venció. Revísalo o pide otro."
        is KuraApiError.Conflict -> message.ifEmpty { "No se pudo entrar. Vuelve a intentarlo." }
        else -> "No se pudo entrar. Vuelve a intentarlo."
    }
