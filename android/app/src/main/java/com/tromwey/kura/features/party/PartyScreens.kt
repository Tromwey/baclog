package com.tromwey.kura.features.party

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.StoreToastHost
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyCopy
import com.tromwey.kura.data.models.PartySongHit
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.atOrSomeone
import com.tromwey.kura.features.collections.toastLift
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.GoneView
import com.tromwey.kura.designsystem.components.HoneyButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KuraPullToRefresh
import com.tromwey.kura.designsystem.components.KuraSearchBar
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.LoadErrorScreen
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.VibeLine
import com.tromwey.kura.designsystem.components.animatedTintTail
import com.tromwey.kura.designsystem.components.kSkeletonPulse
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.SongSearch
import com.tromwey.kura.state.addPartySong
import com.tromwey.kura.state.closePartyExport
import com.tromwey.kura.state.loadParty
import com.tromwey.kura.state.partiesUnavailable
import com.tromwey.kura.state.party
import com.tromwey.kura.state.partyExport
import com.tromwey.kura.state.partyIsMissing
import com.tromwey.kura.state.searchPartySongs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.time.Duration.Companion.milliseconds

// Colecciones de fiesta + llevar a otra app (fase 2 on Android) — twin of
// ios/Kura/Features/Party/PartyView.swift + PartySearchView.swift. Sheets: PartySheets.kt; the export
// screen: PartyExport.kt; the invite landing: InviteLanding.kt; the carousel body: PartyCarouselBody.kt.

// MARK: The party

/**
 * A party (design `fiesta-app-v2` · collab / host / blocked / empty / loading). One page for the host
 * and the guests; `viewer` says which parts show: the hero (the first three songs as a fan of
 * records, "colección de fiesta", the name, "cada invitado pone N canciones", the contributors'
 * seals), a guest's slots card (or "Ya no puedes agregar canciones" once blocked), "las canciones"
 * with who put each, and the bar at the bottom (honey: "Buscar canción" / the host's "Invitar a la
 * fiesta"). The page wears the feed gradient of the first song with a palette. No dock here.
 * "Llévala a otra app" draws over it while it runs ([PartyExportScreen]).
 */
@Composable
fun PartyScreen(store: AppStore, route: Route.PartyRoute) {
    val scope = rememberCoroutineScope()
    // Always re-read on the way in: other guests add while you're away.
    LaunchedEffect(route.id) { store.loadParty(route.id, force = true) }
    val p = store.party(route.id)
    val error = store.loadError(LoadKey.PartyKey(route.id))
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        when {
            p != null -> PartyPage(store, p)
            store.partiesUnavailable -> GoneView(
                onBack = { store.pop() },
                title = PartyCopy.UNAVAILABLE_TITLE,
                note = "Todavía no están listas en el servidor. Vuelve en unos días.",
            )
            store.partyIsMissing(route.id) -> GoneView(
                onBack = { store.pop() },
                title = "esta fiesta ya no está.",
                note = "No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella.",
            )
            error != null -> {
                val (title, note) = error.loadCopy
                LoadErrorScreen(title, note, { scope.launch { store.loadParty(route.id, force = true) } }, onBack = { store.pop() })
            }
            else -> PartyLoading(store)
        }
        val flow = store.partyExport
        if (flow != null && flow.partyId == route.id) {
            BackHandler { store.closePartyExport() }
            PartyExportScreen(store, flow)
        }
    }
}

/** The page's skeleton (design `loading`): the empty fan, three bars, five rows. */
@Composable
private fun PartyLoading(store: AppStore) {
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier.fillMaxWidth().padding(top = 126.dp).kSkeletonPulse().clearAndSetSemantics { contentDescription = "Cargando la fiesta" },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FanView(emptyList(), 212.dp, ghost = true, plus = false)
            Box(Modifier.padding(top = 8.dp).size(140.dp, 10.dp).background(KColor.glassBg, CircleShape))
            Box(Modifier.size(230.dp, 32.dp).background(KColor.glassBg, RoundedCornerShape(10.dp)))
            Box(Modifier.size(170.dp, 12.dp).background(Color.White.copy(alpha = 0.05f), CircleShape))
            PartyRowsSkeleton(Modifier.padding(horizontal = 8.dp).padding(top = 26.dp))
        }
        KuraTopBar(onBack = { store.pop() })
    }
}

/** The same rules as iOS `PartyView.bar`: host always; a blocked guest / "solo ver" nothing. */
internal fun partyAction(p: Party): PartyBarAction? {
    if (p.isHost) return PartyBarAction.Host
    if (p.viewer.blocked || p.perGuestLimit == 0) return null
    val full = (p.perGuestLimit ?: 0) > 0 && (p.viewer.remaining ?: 1) == 0
    return if (full) PartyBarAction.Change else PartyBarAction.Search
}

internal enum class PartyBarAction { Host, Search, Change }

@Composable
private fun PartyPage(store: AppStore, p: Party) {
    val scope = rememberCoroutineScope()
    val tint = p.tint
    val tail = animatedTintTail(tint)
    val bar = partyAction(p)
    var refreshing by remember { mutableStateOf(false) }
    BoxWithConstraints(Modifier.fillMaxSize().background(tail)) {
        val viewport = maxHeight
        KuraPullToRefresh(
            refreshing = refreshing,
            onRefresh = {
                scope.launch {
                    refreshing = true
                    store.loadParty(p.id, force = true)
                    refreshing = false
                }
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                Column(
                    Modifier.fillMaxWidth().heightIn(min = viewport).kTint(tint, TintStyle.Feed(900.dp))
                        .padding(bottom = if (bar == null) 56.dp else 170.dp),
                ) {
                    PartyHero(p)
                    PartyStatus(p)
                    if (p.songs.isEmpty()) PartyEmpty(p.isHost, p.perGuestLimit, big = true) else PartySongs(store, p, heading = true)
                }
            }
        }
        TopVeil(color = Tint.feedTop(tint))
        KuraTopBar(onBack = { store.pop() }) { PartyChips(store, p) }
        if (bar != null) PartyBottomBar(store, p, bar, tail, Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
private fun PartyHero(p: Party) {
    Column(
        Modifier.fillMaxWidth().padding(top = 126.dp, bottom = 26.dp).padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        FanView(p.songs.take(3).map { it.cover }, 212.dp, ghost = p.songs.isEmpty(), plus = false, label = "Portadas de ${p.name}")
        MonoLabel("colección de fiesta", Modifier.padding(top = 4.dp), size = 10f)
        BasicText(
            p.name,
            Modifier.semantics { heading() },
            style = KuraType.news(36f).copy(textAlign = TextAlign.Center, lineHeight = 40.sp),
        )
        VibeLine(PartyCopy.heroLine(p.perGuestLimit))
        PartyCredits(p.contributors, p.host, p.isHost, p.songs.size)
    }
}

/** A guest's slots card ("Pusiste 1 de 3 · Te quedan 2"), "Ya no puedes agregar canciones", or "solo ver". */
@Composable
private fun PartyStatus(p: Party) {
    if (p.isHost) return
    val mine = p.mySongs
    val limit = p.perGuestLimit
    when {
        p.viewer.blocked -> PartyCard {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                BasicText("Ya no puedes agregar canciones", style = KuraType.ui(15f, UiWeight.SemiBold))
                PartySheetBody(
                    if (mine.isEmpty()) "${p.host.atOrSomeone} te quitó de los colaboradores. Puedes seguir viendo la colección."
                    else "${p.host.atOrSomeone} te quitó de los colaboradores. Puedes seguir viendo la colección y quitar las que pusiste.",
                )
            }
        }
        limit == 0 -> PartyCard {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                BasicText("Esta fiesta es para escuchar", style = KuraType.ui(15f, UiWeight.SemiBold))
                PartySheetBody("${p.host.atOrSomeone} armó la playlist; aquí no se agregan canciones.")
            }
        }
        else -> PartyCard(Modifier.semantics(mergeDescendants = true) { }) {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                val slots = if (limit == null) minOf(3, maxOf(1, mine.size + 1)) else minOf(limit, 5)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    repeat(slots) { i ->
                        val s = mine.getOrNull(i)
                        if (s != null) SongCover(s.artworkUrl, s.palette, size = 44.dp, radius = 6.dp, shadow = false) else EmptySongSlot()
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    BasicText(slotsTitle(mine.size, limit), style = KuraType.ui(15f, UiWeight.SemiBold))
                    MonoLabel(slotsSub(mine.size, limit, p.viewer.remaining), size = 10f)
                }
            }
        }
    }
}

private fun slotsTitle(n: Int, limit: Int?): String = when {
    limit == null -> if (n == 0) "Tus canciones" else "Pusiste ${PartyCopy.songs(n)}"
    n == 0 -> if (limit == 1) "Tu canción" else "Tus $limit canciones"
    n >= limit -> if (limit == 1) "Pusiste tu canción" else "Pusiste tus $limit"
    else -> "Pusiste $n de $limit"
}

private fun slotsSub(n: Int, limit: Int?, remaining: Int?): String {
    if (limit == null) return if (n == 0) "Todavía no pones ninguna" else "Sin límite"
    val r = remaining ?: 0
    return when {
        n == 0 -> "Todavía no pones ninguna"
        r == 0 -> "Quita una para cambiarla"
        else -> "Te ${if (r == 1) "queda" else "quedan"} $r"
    }
}

/**
 * "las canciones", in playlist order. Your own song always opens its sheet (C4: blocked, you can
 * still take it out); the host's "…" opens Quitar / Quitar y bloquear. [openParty]: a row with
 * nothing to do opens the party (the carousel's body).
 */
@Composable
internal fun PartySongs(store: AppStore, p: Party, heading: Boolean, openParty: Boolean = false) {
    Column {
        if (heading) {
            BasicText(
                "las canciones",
                Modifier.padding(horizontal = 20.dp).padding(bottom = 14.dp).semantics { heading() },
                style = KuraType.news(22f),
            )
        }
        Column(Modifier.padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            p.songs.forEach { s ->
                val actionable = s.canRemove || s.canBlockAuthor || s.mine
                val open = { store.present(SheetRoute.PartySong(p.id, s.titleId)) }
                PartySongRow(
                    s,
                    showMore = p.isHost && actionable,
                    onTap = when {
                        actionable -> open
                        openParty -> ({ store.push(Route.PartyRoute(p.id)) })
                        else -> null
                    },
                    onMore = open,
                )
            }
        }
    }
}

/** No songs yet ("la pista está vacía."): 28 on the page, 22 in the carousel. */
@Composable
internal fun PartyEmpty(isHost: Boolean, limit: Int?, big: Boolean) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = if (big) 32.dp else 28.dp).padding(top = if (big) 0.dp else 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        BasicText(
            "la pista está vacía.",
            style = KuraType.news(if (big) 28f else 22f).copy(color = if (big) KColor.text else KColor.text2, textAlign = TextAlign.Center),
        )
        BasicText(
            if (isHost) "Nadie ha puesto nada todavía. Comparte el link y que cada quien ponga ${PartyCopy.theirs(limit)}."
            else "Nadie ha puesto nada todavía. Alguien tiene que abrir la pista.",
            Modifier.widthIn(max = 290.dp),
            style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center, lineHeight = 21.sp),
        )
    }
}

/** The bar over the page's tail: "Buscar canción" (honey) → "Cambiar una canción" once full; the
 *  host's "Invitar a la fiesta" (honey) + a search chip. */
@Composable
private fun PartyBottomBar(store: AppStore, p: Party, bar: PartyBarAction, tail: Color, modifier: Modifier) {
    Box(
        modifier.fillMaxWidth()
            .background(Brush.verticalGradient(0f to tail.copy(alpha = 0f), 0.42f to tail, 1f to tail))
            .navigationBarsPadding()
            // Over the frame's toast when one is up (it would cover the bar's action).
            .padding(horizontal = 16.dp).padding(top = 56.dp, bottom = 12.dp + toastLift(store)),
    ) {
        when (bar) {
            PartyBarAction.Search -> HoneyButton(
                if (p.mySongs.isEmpty()) "Buscar canción" else "Buscar otra canción",
                { store.push(Route.PartySearch(p.id)) },
                icon = KIcon.Search,
                height = 56.dp,
            )
            PartyBarAction.Change -> GlassButton(
                "Cambiar una canción", { store.present(SheetRoute.PartyCap(p.id)) },
                height = 56.dp, fontSize = 16f, fullWidth = true,
            )
            PartyBarAction.Host -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                HoneyButton("Invitar a la fiesta", { store.present(SheetRoute.PartyShare(p.id)) }, Modifier.weight(1f), height = 56.dp)
                IconChip44(KIcon.Search, "Buscar canción", { store.push(Route.PartySearch(p.id)) }, size = 56.dp, iconSize = 20.dp)
            }
        }
    }
}

// MARK: Buscar canción

private sealed interface SearchPhase {
    data object Idle : SearchPhase
    data object Loading : SearchPhase
    data object Results : SearchPhase
    data class Error(val e: KuraApiError) : SearchPhase
}

/**
 * "Buscar canción" (design `search-idle` · `search-loading` · `search-results` · `search-dup` ·
 * `search-error`): Material's expanded search (`KuraSearchBar`, its back arrow = Cancelar),
 * "Te quedan 2 de 3", and the iTunes results from `GET /parties/{id}/songs?q=` — Agregar, or "Ya
 * está" with who put it. Adding the last one you had opens "ya pusiste tus 3." (`addPartySong`).
 */
@Composable
fun PartySearchScreen(store: AppStore, route: Route.PartySearch) {
    val id = route.id
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var phase by remember { mutableStateOf<SearchPhase>(SearchPhase.Idle) }
    var hits by remember { mutableStateOf<List<PartySongHit>>(emptyList()) }
    var adding by remember { mutableStateOf<Set<String>>(emptySet()) }
    var left by remember { mutableStateOf(false) }
    val party = store.party(id)
    LaunchedEffect(id) { store.loadParty(id) }

    fun leave() {
        if (left) return
        left = true
        if (store.path(store.tab).lastOrNull() == route) store.pop()
    }

    suspend fun run(q: String) {
        val t = q.trim()
        if (t.isEmpty()) {
            phase = SearchPhase.Idle
            hits = emptyList()
            return
        }
        phase = SearchPhase.Loading
        when (val r = store.searchPartySongs(id, t)) {
            is SongSearch.Results -> {
                hits = r.hits
                phase = SearchPhase.Results
            }
            is SongSearch.Failed -> {
                if (r.error == KuraApiError.NotFound) {
                    // The party isn't there for you any more: out of the search, and the re-read
                    // takes the page too if it's gone.
                    leave()
                    store.loadParty(id, force = true)
                    return
                }
                phase = SearchPhase.Error(r.error)
            }
            SongSearch.Dropped -> Unit
        }
    }
    LaunchedEffect(query) {
        delay(350.milliseconds)
        run(query)
    }
    // The party changed (an add, a removal in the cap sheet): the "Ya está" marks follow.
    val songIds = party?.songs?.map { it.titleId }
    LaunchedEffect(songIds) {
        val p = party ?: return@LaunchedEffect
        val byId = p.songs.associateBy { it.titleId }
        hits = hits.map { h -> h.copy(inParty = byId[h.titleId]?.let { PartySongHit.InParty(it.mine, it.addedBy) }) }
    }

    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        KuraSearchBar(
            query = query,
            onQueryChange = { query = it },
            expanded = true,
            onExpandedChange = { open -> if (!open) leave() },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 64.dp),
            placeholder = "Canción o artista",
            onSearch = { scope.launch { run(it) } },
            overlay = { StoreToastHost(store) },
        ) {
            val keyboard = LocalSoftwareKeyboardController.current
            LaunchedEffect(store.sheet) { if (store.sheet != null) keyboard?.hide() }
            MonoLabel(
                remainLabel(party),
                Modifier.padding(horizontal = 24.dp).padding(top = 12.dp, bottom = 6.dp),
                tracking = 0.1f,
                color = KColor.text3,
            )
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 8.dp).padding(bottom = 40.dp)) {
                when (val ph = phase) {
                    SearchPhase.Idle -> SearchNote("Busca por nombre de la canción o del artista.")
                    SearchPhase.Loading -> PartyRowsSkeleton(trailing = 88.dp)
                    is SearchPhase.Error -> {
                        val (title, note) = searchErrorCopy(ph.e, store.partiesUnavailable)
                        LoadErrorBlock(title, note, { scope.launch { run(query) } }, Modifier.padding(horizontal = 20.dp).padding(top = 56.dp), titleSize = 30f)
                    }
                    SearchPhase.Results -> if (hits.isEmpty()) {
                        SearchNote("Nada con «${query.trim()}». Prueba con el artista o con menos palabras.")
                    } else {
                        hits.forEach { h ->
                            SearchRow(h, busy = h.titleId in adding) {
                                val inParty = h.inParty
                                if (inParty != null) {
                                    store.showToast(
                                        com.tromwey.kura.state.ToastModel(
                                            if (inParty.mine) "Ya la pusiste tú." else "Ya está, la puso ${inParty.addedBy.atOrSomeone}",
                                            com.tromwey.kura.state.ToastModel.Kind.Info,
                                        ),
                                    )
                                } else {
                                    scope.launch {
                                        adding = adding + h.titleId
                                        store.addPartySong(id, h)
                                        adding = adding - h.titleId
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchNote(text: String) {
    BasicText(
        text,
        Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(top = 60.dp),
        style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center, lineHeight = 21.sp),
    )
}

@Composable
private fun SearchRow(h: PartySongHit, busy: Boolean, onAction: () -> Unit) {
    val dup = h.inParty != null
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp, horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SongCover(h.artworkUrl, h.palette, radius = 8.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            BasicText(h.title, style = KuraType.newsItalic(18f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (h.subtitle.isNotEmpty()) BasicText(h.subtitle, style = KuraType.ui(13f).copy(color = KColor.text2), maxLines = 1, overflow = TextOverflow.Ellipsis)
            h.dupLine?.let { BasicText(it, style = KuraType.ui(12f, UiWeight.Medium).copy(color = KColor.text3), maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        GlassButton(
            when {
                busy -> "Agregando…"
                dup -> "Ya está"
                else -> "Agregar"
            },
            onAction,
            Modifier.semantics { contentDescription = if (dup) "Ya está: ${h.dupLine.orEmpty()}" else "Agregar ${h.title}" },
            fontSize = 14f,
            fill = if (dup) Color.White.copy(alpha = 0.05f) else KColor.glassBg,
            enabled = !busy,
        )
    }
}

/** The search's error, by what failed. (`NotFound` never gets here: the search leaves the page.) */
private fun searchErrorCopy(e: KuraApiError, partiesOff: Boolean): Pair<String, String> = when {
    e is KuraApiError.RateLimited -> "un momento." to "Fueron muchas búsquedas seguidas. Espera unos segundos y vuelve a intentarlo."
    e == KuraApiError.Unavailable && partiesOff -> PartyCopy.UNAVAILABLE_TITLE to PartyCopy.UNAVAILABLE
    e == KuraApiError.Unavailable -> "no pudimos buscar." to "El buscador de canciones no respondió. Vuelve a intentarlo en unos segundos; tus canciones siguen guardadas."
    else -> "no pudimos buscar." to "No hubo respuesta. Revisa tu conexión y vuelve a intentarlo; tus canciones siguen guardadas."
}

private fun remainLabel(p: Party?): String {
    p ?: return " "
    if (p.isHost || p.perGuestLimit == null) return "Pon las que quieras"
    val limit: Int = p.perGuestLimit
    val r = p.viewer.remaining ?: 0
    return when {
        limit == 0 -> "Solo para escuchar"
        r == 0 -> if (limit == 1) "Ya pusiste tu canción" else "Ya pusiste tus $limit"
        else -> "Te ${if (r == 1) "queda" else "quedan"} $r de $limit"
    }
}
