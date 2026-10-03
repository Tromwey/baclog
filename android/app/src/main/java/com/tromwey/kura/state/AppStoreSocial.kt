package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Creator
import com.tromwey.kura.data.models.FeedBursts
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FeedKind
import com.tromwey.kura.data.models.FollowListsVisibility
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.PeopleKind
import com.tromwey.kura.data.models.PeopleMark
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.RequestState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.Duration

// Follow, mute, people and the feed: its reads (`loadFeed`, `loadPerson`, `loadPeopleList`…), the
// follow write and what the feed shows — twin of `AppStore+Social.swift`.

/** `GET /feed` + `GET /feed/suggestion`. */
suspend fun AppStore.loadFeed(force: Boolean = false) {
    if ((!force && s.feedLoaded) || s.feedLoading) return
    s.feedLoading = true
    setLoadError(LoadKey.Feed, null)
    val session = s
    try {
        val (first, suggestion) = coroutineScope {
            val page = async { api.feed(null) }
            // The suggestion is an extra: its failure is "no suggestion", never a feed that doesn't load.
            val sug = async {
                try {
                    api.feedSuggestion()
                } catch (e: Exception) {
                    if (e is CancellationException || e == KuraApiError.Unauthorized) throw e
                    null
                }
            }
            page.await() to sug.await()
        }
        check(session)
        var events = FeedBursts.append(first.items.map { ingest(it) }, emptyList())
        s.feedCursor = first.nextCursor
        if (suggestion != null) {
            events = events.toMutableList().also { it.add(minOf(3, it.size), ingest(suggestion)) }
        }
        loaded(LoadKey.Feed)
        setLoadError(LoadKey.FeedMore, null)
        val ids = ArrayList<String>()
        for (e in events) {
            e.titleId?.let(ids::add)
            when (val k = e.kind) {
                is FeedKind.Burst -> ids += k.titleIds
                is FeedKind.Suggestion -> ids += k.titleIds
                else -> Unit
            }
        }
        hydrateTitles(ids, LoadKey.Feed)
        check(session)
        s.feed = events
        s.feedLoaded = true
        s.feedFollowingKey = s.following
        s.feedDirty = false
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        fail(LoadKey.Feed, err)
    } finally {
        session.feedLoading = false
    }
    // Page 1 can be all muted / blocked people: "todo en calma" would be a guess while there are more
    // pages — ask on (one `loadMoreFeed`, with its own cap) before the screen says the feed is quiet.
    if (s === session && s.feedLoaded && s.feedCursor != null && visibleFeed.isEmpty()) loadMoreFeed()
}

/** At most this many pages per `loadMoreFeed` call, until something visible arrives. */
private const val MAX_FEED_PAGES_PER_CALL = 3

/**
 * Next page when the stack nears its end. A failure doesn't retry on its own: the end of the stack
 * offers Reintentar (`retry = true`). A page can bring nothing you'd see (muted, blocked, folded into
 * the last burst): then one call keeps paging, up to `MAX_FEED_PAGES_PER_CALL`.
 */
suspend fun AppStore.loadMoreFeed(retry: Boolean = false) {
    if (s.feedCursor == null || s.feedLoading) return
    if (!retry && loadError(LoadKey.FeedMore) != null) return
    s.feedLoading = true
    val session = s
    try {
        var pages = 0
        while (pages < MAX_FEED_PAGES_PER_CALL) {
            val cursor = s.feedCursor ?: return
            pages += 1
            try {
                val page = api.feed(cursor)
                check(session)
                loaded(LoadKey.FeedMore)
                val events = page.items.map { ingest(it) }
                s.feedCursor = page.nextCursor
                hydrateTitles(events.mapNotNull { it.titleId }, LoadKey.FeedMore)
                check(session)
                val known = s.feed.map { it.id }.toSet()
                val fresh = events.filter { it.id !in known }
                val before = s.feed.size
                s.feed = FeedBursts.append(fresh, s.feed)
                // Only a NEW visible card ends the loop.
                if (s.feed.drop(before).any { isVisible(it) }) return
            } catch (err: Exception) {
                if (err is CancellationException) throw err
                if (s !== session) return
                fail(LoadKey.FeedMore, err)
                return
            }
        }
    } finally {
        session.feedLoading = false
    }
}

/** Registers what the event embeds and derives the display fields. */
private fun AppStore.ingest(event: FeedEvent): FeedEvent {
    var e = event
    e.embeddedTitle?.let { register(it) }
    e.embeddedAuthor?.let { register(it) }
    e.embeddedReview?.let { r -> if (review(r.id) == null) setReviews(r.titleId, reviewList(r.titleId) + r) }
    e.at?.let { at -> e = e.copy(ageHours = maxOf(0.0, Duration.between(at, now).toMillis() / 3_600_000.0)) }
    val k = e.kind
    val rd = e.releaseDate
    if (k is FeedKind.Added && rd != null && rd > now) {
        e = e.copy(kind = FeedKind.WaitingAdd(k.collection, sentence(Release.Day(KuraJson.dayAtNoon(rd)))))
    }
    return e
}

/** `GET /people/{handle}` (404 for private and nonexistent alike). */
suspend fun AppStore.loadPerson(handle: String, force: Boolean = false) {
    if (handle == me.id || (!force && handle in s.loadedPeople) || handle in s.loadingPeople) return
    s.loadingPeople = s.loadingPeople + handle
    val session = s
    try {
        val p = api.person(handle)
        check(session)
        loaded(LoadKey.PersonKey(handle))
        register(p)
        // Only this read says whether you blocked them; every other payload is silent.
        s.blocked = if (p.isBlocked) s.blocked + handle else s.blocked - handle
        hydrateTitles(p.obsessions + p.common + p.collections.flatMap { it.titleIds } + listOfNotNull(p.featuredTitleId),
            LoadKey.PersonKey(handle))
        check(session)
        s.missingPeople = s.missingPeople - handle
        s.loadedPeople = s.loadedPeople + handle
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        val e = fail(LoadKey.PersonKey(handle), err)
        if (e == KuraApiError.NotFound) s.missingPeople = s.missingPeople + handle
    } finally {
        session.loadingPeople = session.loadingPeople - handle
    }
}

/** `GET /people/{handle}/collections/{id}` — read-only, 404 for private and nonexistent alike. The
 *  owner's `states` stay with the collection; they never touch your `userTitles`. */
suspend fun AppStore.loadPublicCollection(handle: String, id: String, force: Boolean = false) {
    val key = AppStore.publicKey(handle, id)
    if (!force && s.publicCollections[key] != null) return
    val session = s
    try {
        val d = api.personCollection(handle, id)
        check(session)
        loaded(LoadKey.PublicCollection(key))
        registerAll(d.titles)
        s.missingPublicCollections = s.missingPublicCollections - key
        s.publicCollections = s.publicCollections + (key to d)
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        val e = fail(LoadKey.PublicCollection(key), err)
        if (e == KuraApiError.NotFound) {
            s.missingPublicCollections = s.missingPublicCollections + key
            s.publicCollections = s.publicCollections - key
        }
    }
}

/** Upper bound for walking one of your own lists: 30 per page, so 1 500 people. */
private const val MAX_PEOPLE_PAGES = 50

/** Every page of one of YOUR lists (`GET /me/following` · `/me/followers`), until `nextCursor` is null. */
suspend fun AppStore.allPeople(kind: PeopleKind): List<Person> = allPeoplePages(kind).first

/** `allPeople` plus page 1's `privateCount` (the ones without a public handle, as a number). */
private suspend fun AppStore.allPeoplePages(kind: PeopleKind): Pair<List<Person>, Int> {
    val out = ArrayList<Person>()
    val seen = HashSet<String>()
    var cursor: String? = null
    var hidden = 0
    repeat(MAX_PEOPLE_PAGES) { i ->
        val page = api.people(kind, cursor)
        if (i == 0) hidden = page.privateCount
        for (p in page.items) if (seen.add(p.id)) out.add(p)
        val next = page.nextCursor
        if (next == null || next == cursor) return out to hidden
        cursor = next
    }
    return out to hidden
}

private fun AppStore.setPeopleList(key: String, list: List<Person>, meta: PeopleListMeta? = null) {
    if (meta != null) s.peopleListMeta = s.peopleListMeta + (key to meta)
    s.peopleLists = s.peopleLists + (key to list)
}

/**
 * Followers / following of someone. YOUR lists come whole (`allPeople`); someone else's come a page at a
 * time from `GET /people/{handle}/followers|following`, by THEIR `followListsVisibility`. `canSeeFollowLists
 * == false` asks nothing; a 403 `lists_private` lands in the same place; a 404 says the list isn't
 * available — identical for every cause.
 */
suspend fun AppStore.loadPeopleList(personId: String, following: Boolean) {
    val key = AppStore.peopleListKey(personId, following)
    if (s.peopleLists[key] != null) return
    val session = s
    val theirs = personId != me.id
    if (theirs) {
        val p = person(personId)
        if (p != null && (p.canSeeFollowLists == false || isBlocked(personId))) {
            setPeopleList(key, emptyList(), PeopleListMeta(denied = (p.followListsVisibility ?: FollowListsVisibility.Private).deniedNote))
            return
        }
    }
    try {
        val items: List<Person>
        if (theirs) {
            val page = api.people(if (following) PeopleKind.FollowingOf(personId) else PeopleKind.FollowersOf(personId), null)
            check(session)
            items = page.items
            s.peopleListMeta = s.peopleListMeta + (key to PeopleListMeta(nextCursor = page.nextCursor, anonymous = page.anonymousCount))
        } else {
            val (all, hidden) = allPeoplePages(if (following) PeopleKind.Following else PeopleKind.Followers)
            check(session)
            items = all
            s.peopleListMeta = s.peopleListMeta + (key to PeopleListMeta(anonymous = hidden))
            if (following) s.following = s.following + items.map { it.id }
        }
        loaded(LoadKey.PeopleList(key))
        for (p in items) register(p)
        setPeopleList(key, items)
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        when {
            err is KuraApiError.Forbidden && err.code == "lists_private" -> {
                loaded(LoadKey.PeopleList(key))
                val v = person(personId)?.followListsVisibility ?: FollowListsVisibility.Private
                setPeopleList(key, emptyList(), PeopleListMeta(denied = v.deniedNote))
            }
            err == KuraApiError.NotFound -> {
                loaded(LoadKey.PeopleList(key))
                setPeopleList(key, emptyList(), PeopleListMeta(denied = "Esta lista no está disponible."))
            }
            else -> fail(LoadKey.PeopleList(key), err)
        }
    }
}

/** The next page of someone else's list (the rows' end reached it). One at a time. */
suspend fun AppStore.loadMorePeople(personId: String, following: Boolean) {
    val key = AppStore.peopleListKey(personId, following)
    val meta = s.peopleListMeta[key] ?: return
    val cursor = meta.nextCursor ?: return
    if (meta.loadingMore) return
    val session = s
    val errorKey = LoadKey.PeopleMore(personId, following)
    // A retry clears the strip at once (the rows' end shows it's loading again).
    setLoadError(errorKey, null)
    s.peopleListMeta = s.peopleListMeta + (key to meta.copy(loadingMore = true))
    try {
        val page = api.people(if (following) PeopleKind.FollowingOf(personId) else PeopleKind.FollowersOf(personId), cursor)
        check(session)
        loaded(errorKey)
        for (p in page.items) register(p)
        val list = s.peopleLists[key] ?: emptyList()
        val seen = list.map { it.id }.toSet()
        s.peopleLists = s.peopleLists + (key to list + page.items.filter { it.id !in seen })
        // A server that hands back the same cursor would loop: stop there.
        val next = if (page.nextCursor == cursor) null else page.nextCursor
        s.peopleListMeta[key]?.let { m -> s.peopleListMeta = s.peopleListMeta + (key to m.copy(nextCursor = next, loadingMore = false)) }
    } catch (err: Exception) {
        if (s === session) {
            s.peopleListMeta[key]?.let { m -> s.peopleListMeta = s.peopleListMeta + (key to m.copy(loadingMore = false)) }
        }
        if (err is CancellationException) throw err
        if (s !== session) return
        // The list says it stopped short (`RetryStrip`) instead of just ending there.
        fail(errorKey, err)
    }
}

// MARK: Social

fun AppStore.isFollowing(id: String): Boolean = id in following

fun AppStore.toggleFollow(id: String) {
    haptic(StoreHaptic.Tap)
    setFollow(id, id !in following)
}

/** Followed people who did something with this title, filtered by `following` NOW (an unfollow takes
 *  the person out of "gente que sigues" at once, and a Deshacer puts them back). */
fun AppStore.followedMarks(titleId: String): List<Pair<Person, PeopleMark>> =
    (titleActivity[titleId] ?: emptyList()).mapNotNull { pm ->
        if (pm.personId !in following) return@mapNotNull null
        val p = people[pm.personId] ?: return@mapNotNull null
        p to pm
    }

/**
 * Follow from a profile: public → follow; private → "Solicitado" (⚠️ solo mock / no-op en live: nunca
 * llama a la API; el servidor solo deja seguir perfiles públicos y no hay modelo de solicitudes).
 * Tapping Siguiendo unfollows at once with Deshacer (no confirmation).
 */
fun AppStore.followFromProfile(id: String) {
    val p = people[id] ?: return
    if (id in blocked) return
    when {
        id in following -> {
            setFollow(id, false)
            undoToast("Dejaste de seguir a @${p.handle}") { setFollow(id, true) }
        }
        p.isPrivate -> {
            s.requested = if (id in s.requested) s.requested - id else s.requested + id
            haptic(StoreHaptic.Tap)
        }
        else -> toggleFollow(id)
    }
}

/**
 * The one follow write: optimistic (`following`, `people[id].isFollowing` and `.followers`, your count),
 * then `PUT/DELETE /me/following/{handle}` in order per handle. A failure puts it all back — unless a
 * later tap already changed it again. 404 = the profile isn't there; anything retryable offers Reintentar.
 */
private fun AppStore.setFollow(id: String, on: Boolean) {
    if ((id in following) == on) return
    val session = s
    val key = AppStore.WriteKey.follow(id)
    session.beginWrite(key, id in following)
    applyFollow(id, on)
    sync(key = key, onError = err@{ e ->
        // Back to what the SERVER last confirmed (not to the tap before this one) — unless a newer
        // follow write is queued (that one decides) or the phone no longer shows this one.
        val base = session.endWrite(key)
        // The session this follow belonged to is gone (a 401 → `sessionExpired`): `following` is now
        // the next account's, and a revert here would put this person in it.
        if (s !== session) return@err true
        val newer = base?.newer == true || session.writeChains[session.canonicalWriteKey(key)] != null
        if (newer || (id in following) != on) return@err true
        val confirmed = base?.value as? Boolean ?: !on
        if ((id in following) != confirmed) applyFollow(id, confirmed)
        // The server already has what was asked (follow → unfollow, both lost): nothing to retry.
        if (confirmed == on) return@err true
        when (e) {
            KuraApiError.Unauthorized -> Unit
            KuraApiError.NotFound -> showToast(ToastModel("Ese perfil no existe o es privado", ToastModel.Kind.Info))
            else -> {
                val who = person(id)?.let { "@${it.handle}" } ?: "este perfil"
                val text = e.toast(if (on) "No se pudo seguir a $who" else "No se pudo dejar de seguir a $who")
                retryToast(text, key) {
                    dismissToast()
                    setFollow(id, on)
                }
            }
        }
        true
    }) { api ->
        api.setFollowing(id, on)
        session.confirmWrite(key, on)
        session.endWrite(key)
    }
}

private fun AppStore.applyFollow(id: String, on: Boolean) {
    s.following = if (on) s.following + id else s.following - id
    // Their follower count moves with it (and back on a revert); the next profile read brings the truth.
    s.people[id]?.let { p ->
        s.people = s.people + (id to p.copy(isFollowing = on, followers = maxOf(0, p.followers + if (on) 1 else -1)))
    }
    me = me.copy(followingCount = maxOf(0, me.followingCount + if (on) 1 else -1))
}

fun AppStore.toggleMute(id: String) {
    val p = people[id] ?: return
    val nowMuted = id !in muted
    s.muted = if (nowMuted) s.muted + id else s.muted - id
    saveLocal()
    undoToast(if (nowMuted) "@${p.handle} ya no sale en tu feed" else "@${p.handle} vuelve a tu feed") {
        s.muted = if (nowMuted) s.muted - id else s.muted + id
        saveLocal()
    }
}

fun AppStore.creator(name: String): Creator {
    val works = catalogOrder.mapNotNull { titles[it] }.filter { it.creator == name }
    val isMusic = works.any { it.format == MediaFormat.Album }
    return Creator(name, if (isMusic) "artista" else "director", maxOf(works.size, 1))
}

/** Visible feed: nobody you muted or blocked. */
val AppStore.visibleFeed: List<FeedEvent> get() = feed.filter { isVisible(it) }

private fun AppStore.isVisible(e: FeedEvent): Boolean {
    if (e.authorId in muted || e.authorId in blocked) return false
    val k = e.kind
    if (k is FeedKind.Suggestion && k.personId in blocked) return false
    return true
}

/** ⚠️ Solo mock / no-op en live: aprobar o rechazar una solicitud (31a) solo cambia `requestStates` en
 *  memoria — no hay solicitudes en el servidor y en live `notifications` está siempre vacía. */
fun AppStore.setRequest(notificationId: String, state: RequestState) {
    s.requestStates = s.requestStates + (notificationId to state)
    haptic(StoreHaptic.Tap)
}

/** ⚠️ Solo mock / no-op en live: marca leídas las notificaciones locales; nada se avisa al servidor. */
fun AppStore.markNotificationsRead() {
    s.notifications = s.notifications.map { it.copy(unread = false) }
}

val AppStore.hasUnread: Boolean get() = notifications.any { it.unread }
