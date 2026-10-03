package com.tromwey.kura.features.people

import com.tromwey.kura.designsystem.ActiveEffect
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.designsystem.components.BackChip
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowSize
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.MonoSegmented
import com.tromwey.kura.designsystem.components.NearViewport
import com.tromwey.kura.designsystem.components.WindowEnd
import com.tromwey.kura.designsystem.components.rememberWindow
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.followFromProfile
import com.tromwey.kura.state.isBlocked
import com.tromwey.kura.state.isFollowing
import com.tromwey.kura.state.loadMorePeople
import com.tromwey.kura.state.loadPeopleList
import com.tromwey.kura.state.loadPerson
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.state.push
import com.tromwey.kura.state.pop

/**
 * 20e · Seguidores / siguiendo (iOS `FollowersView`): whose people these are in Newsreader, the two
 * counts as a segmented control, Buscar, then "Que también sigues" and "Todos" — 72 rows with the
 * seal, the name, "@handle · N en común" and Seguir ↔ Siguiendo. Someone else's list comes a page at
 * a time (the end of the rows asks for the next), with the anonymous rest as a number ("y N personas
 * más", never who); when their setting keeps you out, the private profile's shape with the server's
 * words. The page wears the person's gradient, like their profile.
 */
@Composable
fun FollowersScreen(store: AppStore, route: Route.Followers) {
    val personId = route.handle
    val scope = rememberCoroutineScope()
    var showFollowing by rememberSaveable(personId) { mutableStateOf(route.showFollowing) }
    var query by rememberSaveable(personId) { mutableStateOf("") }
    val isMe = personId == store.me.id
    val p = store.person(personId)
    val key = AppStore.peopleListKey(personId, showFollowing)

    ActiveEffect(personId) { if (!isMe && p == null) store.loadPerson(personId) }
    ActiveEffect(key) { store.loadPeopleList(personId, showFollowing) }

    val followersCount = maxOf(p?.followers ?: 0, 0)
    val followingCount = if (isMe) maxOf(p?.followingCount ?: 0, store.following.size) else (p?.followingCount ?: 0)
    val loaded = store.peopleLists[key]
    // Your own lists come whole (no cursor, never denied) but still count who can't be listed.
    val meta = store.peopleListMeta[key]
    val anonymous = meta?.anonymous ?: 0
    val denied = meta?.denied
    val handle = p?.handle ?: personId
    val q = fold(query)
    // Searching someone else's list reads the pages that haven't come (the endpoint doesn't search):
    // after a pause in the typing, and at most `SEARCH_PAGES` per search SESSION (from the first
    // letter until the field is empty again — not per text, or every keystroke would reset the
    // count) — then "Seguir buscando".
    var searchPages by remember(key) { mutableIntStateOf(0) }
    LaunchedEffect(key, q.isEmpty()) { if (q.isEmpty()) searchPages = 0 }
    val searchCapped = q.isNotEmpty() && searchPages >= SEARCH_PAGES
    val list = (loaded ?: emptyList()).map { store.person(it.id) ?: it }.filter { it.id != store.me.id }
        .filter { q.isEmpty() || fold(it.handle).contains(q) || fold(it.name).contains(q) }
    val mutual = list.filter { store.isFollowing(it.id) }
    val rest = list.filter { !store.isFollowing(it.id) }
    // A locked or blocked profile stays `bg`, like the profile itself.
    val tint = when {
        isMe -> store.myProfileHexes
        p == null || store.isBlocked(p.id) || (p.isPrivate && !store.isFollowing(p.id)) -> emptyList()
        else -> store.profileHexes(p)
    }
    val first = if (isMe) "" else p?.let { firstName(it).lowercase() } ?: "@$handle"
    val title = when {
        isMe -> if (showFollowing) "a quién sigues" else "tus seguidores"
        else -> if (showFollowing) "a quién sigue $first" else "seguidores de $first"
    }

    // At least the gradient's span: a short list would end the gradient mid-screen.
    TintedPage(tint, minHeight = 900.dp) {
        Column(
            Modifier.fillMaxWidth().padding(top = KSize.chromeTop, start = 24.dp, end = 24.dp, bottom = 150.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            BackChip(onClick = { store.pop() })
            BasicText(title, Modifier.padding(top = 2.dp).semantics { heading() }, style = KuraType.screenTitle, maxLines = 2)
            MonoSegmented(
                listOf(false to "$followersCount ${if (followersCount == 1) "seguidor" else "seguidores"}", true to "$followingCount siguiendo"),
                selection = showFollowing,
                onSelect = { showFollowing = it },
                height = 40.dp,
            )
            if (denied == null) {
                KuraTextField(query, { query = it }, placeholder = "Buscar", clearable = true)
            }
            Column(Modifier.fillMaxWidth()) {
                val error = store.loadError(LoadKey.PeopleList(key))
                when {
                    loaded == null && error != null -> {
                        val (t, note) = error.loadCopy
                        LoadErrorBlock(t, note, onRetry = { scope.launch { store.loadPeopleList(personId, showFollowing) } },
                            modifier = Modifier.padding(top = 12.dp), titleSize = 24f)
                    }
                    loaded == null -> repeat(4) { RowSkeleton() }
                    denied != null -> PrivateListNote(denied, showFollowing, Modifier.padding(top = 12.dp))
                    // Searching a list that hasn't all arrived: "nobody" can only be said once the last
                    // page is in (the rest keeps coming below, and may still bring the name).
                    list.isEmpty() && q.isNotEmpty() && meta?.nextCursor == null -> Note("Nadie con ese nombre.")
                    list.isEmpty() && q.isNotEmpty() && searchCapped -> Note("No aparece en lo que ya se cargó de la lista.")
                    list.isEmpty() && q.isNotEmpty() -> Note("Buscando en el resto de la lista…")
                    list.isEmpty() && !isMe && anonymous == 0 ->
                        Note(if (showFollowing) "@$handle todavía no sigue a nadie." else "Todavía nadie sigue a @$handle.")
                    list.isEmpty() && isMe && anonymous == 0 ->
                        Note(if (showFollowing) "Todavía no sigues a nadie." else "Todavía nadie te sigue.")
                }
                // Windowed (`Windowed.kt`) across both groups: the first page of rows, growing with the scroll.
                val window = rememberWindow(mutual + rest)
                val shownMutual = window.visible.take(mutual.size)
                val shownRest = window.visible.drop(mutual.size)
                if (shownMutual.isNotEmpty()) {
                    MonoLabel("Que también sigues", Modifier.padding(top = 8.dp, bottom = 4.dp), tracking = 0.1f, color = KColor.text3)
                    shownMutual.forEach { key(it.id) { PersonListRow(store, it) } }
                }
                if (shownRest.isNotEmpty()) {
                    MonoLabel("Todos", Modifier.padding(top = 16.dp, bottom = 4.dp), tracking = 0.1f, color = KColor.text3)
                    shownRest.forEach { key(it.id) { PersonListRow(store, it) } }
                }
                WindowEnd(window)
                if (window.hasMore) {
                    // More rows of what's already here come first; the server's next page after them.
                } else if (meta?.nextCursor != null) {
                    val moreError = store.loadError(LoadKey.PeopleMore(personId, showFollowing))
                    if (moreError != null) {
                        // The next page failed: say so and let it be asked again, instead of a
                        // skeleton that would wait forever.
                        RetryStrip(
                            "No se cargó el resto.",
                            onRetry = { scope.launch { store.loadMorePeople(personId, showFollowing) } },
                            Modifier.padding(top = 12.dp),
                            offline = moreError == KuraApiError.Offline,
                        )
                    } else {
                        // The end of the rows asks for the next page (one at a time) as it nears the screen —
                        // or right away while searching: the name may be on a page that hasn't come.
                        if (searchCapped) {
                            KuraTextButton("Seguir buscando", onClick = { searchPages = 0 }, color = KColor.text2)
                        } else {
                            RowSkeleton()
                        }
                        if (searchCapped) {
                            // Waits for "Seguir buscando".
                        } else if (q.isNotEmpty()) {
                            // Keyed by the text AND the cursor: every keystroke restarts the wait (a real
                            // debounce from the last one), and a page that landed asks for the next.
                            // The read runs on the store's scope — typing must not cancel it midway.
                            LaunchedEffect(key, q, meta.nextCursor) {
                                delay(SEARCH_DEBOUNCE_MS)
                                if (store.peopleListMeta[key]?.loadingMore == true) return@LaunchedEffect
                                searchPages += 1
                                store.launch { store.loadMorePeople(personId, showFollowing) }
                            }
                        } else {
                            key(meta.nextCursor) { NearViewport { scope.launch { store.loadMorePeople(personId, showFollowing) } } }
                        }
                    }
                } else if (anonymous > 0 && q.isEmpty() && denied == null) {
                    // Private accounts, no public handle, a block with you: a number, never who (your
                    // own lists too: the server's `privateCount`).
                    BasicText(
                        if (anonymous == 1) "y 1 persona más" else "y $anonymous personas más",
                        Modifier.padding(top = if (list.isEmpty()) 12.dp else 16.dp),
                        style = KuraType.ui(14f).copy(color = KColor.text3),
                    )
                }
            }
        }
    }
}

/** Pages one search may pull by itself before asking ("Seguir buscando"). */
private const val SEARCH_PAGES = 5
private const val SEARCH_DEBOUNCE_MS = 350L

@Composable
private fun Note(text: String) {
    BasicText(text, Modifier.padding(top = 12.dp), style = KuraType.ui(15f).copy(color = KColor.text2))
}

/** One person: seal 48, name, "@handle · N en común", Seguir ↔ Siguiendo (tonal: the list has no honey). */
@Composable
internal fun PersonListRow(store: AppStore, p: Person) {
    val f = store.isFollowing(p.id)
    val n = p.common.size
    // A row that came from a list is the lite shape: it never carries `common`, so "nada en común"
    // can only be said of a profile that was read whole.
    val commonKnown = n > 0 || p.id in store.loadedPeople
    // A followed profile that went private (`isPrivate` on your own lists): dimmed, like the web.
    val dimmed = p.isPrivate && f
    Row(
        Modifier.fillMaxWidth().heightIn(min = KSize.rowPeople).alpha(if (dimmed) 0.5f else 1f)
            .kPressable(feel = KPressFeel.Row(inset = (-10).dp), enabled = !dimmed, onClickLabel = "Ver el perfil de @${p.handle}") {
                store.push(Route.PersonRoute(p.id))
            },
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Seal(p.initials, p.hexes, size = 48.dp, photo = p.photo)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            BasicText(p.name, style = KuraType.ui(16f, UiWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
            BasicText(
                when {
                    !commonKnown -> "@${p.handle}"
                    n == 0 -> "@${p.handle} · nada en común aún"
                    else -> "@${p.handle} · $n en común"
                },
                style = KuraType.mono(11f).copy(color = KColor.text2),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        FollowButton(
            when {
                f -> FollowState.Following
                p.id in store.requested -> FollowState.Requested
                else -> FollowState.Follow
            },
            onClick = { store.followFromProfile(p.id) },
            size = FollowSize.List,
            handle = p.handle,
        )
    }
}

@Composable
internal fun RowSkeleton(seal: Int = 48) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = KSize.rowPeople).clearAndSetSemantics { contentDescription = "Cargando" },
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Skeleton(Modifier.size(seal.dp), radius = 999.dp)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Skeleton(Modifier.width(140.dp).heightIn(min = 14.dp, max = 14.dp), radius = 6.dp)
            Skeleton(Modifier.width(90.dp).heightIn(min = 10.dp, max = 10.dp), radius = 5.dp)
        }
    }
}

/** A list its owner keeps closed to you: the private profile's shape — lock, a Newsreader line, the
 *  server's words under it — not a loose line over an empty page. */
@Composable
private fun PrivateListNote(note: String, following: Boolean, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        LockTile(Modifier.padding(bottom = 6.dp))
        BasicText(
            if (following) "a quién sigue es privado" else "sus seguidores son privados",
            Modifier.semantics { heading() },
            style = KuraType.news(24f),
        )
        BasicText(note, style = KuraType.ui(15f).copy(color = KColor.text2))
        BasicText("Los números de arriba se ven siempre.", style = KuraType.ui(13f).copy(color = KColor.text3))
    }
}

