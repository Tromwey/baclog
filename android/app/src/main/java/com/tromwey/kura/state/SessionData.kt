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

// The per-account state behind `AppStore` (moved out of AppStore.kt, 2026-10-01; iOS `SessionData`).

/** A per-account cache slot recomputed only when an input changed (compared by identity: every
 *  mutation of the store's immutable values builds a new instance). iOS `SessionData.DerivedCache`. */
internal class Memo<T> {
    private var deps: Array<out Any?>? = null
    private var value: Any? = null

    @Suppress("UNCHECKED_CAST")
    fun get(vararg inputs: Any?, compute: () -> T): T {
        val d = deps
        if (d != null && d.size == inputs.size && d.indices.all { d[it] === inputs[it] }) return value as T
        val v = compute()
        deps = inputs
        value = v
        return v
    }
}

internal class WriteChain(val token: Any, val job: Job)

/** `SessionData.endWrite`: the last value the server confirmed, and whether a newer write is pending. */
internal class WriteBase(val value: Any?, val newer: Boolean)

/** The confirmed side of a mark: whether you had a state for the title at all, its mark, and your
 *  review of it (the server deletes it with a mark that leaves no reaction: a failed one puts it back). */
internal data class ConfirmedMark(val had: Boolean, val mark: com.tromwey.kura.data.models.Mark?, val review: OwnReview? = null)

/** Your review of a title as the phone had it: the state's `reviewId` and the review itself when loaded. */
internal data class OwnReview(val reviewId: String?, val reviews: List<Review>)

/**
 * Everything that belongs to ONE signed-in account (and the entrance that leads to it). Signing out, a
 * deleted account and a 401 all replace it whole (`AppStore.resetData` → `SessionData()`), so nothing
 * of account A can leak into account B. **A new per-account field goes HERE, never as a stored
 * property of `AppStore`**; the store forwards it.
 */
internal class SessionData {
    // Navigation (a new account starts at the root of Colecciones)
    var tab by mutableStateOf(Tab.Collections)
    var paths by mutableStateOf<Map<Tab, List<Route>>>(emptyMap())
    var sheet by mutableStateOf<SheetRoute?>(null)
    var sheetLocked by mutableStateOf(false)
    var loadState by mutableStateOf(LoadState.Loading)
    var dockHidden by mutableStateOf(false)
    var heroResets by mutableStateOf<Map<Tab, Int>>(emptyMap())

    // Account / entrance
    var me by mutableStateOf(Person(handle = "", name = "", initials = "k", hexes = emptyList()))
    var account by mutableStateOf<Me?>(null)
    var authEmail by mutableStateOf("")
    var authError by mutableStateOf<String?>(null)
    var suggestedName by mutableStateOf<String?>(null)
    var onboardingPicks by mutableStateOf<List<String>>(emptyList())

    // Data
    var people by mutableStateOf<Map<String, Person>>(emptyMap())
    var titles by mutableStateOf<Map<String, Title>>(emptyMap())
    var catalogOrder by mutableStateOf<List<String>>(emptyList())
    var collections by mutableStateOf<List<KCollection>>(emptyList())
    var userTitles by mutableStateOf<Map<String, UserTitleState>>(emptyMap())
    var following by mutableStateOf<Set<String>>(emptySet())
    /** Reviews by title id, in display order (`reviewTitleIndex` finds one by its own id). */
    var reviewsByTitle by mutableStateOf<Map<String, List<Review>>>(emptyMap())
    var feed by mutableStateOf<List<FeedEvent>>(emptyList())
    var revealedSpoilers by mutableStateOf<Set<String>>(emptySet())
    var lastUsedCollectionId by mutableStateOf<String?>(null)
    var titleActivity by mutableStateOf<Map<String, List<PeopleMark>>>(emptyMap())
    /** Review text typed and not published yet, by title id (`AppStoreSavedState.kt`): the Completar
     *  sheet opens on it, and it survives the system killing the app in the background. */
    var reviewDrafts: Map<String, String> = emptyMap()

    // Per-screen loads
    var loadErrors by mutableStateOf<Map<LoadKey, KuraApiError>>(emptyMap())
    var loadedCollections by mutableStateOf<Set<String>>(emptySet())
    var loadedTitles by mutableStateOf<Set<String>>(emptySet())
    var loadingTitles by mutableStateOf<Set<String>>(emptySet())
    var missingTitles by mutableStateOf<Set<String>>(emptySet())
    var reviewCursors by mutableStateOf<Map<String, String>>(emptyMap())
    var reviewsPaging by mutableStateOf<Set<String>>(emptySet())
    var publicCollections by mutableStateOf<Map<String, CollectionDetail>>(emptyMap())
    var missingPublicCollections by mutableStateOf<Set<String>>(emptySet())
    var avatarBusy by mutableStateOf(false)
    var loadedPeople by mutableStateOf<Set<String>>(emptySet())
    var loadingPeople by mutableStateOf<Set<String>>(emptySet())
    var missingPeople by mutableStateOf<Set<String>>(emptySet())
    var peopleLists by mutableStateOf<Map<String, List<Person>>>(emptyMap())
    var peopleListMeta by mutableStateOf<Map<String, PeopleListMeta>>(emptyMap())
    var feedLoaded by mutableStateOf(false)
    var feedLoading by mutableStateOf(false)
    var feedCursor by mutableStateOf<String?>(null)
    var discover by mutableStateOf<DiscoverPayload?>(null)
    var discoverLoading by mutableStateOf(false)
    var discoverCreators by mutableStateOf<DiscoverCreatorsPayload?>(null)
    var discoverCreatorsLoading by mutableStateOf(false)
    var discoverFormats by mutableStateOf<Map<String, DiscoverFormatPayload>>(emptyMap())
    var searchQuery by mutableStateOf("")
    var searchResults by mutableStateOf<List<SearchResult>>(emptyList())
    var searchPeople by mutableStateOf<List<Person>>(emptyList())
    var searchLoading by mutableStateOf(false)
    var searchError by mutableStateOf<KuraApiError?>(null)
    var onboardingGrid by mutableStateOf<List<Title>>(emptyList())
    var onboardingGridError by mutableStateOf<KuraApiError?>(null)
    var onboardingPeople by mutableStateOf<List<Person>>(emptyList())
    var onboardingPeopleLoaded by mutableStateOf(false)
    var recapMonths by mutableStateOf<List<RecapMonth>?>(null)
    var recaps by mutableStateOf<Map<String, RecapPayload>>(emptyMap())
    var recapLoading by mutableStateOf(false)
    var recapEraLoads by mutableStateOf<Set<String>>(emptySet())

    // Social / settings
    var requested by mutableStateOf<Set<String>>(emptySet())
    var muted by mutableStateOf<Set<String>>(emptySet())
    var blocked by mutableStateOf<Set<String>>(emptySet())
    var blockedAccounts by mutableStateOf<List<BlockedAccount>?>(null)
    var reportedReviews by mutableStateOf<Set<String>>(emptySet())
    var notifications by mutableStateOf<List<KNotification>>(emptyList())
    var requestStates by mutableStateOf<Map<String, RequestState>>(emptyMap())
    var recentSearches by mutableStateOf<List<String>>(emptyList())
    var showCommon by mutableStateOf(true)
    var defaultPrivacy by mutableStateOf(Privacy.OnlyMe)
    var alerts by mutableStateOf<Set<String>>(emptySet())
    var recentlyViewed by mutableStateOf<List<String>>(emptyList())
    // `PATCH /me` settings, raw (the store's setters patch the server)
    var profilePrivate by mutableStateOf(false)
    var notifyReleases by mutableStateOf(true)
    var notifyRecap by mutableStateOf(true)
    var notifyFollowers by mutableStateOf(true)
    var followListsVisibility by mutableStateOf(FollowListsVisibility.Private)
    var musicApp by mutableStateOf("Apple Music")

    // Bookkeeping nobody draws
    var feedFollowingKey: Set<String> = emptySet()
    var feedDirty = false
    var pendingPush: Route? = null
    /** Collections created optimistically: local id → the POST that gives the server id. */
    val pendingCollections = HashMap<String, Deferred<String>>()
    /** Local id → server id, forever (an undo captured with the local id still finds it). */
    val collectionAliases = HashMap<String, String>()
    /** Removals waiting for the Deshacer window to close. */
    val deferredWrites = HashMap<String, Job>()
    /** Titles with a write in flight (a read must not clobber the optimistic state). */
    val inflight = HashMap<String, Int>()
    /** The last write queued per key (`WriteKey`): the next one for the same key waits for it. */
    val writeChains = HashMap<String, WriteChain>()
    /** What `LocalPrefs` holds for THIS account; `localDirty` = memory is ahead of it. */
    var local = LocalPrefs.Payload()
    var localDirty = false
    /** `loadLocal()` in flight (DataStore is async): `bootstrap` waits for it before `applyLocal`. */
    var localLoad: Job? = null
    /** `bootstrap` put the server's collections and states in memory. */
    var libraryLoaded = false
    val reviewTitleIndex = HashMap<String, String>()

    // Derived caches (iOS `DerivedCache`)
    val orderedMemo = Memo<List<KCollection>>()
    val indexMemo = Memo<Map<String, Int>>()
    val containingMemo = Memo<Map<String, List<Int>>>()
    val libraryMemo = Memo<Set<String>>()
    val waitingMemo = Memo<List<Title>>()
    val titlesInMemo = HashMap<String, Memo<List<Title>>>()

    /** Fiestas + "llévala a otra app" of this account (`AppStoreParties.kt`, `AppStoreMusicExport.kt`). */
    val party = PartySession()

    fun inflightCount(titleId: String) = inflight[titleId] ?: 0

    /** Writes ISSUED per title (never goes down). A read captures it when it starts: if it moved by the
     *  time the answer lands, the read is older than a write and must not overwrite what it wrote. */
    val writeGen = HashMap<String, Int>()

    fun bumpWriteGen(titleId: String) {
        writeGen[titleId] = (writeGen[titleId] ?: 0) + 1
    }

    /**
     * Writes ISSUED per collection, like [writeGen] for titles: `c|id` = its own fields (name, frase,
     * privacy, cover, order), `m|id` = a title saved in / taken out of it, `pin` = the account's pin.
     * `loadCollection` captures them when its GET goes out: a write issued AND resolved while the GET
     * was out leaves nothing in flight when the answer lands, and that (older) answer would put the
     * value from before the write back on screen.
     */
    val collectionGen = HashMap<String, Int>()

    /** [key] = a `sync` write key, already canonical. Anything that isn't about a collection is ignored. */
    fun bumpCollectionGen(key: String) {
        val slot = when {
            key == AppStore.WriteKey.PIN -> key
            key.startsWith("c|") -> key
            key.startsWith("m|") -> "m|" + key.substringAfterLast('|')
            else -> return
        }
        collectionGen[slot] = (collectionGen[slot] ?: 0) + 1
    }

    /**
     * THE RETRY QUEUE: writes that failed for something trying again can fix (`AppStore.retryToast`),
     * write key → what re-applies the change on screen and sends it again. One per key (the last value
     * asked), in the order they failed, at most `RETRY_QUEUE_LIMIT`. ALL of them go again when the
     * connection comes back or Reintentar is tapped. One leaves without being sent when a later write
     * of its key is issued or lands, when its title / collection goes, by the notice's ✕, and with the
     * session. Another toast covering the notice does NOT take anything out.
     */
    val pendingRetries = LinkedHashMap<String, PendingRetry>()

    /** The notice that stands for several queued writes, with the count it was made for. */
    var queueNotice: Pair<Int, ToastModel>? = null

    /** The key `retryToast` queued last (`sync` reads it right after a caller's `onError`). */
    var lastQueued: String? = null

    /**
     * Retry key → what re-reads the thing, for a write that failed by TIMEOUT: the server may have
     * applied it, so the value the screen went back to may no longer be the server's. Reintentar sends
     * it again (either way they agree); closing the notice WITHOUT retrying runs this, so the screen
     * takes the server's truth instead of keeping a "confirmed" value that is gone.
     */
    val uncertain = HashMap<String, () -> Unit>()

    /** The queued write under [key] is given up without being retried: if its write may have
     *  landed (timeout), read the thing again. */
    fun dropRetry(key: String) {
        pendingRetries.remove(key)
        uncertain.remove(key)?.invoke()
    }

    /**
     * Retires the failed edits of collection [id] still waiting that touch any of [fields] (null =
     * all of them). Their keys are per field written — `c.name|id`, `c.name+vibe|id`, `c.priv|id`,
     * `c.cover|id`, `c.order|id` — so a privacy change never withdraws the Reintentar of a rename.
     */
    fun collectionRetries(id: String, fields: Set<String>?): List<String> {
        val suffix = "|$id"
        return pendingRetries.keys.filter { k ->
            k.startsWith("c.") && k.endsWith(suffix) &&
                (fields == null || k.substring(2, k.length - suffix.length).split('+').any { it in fields })
        }
    }

    /** The failed saves / removals of a title in collection [id] still waiting (`m|title|id`). */
    fun membershipRetries(id: String): List<String> {
        val suffix = "|$id"
        return pendingRetries.keys.filter { it.startsWith("m|") && it.endsWith(suffix) }
    }

    /**
     * What the SERVER last confirmed for something written optimistically, while writes of it are
     * unresolved (slot = the write key, or one per field for a collection). A failed write puts the
     * screen back to THIS — never to the optimistic value the tap before it had set (offline:
     * Me gusta → Me obsesiona must end with no mark, not with "Me gusta").
     */
    private class Confirmed(var value: Any?, var writes: Int)
    private val confirmed = HashMap<String, Confirmed>()

    /** A write of [slot] is being issued; [current] = what the screen showed BEFORE it (the server's
     *  value when nothing else of this slot is unresolved — otherwise the one already kept wins). */
    fun beginWrite(slot: String, current: Any?) {
        confirmed.getOrPut(slot) { Confirmed(current, 0) }.writes += 1
    }

    /** What a failure of [slot] would revert to right now (null = no write of it is unresolved). */
    fun confirmedValue(slot: String): Any? = confirmed[slot]?.value

    /** The server took [value] for [slot]: that is what a later failure reverts to. */
    fun confirmWrite(slot: String, value: Any?) {
        confirmed[slot]?.value = value
    }

    /** One write of [slot] resolved. Returns what the server has and whether a newer write of the
     *  slot is still unresolved (that one decides: this one must not revert). null = never begun. */
    fun endWrite(slot: String): WriteBase? {
        val c = confirmed[slot] ?: return null
        c.writes -= 1
        if (c.writes <= 0) confirmed.remove(slot)
        return WriteBase(c.value, c.writes > 0)
    }

    /** `adopt`: the slots of a collection follow it from its local id to the server's. */
    fun moveWriteSlots(localId: String, serverId: String) {
        val suffix = "|$localId"
        for (k in confirmed.keys.filter { it.endsWith(suffix) }) {
            val c = confirmed.remove(k) ?: continue
            confirmed[k.dropLast(suffix.length) + "|$serverId"] = c
        }
    }

    /** Drops every failed write still waiting about [titleId] (its mark, its review, its memberships):
     *  the title is leaving the library, and resending them would bring it back. */
    fun purgeRetries(titleId: String) {
        pendingRetries.keys.filter { retryIsAbout(it, titleId) }.forEach(pendingRetries::remove)
        // Their "read it again if given up unretried" too (never run: the title is going).
        uncertain.keys.filter { retryIsAbout(it, titleId) }.forEach(uncertain::remove)
    }

    /** A retry key (`WriteKey`) that writes [titleId]'s mark, review or a membership of it. */
    fun retryIsAbout(key: String, titleId: String): Boolean =
        key == "mark|$titleId" || key == "review|$titleId" || key.startsWith("m|$titleId|")

    /** "Quitar de tus colecciones" not confirmed yet: title id → what puts it all back (Deshacer, or a
     *  DELETE that failed). */
    val libraryRemovals = HashMap<String, () -> Unit>()

    /** "Quitar de tus colecciones" waiting for its Deshacer window: title id → the toast that offers it. */
    val libraryRemovalToasts = HashMap<String, Long>()

    /** A `sync` key with its collection id made current (`collectionAliases`). */
    fun canonicalWriteKey(key: String): String {
        val bar = key.lastIndexOf('|')
        if (bar < 0) return key
        val serverId = collectionAliases[key.substring(bar + 1)] ?: return key
        return key.substring(0, bar) + "|" + serverId
    }

    /** Cancels every write and timer of this session (it's being replaced). */
    fun cancelAll() {
        deferredWrites.values.forEach { it.cancel() }
        writeChains.values.forEach { it.job.cancel() }
        pendingCollections.values.forEach { it.cancel() }
        localLoad?.cancel()
        party.exportJob?.cancel()
        deferredWrites.clear()
        writeChains.clear()
        pendingCollections.clear()
    }
}

/** One write waiting in the retry queue: [redo] re-applies it and sends it again; [toast] is its own
 *  notice, shown while it is the only one waiting. */
class PendingRetry(val redo: () -> Unit, val toast: ToastModel)
