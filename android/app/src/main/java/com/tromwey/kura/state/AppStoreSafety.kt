package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.BlockedAccount
import com.tromwey.kura.data.models.FeedKind
import com.tromwey.kura.data.models.ReportTarget
import com.tromwey.kura.data.models.Review
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

// Reportar y bloquear, and the blocked accounts list — twin of `AppStore+Safety.swift`.

fun AppStore.isBlocked(handle: String): Boolean = handle in blocked

/** Reviews to show for a title: nobody you blocked (the server already filters; this covers the cache). */
fun AppStore.visibleReviews(titleId: String): List<Review> = reviewList(titleId).filter { it.authorId !in blocked }

/** Sends a report and says "Gracias" only once the server answered 204. A failure offers Reintentar
 *  with the same reason; a 404 means it's already gone. */
suspend fun AppStore.report(target: ReportTarget, reason: String, details: String? = null): Boolean {
    val result = boundWrite {
        when (target) {
            is ReportTarget.PersonTarget -> api.reportPerson(target.handle, reason, details)
            is ReportTarget.ReviewTarget -> api.reportReview(target.id, reason)
        }
    }
    return when (result) {
        BoundWrite.Stale -> false
        is BoundWrite.Ok -> {
            if (target is ReportTarget.ReviewTarget) s.reportedReviews = s.reportedReviews + target.id
            haptic(StoreHaptic.Success)
            showToast(ToastModel(if (target.isReview) "Gracias. La revisamos." else "Gracias. Lo revisamos.", ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> {
            val e = result.error
            if (onboardingRequired(e)) return false
            when (e) {
                KuraApiError.Unauthorized -> Unit
                KuraApiError.NotFound -> showToast(ToastModel(
                    if (target.isReview) "Esa reseña ya no existe." else "Ese perfil no existe o es privado.", ToastModel.Kind.Info))
                else -> {
                    val text = when {
                        e == KuraApiError.Offline -> "Sin conexión. No se envió tu reporte."
                        e.isRateLimit -> e.toast
                        else -> "No se envió tu reporte."
                    }
                    showToast(ToastModel(text, ToastModel.Kind.Retry) {
                        dismissToast()
                        scope.launch { report(target, reason, details) }
                    })
                }
            }
            false
        }
    }
}

/** `PUT /me/blocks/{handle}`; the local state changes only after the 204 (the server drops the follows
 *  both ways — the app mirrors it, it doesn't guess ahead). */
suspend fun AppStore.block(handle: String): Boolean = when (val r = boundWrite { api.block(handle) }) {
    BoundWrite.Stale -> false
    is BoundWrite.Ok -> {
        applyBlock(handle)
        haptic(StoreHaptic.Success)
        showToast(ToastModel("Bloqueaste a @$handle.", ToastModel.Kind.Info))
        true
    }
    is BoundWrite.Failed -> {
        when (r.error) {
            KuraApiError.Unauthorized -> Unit
            KuraApiError.NotFound -> showToast(ToastModel("Ese perfil no existe o es privado.", ToastModel.Kind.Info))
            else -> {
                val text = if (r.error == KuraApiError.Offline) "Sin conexión. No se bloqueó a @$handle." else "No se pudo bloquear a @$handle."
                showToast(ToastModel(text, ToastModel.Kind.Retry) {
                    dismissToast()
                    scope.launch { block(handle) }
                })
            }
        }
        false
    }
}

/** Mirrors the server's block: no follow either way, and nothing of theirs left on screen. */
private fun AppStore.applyBlock(handle: String) {
    s.blocked = s.blocked + handle
    val wasFollowing = handle in s.following
    if (wasFollowing) {
        s.following = s.following - handle
        me = me.copy(followingCount = maxOf(0, me.followingCount - 1))
    }
    s.people[handle]?.let { p ->
        s.people = s.people + (handle to p.copy(
            isBlocked = true, isFollowing = false, followers = if (wasFollowing) maxOf(0, p.followers - 1) else p.followers,
        ))
    }
    s.requested = s.requested - handle
    s.feed = s.feed.filterNot { e ->
        val k = e.kind
        e.authorId == handle || (k is FeedKind.Suggestion && k.personId == handle)
    }
    for (tid in s.reviewsByTitle.keys.toList()) removeReviews(tid) { it.authorId == handle }
    s.titleActivity = s.titleActivity.mapValues { (_, v) -> v.filter { it.personId != handle } }
    s.peopleLists = s.peopleLists.mapValues { (_, v) -> v.filter { it.id != handle } }
    s.searchPeople = s.searchPeople.filter { it.id != handle }
    s.onboardingPeople = s.onboardingPeople.filter { it.id != handle }
    s.feedDirty = true
    val list = s.blockedAccounts
    if (list != null && list.none { it.handle == handle }) {
        val p = s.people[handle]
        s.blockedAccounts = listOf(BlockedAccount(id = handle, handle = handle, name = p?.name ?: handle, avatarUrl = p?.avatarUrl)) + list
    }
}

/** `DELETE /me/blocks/{handleOrId}`. Follows don't come back (the block removed them); their activity and
 *  reviews do, on the next read of each screen. */
suspend fun AppStore.unblock(key: String, handle: String?): Boolean {
    val shown = handle?.let { "@$it" } ?: "esta cuenta"
    return when (val r = boundWrite { api.unblock(key) }) {
        BoundWrite.Stale -> false
        is BoundWrite.Ok -> {
            if (handle != null) {
                s.blocked = s.blocked - handle
                s.people[handle]?.let { p -> s.people = s.people + (handle to p.copy(isBlocked = false)) }
            }
            s.blockedAccounts = s.blockedAccounts?.filterNot { it.key == key || it.id == key }
            s.feedDirty = true
            s.loadedTitles = emptySet() // fichas re-read their reviews on the next visit
            haptic(StoreHaptic.Success)
            showToast(ToastModel("Desbloqueaste a $shown.", ToastModel.Kind.Info))
            if (handle != null && s.people[handle] != null) loadPerson(handle, force = true)
            true
        }
        is BoundWrite.Failed -> {
            when (r.error) {
                KuraApiError.Unauthorized -> Unit
                KuraApiError.NotFound -> {
                    // Nothing to undo on the server: the list just catches up.
                    if (handle != null) s.blocked = s.blocked - handle
                    s.blockedAccounts = s.blockedAccounts?.filterNot { it.key == key || it.id == key }
                }
                else -> {
                    val text = if (r.error == KuraApiError.Offline) "Sin conexión. No se desbloqueó a $shown." else "No se pudo desbloquear a $shown."
                    showToast(ToastModel(text, ToastModel.Kind.Retry) {
                        dismissToast()
                        scope.launch { unblock(key, handle) }
                    })
                }
            }
            false
        }
    }
}

/** `GET /me/blocks` (Ajustes › Cuentas bloqueadas), on every visit. */
suspend fun AppStore.loadBlocks() {
    val session = s
    try {
        val items = api.blocks()
        check(session)
        loaded(LoadKey.Blocks)
        s.blocked = s.blocked + items.mapNotNull { it.handle }
        s.blockedAccounts = items
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        fail(LoadKey.Blocks, err)
    }
}
