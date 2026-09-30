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

/** Your reaction, optimistic. `preview` = "La vi en preestreno" (the server refuses a mark on an
 *  unreleased title without it: `409 not_released`). */
fun AppStore.setMark(titleId: String, mark: Mark?, haptic: Boolean = true, preview: Boolean = false) {
    // An `ext:` search result isn't in the catalog until it's saved: nothing to mark yet.
    if (ExternalRef.parse(titleId) != null) {
        askToSaveFirst(titleId)
        return
    }
    val previous = s.userTitles[titleId]?.mark
    val hadState = s.userTitles[titleId] != null
    ensureUserState(titleId)
    updateState(titleId) { it.copy(mark = mark) }
    if (haptic) haptic(StoreHaptic.Reaction(mark))
    val session = s
    sync(key = AppStore.WriteKey.mark(titleId), titleId = titleId, onError = err@{ e ->
        // Neither is retryable. The optimistic state goes: an unsaved title leaves the library it had
        // just entered; a saved one gets its previous mark back.
        val revert = {
            if (hadState) updateState(titleId) { it.copy(mark = previous) } else if (!isSaved(titleId)) setState(titleId, null)
        }
        if (e is KuraApiError.Conflict && e.code == "not_released") {
            revert()
            showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            return@err true
        }
        // A mark on an unsaved title CREATES your state, so a 404 means the title itself is gone.
        if (e == KuraApiError.NotFound) {
            revert()
            showToast(ToastModel(AppStore.UNKNOWN_TITLE_NOTE, ToastModel.Kind.Info))
            return@err true
        }
        false
    }) { api ->
        val ack = api.setMark(titleId, mark, preview)
        if (s !== session || s.userTitles[titleId]?.mark != mark) return@sync
        updateState(titleId) { it.copy(reviewId = ack.reviewId ?: it.reviewId, savedAt = ack.savedAt) }
        // The ficha's "obsesionados / completos" are server aggregates: re-read them.
        if (titleId in s.loadedTitles) scope.launch { loadTitle(titleId, force = true) }
        // Marked from a ficha you hadn't saved: "Guardar en…" is only a suggestion.
        if (mark != null) suggestSaving(titleId)
    }
}

/** After a mark on a title in no collection: open "Guardar en…" as a suggestion (never over another sheet). */
fun AppStore.suggestSaving(titleId: String) {
    if (mark(titleId) == null || isSaved(titleId) || sheet != null) return
    present(SheetRoute.SaveTo(titleId))
}

/** An `ext:` result has no catalog id to mark yet: save it first (the membership PUT materializes it). */
private fun AppStore.askToSaveFirst(titleId: String) {
    showToast(ToastModel("Primero guarda este título en una colección.", ToastModel.Kind.Info))
    // After the caller's own dismiss (the complete sheet closes right after calling setMark).
    scope.launch { present(SheetRoute.SaveTo(titleId)) }
}

/**
 * Completar + reseña in one go: the server refuses a review before a reaction (`409
 * reaction_required`), so the mark is AWAITED here and the caller sends the review only on `null`.
 * Optimistic like `setMark`; on failure the mark is reverted and the error returned (the sheet keeps
 * the text). An `ext:` result opens "guardar en" and returns `NotFound`.
 */
suspend fun AppStore.setMarkConfirmed(titleId: String, mark: Mark?, preview: Boolean): KuraApiError? {
    if (ExternalRef.parse(titleId) != null) {
        askToSaveFirst(titleId)
        return KuraApiError.NotFound
    }
    val hadState = s.userTitles[titleId]
    ensureUserState(titleId)
    updateState(titleId) { it.copy(mark = mark) }
    val session = s
    session.inflight[titleId] = session.inflightCount(titleId) + 1
    // In line behind any `setMark` still queued for this title, and ahead of whatever comes after it.
    val key = AppStore.WriteKey.mark(titleId)
    val previous = session.writeChains[key]?.job
    val call = scope.async(start = CoroutineStart.LAZY) {
        previous?.join()
        api.setMark(titleId, mark, preview)
    }
    val token = Any()
    session.writeChains[key] = WriteChain(token, call)
    call.start()
    try {
        val ack: UserTitleState = call.await()
        if (s !== session) return STALE
        online()
        if (s.userTitles[titleId]?.mark == mark) {
            updateState(titleId) { it.copy(reviewId = ack.reviewId ?: it.reviewId, savedAt = ack.savedAt) }
            if (titleId in s.loadedTitles) scope.launch { loadTitle(titleId, force = true) }
        }
        return null
    } catch (err: Exception) {
        // A session that changed meanwhile: whoever asked is gone; never "success" (the caller would review).
        if (s !== session) return STALE
        if (hadState != null) updateState(titleId) { it.copy(mark = hadState.mark) } else if (!isSaved(titleId)) setState(titleId, null)
        if (err is CancellationException) throw err
        return noteError(err)
    } finally {
        val n = session.inflightCount(titleId) - 1
        if (n <= 0) session.inflight.remove(titleId) else session.inflight[titleId] = n
        if (session.writeChains[key]?.token === token) session.writeChains.remove(key)
    }
}

/** iOS `.cancelled` for `setMarkConfirmed`: the session changed while the mark was in flight. */
private val STALE = KuraApiError.Server("cancelado")

fun AppStore.publishReview(titleId: String, text: String, spoiler: Boolean) {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return
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
    sync(key = AppStore.WriteKey.review(titleId), titleId = titleId, onError = err@{ e ->
        // No reaction on the server: the review never existed there. Put back what was before and say
        // the real rule — never a "Reintentar" that can only fail again.
        if (!(e is KuraApiError.Conflict && e.code == "reaction_required")) return@err false
        val cur = reviewList(titleId).toMutableList()
        val j = cur.indexOfFirst { it.id == localId }
        if (j >= 0) {
            if (previous != null) cur[j] = previous else cur.removeAt(j)
            setReviews(titleId, cur)
        }
        updateState(titleId) { it.copy(reviewId = previousReviewId) }
        showToast(ToastModel(e.toast, ToastModel.Kind.Info))
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
    removeReviews(titleId) { it.authorId == meId }
    updateState(titleId) { it.copy(reviewId = null) }
    sync(key = AppStore.WriteKey.review(titleId), titleId = titleId) { api -> api.deleteReview(titleId) }
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
