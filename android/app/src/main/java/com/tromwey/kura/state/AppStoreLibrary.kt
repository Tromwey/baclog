package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApi
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.CollectionLayout
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.MembershipResult
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.Releases
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.SortMode
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.TitleRef
import com.tromwey.kura.data.models.UserTitleState
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Collection writes and title membership (add, remove with a deferred Deshacer, move, "Guardar en…") —
// twin of `AppStore+Library.swift`.

// MARK: Collection writes

/** The server id for a collection created optimistically (or the id itself). */
internal suspend fun AppStore.resolveCollectionId(id: String): String {
    s.collectionAliases[id]?.let { return it }
    val task = s.pendingCollections[id] ?: return id
    return task.await()
}

/** The id a collection has NOW: a local id already adopted maps to the server's (forever). */
fun AppStore.canonicalCollectionId(id: String): String = s.collectionAliases[id] ?: id

/** Swaps a temporary collection id for the one the server assigned. */
private fun AppStore.adopt(serverId: String, localId: String) {
    if (serverId == localId) return
    s.collectionAliases[localId] = serverId
    // Pending removals and write queues keyed by the local id follow it to the server id.
    val suffix = "|$localId"
    for (k in s.deferredWrites.keys.filter { it.endsWith(suffix) }) {
        val t = s.deferredWrites.remove(k) ?: continue
        s.deferredWrites[k.dropLast(suffix.length) + "|$serverId"] = t
    }
    for (k in s.writeChains.keys.filter { it.endsWith(suffix) }) {
        val c = s.writeChains.remove(k) ?: continue
        s.writeChains[k.dropLast(suffix.length) + "|$serverId"] = c
    }
    s.collections = s.collections.map { if (it.id == localId) it.copy(id = serverId) else it }
    if (lastUsedCollectionId == localId) lastUsedCollectionId = serverId
    s.paths = s.paths.mapValues { (_, routes) ->
        routes.map { r -> if (r is Route.Collection && r.id == localId) Route.Collection(serverId) else r }
    }
    when (val sh = sheet) {
        is SheetRoute.More -> if (sh.id == localId) sheet = SheetRoute.More(serverId)
        is SheetRoute.AddTitles -> if (sh.id == localId) sheet = SheetRoute.AddTitles(serverId)
        is SheetRoute.Reorder -> if (sh.id == localId) sheet = SheetRoute.Reorder(serverId)
        else -> Unit
    }
    s.loadedCollections = s.loadedCollections + serverId
}

/**
 * A new collection, shown at once with a local id. The POST alone creates it; the first title's
 * membership is a separate write whose Reintentar retries only the membership against the server id —
 * never the POST again (a duplicate collection).
 */
fun AppStore.createCollection(name: String, privacy: Privacy, adding: String? = null): String {
    val trimmed = name.trim()
    val finalName = if (trimmed.isEmpty()) "colección nueva" else trimmed.lowercase().take(AppStore.COLLECTION_NAME_LIMIT)
    val at = now
    var c = KCollection(id = AppStore.localId("c"), name = finalName, titleIds = emptyList(), privacy = privacy, createdAt = at)
    if (adding != null) {
        c = c.copy(titleIds = listOf(adding), addedAt = mapOf(adding to at))
        ensureUserState(adding)
    }
    s.collections = s.collections + c
    lastUsedCollectionId = c.id
    s.loadedCollections = s.loadedCollections + c.id
    val localId = c.id
    val session = s
    val task = scope.async(start = CoroutineStart.LAZY) {
        val created = api.createCollection(finalName, privacy)
        if (s === session) adopt(created.id, localId)
        created.id
    }
    session.pendingCollections[localId] = task
    task.start()
    scope.launch {
        try {
            val sid = task.await()
            if (s !== session) return@launch
            session.pendingCollections.remove(localId)
            online()
            // Only if it's still there: a quick Quitar before the POST answered wins.
            if (adding != null && collection(sid)?.titleIds?.contains(adding) == true) syncAdd(adding, sid)
        } catch (err: Exception) {
            if (s !== session) return@launch
            session.pendingCollections.remove(localId)
            val e = noteError(err)
            s.collections = s.collections.filter { it.id != localId }
            if (adding != null) gcUserState(adding)
            if (e == null || e == KuraApiError.Unauthorized) return@launch
            showToast(ToastModel(e.toast("No se pudo crear la colección."), ToastModel.Kind.Retry) {
                createCollection(finalName, privacy, adding)
            })
        }
    }
    return c.id
}

internal fun AppStore.update(id: String, change: (KCollection) -> KCollection) {
    val cid = canonicalCollectionId(id)
    val i = s.collections.indexOfFirst { it.id == cid }
    if (i < 0) return
    s.collections = s.collections.toMutableList().also { it[i] = change(it[i]) }
}

/** What a collection edit replaced, for the rollback. `vibe`: null = untouched, "" = none. */
private data class CollectionWas(val name: String?, val vibe: String?, val privacy: Privacy?)

/**
 * `PATCH /collections/{id}` for a name / frase edit or a privacy change. On ANY failure the collection
 * goes back to what it was — only if it still shows what this write set. A rejected value (400) says
 * why; anything else offers Reintentar, which applies the change again and resends it.
 * `vibe` null = untouched, "" = cleared (the server stores an empty frase as `null`).
 */
private fun AppStore.syncCollection(id: String, name: String? = null, vibe: String? = null, privacy: Privacy? = null, was: CollectionWas) {
    sync(key = AppStore.WriteKey.collection(canonicalCollectionId(id)), onError = err@{ e ->
        update(id) { c ->
            var out = c
            if (name != null && c.name == name && was.name != null) out = out.copy(name = was.name)
            if (vibe != null && (c.vibe ?: "") == vibe && was.vibe != null) out = out.copy(vibe = was.vibe.ifEmpty { null })
            if (privacy != null && c.privacy == privacy && was.privacy != null) out = out.copy(privacy = was.privacy)
            out
        }
        when (e) {
            KuraApiError.Unauthorized, KuraApiError.NotFound, KuraApiError.Unsupported -> return@err true
            is KuraApiError.Invalid -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            else -> showToast(ToastModel(e.toast("No se guardaron los cambios de la colección."), ToastModel.Kind.Retry) {
                if (collection(id) == null) return@ToastModel
                dismissToast()
                update(id) { c ->
                    var out = c
                    if (name != null) out = out.copy(name = name)
                    if (vibe != null) out = out.copy(vibe = vibe.ifEmpty { null })
                    if (privacy != null) out = out.copy(privacy = privacy)
                    out
                }
                syncCollection(id, name, vibe, privacy, was)
            })
        }
        true
    }) { api ->
        val sid = resolveCollectionId(id)
        api.updateCollection(sid, name, vibe, privacy)
    }
}

/** Editar (O2b, nombre + frase): one optimistic write for whatever changed, one Deshacer for both. */
fun AppStore.editCollection(id: String, name: String, vibe: String) {
    val trimmed = name.trim()
    val c = collection(id) ?: return
    if (trimmed.isEmpty()) return
    // An untouched name (older, longer than today's limit) stays whole.
    val newName = if (trimmed.lowercase() == c.name) c.name else trimmed.lowercase().take(AppStore.COLLECTION_NAME_LIMIT)
    val newVibe = vibe.trim().take(AppStore.COLLECTION_VIBE_LIMIT)
    val oldName = c.name
    val oldVibe = c.vibe ?: ""
    val nameChanged = newName != oldName
    val vibeChanged = newVibe != oldVibe
    if (!nameChanged && !vibeChanged) return
    val n = if (nameChanged) newName else null
    val v = if (vibeChanged) newVibe else null
    update(id) { col ->
        var out = col
        if (n != null) out = out.copy(name = n)
        if (v != null) out = out.copy(vibe = v.ifEmpty { null })
        out
    }
    syncCollection(id, name = n, vibe = v, was = CollectionWas(oldName, oldVibe, null))
    val text = when {
        nameChanged && vibeChanged -> "Cambios guardados"
        nameChanged -> "Nombre cambiado"
        else -> "Frase guardada"
    }
    undoToast(text) {
        update(id) { col ->
            var out = col
            if (nameChanged) out = out.copy(name = oldName)
            if (vibeChanged) out = out.copy(vibe = oldVibe.ifEmpty { null })
            out
        }
        syncCollection(id, name = if (nameChanged) oldName else null, vibe = if (vibeChanged) oldVibe else null,
            was = CollectionWas(n, v, null))
    }
}

fun AppStore.setPrivacy(id: String, p: Privacy) {
    val old = collection(id)?.privacy ?: return
    if (old == p) return
    update(id) { it.copy(privacy = p) }
    syncCollection(id, privacy = p, was = CollectionWas(null, null, old))
    undoToast(p.changedToast) {
        update(id) { it.copy(privacy = old) }
        syncCollection(id, privacy = old, was = CollectionWas(null, null, p))
    }
}

// MARK: Curation (pinned, cover, manual order)

/** A write to this collection is queued or in flight: a read landing meanwhile is older than the screen. */
fun AppStore.collectionWriteInFlight(id: String): Boolean =
    s.writeChains[s.canonicalWriteKey(AppStore.WriteKey.collection(canonicalCollectionId(id)))] != null

/** A pin write is queued or in flight (one per account: it moves the pin between collections). */
val AppStore.pinWriteInFlight: Boolean get() = s.writeChains[AppStore.WriteKey.PIN] != null

/** The optimistic write pattern of the curation: revert on ANY failure (only while it still shows what
 *  this write set); 400 says why; anything else offers Reintentar (re-apply + resend). */
private fun AppStore.syncCuration(
    id: String,
    key: String,
    stillOurs: (KCollection) -> Boolean,
    revert: () -> Unit,
    reapply: () -> Unit,
    op: suspend (KuraApi, String) -> Unit,
) {
    sync(key = key, onError = err@{ e ->
        collection(id)?.let { if (stillOurs(it)) revert() }
        when (e) {
            KuraApiError.Unauthorized, KuraApiError.NotFound, KuraApiError.Unsupported -> return@err true
            is KuraApiError.Invalid -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            else -> showToast(ToastModel(e.toast, ToastModel.Kind.Retry) {
                if (collection(id) == null) return@ToastModel
                dismissToast()
                reapply()
            })
        }
        true
    }) { api ->
        val sid = resolveCollectionId(id)
        op(api, sid)
    }
}

/** Fijar / Desfijar. One pinned per account; Deshacer puts the pin back where it was. */
fun AppStore.togglePin(id: String) {
    val c = collection(id) ?: return
    val before = s.collections.firstOrNull { it.pinned }?.id
    setPinned(c.id, !c.pinned)
    haptic(StoreHaptic.Tap)
    val pinned = !c.pinned
    undoToast(if (pinned) "Fijada" else "Ya no está fijada") {
        if (before != null) setPinned(before, true) else setPinned(c.id, false)
    }
}

private fun AppStore.setPinned(id: String, pinned: Boolean) {
    val cid = canonicalCollectionId(id)
    val snapshot = s.collections.associate { it.id to it.pinned }
    s.collections = s.collections.map {
        when {
            it.id == cid -> it.copy(pinned = pinned)
            pinned -> it.copy(pinned = false)
            else -> it
        }
    }
    syncCuration(cid, AppStore.WriteKey.PIN,
        stillOurs = { it.pinned == pinned },
        revert = { s.collections = s.collections.map { it.copy(pinned = snapshot[it.id] ?: false) } },
        reapply = { setPinned(cid, pinned) },
    ) { api, sid -> api.setCollectionPinned(sid, pinned) }
}

/** "Usar como portada" (a member) / "Portada automática" (null): `PATCH { coverTitleId }`. */
fun AppStore.setCover(id: String, titleId: String?) {
    val c = collection(id) ?: return
    val old = c.chosenCoverTitleId
    if (old == titleId) return
    writeCover(c.id, titleId, old)
    undoToast(if (titleId == null) "Portada automática" else "Nueva portada") { writeCover(c.id, old, titleId) }
}

private fun AppStore.writeCover(id: String, titleId: String?, was: String?) {
    update(id) { it.copy(chosenCoverTitleId = titleId) }
    syncCuration(id, AppStore.WriteKey.collection(canonicalCollectionId(id)),
        stillOurs = { it.chosenCoverTitleId == titleId },
        revert = { update(id) { it.copy(chosenCoverTitleId = was) } },
        reapply = { writeCover(id, titleId, was) },
    ) { api, sid -> api.setCollectionCover(sid, titleId) }
}

/**
 * Reordenar › Guardar orden: the WHOLE manual order (`PUT /collections/{id}/order`), and the view goes
 * back to Manual. Titles that came while the sheet was open go on top; gone ones are dropped. The new #1
 * LEADS the fan: a chosen cover that isn't the new #1 goes back to automatic in the same beat.
 */
fun AppStore.reorder(id: String, order: List<String>) {
    val c = collection(id) ?: return
    val present = c.titleIds.toSet()
    val kept = order.filter { it in present }
    val placed = kept.toSet()
    val final = c.titleIds.filter { it !in placed } + kept
    val old = c.titleIds
    update(id) { it.copy(sort = SortMode.Manual) }
    saveLocal()
    if (final == old) return
    val cover = c.chosenCoverTitleId
    if (cover != null && cover != final.firstOrNull()) writeCover(c.id, null, cover)
    writeOrder(c.id, final, old)
}

private fun AppStore.writeOrder(id: String, order: List<String>, was: List<String>) {
    update(id) { it.copy(titleIds = order) }
    syncCuration(id, AppStore.WriteKey.collection(canonicalCollectionId(id)),
        stillOurs = { it.titleIds == order },
        revert = { update(id) { it.copy(titleIds = was) } },
        reapply = { writeOrder(id, order, was) },
    ) { api, sid -> api.reorderCollection(sid, order) }
}

fun AppStore.setSort(id: String, mode: SortMode) {
    update(id) { it.copy(sort = mode) }
    saveLocal()
}

fun AppStore.setLayout(id: String, layout: CollectionLayout) {
    update(id) { it.copy(layout = layout) }
    saveLocal()
}

/** "Ver como lista / Ver en columnas": flips what the collection has NOW in the store (learning
 *  2026-09-27-ios-toggle-desde-hoja-lee-el-store: never from a copy the sheet captured). */
fun AppStore.toggleLayout(id: String) {
    val c = collection(id) ?: return
    setLayout(id, if (c.layout == CollectionLayout.List) CollectionLayout.Covers else CollectionLayout.List)
}

fun AppStore.deleteCollection(id: String) {
    val cid = canonicalCollectionId(id)
    s.collections = s.collections.filter { it.id != cid }
    s.paths = s.paths.mapValues { (_, routes) -> routes.filterNot { it is Route.Collection && it.id == cid } }
    for (key in s.deferredWrites.keys.filter { it.endsWith("|$cid") }) s.deferredWrites.remove(key)?.cancel()
    sync(key = AppStore.WriteKey.collection(cid)) { api ->
        api.deleteCollection(resolveCollectionId(cid))
    }
    saveLocal()
    showToast(ToastModel("Colección borrada", ToastModel.Kind.Info))
}

// MARK: Title membership

/** Your state for a title, created (saved now) if it doesn't exist. */
fun AppStore.ensureUserState(titleId: String) {
    if (s.userTitles[titleId] == null) s.userTitles = s.userTitles + (titleId to UserTitleState(savedAt = now))
}

/** Changes your state for a title (no-op when it has none). */
internal fun AppStore.updateState(titleId: String, change: (UserTitleState) -> UserTitleState) {
    val st = s.userTitles[titleId] ?: return
    s.userTitles = s.userTitles + (titleId to change(st))
}

internal fun AppStore.setState(titleId: String, state: UserTitleState?) {
    s.userTitles = if (state == null) s.userTitles - titleId else s.userTitles + (titleId to state)
}

/** A title leaving its LAST collection loses its state too (the server GCs `user_item` on that remove). */
internal fun AppStore.gcUserState(titleId: String) {
    if (!isSaved(titleId)) {
        setState(titleId, null)
        val mine = me.id
        removeReviews(titleId) { it.authorId == mine }
    }
}

/** The membership response: the real (cached) title and the server state. */
private fun AppStore.absorb(r: MembershipResult, localId: String) {
    if (r.title.id != localId) remapExternal(localId, r.title) else register(r.title)
    val st = r.state ?: return
    if (s.inflightCount(r.title.id) > 1) return
    val merged = st.copy(watchedEpisodes = s.userTitles[r.title.id]?.watchedEpisodes ?: emptySet())
    val local = s.userTitles[r.title.id]
    if (local != null && local.mark != merged.mark && s.inflightCount(r.title.id) > 0) return
    setState(r.title.id, merged)
}

/** An external search result became a real catalog item: move everything over. */
private fun AppStore.remapExternal(localId: String, real: Title) {
    register(real)
    s.titles = s.titles - localId
    s.catalogOrder = s.catalogOrder.filter { it != localId }
    s.collections = s.collections.map { c ->
        c.copy(
            titleIds = c.titleIds.map { if (it == localId) real.id else it },
            addedAt = c.addedAt[localId]?.let { d -> (c.addedAt - localId) + (real.id to d) } ?: c.addedAt,
            chosenCoverTitleId = if (c.chosenCoverTitleId == localId) real.id else c.chosenCoverTitleId,
            fanTitleIds = c.fanTitleIds.map { if (it == localId) real.id else it },
        )
    }
    s.userTitles[localId]?.let { st ->
        s.userTitles = s.userTitles - localId
        if (s.userTitles[real.id] == null) s.userTitles = s.userTitles + (real.id to st)
    }
    s.recentlyViewed = s.recentlyViewed.map { if (it == localId) real.id else it }
    s.onboardingPicks = s.onboardingPicks.map { if (it == localId) real.id else it }
    s.paths = s.paths.mapValues { (_, routes) ->
        routes.map { if (it is Route.TitleRoute && it.id == localId) Route.TitleRoute(real.id) else it }
    }
    when (val sh = sheet) {
        is SheetRoute.SaveTo -> if (sh.titleId == localId) sheet = SheetRoute.SaveTo(real.id)
        is SheetRoute.Complete -> if (sh.titleId == localId) sheet = SheetRoute.Complete(real.id, sh.focusReview)
        is SheetRoute.TitleMore -> if (sh.titleId == localId) sheet = SheetRoute.TitleMore(real.id)
        else -> Unit
    }
}

internal fun AppStore.syncAdd(titleId: String, collectionId: String) {
    val session = s
    sync(key = AppStore.WriteKey.membership(titleId, canonicalCollectionId(collectionId)), titleId = titleId) { api ->
        val cid = resolveCollectionId(collectionId)
        val palette = unsentPalettes[titleId]
        val r = api.createTitleMembership(cid, TitleRef.from(titleId), palette)
        // The server now has a palette (ours, or the one that beat it): nothing left to send.
        if (palette != null) unsentPalettes.remove(titleId)
        on(session) { absorb(r, titleId) }
    }
}

private fun AppStore.syncRemove(titleId: String, collectionId: String) {
    sync(key = AppStore.WriteKey.membership(titleId, canonicalCollectionId(collectionId)), titleId = titleId) { api ->
        api.removeTitleMembership(resolveCollectionId(collectionId), titleId)
    }
}

/** Removals wait for the Deshacer window (`undoWindow`): undoing never round-trips, and the server keeps
 *  the title's state until the window closes. */
private fun AppStore.deferRemove(titleId: String, collectionId: String) {
    val key = removalKey(titleId, collectionId)
    s.deferredWrites.remove(key)?.cancel()
    val window = undoWindow
    val session = s
    val job = scope.launch(start = CoroutineStart.LAZY) {
        delay(window)
        if (s !== session) return@launch
        // Recomputed: `adopt` may have moved the entry to the server id meanwhile.
        session.deferredWrites.remove(removalKey(titleId, collectionId))
        syncRemove(titleId, collectionId)
    }
    s.deferredWrites[key] = job
    job.start()
}

/** `deferredWrites` key: title + the collection's CURRENT id (see `adopt`). */
private fun AppStore.removalKey(titleId: String, collectionId: String) = "$titleId|${canonicalCollectionId(collectionId)}"

/** Cancels a pending removal; true when there was one (nothing to re-add on the server). */
private fun AppStore.cancelRemove(titleId: String, collectionId: String): Boolean {
    val job = s.deferredWrites.remove(removalKey(titleId, collectionId)) ?: return false
    job.cancel()
    return true
}

/** Titles whose removal from this collection is still inside its Deshacer window. */
fun AppStore.pendingRemovals(collectionId: String): List<String> {
    val cid = canonicalCollectionId(collectionId)
    return s.deferredWrites.keys.filter { it.endsWith("|$cid") }.map { it.substringBefore('|') }
}

private fun KCollection.inserting(titleId: String, at: java.time.Instant?): KCollection =
    copy(titleIds = listOf(titleId) + titleIds, addedAt = if (at != null) addedAt + (titleId to at) else addedAt)

private fun KCollection.inserting(titleId: String, index: Int): KCollection =
    copy(titleIds = titleIds.toMutableList().also { it.add(index.coerceAtMost(it.size), titleId) })

private fun KCollection.removing(titleId: String): KCollection = copy(titleIds = titleIds.filter { it != titleId })

fun AppStore.add(titleId: String, collectionId: String, toast: Boolean = true) {
    val cid = canonicalCollectionId(collectionId)
    val c = collection(cid) ?: return
    if (titleId in c.titleIds) return
    val hadState = s.userTitles[titleId]
    ensureUserState(titleId)
    update(cid) { it.inserting(titleId, now) }
    lastUsedCollectionId = cid
    if (!cancelRemove(titleId, cid)) syncAdd(titleId, cid)
    haptic(StoreHaptic.Tap)
    if (toast) {
        undoToast("Agregado a ${c.name}") {
            update(cid) { it.removing(titleId) }
            syncRemove(titleId, cid)
            if (hadState == null) gcUserState(titleId)
        }
    }
}

/** Silent inverse used by the add sheet's ✓ → + toggle. */
fun AppStore.removeSilently(titleId: String, collectionId: String) {
    val cid = canonicalCollectionId(collectionId)
    update(cid) { it.removing(titleId) }
    syncRemove(titleId, cid)
    gcUserState(titleId)
}

fun AppStore.remove(titleId: String, collectionId: String) {
    val cid = canonicalCollectionId(collectionId)
    val c = collection(cid) ?: return
    val idx = c.titleIds.indexOf(titleId)
    if (idx < 0) return
    val state = s.userTitles[titleId]
    val myReviews = reviewList(titleId).filter { it.authorId == me.id }
    update(cid) { col -> col.copy(titleIds = col.titleIds.toMutableList().also { it.removeAt(idx) }) }
    gcUserState(titleId)
    deferRemove(titleId, cid)
    undoToast("Quitado de ${c.name}") {
        cancelRemove(titleId, cid)
        update(cid) { it.inserting(titleId, idx) }
        if (s.userTitles[titleId] == null) setState(titleId, state)
        val back = myReviews.filter { review(it.id) == null }
        if (back.isNotEmpty()) setReviews(titleId, reviewList(titleId) + back)
    }
}

fun AppStore.move(titleId: String, fromId: String, toId: String) {
    val from = canonicalCollectionId(fromId)
    val to = canonicalCollectionId(toId)
    if (from == to) return
    val fromC = collection(from) ?: return
    val toC = collection(to) ?: return
    val idx = fromC.titleIds.indexOf(titleId)
    if (idx < 0) return
    val alreadyThere = titleId in toC.titleIds
    update(from) { col -> col.copy(titleIds = col.titleIds.toMutableList().also { it.removeAt(idx) }) }
    if (!alreadyThere) {
        update(to) { it.inserting(titleId, now) }
        if (!cancelRemove(titleId, to)) syncAdd(titleId, to)
    }
    deferRemove(titleId, from)
    lastUsedCollectionId = to
    haptic(StoreHaptic.Tap)
    undoToast("Movido a ${toC.name}") {
        cancelRemove(titleId, from)
        if (!alreadyThere) {
            update(to) { it.removing(titleId) }
            syncRemove(titleId, to)
        }
        update(from) { it.inserting(titleId, idx) }
    }
}

/** "Guardar en": sets the exact membership of a title. */
fun AppStore.setMembership(titleId: String, collectionIds: Set<String>) {
    val ids = collectionIds.map { canonicalCollectionId(it) }.toSet()
    val before = collectionsContaining(titleId).map { it.id }.toSet()
    if (before == ids) return
    val hadState = s.userTitles[titleId]
    if (ids.isNotEmpty()) ensureUserState(titleId)
    val added = ids - before
    val removed = before - ids
    for (id in added) {
        update(id) { it.inserting(titleId, now) }
        if (!cancelRemove(titleId, id)) syncAdd(titleId, id)
    }
    for (id in removed) {
        update(id) { it.removing(titleId) }
        deferRemove(titleId, id)
    }
    added.firstOrNull()?.let { lastUsedCollectionId = it }
    haptic(StoreHaptic.Tap)
    if (before.isEmpty() && ids.isNotEmpty() && notifyReleases) {
        s.titles[titleId]?.let { t -> if (Releases.isUnreleased(t, now)) platform.scheduleReleaseNotice(t) }
    }
    gcUserState(titleId)
    val text = when {
        ids.isEmpty() -> "Ya no está guardado"
        ids.size == 1 && collection(ids.first()) != null -> "Guardado en ${collection(ids.first())!!.name}"
        else -> "Guardado en ${ids.size} colecciones"
    }
    undoToast(text) {
        for (id in added) {
            update(id) { it.removing(titleId) }
            syncRemove(titleId, id)
        }
        for (id in removed) {
            cancelRemove(titleId, id)
            update(id) { it.inserting(titleId, null) }
        }
        setState(titleId, hadState)
    }
}
