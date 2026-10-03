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

// Toasts (Deshacer / Reintentar), the optimistic-write queue (`sync`) and `PATCH /me` settings —
// moved out of AppStore.kt as extensions (2026-10-01). `AppStore.WriteKey` stays in the class.

/**
 * A toast over the dock. Equality is identity (`id`), like iOS. A [Kind.Retry] toast never times out:
 * it stays until Reintentar, its ✕, a newer toast, or the same write (`retryKey`) going through.
 */
class ToastModel(val text: String, val kind: Kind, val retryKey: String? = null, val action: (() -> Unit)? = null) {
    enum class Kind { Undo, Retry, Info }

    val id: Long = ids.incrementAndGet()

    override fun equals(other: Any?) = other is ToastModel && other.id == id
    override fun hashCode() = id.hashCode()
    override fun toString() = "ToastModel($kind, \"$text\")"

    private companion object {
        val ids = AtomicLong()
    }
}


// MARK: Toasts

/** How long a toast (and the Deshacer behind it) stays: 5 s, or 15 s with TalkBack. `deferRemove`
 *  waits exactly this long, so an undo still on screen can always be honored (learning
 *  2026-09-24-ios-deshacer-y-aviso-comparten-ventana). */
val AppStore.undoWindow: Duration get() = if (platform.screenReaderOn) 15.seconds else 5.seconds

/** The beat between "the network is back" and resending the writes that failed without it. */
internal val AppStore.retryAfterReconnect: Duration get() = 1.seconds

fun AppStore.showToast(t: ToastModel) {
    if (revertOnly) return
    toastJob?.cancel()
    toastJob = null
    // A Reintentar another toast covers stays in the queue (`SessionData.pendingRetries`): it is offered
    // again when that toast leaves, and resent with the rest when the network is back.
    if (t.kind == ToastModel.Kind.Retry) haptic(StoreHaptic.Error)
    toast = t
    val verb = if (t.kind == ToastModel.Kind.Retry) "Reintentar" else "Deshacer"
    announce(if (t.action == null) t.text else "${t.text}. $verb disponible")
    // A failed write's Reintentar never closes by itself: the phone and the server disagree until
    // it's retried (or its ✕ gives the change up).
    if (t.kind == ToastModel.Kind.Retry) return
    val window = undoWindow
    toastJob = scope.launch {
        delay(window)
        if (toast?.id == t.id) {
            toast = null
            offerPendingRetries()
        }
    }
}

/** How many failed writes wait for the network at most; past it the oldest is given up. */
internal const val RETRY_QUEUE_LIMIT = 50

/** `retryKey` of the notice that stands for SEVERAL queued writes. */
internal const val RETRY_QUEUE_KEY = "queue"

/** The one notice for several queued writes (the canonical "No se pudo guardar", with its object). */
internal fun retryQueueText(n: Int) = "No se pudieron guardar $n cambios"

/**
 * A failure that trying again can fix: no network, a timeout, a 5xx / 503, a rate limit. Only these
 * queue a write (`retryToast`). A definitive answer (400, 403, 409) says why once and queues nothing —
 * every reconnection would repeat the write for the same refusal.
 */
internal val KuraApiError.canRetry: Boolean
    get() = this == KuraApiError.Offline || this == KuraApiError.Unavailable || this is KuraApiError.Server ||
        this is KuraApiError.ServiceUnavailable || this is KuraApiError.RateLimited

/** The collection a retry key is about (`c|id`, `c.name|id`, `m|title|id`), null for any other write. */
private fun retryCollectionId(key: String): String? =
    key.takeIf { it.startsWith("c|") || it.startsWith("c.") || it.startsWith("m|") }?.substringAfterLast('|')

/** Queued writes about a collection that is no longer there (deleted here, or gone on the server) have
 *  nothing left to write — nor to read again. */
private fun AppStore.pruneRetries(session: SessionData) {
    for (key in session.pendingRetries.keys.toList()) {
        val cid = retryCollectionId(key) ?: continue
        if (collection(cid) == null) {
            session.pendingRetries.remove(key)
            session.uncertain.remove(key)
        }
    }
}

/** The ONE notice of the queue: the write's own text while it is alone, the count when several wait.
 *  Its Reintentar always resends everything queued. null = nothing waits. */
private fun AppStore.retryNotice(session: SessionData): ToastModel? {
    val n = session.pendingRetries.size
    if (n == 0) return null
    if (n == 1) return session.pendingRetries.values.first().toast
    session.queueNotice?.let { if (it.first == n) return it.second }
    val t = ToastModel(retryQueueText(n), ToastModel.Kind.Retry, retryKey = RETRY_QUEUE_KEY) { resendQueue(session) }
    session.queueNotice = n to t
    return t
}

/**
 * Keeps the Reintentar on screen in step with the queue: shown whenever writes wait and no other toast
 * (a Deshacer, an Info) is up — so it comes back when that one leaves — and gone when the queue empties.
 * The queue lives in the session: one left in an account that was left never shows in the next.
 */
internal fun AppStore.offerPendingRetries() {
    val session = s
    pruneRetries(session)
    val cur = toast
    if (cur != null && cur.kind != ToastModel.Kind.Retry) return
    val want = retryNotice(session)
    if (want?.id != cur?.id) toast = want
}

/**
 * A write failed for something trying again can fix, and was ALREADY reverted on screen: it waits in the
 * queue under [key] (the write's `WriteKey`; one per key — the last value asked) and the notice offers
 * Reintentar. [redo] re-applies the change and sends it again: run by Reintentar and when the network
 * comes back, with everything else queued, in the order it failed. It leaves the queue when a later
 * write of its key is issued or lands, when its title / collection goes, with the session, or by the ✕.
 *
 * A definitive failure (`KuraApiError.canRetry` false — `sync` says which error this is) only says [text].
 */
fun AppStore.retryToast(text: String, key: String?, redo: () -> Unit) {
    if (revertOnly) return
    if (failing?.canRetry == false) {
        showToast(ToastModel(text, ToastModel.Kind.Info))
        return
    }
    val session = s
    val k = key?.let(session::canonicalWriteKey) ?: "toast|${System.nanoTime()}"
    // Re-queued at the END: the order of the queue is the order things failed in.
    session.pendingRetries.remove(k)
    session.uncertain.remove(k) // `sync` marks it again when THIS failure was a timeout
    session.pendingRetries[k] = PendingRetry(redo, ToastModel(text, ToastModel.Kind.Retry, retryKey = k) { resendQueue(session) })
    session.lastQueued = k
    while (session.pendingRetries.size > RETRY_QUEUE_LIMIT) session.dropRetry(session.pendingRetries.keys.first())
    retryNotice(session)?.let(::showToast)
}

/**
 * Sends everything queued again, in order — Reintentar, or the network coming back. Each one leaves the
 * queue as it goes (a resend that still fails queues itself again); one that an EARLIER resend just
 * retired (a "borrar colección" takes the edits of that collection with it) is skipped.
 */
private fun AppStore.resendQueue(session: SessionData) {
    if (s !== session) return
    pruneRetries(session)
    for (key in session.pendingRetries.keys.toList()) {
        if (s !== session) return
        val p = session.pendingRetries.remove(key) ?: continue
        session.uncertain.remove(key)
        p.redo()
    }
    if (s === session) offerPendingRetries()
}

/** The network is back: every write waiting in the queue goes again (once), after a beat for DNS/TLS
 *  to settle — a resend that still fails just queues itself again. */
internal fun AppStore.resendPendingRetries() {
    val session = s
    if (session.pendingRetries.isEmpty()) return
    scope.launch {
        delay(retryAfterReconnect)
        if (s !== session || !pathSatisfied) return@launch
        resendQueue(session)
    }
}

/** A write under [key] went through — or a newer one of the same thing was just issued: the old one
 *  waiting in the queue (if any) has nothing left to do, and must not be resent over the newer value. */
internal fun AppStore.settleRetry(session: SessionData, key: String?) {
    key ?: return
    val had = session.pendingRetries.remove(key) != null
    session.uncertain.remove(key)
    if (had && s === session) offerPendingRetries()
}

fun AppStore.undoToast(text: String, undo: () -> Unit) {
    showToast(ToastModel(text, ToastModel.Kind.Undo) {
        undo()
        toast = null
    })
}

fun AppStore.dismissToast() {
    toast = null
    offerPendingRetries()
}

/** The toast's ✕ (only a Reintentar has one): everything it offers is given up — the changes stay
 *  reverted and nothing is resent when the network comes back. */
fun AppStore.closeToast(t: ToastModel) {
    if (toast?.id != t.id) return
    toast = null
    if (t.kind == ToastModel.Kind.Retry) {
        // Not retried: what may have landed anyway (it timed out) is read again.
        for (key in s.pendingRetries.keys.toList()) s.dropRetry(key)
    }
    offerPendingRetries()
}

/** The toast's button (Deshacer / Reintentar): runs its action and closes it — only while THAT toast
 *  is the one up. A stale pill (another toast replaced it, its window closed) does nothing: its
 *  Deshacer can no longer be honored. */
fun AppStore.tapToastAction(t: ToastModel) {
    if (toast?.id != t.id) return
    t.action?.invoke()
    if (toast?.id == t.id) toast = null
    offerPendingRetries()
}

/**
 * Runs an API write; on failure offers "Reintentar" (with the error's own text when it says what to
 * do). `onError` returns true when it handled the failure (reverted, said why).
 *
 * `key` serializes writes to the same thing (`WriteKey`): a write with a key waits for the previous
 * one with that key (success or failure) before it goes out. Everything is bound to the session that
 * queued it: once the account changes its late failures and "Reintentar" never surface.
 *
 * A write about a title (`titleId`) also bumps its write generation (reads that started before it
 * don't overwrite it) and, when a "Quitar de tus colecciones" is still inside its Deshacer window,
 * sends that removal NOW and goes out after it (`commitsLibraryRemoval = false` only for removals).
 *
 * `retryKey` = the key its Reintentar lives under, when that is narrower than what serializes it
 * (`key`): every `PATCH /collections/{id}` waits in ONE line (`c|id`), but a privacy change must not
 * retire the Reintentar of a failed rename — each field has its own (`c.name|id`…).
 */
fun AppStore.sync(
    key: String? = null,
    titleId: String? = null,
    onError: ((KuraApiError) -> Boolean)? = null,
    commitsLibraryRemoval: Boolean = true,
    retryKey: String? = key,
    op: suspend (KuraApi) -> Unit,
): Job {
    val session = s
    val k = key?.let(session::canonicalWriteKey)
    val rk = retryKey?.let(session::canonicalWriteKey)
    val removal = if (titleId != null && commitsLibraryRemoval) commitLibraryRemoval(titleId) else null
    // This write is the newest word about its key: an older failed one waiting for the network (or for
    // its Reintentar) would be resent AFTER it and win. Same for a failed "Quitar de tus colecciones"
    // of a title that is being written about again.
    if (rk != null) settleRetry(session, rk)
    if (titleId != null && commitsLibraryRemoval) settleRetry(session, AppStore.WriteKey.library(titleId))
    if (titleId != null) {
        session.inflight[titleId] = session.inflightCount(titleId) + 1
        session.bumpWriteGen(titleId)
    }
    // Same for the collection (or the pin) this writes: a read that started before it is older.
    if (k != null) session.bumpCollectionGen(k)
    val previous = k?.let { session.writeChains[it]?.job }
    val token = Any()
    val job = scope.launch(start = CoroutineStart.LAZY) {
        var failure: Exception? = null
        try {
            previous?.join()
            removal?.join()
            op(api)
        } catch (e: Exception) {
            failure = e
        } finally {
            if (titleId != null) {
                val n = session.inflightCount(titleId) - 1
                if (n <= 0) session.inflight.remove(titleId) else session.inflight[titleId] = n
            }
            // Re-canonicalized: an `adopt` while this ran moved the chain to the server id.
            if (k != null) {
                val now = session.canonicalWriteKey(k)
                if (session.writeChains[now]?.token === token) session.writeChains.remove(now)
            }
        }
        if (s !== session) return@launch
        val f = failure
        if (f == null) {
            online()
            // Only when nothing newer with this key is queued (that one decides).
            if (k != null && rk != null && session.writeChains[session.canonicalWriteKey(k)] == null) settleRetry(session, session.canonicalWriteKey(rk))
            return@launch
        }
        val e = noteError(f) ?: return@launch
        // A 401 just replaced the session (`noteError` → `sessionExpired`): whatever `onError` reverts
        // or re-applies would land on the NEW, empty one (an unfollow's revert put the person back in
        // its `following`, and the next `bootstrap` kept them by union).
        if (s !== session) return@launch
        if (e is KuraApiError.Forbidden && e.needsOnboarding) {
            // The caller only puts the screen back (no Reintentar, nothing queued for the reconnection:
            // it could only fail again); the one handler says why and re-routes by `GET /me`.
            revertOnly = true
            try { onError?.invoke(e) } finally { revertOnly = false }
            if (rk != null) settleRetry(session, session.canonicalWriteKey(rk))
            onboardingRequired(e)
            return@launch
        }
        // A timeout is not "it didn't happen": the server may have taken the write. The Reintentar this
        // failure puts up (if any) remembers how to read the thing again, for when it's closed unretried.
        // `failing` tells `retryToast` which error this is: only one that trying again can fix queues.
        session.lastQueued = null
        failing = e
        val handled = try { onError?.invoke(e) == true } finally { failing = null }
        if (s !== session) return@launch
        if (handled) {
            if (e == KuraApiError.Offline && api.lastOfflineTimedOut) noteUncertain(session, session.lastQueued, k, titleId)
            return@launch
        }
        when (e) {
            KuraApiError.Unauthorized -> Unit
            // A write without its own revert (no caller today: every one passes `onError`). Retrying a
            // 404 / 501 can only fail again, so the phone says it's out of step instead of going
            // quiet; the next read of that screen brings the server's truth.
            KuraApiError.NotFound, KuraApiError.Unsupported -> showToast(ToastModel(AppStore.NOT_SAVED_NOTE, ToastModel.Kind.Info))
            // The screen still shows it, so Reintentar (and the network coming back) sends exactly
            // the same op again.
            else -> {
                failing = e
                try { retryToast(e.toast, rk) { sync(k, titleId, onError, commitsLibraryRemoval, rk, op) } } finally { failing = null }
                if (e == KuraApiError.Offline && api.lastOfflineTimedOut) noteUncertain(session, session.lastQueued, k, titleId)
            }
        }
    }
    if (k != null) session.writeChains[k] = WriteChain(token, job)
    job.start()
    return job
}

/** The write a timed-out failure just queued ([key]) learns what to read again if it's given up
 *  without retrying: the title, and the collection its key names. */
private fun AppStore.noteUncertain(session: SessionData, key: String?, k: String?, titleId: String?) {
    if (key == null || !session.pendingRetries.containsKey(key)) return
    val collectionId = k?.takeIf { it.startsWith("c|") || it.startsWith("m|") }?.substringAfterLast('|')
    if (titleId == null && collectionId == null) return
    session.uncertain[key] = {
        scope.launch {
            if (s !== session) return@launch
            if (titleId != null) loadTitle(titleId, force = true)
            // Not a collection that was deleted meanwhile: the GET could beat the DELETE and bring it back.
            if (collectionId != null && s === session && collection(collectionId) != null) loadCollection(collectionId, force = true)
        }
    }
}

/**
 * `PATCH /me` for a setting already applied locally. On failure `revert` runs only when
 * `stillMine()` (this write's value is still the one showing: a newer choice isn't undone by an
 * older failure), and a toast says what didn't change. Serialized with every `PATCH /me`.
 */
internal fun AppStore.patchSetting(patch: MePatch, failText: String, stillMine: () -> Boolean, revert: () -> Unit) {
    val session = s
    sync(key = AppStore.WriteKey.ME_PATCH, onError = err@{ e ->
        if (s !== session) return@err true
        if (stillMine()) revert()
        if (e is KuraApiError.Unauthorized) return@err true
        showToast(ToastModel(e.toast(failText), ToastModel.Kind.Info))
        true
    }) { api ->
        val m = api.updateMe(patch)
        on(session) { account = m }
    }
}
