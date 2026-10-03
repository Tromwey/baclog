package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.ExternalRef
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.data.models.UserTitleState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.launch

// Marks (Completar · Me gusta · Me obsesiona), reviews and watched episodes — twin of
// `AppStore+Reactions.swift`.

/** A review hangs from a reaction (`obsessed || verdict != null`): Me gusta and Me obsesiona keep it. */
internal fun Mark?.keepsReview(): Boolean = this == Mark.Liked || this == Mark.Obsessed

/**
 * Writing [mark] would DELETE your review of the title: the server drops it, in the same transaction,
 * with any mark that leaves no reaction (Completo, or none), and nothing brings the text back. True
 * also when only the state knows of the review (`reviewId`: the ficha was never opened).
 */
fun AppStore.markDropsReview(titleId: String, mark: Mark?): Boolean =
    !mark.keepsReview() && (myReview(titleId) != null || s.userTitles[titleId]?.reviewId != null)

/** What the phone has of your review of [titleId] (null = none). */
private fun AppStore.ownReview(titleId: String): OwnReview? {
    val id = s.userTitles[titleId]?.reviewId
    val mine = reviewList(titleId).filter { it.authorId == me.id }
    return if (id == null && mine.isEmpty()) null else OwnReview(id, mine)
}

private fun AppStore.confirmedNow(titleId: String): ConfirmedMark =
    s.userTitles[titleId].let { ConfirmedMark(it != null, it?.mark, ownReview(titleId)) }

/** Your review leaves the screen (ficha, perfil): the mark being written takes it with it. */
private fun AppStore.dropOwnReview(titleId: String) {
    val meId = me.id
    removeReviews(titleId) { it.authorId == meId }
    if (s.userTitles[titleId]?.reviewId != null) updateState(titleId) { it.copy(reviewId = null) }
}

/**
 * `PUT …/mark` answered. A mark that leaves no reaction came back with `reviewId: null`: the server
 * deleted your review with it. The phone's copy goes (unless a newer reaction already decides what's
 * on screen), a failed "publicar" of it still waiting is retired (it could only answer
 * `reaction_required`), and the count of your reviews follows. Returns what a later failure reverts to.
 */
private fun AppStore.markLanded(session: SessionData, key: String, titleId: String, mark: Mark?, ack: UserTitleState): ConfirmedMark {
    val before = (session.confirmedValue(key) as? ConfirmedMark)?.review
    val dropped = !mark.keepsReview() && ack.reviewId == null
    val now = ConfirmedMark(mark != null || isSaved(titleId), mark, if (dropped) null else before)
    session.confirmWrite(key, now)
    if (dropped && s === session) {
        settleRetry(session, AppStore.WriteKey.review(titleId))
        if (!s.userTitles[titleId]?.mark.keepsReview()) dropOwnReview(titleId)
        if (before != null) account?.let { a ->
            if (a.stats.reviews > 0) account = a.copy(stats = a.stats.copy(reviews = a.stats.reviews - 1))
        }
    }
    return now
}

/**
 * Your reaction, optimistic. `preview` = "La vi en preestreno" (the server refuses a mark on an
 * unreleased title without it: `409 not_released`).
 *
 * A mark that would delete your review ([markDropsReview]) is NOT sent until the person says so:
 * this opens "tu reseña se borra con la reacción." and returns false; its "Quitar y borrar reseña"
 * calls back with [confirmed]. True = the mark is on its way (or an `ext:` result went to "guardar en").
 */
fun AppStore.setMark(titleId: String, mark: Mark?, haptic: Boolean = true, preview: Boolean = false, confirmed: Boolean = false): Boolean {
    // An `ext:` search result isn't in the catalog until it's saved: nothing to mark yet.
    if (ExternalRef.parse(titleId) != null) {
        askToSaveFirst(titleId)
        return true
    }
    if (!confirmed && markDropsReview(titleId, mark)) {
        present(SheetRoute.DropReview(titleId, mark, preview))
        return false
    }
    val session = s
    val key = AppStore.WriteKey.mark(titleId)
    session.beginWrite(key, confirmedNow(titleId))
    ensureUserState(titleId)
    updateState(titleId) { it.copy(mark = mark) }
    if (!mark.keepsReview()) dropOwnReview(titleId)
    if (haptic) haptic(StoreHaptic.Reaction(mark))
    sync(key = key, titleId = titleId, onError = err@{ e ->
        // On ANY failure the optimistic state goes (the server never changed): the title goes back to
        // the mark the SERVER last confirmed — not to the optimistic one of the tap before. Only while
        // the phone still shows THIS mark and no newer one is queued (that one decides).
        val base = session.endWrite(key)
        val newer = base?.newer == true || session.writeChains[session.canonicalWriteKey(key)] != null
        val settled = revertMark(titleId, mark, base?.value as? ConfirmedMark, newer)
        // Back to what the server has, and that IS what was asked (Me gusta → sin marca, both lost):
        // nothing to say, nothing to retry.
        if (settled) return@err true
        // A newer mark is queued: it decides. Offering THIS one again would let Reintentar (or the
        // network coming back) send the old value after the newer one.
        if (newer) return@err true
        when {
            e is KuraApiError.Conflict && e.code == "not_released" -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            // A mark on an unsaved title CREATES your state, so a 404 means the title itself is gone.
            e == KuraApiError.NotFound -> showToast(ToastModel(AppStore.UNKNOWN_TITLE_NOTE, ToastModel.Kind.Info))
            e == KuraApiError.Unauthorized -> Unit
            e == KuraApiError.Unsupported -> showToast(ToastModel(e.toast("No se pudo guardar tu reacción"), ToastModel.Kind.Info))
            e is KuraApiError.Invalid -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            // Offline, 5xx, 429: Reintentar (and the network coming back) puts the mark back and sends it.
            // (Already confirmed when it deletes the review: the same action, asked once.)
            else -> retryToast(e.toast("No se pudo guardar tu reacción"), key) {
                dismissToast()
                setMark(titleId, mark, haptic = false, preview = preview, confirmed = true)
            }
        }
        true
    }) { api ->
        val ack = api.setMark(titleId, mark, preview)
        markLanded(session, key, titleId, mark, ack)
        session.endWrite(key)
        if (s !== session || s.userTitles[titleId]?.mark != mark) return@sync
        updateState(titleId) { it.copy(reviewId = if (mark.keepsReview()) ack.reviewId ?: it.reviewId else ack.reviewId, savedAt = ack.savedAt) }
        // The ficha's "obsesionados / completos" are server aggregates: re-read them.
        if (titleId in s.loadedTitles) scope.launch { loadTitle(titleId, force = true) }
        // Marked from a ficha you hadn't saved: "Guardar en…" is only a suggestion.
        if (mark != null) suggestSaving(titleId)
    }
    return true
}

/**
 * A mark write failed: the title shows what the server last confirmed ([base]) again — unless a newer
 * write decides ([newer]) or the phone no longer shows [mark]. True = the server already has exactly
 * what this write asked for (so there's nothing to retry).
 *
 * The review this write took off the screen comes back with it: the server only deletes a review with
 * a mark that LANDS, so the one it last confirmed ([ConfirmedMark.review]) is still there. Also when a
 * newer reaction that keeps reviews is what the screen shows (Completo failed, Me obsesiona queued).
 */
private fun AppStore.revertMark(titleId: String, mark: Mark?, base: ConfirmedMark?, newer: Boolean): Boolean {
    val shown = s.userTitles[titleId]?.mark
    val reverts = !newer && shown == mark
    if (reverts) when {
        base == null -> if (!isSaved(titleId)) setState(titleId, null) else updateState(titleId) { it.copy(mark = null) }
        base.had -> updateState(titleId) { it.copy(mark = base.mark) }
        !isSaved(titleId) -> setState(titleId, null)
        else -> updateState(titleId) { it.copy(mark = null) }
    }
    val kept = base?.review
    if (kept != null && (reverts || (newer && shown.keepsReview()))) restoreOwnReview(titleId, kept)
    if (!reverts) return false
    return base != null && base.mark == mark && (base.had || mark == null)
}

/** Puts [kept] back on screen — unless a review of yours is already there (written meanwhile). */
private fun AppStore.restoreOwnReview(titleId: String, kept: OwnReview) {
    if (s.userTitles[titleId] == null || myReview(titleId) != null) return
    if (kept.reviews.isNotEmpty()) setReviews(titleId, kept.reviews + reviewList(titleId))
    if (kept.reviewId != null) updateState(titleId) { it.copy(reviewId = kept.reviewId) }
}

/** After a mark on a title in no collection: open "Guardar en…" as a suggestion (never over another sheet). */
fun AppStore.suggestSaving(titleId: String) {
    if (mark(titleId) == null || isSaved(titleId) || sheet != null) return
    present(SheetRoute.SaveTo(titleId))
}

/** An `ext:` result has no catalog id to mark yet: save it first (the membership PUT materializes it). */
private fun AppStore.askToSaveFirst(titleId: String) {
    showToast(ToastModel("Primero guarda este título en una colección", ToastModel.Kind.Info))
    // After the caller's own dismiss (the complete sheet closes right after calling setMark).
    scope.launch { present(SheetRoute.SaveTo(titleId)) }
}

/**
 * Completar + reseña in one go: the server refuses a review before a reaction (`409
 * reaction_required`), so the mark is AWAITED here and the caller sends the review only on `null`.
 * Optimistic like `setMark`; on failure the mark is reverted and the error returned (the sheet keeps
 * the text). An `ext:` result opens "guardar en" and returns `NotFound`.
 */
suspend fun AppStore.setMarkConfirmed(titleId: String, mark: Mark?, preview: Boolean, confirmed: Boolean = false): KuraApiError? {
    if (ExternalRef.parse(titleId) != null) {
        askToSaveFirst(titleId)
        return KuraApiError.NotFound
    }
    // Same door as `setMark`: a mark that deletes your review waits for "Quitar y borrar reseña".
    // Nothing was sent, so this is never "success" (the caller would publish a review).
    if (!confirmed && markDropsReview(titleId, mark)) {
        present(SheetRoute.DropReview(titleId, mark, preview))
        return STALE
    }
    val session = s
    val key = AppStore.WriteKey.mark(titleId)
    session.beginWrite(key, confirmedNow(titleId))
    ensureUserState(titleId)
    updateState(titleId) { it.copy(mark = mark) }
    if (!mark.keepsReview()) dropOwnReview(titleId)
    val removal = commitLibraryRemoval(titleId)
    // Like `sync`: this mark is the newest word, so an older failed one (or a failed "Quitar de tus
    // colecciones") waiting for the network is retired — it would be resent over this.
    settleRetry(session, key)
    settleRetry(session, AppStore.WriteKey.library(titleId))
    session.inflight[titleId] = session.inflightCount(titleId) + 1
    session.bumpWriteGen(titleId)
    // In line behind any `setMark` still queued for this title, and ahead of whatever comes after it.
    val previous = session.writeChains[key]?.job
    val call = scope.async(start = CoroutineStart.LAZY) {
        previous?.join()
        removal?.join()
        api.setMark(titleId, mark, preview)
    }
    val token = Any()
    session.writeChains[key] = WriteChain(token, call)
    call.start()
    // A timeout is not "it didn't happen" (`sync` / `noteUncertain`): there is no Reintentar here to
    // remember it, so the title is read again as soon as this write is out of the way.
    var reread = false
    try {
        val ack: UserTitleState = call.await()
        markLanded(session, key, titleId, mark, ack)
        session.endWrite(key)
        if (s !== session) return STALE
        online()
        // Only when nothing newer about this mark is queued (that one decides) — same as `sync`.
        if (session.writeChains[key]?.token === token) settleRetry(session, key)
        if (s.userTitles[titleId]?.mark == mark) {
            updateState(titleId) { it.copy(reviewId = if (mark.keepsReview()) ack.reviewId ?: it.reviewId else ack.reviewId, savedAt = ack.savedAt) }
            if (titleId in s.loadedTitles) scope.launch { loadTitle(titleId, force = true) }
        }
        return null
    } catch (err: Exception) {
        // A session that changed meanwhile: whoever asked is gone; never "success" (the caller would review).
        val base = session.endWrite(key)
        if (s !== session) return STALE
        // The same guard as `setMark`: back to what the server confirmed, unless a newer mark is queued.
        val newer = base?.newer == true || session.writeChains[key]?.token !== token
        revertMark(titleId, mark, base?.value as? ConfirmedMark, newer)
        if (err is CancellationException) throw err
        val e = noteError(err)
        reread = e == KuraApiError.Offline && api.lastOfflineTimedOut && s === session
        return e
    } finally {
        val n = session.inflightCount(titleId) - 1
        if (n <= 0) session.inflight.remove(titleId) else session.inflight[titleId] = n
        if (session.writeChains[key]?.token === token) session.writeChains.remove(key)
        if (reread) scope.launch { if (s === session) loadTitle(titleId, force = true) }
    }
}

/** iOS `.cancelled` for `setMarkConfirmed`: the session changed while the mark was in flight. */
private val STALE = KuraApiError.Server("cancelado")

fun AppStore.publishReview(titleId: String, text: String, spoiler: Boolean) {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return
    // A NEW review needs a reaction (`409 reaction_required`): with "Completo" or no mark nothing is
    // sent and nothing is painted — the text stays a draft. (Editing one you already have goes on: a
    // "no me gustó" set on the web reads as Completo here and does carry a review.)
    if (!mark(titleId).keepsReview() && myReview(titleId) == null && s.userTitles[titleId]?.reviewId == null) {
        showToast(ToastModel(com.tromwey.kura.data.api.REACTION_REQUIRED_TEXT, ToastModel.Kind.Info))
        return
    }
    clearReviewDraft(titleId)
    ensureUserState(titleId)
    val mark = mark(titleId)
    val list = reviewList(titleId).toMutableList()
    val previous = list.firstOrNull { it.authorId == me.id }
    val previousReviewId = s.userTitles[titleId]?.reviewId
    val localId: String
    val i = list.indexOfFirst { it.authorId == me.id }
    if (i >= 0) {
        list[i] = list[i].copy(text = trimmed, spoiler = spoiler, mark = mark)
        localId = list[i].id
    } else {
        val r = Review(id = AppStore.localId("r", 6), authorId = me.id, titleId = titleId, text = trimmed, mark = mark,
            spoiler = spoiler, date = now)
        list.add(0, r)
        updateState(titleId) { it.copy(reviewId = r.id) }
        localId = r.id
    }
    setReviews(titleId, list)
    val session = s
    val key = AppStore.WriteKey.review(titleId)
    sync(key = key, titleId = titleId, onError = err@{ e ->
        // The server kept what it had: put back what was before (only while the phone still shows THIS
        // text and nothing newer about the review is queued). No reaction on the server says the real
        // rule — never a "Reintentar" that can only fail again; offline / 5xx offer it.
        val newer = session.writeChains[session.canonicalWriteKey(key)] != null
        val cur = reviewList(titleId).toMutableList()
        val j = cur.indexOfFirst { it.id == localId }
        if (!newer && j >= 0 && cur[j].text == trimmed) {
            if (previous != null) cur[j] = previous else cur.removeAt(j)
            setReviews(titleId, cur)
            updateState(titleId) { it.copy(reviewId = previousReviewId) }
        }
        if (newer) return@err true // the newer write of this review decides; never the old text again
        when {
            e is KuraApiError.Conflict && e.code == "reaction_required" -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            e == KuraApiError.Unauthorized -> Unit
            // Put back above; the title is gone on the server (404) or reviews aren't there (501).
            e == KuraApiError.NotFound -> showToast(ToastModel(AppStore.UNKNOWN_TITLE_NOTE, ToastModel.Kind.Info))
            e == KuraApiError.Unsupported -> showToast(ToastModel("No se pudo guardar tu reseña", ToastModel.Kind.Info))
            e is KuraApiError.Invalid -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            else -> retryToast(e.toast("No se pudo guardar tu reseña"), key) {
                dismissToast()
                publishReview(titleId, trimmed, spoiler)
            }
        }
        true
    }) { api ->
        val saved = api.saveReview(titleId, trimmed, spoiler)
        if (s !== session) return@sync
        val cur = reviewList(titleId).toMutableList()
        val j = cur.indexOfFirst { it.id == localId }
        if (j < 0) return@sync
        cur[j] = Review(id = saved.id, authorId = me.id, titleId = titleId, text = cur[j].text,
            mark = saved.mark ?: cur[j].mark, spoiler = cur[j].spoiler, date = saved.date)
        setReviews(titleId, cur)
        updateState(titleId) { it.copy(reviewId = saved.id) }
        revealedSpoilers = revealedSpoilers - localId
    }
}

fun AppStore.deleteReview(titleId: String) {
    val meId = me.id
    val mine = reviewList(titleId).filter { it.authorId == meId }
    if (mine.isEmpty()) return
    clearReviewDraft(titleId)
    val reviewId = s.userTitles[titleId]?.reviewId
    removeReviews(titleId) { it.authorId == meId }
    updateState(titleId) { it.copy(reviewId = null) }
    val session = s
    val key = AppStore.WriteKey.review(titleId)
    sync(key = key, titleId = titleId, onError = err@{ e ->
        if (e == KuraApiError.NotFound) return@err true // already gone on the server: the phone agrees
        // The review is still on the server: it comes back on screen (unless something newer about it
        // is queued, or it's already back), and Reintentar deletes it again.
        val newer = session.writeChains[session.canonicalWriteKey(key)] != null
        if (!newer && reviewList(titleId).none { it.authorId == meId }) {
            setReviews(titleId, reviewList(titleId) + mine)
            if (reviewId != null) updateState(titleId) { it.copy(reviewId = reviewId) }
        }
        if (newer) return@err true // a newer write of this review decides
        when (e) {
            KuraApiError.Unauthorized -> Unit
            KuraApiError.Unsupported -> showToast(ToastModel("No se borró tu reseña", ToastModel.Kind.Info))
            else -> retryToast(e.toast("No se borró tu reseña"), key) {
                dismissToast()
                deleteReview(titleId)
            }
        }
        true
    }) { api -> api.deleteReview(titleId) }
    undoToast("Reseña borrada") {
        setReviews(titleId, reviewList(titleId) + mine.filter { review(it.id) == null })
        mine.firstOrNull()?.let { r -> publishReview(titleId, r.text, r.spoiler) }
    }
}

/** Episodes are local (§4: `PUT …/episodes` → 501). */
fun AppStore.toggleEpisode(titleId: String, key: String) {
    ensureUserState(titleId)
    val set = s.userTitles[titleId]?.watchedEpisodes ?: emptySet()
    updateState(titleId) { it.copy(watchedEpisodes = if (key in set) set - key else set + key) }
    haptic(StoreHaptic.Selection)
    saveLocal()
}
