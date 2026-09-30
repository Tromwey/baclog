package com.tromwey.kura.features.people

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.photo
import com.tromwey.kura.app.reaction
import com.tromwey.kura.data.models.FanOrder
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.PersonCollection
import com.tromwey.kura.data.models.PersonStats
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.PublicLinks
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Newsreader
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.BackChip
import com.tromwey.kura.designsystem.components.ChipRow
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FanHeader
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowSize
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.Masonry
import com.tromwey.kura.designsystem.components.MasonryBadge
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.SaveChip
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.SealSize
import com.tromwey.kura.designsystem.components.SectionTitle
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.VibeLine
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.count
import com.tromwey.kura.state.creator
import com.tromwey.kura.state.followFromProfile
import com.tromwey.kura.state.followedMarks
import com.tromwey.kura.state.isBlocked
import com.tromwey.kura.state.isFollowing
import com.tromwey.kura.state.loadPerson
import com.tromwey.kura.state.loadPublicCollection
import com.tromwey.kura.state.unblock
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.state.SheetRoute
import kotlinx.coroutines.launch

// Gente: someone else's profile (20a · 20d privado · 35d solicitado · bloqueado), their public
// collection, a creator (O7) and your profile as a stranger sees it (K1d / K1e) — twins of iOS
// `PersonProfileView`, `PublicCollectionView`, `CreatorView` and `ProfileAsStrangerView`. The
// seguidores page lives in FollowersScreen.kt; the safety sheets and Cuentas bloqueadas in
// SafetySheets.kt.

/** 20a · Perfil de otra persona. Private and nonexistent are the same 404: never say which. */
@Composable
fun PersonScreen(store: AppStore, route: Route.PersonRoute) {
    val handle = route.handle
    val scope = rememberCoroutineScope()
    LaunchedEffect(handle) { store.loadPerson(handle) }
    val error = store.loadError(LoadKey.PersonKey(handle))
    // A card from a list or the feed is LITE (no counts, no collections, maybe no follow state): the
    // profile waits for its own read instead of flashing "0 seguidores · Seguir". Only a failed read
    // falls back to what we have, with its RetryStrip.
    val complete = handle in store.loadedPeople || handle == store.me.id || error != null
    ResourceScreen(
        value = if (complete) store.person(handle) else null,
        missing = handle in store.missingPeople,
        error = error,
        onRetry = { scope.launch { store.loadPerson(handle, force = true) } },
        onBack = { store.pop() },
        gone = "@$handle no está disponible." to "El perfil es privado o ya no existe.",
        square = true,
    ) { p -> PersonProfile(store, p, preview = false) }
}

/**
 * The profile page itself. [preview] = "Así te ven": nothing is loaded, the chips and Seguir are
 * pictures (nothing to act on), the collections open nothing.
 */
@Composable
internal fun PersonProfile(store: AppStore, p: Person, preview: Boolean) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val following = !preview && store.isFollowing(p.id)
    val blocked = !preview && store.isBlocked(p.id)
    val locked = blocked || (p.isPrivate && !following)
    val tint = if (locked) emptyList() else store.profileHexes(p)
    val error = if (preview) null else store.loadError(LoadKey.PersonKey(p.id))

    TintedPage(tint) {
        // Header
        Column(
            Modifier.fillMaxWidth().padding(top = KSize.chromeTop, start = 24.dp, end = 24.dp, bottom = 34.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BackChip(onClick = { store.pop() }, modifier = Modifier.padding(start = 0.dp))
                Spacer(Modifier.weight(1f))
                if (preview) {
                    MonoLabel("vista previa")
                } else {
                    // Someone else's profile we can open is public: its link is live.
                    PublicLinks.profile(p.handle)?.let { link ->
                        IconChip44(KIcon.Share, "Compartir perfil", { shareLink(context, link, "@${p.handle}") }, fill = KColor.glassBg)
                    }
                    IconChip44(KIcon.More, "Opciones", { store.present(SheetRoute.PersonOptions(p.id)) }, fill = KColor.glassBg)
                }
            }
            Seal(p.initials, p.hexes, size = SealSize.profile, photo = p.photo)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                BasicText(p.name, Modifier.semantics { heading() }, style = KuraType.profile)
                BasicText("@${p.handle}", style = KuraType.mono(12f).copy(color = KColor.text2))
                // The counts are public and always open their page, where the owner's setting decides
                // between the list and a note. A preview and a profile you blocked draw them as text.
                FollowCounts(
                    p.followers, p.followingCount,
                    interactive = !preview && !blocked,
                    onFollowers = { store.push(Route.Followers(p.id, showFollowing = false)) },
                    onFollowing = { store.push(Route.Followers(p.id, showFollowing = true)) },
                )
            }
            if (!locked) StatRibbon(p.stats.obsessed, p.stats.completed, p.stats.liked, p.stats.reviews)
            if (blocked) {
                var busy by remember { mutableStateOf(false) }
                GlassButton(
                    if (busy) "Desbloqueando…" else "Desbloquear",
                    onClick = {
                        if (!busy) {
                            busy = true
                            scope.launch {
                                store.unblock(p.handle, p.handle)
                                busy = false
                            }
                        }
                    },
                    modifier = Modifier.semantics { contentDescription = if (busy) "Desbloqueando" else "Desbloquear a @${p.handle}" },
                    height = 48.dp,
                    fontSize = 16f,
                    enabled = !busy,
                )
            } else {
                // Seguir is the screen's one honey accent.
                val state = when {
                    following -> FollowState.Following
                    !preview && p.id in store.requested -> FollowState.Requested
                    else -> FollowState.Follow
                }
                FollowButton(state, onClick = { if (!preview) store.followFromProfile(p.id) }, size = FollowSize.Hero, honey = true, handle = p.handle)
            }
        }
        if (error != null) {
            // What's on screen came from a list (counts 0, no collections): say it's partial.
            RetryStrip(
                if (error == KuraApiError.Offline) error.loadCopy.first.replaceFirstChar { it.uppercase() } else "No se pudo cargar todo el perfil.",
                onRetry = { scope.launch { store.loadPerson(p.id, force = true) } },
                modifier = Modifier.padding(horizontal = 12.dp).padding(bottom = 12.dp),
                offline = error == KuraApiError.Offline,
            )
        }
        when {
            blocked -> BlockedNote(p.handle, Modifier.padding(top = 4.dp))
            locked -> LockedCollections(firstName(p), Modifier.padding(top = 10.dp))
            else -> PersonBody(store, p, preview, Modifier.padding(top = 8.dp))
        }
        Spacer(Modifier.heightIn(min = 150.dp))
    }
}

@Composable
private fun PersonBody(store: AppStore, p: Person, preview: Boolean, modifier: Modifier) {
    val context = LocalContext.current
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(30.dp)) {
        val common = p.common.mapNotNull { store.title(it) }
        if (common.isNotEmpty() && store.showCommon) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp)
                    .background(KColor.s1, RoundedCornerShape(KRadius.screen))
                    .padding(vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    MonoLabel("En común contigo · ${p.common.size} ${if (p.common.size == 1) "título" else "títulos"}", tracking = 0.1f)
                    val shared = p.obsessions.firstOrNull { store.mark(it) == Mark.Obsessed }?.let { store.title(it) }
                    if (shared != null) {
                        BasicText(
                            buildAnnotatedString {
                                append("Comparten la obsesión por ")
                                withStyle(SpanStyle(fontFamily = Newsreader, fontStyle = FontStyle.Italic, fontSize = 17.sp)) { append(shared.name) }
                                append(".")
                            },
                            style = KuraType.ui(15f),
                        )
                    }
                }
                CoverStrip(common, 72.dp, radius = KRadius.coverS, onOpen = { store.push(Route.TitleRoute(it.id)) })
            }
        }

        val obs = p.obsessions.mapNotNull { store.title(it) }
        if (obs.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                SectionTitle("le obsesiona", Modifier.padding(horizontal = 20.dp))
                CoverStrip(obs, 150.dp, onOpen = { if (!preview) store.push(Route.TitleRoute(it.id)) })
            }
        }

        // Only the collections the owner put on their profile (no followers-only visibility).
        val visible = p.collections.filter { it.privacy == Privacy.PublicAccess }
        if (visible.isNotEmpty()) {
            CollectionsShowcase(
                "colecciones",
                visible.map { pc -> showcaseItem(store, pc, p, preview) },
                onShare = { item -> item.shareLink?.let { shareLink(context, it, item.name) } },
            )
        }
    }
}

private fun showcaseItem(store: AppStore, pc: PersonCollection, owner: Person, preview: Boolean) = ShowcaseItem(
    id = pc.routeId,
    name = pc.name,
    vibe = pc.shownVibe,
    count = pc.titleIds.size,
    pinned = pc.pinned,
    fan = store.fan(pc),
    open = if (preview) null else ({ store.push(Route.PublicCollection(owner.handle, pc.routeId)) }),
    shareLink = if (preview) null else pc.remoteId?.let { PublicLinks.collection(owner.handle, it) },
)

/**
 * 4a · someone else's public collection, read-only: the page in its fan's gradient, the fan at 225,
 * "una colección de @handle", the name, its line, "N títulos · cine, música", then the titles in
 * columns with the OWNER's marks. Tap → ficha (the cover travels); hold → Guardar en (YOUR library).
 * 404 (private or gone, never which) → the "no está disponible" shape.
 */
@Composable
fun PublicCollectionScreen(store: AppStore, route: Route.PublicCollection) {
    val key = AppStore.publicKey(route.handle, route.id)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    LaunchedEffect(key) { store.loadPublicCollection(route.handle, route.id) }
    ResourceScreen(
        value = store.publicCollections[key],
        missing = key in store.missingPublicCollections,
        error = store.loadError(LoadKey.PublicCollection(key)),
        onRetry = { scope.launch { store.loadPublicCollection(route.handle, route.id, force = true) } },
        onBack = { store.pop() },
        gone = "esta colección no está disponible." to "Es privada o ya no existe.",
    ) { d ->
        val c = d.collection
        val all = c.titleIds.mapNotNull { store.title(it) }
        // Someone else's: the server's fan is the truth (their chosen cover may not travel).
        val fanIds = c.fanTitleIds.ifEmpty { FanOrder.fan(c.titleIds, c.chosenCoverTitleId) }
        val fan = fanIds.mapNotNull { store.title(it) }
        val tint = AppStore.fanHexes(fan, all)
        val kinds = MediaFormat.entries.filter { f -> all.any { it.format == f } }.joinToString(", ") { it.sectionName }
        val owner = store.person(route.handle)
        val error = store.loadError(LoadKey.PublicCollection(key))
        TintedPage(tint, veilSolid = KSize.chromeTop, veilEnd = KSize.pushedTitleTop, overlay = {
            KuraTopBar(onBack = { store.pop() }) {
                PublicLinks.collection(route.handle, route.id)?.let { link ->
                    IconChip44(KIcon.Share, "Compartir ${c.name}", { shareLink(context, link, c.name) }, fill = KColor.glassBg)
                }
            }
        }) {
            FanHeader(
                fan = fan.map { it.art },
                name = c.name,
                ghost = all.isEmpty(),
                label = {
                    Row(
                        Modifier.padding(top = 4.dp).heightIn(min = 32.dp)
                            .kPressable(feel = KPressFeel.Dim, onClickLabel = "Ver el perfil de @${route.handle}") { store.push(Route.PersonRoute(route.handle)) },
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (owner != null) Seal(owner.initials, owner.hexes, size = 24.dp, photo = owner.photo)
                        BasicText(
                            buildAnnotatedString {
                                withStyle(SpanStyle(color = KColor.text2)) { append("una colección de ") }
                                withStyle(SpanStyle(color = KColor.text, fontWeight = UiWeight.SemiBold.weight)) { append("@${route.handle}") }
                            },
                            style = KuraType.ui(13f),
                        )
                    }
                },
                below = {
                    c.shownVibe?.let { VibeLine(it) }
                    MonoLabel("${all.size} ${if (all.size == 1) "título" else "títulos"}${if (kinds.isEmpty()) "" else " · $kinds"}")
                },
            )
            if (error != null) {
                RetryStrip(
                    "No se pudo actualizar esta colección.",
                    onRetry = { scope.launch { store.loadPublicCollection(route.handle, route.id, force = true) } },
                    modifier = Modifier.padding(horizontal = 12.dp).padding(bottom = 12.dp),
                    offline = error == KuraApiError.Offline,
                )
            }
            if (all.isEmpty()) {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    BasicText("todavía está vacía.", style = KuraType.news(28f))
                    BasicText("@${route.handle} no ha guardado nada aquí.", style = KuraType.ui(15f).copy(color = KColor.text2))
                }
            } else {
                Masonry(
                    titles = all.map { it.art },
                    onOpen = { store.push(Route.TitleRoute(it.id)) },
                    badge = { t -> d.states[t.id]?.mark?.let { MasonryBadge.State(it.reaction.glyph) } ?: MasonryBadge.None },
                    onHold = { t -> store.present(SheetRoute.SaveTo(t.id)) },
                    coverModifier = { Modifier.kHeroCover("cover-${it.id}") },
                )
            }
            Spacer(Modifier.heightIn(min = 56.dp))
        }
    }
}

/** O7 · Ficha de un creador: their works we know, what's in your collections, who you follow. */
@Composable
fun CreatorScreen(store: AppStore, route: Route.CreatorRoute) {
    val name = route.name
    var filter by rememberSaveable { mutableStateOf<String?>(null) }
    val c = store.creator(name)
    val works = store.catalogOrder.mapNotNull { store.title(it) }.filter { it.creator == name }
    val saved = works.filter { store.collectionsContaining(it.id).isNotEmpty() }
    val formats = MediaFormat.entries.filter { f -> works.any { it.format == f } }
    val shown = works.filter { filter == null || it.format.rawValue == filter }
    val people = works.flatMap { t -> store.followedMarks(t.id).map { it.first } }.distinctBy { it.id }.sortedBy { it.handle }
    // A page (degradado único): the first work's gradient over the whole page.
    val tint = works.firstOrNull()?.palette ?: emptyList()

    TintedPage(tint, veilSolid = KSize.chromeTop, veilEnd = KSize.pushedTitleTop, overlay = {
        // No share: the web has no public page for a creator (any link would 404).
        KuraTopBar(onBack = { store.pop() })
    }) {
        Column(
            Modifier.fillMaxWidth().padding(top = KSize.pushedTitleTop, bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Seal(c.initials, emptyList(), size = SealSize.profile)
            BasicText(c.name.lowercase(), Modifier.padding(top = 12.dp).semantics { heading() }, style = KuraType.news(32f))
            MonoLabel("${c.role} · ${c.works} ${if (c.works == 1) "obra" else "obras"}")
        }
        Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
            if (saved.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SectionTitle("en tus colecciones", Modifier.padding(horizontal = 20.dp), trailing = "${saved.size}")
                    CoverStrip(saved, 150.dp, onOpen = { store.push(Route.TitleRoute(it.id)) })
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SectionTitle("obra", Modifier.padding(horizontal = 20.dp), trailing = "${c.works}")
                if (formats.size > 1) {
                    ChipRow(
                        listOf<Pair<String?, String>>(null to "Todo") + formats.map { it.rawValue to it.label },
                        selection = filter,
                        onSelect = { filter = it },
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
                shown.forEach { t ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 84.dp)
                            .kPressable(feel = KPressFeel.Row(), onClickLabel = "Abrir ${t.name}") { store.push(Route.TitleRoute(t.id)) }
                            .padding(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val album = t.format == MediaFormat.Album
                        Cover(t.art, Modifier.kHeroCover("cover-${t.id}"), width = if (album) 56.dp else 44.dp, radius = KRadius.coverS)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            BasicText(t.name, style = KuraType.newsItalic(18f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            MonoLabel(listOfNotNull(t.format.metaLabel, t.year?.toString()).joinToString(" · "))
                        }
                        SaveChip(store.collectionsContaining(t.id).size, onClick = { store.present(SheetRoute.SaveTo(t.id)) })
                    }
                }
            }
            if (people.isNotEmpty()) {
                Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    SectionTitle("gente que sigues")
                    people.forEach { p ->
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 52.dp)
                                .kPressable(feel = KPressFeel.Row(inset = (-10).dp), onClickLabel = "Ver el perfil de @${p.handle}") {
                                    store.push(Route.PersonRoute(p.id))
                                },
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Seal(p.initials, p.hexes, size = 36.dp, photo = p.photo)
                            BasicText("@${p.handle}", Modifier.weight(1f), style = KuraType.ui(15f, UiWeight.Medium), maxLines = 1)
                            Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                                GlyphIcon(Glyph.Flame, size = 14.dp)
                                MonoLabel("le obsesiona")
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.heightIn(min = 56.dp))
    }
}

/**
 * K1d / K1e · your profile as someone who doesn't follow you. Private = nobody else can open it:
 * the web and the API answer the same 404 as a profile that doesn't exist.
 */
@Composable
fun ProfileAsStrangerScreen(store: AppStore) {
    if (store.profilePrivate) {
        Box(Modifier.fillMaxSize().background(KColor.bg)) {
            Column(Modifier.padding(start = 24.dp, end = 24.dp, top = 140.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                BasicText("este perfil no existe o es privado.", Modifier.semantics { heading() }, style = KuraType.news(28f))
                BasicText(
                    "Así te ve cualquiera mientras tu perfil sea privado. Se cambia en Ajustes › privacidad.",
                    style = KuraType.ui(15f).copy(color = KColor.text2),
                )
            }
            TopVeil()
            KuraTopBar(onBack = { store.pop() }) { MonoLabel("vista previa", Modifier.padding(end = 4.dp)) }
        }
        return
    }
    PersonProfile(store, meAsStranger(store), preview = true)
}

/** The very profile a stranger opens, fed with what they'd get: your public collections, nothing in common. */
private fun meAsStranger(store: AppStore): Person {
    val me = store.me
    val obsessed = store.count(Mark.Obsessed)
    val liked = store.count(Mark.Liked)
    return me.copy(
        // Only drawn while your profile is public (`profilePrivate` is the truth; `me.isPrivate` can lag it).
        isPrivate = false,
        followingCount = maxOf(me.followingCount, store.following.size),
        stats = PersonStats(
            obsessed = obsessed,
            completed = store.count(Mark.Completed) + liked + obsessed,
            liked = liked,
            reviews = store.reviewCount,
        ),
        obsessions = store.myObsessions.map { it.id },
        common = emptyList(),
        // Only the public ones; a preview opens nothing (no backend id: it would be your own page).
        collections = store.orderedCollections.filter { it.privacy == Privacy.PublicAccess && it.titleIds.isNotEmpty() }.map { c ->
            PersonCollection(
                name = c.name, titleIds = c.titleIds, privacy = c.privacy, vibe = c.vibe, pinned = c.pinned,
                fanTitleIds = store.fan(c).map { it.id },
            )
        },
    )
}
