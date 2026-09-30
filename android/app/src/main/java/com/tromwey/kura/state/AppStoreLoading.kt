package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.DiscoverCreatorsPayload
import com.tromwey.kura.data.models.DiscoverFormatPayload
import com.tromwey.kura.data.models.ExternalRef
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.PeopleKind
import com.tromwey.kura.data.models.RecapPayload
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.UserTitleState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.Instant

// Per-resource reads: the launch (`bootstrap`), a collection, a ficha and its reviews, Descubrir, search
// and the recap — twin of `AppStore+Loading.swift`. Feed and people reads live in AppStoreSocial.kt.
//
// Every read is a `suspend fun` the screen calls from its `LaunchedEffect` (iOS `.task`): leaving the
// screen cancels it, and the in-flight flags reset in `finally`.

/** The launch: `GET /me` + `/collections` + `/me/titles` + every page of `/me/following` in parallel,
 *  then `GET /titles?ids=` for what's missing — AWAITED before `Loaded` (cards draw only known titles). */
suspend fun AppStore.bootstrap(emptyLibrary: Boolean = false, keepLoading: Boolean = false) {
    loadState = LoadState.Loading
    setLoadError(LoadKey.Library, null)
    val session = s
    try {
        val (account, library, myStates, followed) = coroutineScope {
            val m = async { api.me() }
            val cols = async { api.collections() }
            val states = async { api.myTitles() }
            val fol = async { allPeople(PeopleKind.Following) }
            Quad(m.await(), cols.await(), states.await(), fol.await())
        }
        check(session)
        // `LocalPrefs` loads asynchronously (DataStore): sort/layout/episodes must be in memory first.
        s.localLoad?.join()
        check(session)
        loaded(LoadKey.Library)
        for (p in followed) register(p)
        s.following = followed.map { it.id }.toSet() + s.following
        val merged = HashMap<String, UserTitleState>(myStates)
        for ((id, st) in s.userTitles) merged.putIfAbsent(id, st)
        if (emptyLibrary) {
            s.collections = emptyList()
            s.userTitles = emptyMap()
        } else {
            s.collections = library.map { applyLocal(it) }
            registerAll(library.flatMap { it.embeddedTitles })
            s.userTitles = merged
            applyLocalEpisodes()
            lastUsedCollectionId = s.collections.firstOrNull { it.pinned }?.id
        }
        s.libraryLoaded = true
        // iOS `migrateLegacyCuration()`: no Android build ever kept curation on the device (see AppStoreLocalPrefs.kt).
        applyMe(account)
        hydrateTitles(libraryIds + listOfNotNull(account.featuredTitleId), LoadKey.Library)
        check(session)
        if (me.hexes.isEmpty()) me.featuredTitleId?.let { s.titles[it] }?.let { me = me.copy(hexes = it.palette) }
        if (!keepLoading) loadState = LoadState.Loaded
    } catch (err: Exception) {
        if (s !== session) {
            if (err is CancellationException) throw err
            return
        }
        if (err is CancellationException) {
            // The launch went away mid-way: never leave the skeleton up for good. The next appearance
            // starts over; meanwhile the tab shows Reintentar.
            didBootstrap = false
            if (phase == AppPhase.Main) {
                setLoadError(LoadKey.Library, KuraApiError.Server("cancelado"))
                loadState = LoadState.Failed
            }
            throw err
        }
        // The launch failed (offline, 5xx): Reintentar instead of a skeleton that never ends.
        val e = fail(LoadKey.Library, err)
        if (e == KuraApiError.Unauthorized) return
        if (loadError(LoadKey.Library) == null && e != null) setLoadError(LoadKey.Library, e)
        loadState = LoadState.Failed
    }
}

private data class Quad<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

/** `GET /collections/{id}` — the titles and your states for one collection. */
suspend fun AppStore.loadCollection(id: String, force: Boolean = false) {
    val cid = canonicalCollectionId(id)
    if ((!force && cid in s.loadedCollections) || s.pendingCollections.containsKey(cid)) return
    val session = s
    try {
        val d = api.collection(cid)
        check(session)
        loaded(LoadKey.Collection(cid))
        registerAll(d.titles)
        val states = s.userTitles.toMutableMap()
        for ((tid, st) in d.states) {
            if (s.inflightCount(tid) != 0) continue
            states[tid] = st.copy(watchedEpisodes = s.userTitles[tid]?.watchedEpisodes ?: emptySet())
        }
        s.userTitles = states
        val i = s.collections.indexOfFirst { it.id == cid }
        if (i >= 0) {
            val current = s.collections[i]
            var c = applyLocal(d.collection)
            // A pin / cover / order / rename still on its way wins over this (older) read.
            if (collectionWriteInFlight(cid)) {
                c = c.copy(
                    pinned = current.pinned, chosenCoverTitleId = current.chosenCoverTitleId, titleIds = current.titleIds,
                    name = current.name, vibe = current.vibe, privacy = current.privacy,
                )
            } else if (current.pinned != c.pinned && pinWriteInFlight) {
                c = c.copy(pinned = current.pinned)
            }
            val next = if (pendingRemovals(cid).isEmpty()) c else current.copy(
                name = c.name, vibe = c.vibe, privacy = c.privacy, pinned = c.pinned, chosenCoverTitleId = c.chosenCoverTitleId,
            )
            s.collections = s.collections.toMutableList().also { it[i] = next }
        } else {
            s.collections = s.collections + applyLocal(d.collection)
        }
        s.loadedCollections = s.loadedCollections + cid
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        val e = fail(LoadKey.Collection(cid), err)
        if (e == KuraApiError.NotFound) s.collections = s.collections.filter { it.id != cid }
    }
}

/** `GET /titles/{id}` — the full ficha: state, people you follow, reviews. */
suspend fun AppStore.loadTitle(id: String, force: Boolean = false) {
    if (ExternalRef.parse(id) != null) return
    if ((!force && id in s.loadedTitles) || id in s.loadingTitles) return
    s.loadingTitles = s.loadingTitles + id
    val session = s
    try {
        val d = api.title(id)
        check(session)
        loaded(LoadKey.TitleKey(id))
        setLoadError(LoadKey.MoreReviews(id), null)
        register(d.title)
        if (s.inflightCount(id) == 0) {
            val st = d.state
            if (st != null) {
                s.userTitles = s.userTitles + (id to st.copy(watchedEpisodes = s.userTitles[id]?.watchedEpisodes ?: emptySet()))
            } else if (!isSaved(id)) {
                s.userTitles = s.userTitles - id
            }
        }
        for (pm in d.following) pm.person?.let { register(it) }
        s.titleActivity = s.titleActivity + (id to d.following)
        for (r in d.reviews) r.author?.let { register(it) }
        // Your optimistic review survives a read that raced its write; the rest is the server's.
        val writing = s.inflightCount(id) > 0
        val kept = reviewList(id).filter { writing && it.authorId == me.id }
        val keptIds = kept.map { it.id }.toSet()
        setReviews(id, kept + d.reviews.filter { it.id !in keptIds })
        s.reviewCursors = d.reviewsCursor?.let { s.reviewCursors + (id to it) } ?: (s.reviewCursors - id)
        s.missingTitles = s.missingTitles - id
        s.loadedTitles = s.loadedTitles + id
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        val e = fail(LoadKey.TitleKey(id), err)
        if (e == KuraApiError.NotFound) s.missingTitles = s.missingTitles + id
    } finally {
        session.loadingTitles = session.loadingTitles - id
    }
}

/** "Más reseñas": `GET /titles/{id}/reviews?cursor=` after `reviewCursors[id]`. */
suspend fun AppStore.loadMoreReviews(id: String) {
    val cursor = s.reviewCursors[id] ?: return
    if (id in s.reviewsPaging) return
    s.reviewsPaging = s.reviewsPaging + id
    val session = s
    try {
        val page = api.moreReviews(id, cursor)
        check(session)
        loaded(LoadKey.MoreReviews(id))
        for (r in page.items) r.author?.let { register(it) }
        val known = reviewList(id).map { it.id }.toSet()
        setReviews(id, reviewList(id) + page.items.filter { it.id !in known })
        s.reviewCursors = page.nextCursor?.let { s.reviewCursors + (id to it) } ?: (s.reviewCursors - id)
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        when (fail(LoadKey.MoreReviews(id), err)) {
            // The title itself is gone: nothing more to page.
            KuraApiError.NotFound -> s.reviewCursors = s.reviewCursors - id
            is KuraApiError.Invalid -> {
                // The server rejected the cursor: retrying it would loop. Start over from the ficha.
                s.reviewCursors = s.reviewCursors - id
                setLoadError(LoadKey.MoreReviews(id), null)
                session.reviewsPaging = session.reviewsPaging - id
                loadTitle(id, force = true)
            }
            else -> Unit // keeps the button; the ficha says it failed
        }
    } finally {
        session.reviewsPaging = session.reviewsPaging - id
    }
}

/** Seeds a release day on a title that has none yet (summaries of "los más esperados"). */
private fun AppStore.seedRelease(titleId: String, releaseDate: Instant?) {
    val rd = releaseDate ?: return
    val t = s.titles[titleId] ?: return
    if (t.release != null) return
    s.titles = s.titles + (titleId to t.copy(release = Release.Day(KuraJson.dayAtNoon(rd))))
}

/** `GET /discover`. Nothing already in your library shows (re-checked against the library NOW, on load,
 *  not per render: saving from the page doesn't yank the tile out from under your thumb). */
suspend fun AppStore.loadDiscover(force: Boolean = false) {
    if ((!force && s.discover != null) || s.discoverLoading) return
    s.discoverLoading = true
    val session = s
    try {
        var d = api.discover()
        check(session)
        loaded(LoadKey.Discover)
        registerAll(d.allTitles)
        val mine = libraryIds
        d = d.copy(
            trending = d.trending.filter { it.title.id !in mine },
            upcoming = d.upcoming.filter { it.title.id !in mine },
            upcomingAlbums = d.upcomingAlbums.filter { it.title.id !in mine },
        )
        for (u in d.upcoming + d.upcomingAlbums) seedRelease(u.title.id, u.releaseDate)
        s.discover = d
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        fail(LoadKey.Discover, err)
    } finally {
        session.discoverLoading = false
    }
}

/** "lo nuevo de tus favoritos": `GET /discover/creators`, once per session, AFTER `/discover`. Fails
 *  silently: an error stores an empty payload, which hides the section. */
suspend fun AppStore.loadDiscoverCreators() {
    if (s.discoverCreators != null || s.discoverCreatorsLoading) return
    s.discoverCreatorsLoading = true
    val session = s
    try {
        var payload = try {
            api.discoverCreators()
        } catch (err: Exception) {
            if (err is CancellationException) throw err
            DiscoverCreatorsPayload()
        }
        if (s !== session) return
        registerAll(payload.items.map { it.title })
        val mine = libraryIds
        payload = payload.copy(items = payload.items.filter { it.title.id !in mine })
        for (i in payload.items) seedRelease(i.title.id, i.releaseDate)
        s.discoverCreators = payload
    } finally {
        session.discoverCreatorsLoading = false
    }
}

/** Descubrir por formato (2a–2c): `GET /discover/formats/{format}`, once per key per session. Fail-open:
 *  an error leaves an EMPTY shelf (the page words it), never a block. */
suspend fun AppStore.loadDiscoverFormat(format: MediaFormat, time: Int? = null) {
    val key = AppStore.formatKey(format, time)
    if (s.discoverFormats[key] != null) return
    val session = s
    var payload = try {
        api.discoverFormat(format, time)
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        DiscoverFormatPayload(format = format, time = time)
    }
    if (s !== session) return
    registerAll(payload.allTitles)
    val mine = libraryIds
    payload = payload.copy(titles = payload.titles.filter { it.title.id !in mine })
    s.discoverFormats = s.discoverFormats + (key to payload)
}

/** `GET /search` + `GET /people/search`, in parallel. Stale answers are dropped. */
suspend fun AppStore.runSearch(q: String, kind: MediaFormat? = null) {
    val query = q.trim()
    s.searchQuery = query
    if (query.isEmpty()) {
        s.searchResults = emptyList()
        s.searchPeople = emptyList()
        return
    }
    s.searchLoading = true
    s.searchError = null
    val session = s
    try {
        val (results, page) = coroutineScope {
            val t = async { api.search(query, kind) }
            val p = async { api.people(PeopleKind.Search(query), null) }
            t.await() to p.await()
        }
        check(session)
        if (s.searchQuery != query) return
        online()
        for (r in results) registerPartial(r.title)
        for (person in page.items) register(person)
        s.searchResults = results
        s.searchPeople = page.items
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session || s.searchQuery != query) return
        s.searchError = noteError(err)
        s.searchResults = emptyList()
        s.searchPeople = emptyList()
    } finally {
        if (session.searchQuery == query) session.searchLoading = false
    }
}

fun AppStore.clearSearch() {
    s.searchQuery = ""
    s.searchResults = emptyList()
    s.searchPeople = emptyList()
    s.searchError = null
    s.searchLoading = false
}

/** `GET /recap/months` then `GET /recap/{era}` (the newest by default). Each month loads on its own. */
suspend fun AppStore.loadRecap(era: String? = null) {
    if (era != null && s.recaps[era] != null) return
    val session = s
    try {
        if (s.recapMonths == null) {
            if (s.recapLoading) return
            s.recapLoading = true
            try {
                val months = api.recapMonths()
                check(session)
                s.recapMonths = months
            } finally {
                session.recapLoading = false
            }
        }
        loaded(LoadKey.Recap)
        val target = era ?: s.recapMonths?.firstOrNull()?.era ?: return
        if (s.recaps[target] != null || target in s.recapEraLoads) return
        s.recapEraLoads = s.recapEraLoads + target
        s.recapLoading = true
        try {
            val r = api.recap(target)
            check(session)
            loaded(LoadKey.Recap)
            r.top?.let { register(it) }
            registerAll(r.also)
            s.recaps = s.recaps + (target to r)
        } finally {
            session.recapEraLoads = session.recapEraLoads - target
            session.recapLoading = session.recapEraLoads.isNotEmpty()
        }
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        fail(LoadKey.Recap, err)
    }
}

val AppStore.currentRecap: RecapPayload? get() = s.recapMonths?.firstOrNull()?.let { s.recaps[it.era] }

/** Meses anteriores › a month: back to the recap under it, showing THAT month. */
fun AppStore.openRecapMonth(era: String) {
    val p = path(tab).toMutableList()
    while (true) {
        val last = p.lastOrNull() ?: break
        if (last is Route.RecapHistory) { p.removeAt(p.size - 1); continue }
        if (last is Route.Recap && last.era != null) { p.removeAt(p.size - 1); continue }
        break
    }
    val top = p.lastOrNull()
    if (!(top is Route.Recap && top.era == null)) p.add(Route.Recap())
    if (era != s.recapMonths?.firstOrNull()?.era) p.add(Route.Recap(era))
    paths = paths + (tab to p)
}

/** A month's recap (null = the newest). */
fun AppStore.recap(era: String?): RecapPayload? = if (era == null) currentRecap else s.recaps[era]

/** "recap de septiembre" once the months arrive; "tu recap" before; null when no month has activity. */
val AppStore.recapButtonLabel: String?
    get() {
        val months = s.recapMonths ?: return "tu recap"
        val m = months.firstOrNull() ?: return null
        return "recap de ${m.label.split(" ").firstOrNull() ?: ""}"
    }

/** `GET /recap/months` alone (the profile button); the month itself loads in the recap. */
suspend fun AppStore.loadRecapMonths() {
    if (s.recapMonths != null || s.recapLoading) return
    val session = s
    try {
        val months = api.recapMonths()
        check(session)
        s.recapMonths = months
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        noteError(err) // the button keeps "tu recap"; the recap screen has its own error state
    }
}
