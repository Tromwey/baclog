package com.tromwey.kura.state

import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.Privacy
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.time.Duration.Companion.milliseconds

// What the API marks unsupported, kept on this device (`LocalPrefs`) — twin of
// `AppStore+LocalPrefs.swift`. DataStore is async (iOS `UserDefaults` is not): loads and writes go
// through the store's serial `disk` queue, and `bootstrap` waits for `s.localLoad` before `applyLocal`.
//
// NOT ported: `migrateLegacyCuration` (iOS moves pins/covers/orders an OLD iOS build kept on the device
// up to the server, once). No Android build ever kept curation locally, so there's nothing to migrate;
// the `legacy*` fields only ride along untouched in `currentLocalPayload`, like iOS.

/** Reads this account's prefs from disk into memory (async; `s.localLoad` is the job). */
fun AppStore.loadLocal() {
    val session = s
    session.localLoad = disk {
        val p = prefs.load()
        if (s !== session) return@disk
        session.local = p
        session.localDirty = false
        session.recentSearches = p.recentSearches
        session.recentlyViewed = p.recentlyViewed
        session.alerts = p.alerts.toSet()
        session.muted = p.muted.toSet()
        session.showCommon = p.showCommon
        p.defaultPrivacy?.let { raw -> session.defaultPrivacy = Privacy.entries.firstOrNull { it.name == raw } ?: Privacy.OnlyMe }
    }
}

/** The device-local view of a collection: how THIS phone sorts and lays it out. */
fun AppStore.applyLocal(c: KCollection): KCollection {
    syncLocalIfDirty()
    val l = s.local.collections[c.id] ?: return c
    return c.copy(sort = l.sort, layout = l.layout)
}

internal fun AppStore.applyLocalEpisodes() {
    syncLocalIfDirty()
    var states = s.userTitles
    for ((id, eps) in s.local.watchedEpisodes) {
        val st = states[id] ?: continue
        states = states + (id to st.copy(watchedEpisodes = eps.toSet()))
    }
    s.userTitles = states
}

/** Something device-local changed. Memory is the truth right away; the disk write is debounced (0.5 s)
 *  so a burst is one write. `sceneWentInactive` flushes early; an exit cancels it. */
fun AppStore.saveLocal() {
    if (!prefs.enabled) return
    s.localDirty = true
    saveJob?.cancel()
    val job = scope.launch(start = CoroutineStart.LAZY) {
        delay(500.milliseconds)
        saveJob = null
        writeLocalNow()
    }
    saveJob = job
    job.start()
}

/** Writes the pending prefs now (no-op when nothing changed). */
fun AppStore.flushLocal() {
    saveJob?.cancel()
    saveJob = null
    writeLocalNow()
}

private fun AppStore.writeLocalNow() {
    if (!prefs.enabled || !s.localDirty) return
    val payload = currentLocalPayload()
    s.local = payload
    s.localDirty = false
    disk { prefs.save(payload) }
}

/** Rebuilds `local` from memory when memory is ahead of it (a read must see the latest sort). */
private fun AppStore.syncLocalIfDirty() {
    if (!s.localDirty) return
    s.local = currentLocalPayload()
}

private fun AppStore.currentLocalPayload(): LocalPrefs.Payload {
    val base = LocalPrefs.Payload(
        recentSearches = recentSearches,
        recentlyViewed = recentlyViewed,
        alerts = alerts.sorted(),
        muted = muted.sorted(),
        showCommon = showCommon,
        defaultPrivacy = defaultPrivacy.name,
    )
    // Before the library loaded, what derives from it stays as it is on disk (a recent search typed
    // during the launch must not erase every sort and watched episode).
    if (!s.libraryLoaded) return base.copy(collections = s.local.collections, watchedEpisodes = s.local.watchedEpisodes)
    val cols = HashMap<String, LocalPrefs.Collection>()
    for (c in collections) {
        val old = s.local.collections[c.id]
        val entry = LocalPrefs.Collection(
            sort = c.sort, layout = c.layout,
            legacyPinned = old?.legacyPinned, legacyCoverTitleId = old?.legacyCoverTitleId, legacyOrder = old?.legacyOrder,
        )
        if (entry != LocalPrefs.Collection()) cols[c.id] = entry
    }
    val eps = HashMap<String, List<String>>()
    for ((id, st) in userTitles) if (st.watchedEpisodes.isNotEmpty()) eps[id] = st.watchedEpisodes.sorted()
    return base.copy(collections = cols, watchedEpisodes = eps)
}
