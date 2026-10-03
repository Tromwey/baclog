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
import kotlinx.coroutines.Job
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
    s.moveWriteSlots(localId, serverId)
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
    // What the phone knew BEFORE this POST: the retry of a lost answer tells "that POST's collection"
    // from one that was already here by this, not by what `s.collections` holds when it runs.
    val known = s.collections.map { it.id }.toSet()
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
            if (s !== session) return@launch // a 401 replaced the session: nothing of this one to undo
            s.collections = s.collections.filter { it.id != localId }
            if (adding != null) gcUserState(adding)
            if (e == null || e == KuraApiError.Unauthorized) return@launch
            // A TIMEOUT is the only failure after which the POST may have landed anyway: only then does
            // the retry look for it first. A plain offline (nothing went out) or an answered error just
            // sends the POST again — reading the library to "adopt" a homonym there would take a
            // collection made on another device for this one.
            val lost = e == KuraApiError.Offline && api.lastOfflineTimedOut
            val failedAt = realNow() // not `now`: that one ticks by the minute
            createFailed(e, "create|$localId") {
                if (lost) recreateCollection(finalName, privacy, adding, since = at, until = failedAt, known = known)
                else createCollection(finalName, privacy, adding)
            }
        }
    }
    return c.id
}

/**
 * A "crear colección" (or the library read of its retry) failed. `createCollection` doesn't go through
 * `sync`, so the same rules live here: Reintentar — and the resend when the network is back — ONLY for
 * what trying again can fix (offline, a 5xx / 503). A definitive answer (400, 403, 409, 429) says why
 * once, with the server's words, and queues nothing: every reconnection would repeat the POST for the
 * same refusal. `403 onboarding_required` goes to its one handler.
 */
private fun AppStore.createFailed(e: KuraApiError, key: String, redo: () -> Unit) {
    if (onboardingRequired(e)) return
    val fallback = "No se pudo crear la colección."
    when (e) {
        KuraApiError.Offline, KuraApiError.Unavailable, is KuraApiError.Server, is KuraApiError.ServiceUnavailable ->
            retryToast(e.toast(fallback), key) {
                dismissToast()
                redo()
            }
        is KuraApiError.Forbidden -> showToast(ToastModel(e.note.ifEmpty { fallback }, ToastModel.Kind.Info))
        is KuraApiError.Conflict -> showToast(ToastModel(e.message.ifEmpty { fallback }, ToastModel.Kind.Info))
        else -> showToast(ToastModel(e.toast(fallback), ToastModel.Kind.Info))
    }
}

/** How far before the first attempt a collection's `createdAt` may fall and still be "that POST"
 *  (the phone's clock against the server's). */
private val CREATE_WINDOW_SKEW: java.time.Duration = java.time.Duration.ofMinutes(2)

/** How far after the attempt FAILED it may fall: the server can finish a POST whose answer timed out a
 *  little later, never minutes later. Past it, a homonym is somebody else's (another device). */
private val CREATE_WINDOW_LATE: java.time.Duration = java.time.Duration.ofMinutes(1)

/** The lost POST's collection was found with another privacy than the one chosen: adopted as it is. */
internal const val ADOPTED_AS_IS_NOTE = "Esa colección ya existía con otra privacidad. Se quedó como estaba."

/**
 * Reintentar (or the network coming back) of a "crear colección" whose answer was LOST (a timeout — the
 * only caller: a plain offline or an answered error just POSTs again). `POST /collections` is NOT
 * idempotent and takes no idempotency key: the collection may exist already, and a blind second POST
 * would make a twin. So the library is read first — a collection with this name, created inside the
 * window of that attempt ([since] − skew … [until] + a short margin), that the phone didn't know WHEN
 * THAT ATTEMPT WENT OUT ([known]) IS the one: it's adopted (and the title saved in it), never created
 * again. Compared against [known], not against `s.collections` now: a pull to refresh or the
 * reconnection's `bootstrap` between the failure and this retry already brought the lost collection in,
 * and it would read as "one the phone knows" → a twin. A read that fails creates nothing and offers
 * Reintentar again.
 *
 * **Adopting never changes who can see a collection.** A same-name one with the privacy that was chosen
 * is preferred; one with ANOTHER privacy is adopted exactly as the server has it, with a notice and no
 * `PATCH` — it may be a collection made Private on purpose on another device, and publishing it because
 * a name matched is the one thing this must never do. (Fiestas never come in `GET /collections`.)
 */
private fun AppStore.recreateCollection(
    name: String, privacy: Privacy, adding: String?, since: java.time.Instant, until: java.time.Instant, known: Set<String>,
) {
    val session = s
    scope.launch {
        val server = try {
            api.collections()
        } catch (err: Exception) {
            if (err is kotlinx.coroutines.CancellationException) throw err
            if (s !== session) return@launch
            val e = noteError(err)
            if (e == null || e == KuraApiError.Unauthorized) return@launch
            if (s !== session) return@launch
            createFailed(e, "create|$name") { recreateCollection(name, privacy, adding, since, until, known) }
            return@launch
        }
        if (s !== session) return@launch
        online()
        // A collection created here with a local id that got its server id since: still "known".
        val before = known.map { canonicalCollectionId(it) }.toSet()
        val from = since.minus(CREATE_WINDOW_SKEW)
        val to = until.plus(CREATE_WINDOW_LATE)
        val landed = server
            .filter { it.name == name && it.id !in before && !it.createdAt.isBefore(from) && !it.createdAt.isAfter(to) }
            .sortedWith(compareByDescending<KCollection> { it.privacy == privacy }.thenByDescending { it.createdAt })
            .firstOrNull()
        if (landed == null) {
            createCollection(name, privacy, adding)
            return@launch
        }
        // Already on screen when a library read came in between: it's adopted as it is, not added twice.
        if (collection(landed.id) == null) {
            registerAll(landed.embeddedTitles)
            s.collections = s.collections + applyLocal(landed)
            s.loadedCollections = s.loadedCollections + landed.id
        }
        lastUsedCollectionId = landed.id
        if (adding != null && collection(landed.id)?.titleIds?.contains(adding) != true) add(adding, landed.id, toast = false)
        // The SERVER's privacy stays (see above): said, never written.
        if (landed.privacy != privacy) showToast(ToastModel(ADOPTED_AS_IS_NOTE, ToastModel.Kind.Info))
    }
}

/** The Reintentar key of an edit of collection [id]'s [fields] (see `SessionData.collectionRetries`). */
private fun collectionRetryKey(id: String, fields: Collection<String>) = "c.${fields.joinToString("+")}|$id"

internal fun AppStore.update(id: String, change: (KCollection) -> KCollection) {
    val cid = canonicalCollectionId(id)
    val i = s.collections.indexOfFirst { it.id == cid }
    if (i < 0) return
    s.collections = s.collections.toMutableList().also { it[i] = change(it[i]) }
}

/** What a collection edit replaced, for the rollback. `vibe`: null = untouched, "" = none. */
private data class CollectionWas(val name: String?, val vibe: String?, val privacy: Privacy?)

/**
 * `PATCH /collections/{id}` for a name / frase edit or a privacy change. On ANY failure each field goes
 * back to what the SERVER last confirmed (`SessionData.beginWrite`: renaming a → b → c offline ends on
 * "a", not on the optimistic "b") — only if it still shows what this write set and no newer write of
 * that field is unresolved. A rejected value (400) says why; anything else offers Reintentar, which
 * applies the change again and resends it. `was` = what each field showed before this write.
 * `vibe` null = untouched, "" = cleared (the server stores an empty frase as `null`).
 */
private fun AppStore.syncCollection(id: String, name: String? = null, vibe: String? = null, privacy: Privacy? = null, was: CollectionWas) {
    val session = s
    // Recomputed at each use: `adopt` moves the slots from the local id to the server's.
    fun slot(field: String) = "$field|${canonicalCollectionId(id)}"
    if (name != null) session.beginWrite(slot("cname"), was.name)
    if (vibe != null) session.beginWrite(slot("cvibe"), was.vibe)
    if (privacy != null) session.beginWrite(slot("cpriv"), was.privacy)
    // One Reintentar per field: this write retires the failed ones waiting on the fields IT writes
    // (they'd be resent over it), and leaves the rest offered.
    val fields = listOfNotNull("name".takeIf { name != null }, "vibe".takeIf { vibe != null }, "priv".takeIf { privacy != null })
    for (k in session.collectionRetries(canonicalCollectionId(id), fields.toSet())) settleRetry(session, k)
    sync(key = AppStore.WriteKey.collection(canonicalCollectionId(id)), retryKey = collectionRetryKey(canonicalCollectionId(id), fields), onError = err@{ e ->
        val n = if (name != null) session.endWrite(slot("cname")) else null
        val v = if (vibe != null) session.endWrite(slot("cvibe")) else null
        val p = if (privacy != null) session.endWrite(slot("cpriv")) else null
        val baseName = n?.value as? String ?: was.name
        val baseVibe = v?.value as? String ?: was.vibe
        val basePrivacy = p?.value as? Privacy ?: was.privacy
        update(id) { c ->
            var out = c
            if (name != null && c.name == name && n?.newer != true && baseName != null) out = out.copy(name = baseName)
            if (vibe != null && (c.vibe ?: "") == vibe && v?.newer != true && baseVibe != null) out = out.copy(vibe = baseVibe.ifEmpty { null })
            if (privacy != null && c.privacy == privacy && p?.newer != true && basePrivacy != null) out = out.copy(privacy = basePrivacy)
            out
        }
        // What is left to retry: a field the server already has as asked (a → b → a, both lost) isn't,
        // and neither is one a NEWER write of it is about to decide — offering the old value again
        // would send it after (over) the newer one.
        val rName = name?.takeIf { baseName != it && n?.newer != true }
        val rVibe = vibe?.takeIf { baseVibe != it && v?.newer != true }
        val rPrivacy = privacy?.takeIf { basePrivacy != it && p?.newer != true }
        if (rName == null && rVibe == null && rPrivacy == null) return@err true
        val left = listOfNotNull("name".takeIf { rName != null }, "vibe".takeIf { rVibe != null }, "priv".takeIf { rPrivacy != null })
        when (e) {
            KuraApiError.Unauthorized -> return@err true
            // Reverted above; a 404 / 501 can't be retried into working, so it says so instead of
            // going quiet (the change looked saved for a moment).
            KuraApiError.NotFound -> showToast(ToastModel(AppStore.GONE_COLLECTION_NOTE, ToastModel.Kind.Info))
            KuraApiError.Unsupported -> showToast(ToastModel(AppStore.NOT_SAVED_NOTE, ToastModel.Kind.Info))
            is KuraApiError.Invalid -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            else -> retryToast(e.toast("No se pudo guardar la colección"), collectionRetryKey(canonicalCollectionId(id), left)) {
                val cur = collection(id) ?: return@retryToast
                dismissToast()
                // What it shows NOW (the reverted, confirmed values) is what this resend replaces.
                val before = CollectionWas(
                    if (rName != null) cur.name else null,
                    if (rVibe != null) cur.vibe ?: "" else null,
                    if (rPrivacy != null) cur.privacy else null,
                )
                update(id) { c ->
                    var out = c
                    if (rName != null) out = out.copy(name = rName)
                    if (rVibe != null) out = out.copy(vibe = rVibe.ifEmpty { null })
                    if (rPrivacy != null) out = out.copy(privacy = rPrivacy)
                    out
                }
                syncCollection(id, rName, rVibe, rPrivacy, before)
            }
        }
        true
    }) { api ->
        val sid = resolveCollectionId(id)
        api.updateCollection(sid, name, vibe, privacy)
        if (name != null) slot("cname").let { session.confirmWrite(it, name); session.endWrite(it) }
        if (vibe != null) slot("cvibe").let { session.confirmWrite(it, vibe); session.endWrite(it) }
        if (privacy != null) slot("cpriv").let { session.confirmWrite(it, privacy); session.endWrite(it) }
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
    /** The Reintentar's key when [key] is the collection's whole line (`c|id`): cover and order each
     *  have theirs, so one doesn't retire the other's (nor a rename's). */
    retryKey: String = key,
    op: suspend (KuraApi, String) -> Unit,
) {
    sync(key = key, retryKey = retryKey, onError = err@{ e ->
        collection(id)?.let { if (stillOurs(it)) revert() }
        when (e) {
            KuraApiError.Unauthorized -> return@err true
            // Reverted above; a 404 / 501 can't be retried into working, so it says so instead of
            // going quiet (the change looked saved for a moment).
            KuraApiError.NotFound -> showToast(ToastModel(AppStore.GONE_COLLECTION_NOTE, ToastModel.Kind.Info))
            KuraApiError.Unsupported -> showToast(ToastModel(AppStore.NOT_SAVED_NOTE, ToastModel.Kind.Info))
            is KuraApiError.Invalid -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            else -> retryToast(e.toast, retryKey) {
                if (collection(id) == null) return@retryToast
                dismissToast()
                reapply()
            }
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
        retryKey = collectionRetryKey(canonicalCollectionId(id), listOf("cover")),
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
        retryKey = collectionRetryKey(canonicalCollectionId(id), listOf("order")),
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

/** What "borrar también sus títulos" took off the phone for one title, to put it back if the DELETE fails. */
private class PurgedTitle(val id: String, val state: UserTitleState?, val reviews: List<com.tromwey.kura.data.models.Review>)

/**
 * Borrar colección. Default (`purge = false`): only the collection goes; its titles keep their state,
 * your reaction and your review. [purge] (`DELETE …?purge=1`, the sheet's "Borrar también sus títulos"):
 * the titles that are in NO other collection lose all of that too — off the screen at once (state, own
 * review, your count of reviews) with whatever of theirs waited in the retry queue (`mark|T`,
 * `review|T`, `m|T|*`), and ALL of it back if the server refuses. A 404 is a success either way.
 */
fun AppStore.deleteCollection(id: String, purge: Boolean = false) {
    val cid = canonicalCollectionId(id)
    val index = s.collections.indexOfFirst { it.id == cid }
    val gone = s.collections.getOrNull(index)
    s.collections = s.collections.filter { it.id != cid }
    s.paths = s.paths.mapValues { (_, routes) -> routes.filterNot { it is Route.Collection && it.id == cid } }
    for (key in s.deferredWrites.keys.filter { it.endsWith("|$cid") }) s.deferredWrites.remove(key)?.cancel()
    val session = s
    val key = AppStore.WriteKey.collection(cid)
    // Its failed edits still waiting (a rename, a cover) have nothing left to edit.
    // Same for a failed save / quitar of a title in it (`m|…|cid`):
    // settled, not dropped — a timed-out one must NOT read the collection again (the GET could land
    // before this DELETE and put the collection back on screen).
    for (k in session.collectionRetries(cid, null) + session.membershipRetries(cid)) settleRetry(session, k)

    // "Borrar también sus títulos": the ones left in no collection once this one is gone.
    val meId = me.id
    val purged = if (purge && gone != null) {
        gone.titleIds.distinct().filter { !isSaved(it) }.map { t -> PurgedTitle(t, s.userTitles[t], reviewList(t).filter { it.authorId == meId }) }
    } else {
        emptyList()
    }
    val lostReviews = purged.count { it.reviews.isNotEmpty() || it.state?.reviewId != null }
    // Their queued writes leave the queue (resent after the DELETE they'd bring the state back); kept
    // aside for the revert. Writes of theirs still in flight go first, so the server sees them in order.
    val queued = LinkedHashMap<String, PendingRetry>()
    val before = ArrayList<Job>()
    for (p in purged) {
        for ((k, v) in session.pendingRetries) if (session.retryIsAbout(k, p.id)) queued[k] = v
        for ((k, chain) in session.writeChains) if (session.retryIsAbout(k, p.id)) before += chain.job
        dropRetriesAbout(session, p.id)
        setState(p.id, null)
        removeReviews(p.id) { it.authorId == meId }
    }
    if (lostReviews > 0) account?.let { a -> account = a.copy(stats = a.stats.copy(reviews = maxOf(0, a.stats.reviews - lostReviews))) }

    sync(key = key, onError = err@{ e ->
        if (e == KuraApiError.NotFound) return@err true // already gone on the server
        // The server still has it: it comes back where it was — with everything the purge took — and
        // Reintentar deletes it again, the same way.
        if (gone != null && s.collections.none { it.id == cid }) {
            s.collections = s.collections.toMutableList().also { it.add(index.coerceIn(0, it.size), gone) }
            for (p in purged) {
                if (s.userTitles[p.id] == null) setState(p.id, p.state)
                val back = p.reviews.filter { review(it.id) == null }
                if (back.isNotEmpty()) setReviews(p.id, reviewList(p.id) + back)
            }
            if (lostReviews > 0) account?.let { a -> account = a.copy(stats = a.stats.copy(reviews = a.stats.reviews + lostReviews)) }
            for ((k, v) in queued) if (!session.pendingRetries.containsKey(k)) session.pendingRetries[k] = v
            saveLocal()
        }
        when (e) {
            KuraApiError.Unauthorized -> Unit
            KuraApiError.Unsupported -> showToast(ToastModel(e.toast("No se borró la colección"), ToastModel.Kind.Info))
            else -> retryToast(e.toast("No se borró la colección"), session.canonicalWriteKey(key)) {
                dismissToast()
                deleteCollection(cid, purge)
            }
        }
        offerPendingRetries()
        true
    }) { api ->
        before.forEach { it.join() }
        api.deleteCollection(resolveCollectionId(cid), purge)
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
    val key = AppStore.WriteKey.membership(titleId, canonicalCollectionId(collectionId))
    sync(key = key, titleId = titleId, onError = err@{ e ->
        // The server never saved it: it leaves the collection on screen too (only while it still shows
        // there and nothing newer about this membership is queued), and Reintentar saves it again.
        val cid = canonicalCollectionId(collectionId)
        val newer = session.writeChains[session.canonicalWriteKey(key)] != null || hasPendingRemove(titleId, cid)
        if (!newer && collection(cid)?.titleIds?.contains(titleId) == true) {
            update(cid) { it.removing(titleId) }
            gcUserState(titleId)
        }
        when (e) {
            KuraApiError.Unauthorized -> Unit
            // Taken back off the collection above: the collection or the title is gone on the server.
            KuraApiError.NotFound -> showToast(ToastModel(AppStore.GONE_SAVE_NOTE, ToastModel.Kind.Info))
            KuraApiError.Unsupported -> showToast(ToastModel(AppStore.NOT_SAVED_NOTE, ToastModel.Kind.Info))
            is KuraApiError.Invalid -> showToast(ToastModel(e.toast, ToastModel.Kind.Info))
            else -> retryToast(e.toast("No se pudo guardar en ${collection(cid)?.name ?: "la colección"}"), key) {
                if (collection(cid) == null) return@retryToast
                dismissToast()
                add(titleId, cid, toast = false)
            }
        }
        true
    }) { api ->
        val cid = resolveCollectionId(collectionId)
        val palette = unsentPalettes[titleId]
        val r = api.createTitleMembership(cid, TitleRef.from(titleId), palette)
        // The server now has a palette (ours, or the one that beat it): nothing left to send.
        if (palette != null) unsentPalettes.remove(titleId)
        on(session) {
            absorb(r, titleId)
            // The ficha's "guardados" is a server count: re-read it once the save landed.
            refreshCountsIfOpen(r.title.id)
        }
    }
}

/** `state` = the title's state before it left (restored with it if the DELETE fails and it had none). */
private fun AppStore.syncRemove(titleId: String, collectionId: String, state: UserTitleState? = null) {
    val session = s
    val key = AppStore.WriteKey.membership(titleId, canonicalCollectionId(collectionId))
    sync(
        key = key,
        titleId = titleId,
        commitsLibraryRemoval = false,
        onError = err@{ e ->
            if (e == KuraApiError.NotFound) return@err true // not there on the server either
            // The server still has it in the collection: back on screen (unless it's already back or
            // something newer is queued), with its state; Reintentar takes it out again.
            val cid = canonicalCollectionId(collectionId)
            val newer = session.writeChains[session.canonicalWriteKey(key)] != null
            if (!newer && collection(cid)?.titleIds?.contains(titleId) == false) {
                val restored = s.userTitles[titleId] ?: state
                update(cid) { it.inserting(titleId, null as java.time.Instant?) }
                if (s.userTitles[titleId] == null) setState(titleId, restored ?: UserTitleState(savedAt = now))
            }
            when (e) {
                KuraApiError.Unauthorized -> Unit
                KuraApiError.Unsupported -> showToast(ToastModel(e.toast("No se quitó de ${collection(cid)?.name ?: "la colección"}"), ToastModel.Kind.Info))
                else -> retryToast(e.toast("No se quitó de ${collection(cid)?.name ?: "la colección"}"), key) {
                    if (collection(cid)?.titleIds?.contains(titleId) != true) return@retryToast
                    dismissToast()
                    val before = s.userTitles[titleId]
                    update(cid) { it.removing(titleId) }
                    gcUserState(titleId)
                    syncRemove(titleId, cid, before)
                }
            }
            true
        },
    ) { api ->
        api.removeTitleMembership(resolveCollectionId(collectionId), titleId)
        on(session) { refreshCountsIfOpen(titleId) }
    }
}

/** A loaded ficha's counts (guardados, completos…) are server aggregates: re-read after a write moved them. */
private fun AppStore.refreshCountsIfOpen(titleId: String) {
    if (titleId in s.loadedTitles) scope.launch { loadTitle(titleId, force = true) }
}

/** Removals wait for the Deshacer window (`undoWindow`): undoing never round-trips, and the server keeps
 *  the title's state until the window closes. */
private fun AppStore.deferRemove(titleId: String, collectionId: String, state: UserTitleState? = null) {
    val key = removalKey(titleId, collectionId)
    s.deferredWrites.remove(key)?.cancel()
    val window = undoWindow
    val session = s
    val job = scope.launch(start = CoroutineStart.LAZY) {
        delay(window)
        if (s !== session) return@launch
        // Recomputed: `adopt` may have moved the entry to the server id meanwhile.
        session.deferredWrites.remove(removalKey(titleId, collectionId))
        syncRemove(titleId, collectionId, state)
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

private fun AppStore.hasPendingRemove(titleId: String, collectionId: String): Boolean =
    s.deferredWrites.containsKey(removalKey(titleId, collectionId))

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
    val state = s.userTitles[titleId]
    update(cid) { it.removing(titleId) }
    syncRemove(titleId, cid, state)
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
    deferRemove(titleId, cid, state)
    undoToast("Quitado de ${c.name}") {
        // The window closed (the DELETE already went): nothing to put back without a round trip.
        if (!cancelRemove(titleId, cid)) return@undoToast
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
        if (!cancelRemove(titleId, from)) return@undoToast
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
        deferRemove(titleId, id, hadState)
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
        // A removal whose window already closed can't be undone locally: the whole Deshacer stands down
        // (half an undo would leave the phone and the server disagreeing).
        if (removed.any { !hasPendingRemove(titleId, it) }) return@undoToast
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

// MARK: Quitar de tus colecciones (`DELETE /me/titles/{id}`)

/** `deferredWrites` key of a library removal (no `|`: `adopt` and `pendingRemovals` never touch it). */
private fun libraryRemovalKey(titleId: String) = "library:$titleId"

/**
 * "Quitar de tus colecciones": every membership, your state (mark, episodes) and your review go, with
 * one Deshacer. Like quitar de una colección, the `DELETE /me/titles/{id}` waits for the Deshacer window
 * (`undoWindow`): undoing never round-trips. Any other write about this title inside the window (saving
 * it again, a mark, a review) sends the removal first and closes its Deshacer (`commitLibraryRemoval`),
 * so the server never sees them in the wrong order.
 */
fun AppStore.removeFromLibrary(titleId: String) {
    if (titleId !in libraryIds) return
    val session = s
    val places = s.collections.mapNotNull { c ->
        val i = c.titleIds.indexOf(titleId)
        if (i < 0) null else Triple(c.id, i, c.addedAt[titleId])
    }
    val state = s.userTitles[titleId]
    val myReviews = reviewList(titleId).filter { it.authorId == me.id }
    dropRetriesAbout(session, titleId)
    s.collections = s.collections.map { c -> if (titleId in c.titleIds) c.removing(titleId) else c }
    setState(titleId, null)
    removeReviews(titleId) { it.authorId == me.id }
    haptic(StoreHaptic.Tap)

    val key = libraryRemovalKey(titleId)
    s.deferredWrites.remove(key)?.cancel()
    val window = undoWindow
    val job = scope.launch(start = CoroutineStart.LAZY) {
        delay(window)
        if (s !== session) return@launch
        session.deferredWrites.remove(key)
        session.libraryRemovalToasts.remove(titleId)
        sendLibraryRemoval(titleId)
    }
    s.deferredWrites[key] = job
    job.start()

    // Everything back where it was: the Deshacer, and a DELETE that never reached the server.
    val putBack: () -> Unit = {
        for ((cid, i, at) in places) {
            update(cid) { c ->
                if (titleId in c.titleIds) c else c.inserting(titleId, i).let { r -> if (at != null) r.copy(addedAt = r.addedAt + (titleId to at)) else r }
            }
        }
        if (s.userTitles[titleId] == null) setState(titleId, state)
        val back = myReviews.filter { review(it.id) == null }
        if (back.isNotEmpty()) setReviews(titleId, reviewList(titleId) + back)
    }
    s.libraryRemovals[titleId] = putBack
    val single = places.singleOrNull()?.let { collection(it.first)?.name }
    val t = ToastModel(if (single != null) "Quitado de $single" else "Quitado de tus colecciones", ToastModel.Kind.Undo) {
        // Still inside the window (nothing reached the server): put everything back where it was.
        val pending = s.deferredWrites.remove(key) ?: return@ToastModel
        pending.cancel()
        s.libraryRemovalToasts.remove(titleId)
        s.libraryRemovals.remove(titleId)
        putBack()
        dismissToast()
    }
    s.libraryRemovalToasts[titleId] = t.id
    showToast(t)
}

/**
 * The title is leaving the library: a failed mark / review / save of it still waiting for the network
 * (or for its Reintentar) is dropped, toast included. Resent after the `DELETE /me/titles/{id}` it would
 * bring the title back on the server — with its obsession, and into the feed.
 */
private fun AppStore.dropRetriesAbout(session: SessionData, titleId: String) {
    session.purgeRetries(titleId)
    if (s === session) offerPendingRetries()
}

private fun AppStore.sendLibraryRemoval(titleId: String): Job {
    val session = s
    val key = AppStore.WriteKey.library(titleId)
    val putBack = session.libraryRemovals.remove(titleId)
    dropRetriesAbout(session, titleId)
    return sync(key = key, titleId = titleId, commitsLibraryRemoval = false, onError = err@{ e ->
        if (e == KuraApiError.NotFound) return@err true // nothing of it on the server either
        // The server kept it all: back on screen (unless it was saved again meanwhile), and
        // Reintentar quits it again (with its own Deshacer).
        if (titleId !in libraryIds && session.writeChains[session.canonicalWriteKey(key)] == null) putBack?.invoke()
        when (e) {
            KuraApiError.Unauthorized -> Unit
            KuraApiError.Unsupported -> showToast(ToastModel(e.toast("No se quitó de tus colecciones"), ToastModel.Kind.Info))
            else -> retryToast(e.toast("No se quitó de tus colecciones"), key) {
                dismissToast()
                removeFromLibrary(titleId)
            }
        }
        true
    }) { api ->
        api.removeFromLibrary(titleId)
    }
}

/**
 * A write about `titleId` while its "Quitar de tus colecciones" is still inside the Deshacer window: the
 * removal goes out NOW (its Deshacer can no longer be honored without a round trip, so its toast closes)
 * and the caller's write waits for the returned job. null = nothing pending.
 */
internal fun AppStore.commitLibraryRemoval(titleId: String): Job? {
    val pending = s.deferredWrites.remove(libraryRemovalKey(titleId)) ?: return null
    pending.cancel()
    s.libraryRemovalToasts.remove(titleId)?.let { id -> if (toast?.id == id) dismissToast() }
    return sendLibraryRemoval(titleId)
}
