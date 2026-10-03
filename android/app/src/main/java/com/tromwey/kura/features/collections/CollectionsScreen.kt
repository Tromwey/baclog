package com.tromwey.kura.features.collections

import com.tromwey.kura.designsystem.ActiveEffect
import com.tromwey.kura.designsystem.components.DockBandEffect
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.LocalReduceMotion
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.components.CoverArt
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraFabItem
import com.tromwey.kura.designsystem.components.KuraFabMenu
import com.tromwey.kura.designsystem.components.KuraPullToRefresh
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.RowValue
import com.tromwey.kura.designsystem.components.SettingsRow
import com.tromwey.kura.designsystem.components.SheetHeader
import com.tromwey.kura.designsystem.components.SkeletonShape
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.TabTitleBar
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.components.kSkeletonPulse
import com.tromwey.kura.designsystem.components.kuraTitleScroll
import com.tromwey.kura.designsystem.components.rememberKuraTitleScroll
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.features.collectiondetail.CollectionBody
import com.tromwey.kura.features.collectiondetail.CollectionChips
import com.tromwey.kura.features.collectiondetail.PrivacyOptions
import com.tromwey.kura.features.collectiondetail.WaitingMasonry
import com.tromwey.kura.features.collectiondetail.WaitingMeta
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.LoadState
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.bootstrap
import com.tromwey.kura.state.createCollection
import com.tromwey.kura.state.refreshLibrary
import com.tromwey.kura.state.removeSilently
import com.tromwey.kura.state.waitingTitles
import com.tromwey.kura.state.createParty
import com.tromwey.kura.state.loadParties
import com.tromwey.kura.state.party
import com.tromwey.kura.state.partyCards
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyCard
import com.tromwey.kura.data.models.PartyCopy
import com.tromwey.kura.features.party.PartyCarouselBody
import com.tromwey.kura.features.party.PartyChips
import com.tromwey.kura.features.party.PartyLimitStepper
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt
import com.tromwey.kura.state.showToast
import com.tromwey.kura.state.present
import com.tromwey.kura.state.dismissSheet
import com.tromwey.kura.state.push

// Twin of ios/Kura/Features/Collections/CollectionsView.swift (propuesta 10a — "Tus colecciones y
// Colección, una sola página"): one collection at a time, its FAN in a carousel that follows the
// finger 1:1, the names strip under it, and the SAME body as Colección under the names.

/** Tab root · 02 Tus colecciones (+ 6a sin colecciones, 6c cargando, the failed launch). */
@Composable
fun CollectionsScreen(store: AppStore) {
    // Your parties (`GET /parties`): silent when the server doesn't have parties yet (503).
    ActiveEffect { store.loadParties() }
    when (store.loadState) {
        LoadState.Loading -> CollectionsSkeleton()
        LoadState.Failed -> CollectionsFailed(store)
        // A party counts: someone who only joined one by its link has no collection of their own,
        // and the party must still be one swipe away.
        LoadState.Loaded -> if (store.collections.isEmpty() && store.partyCards.isEmpty()) NoCollections(store) else CollectionsCarousel(store)
    }
}

// MARK: The carousel's stops

/** One stop: a collection of yours, the automatic "no puedo esperar", or the ghost "nueva colección". */
private sealed interface Entry {
    val id: String
    val name: String

    data class Shelf(val c: KCollection) : Entry {
        override val id get() = c.id
        override val name get() = c.name
    }

    data class Auto(val titles: List<Title>) : Entry {
        override val id get() = AUTO_ID
        override val name get() = "no puedo esperar"
    }

    data object New : Entry {
        override val id get() = NEW_ID
        override val name get() = "nueva colección"
    }

    /** A party (colección de fiesta), yours or one you joined — `GET /parties`. Its body is
     *  [PartyCarouselBody] (its songs as a list); its fan opens the party. */
    data class PartyEntry(val card: PartyCard) : Entry {
        override val id get() = "party:${card.id}"
        override val name get() = card.name
    }
}

private const val AUTO_ID = "no-puedo-esperar"
private const val NEW_ID = "nueva-coleccion"

/** One collection per 320 of finger; the rubber band's dimension. */
private val STEP = 320.dp
/** Transparent margin around each fan's layer: the back covers tilt ~10 dp past the 300 box, and the
 *  cover shadow (`0 18 36 -16`) reaches ~40 dp below it. The 290 band (225 + 14 top) holds 225 + 48. */
private val FAN_BLEED = 24.dp
private val FAN_BLEED_BOTTOM = 48.dp
private const val BAND = 390f
private const val RUBBER_C = 0.55f

/** `spr(0.42, 1)` / thrown `spr(0.42, 0.86)` (iOS `KSpringSpec.carousel` / `carouselFlung`). */
private val CAROUSEL_STIFFNESS = (2 * PI / 0.42).let { (it * it).toFloat() }

/** Resistance past either end, and its exact inverse (learning 2026-09-24 "rubberband doble"). */
private fun band(o: Float, d: Float): Float = o * d * RUBBER_C / (d + RUBBER_C * abs(o))

private fun unband(y: Float, d: Float): Float {
    val a = minOf(abs(y), d * 0.999f)
    val o = a * d / (RUBBER_C * (d - a))
    return if (y < 0) -o else o
}

/** The two stops the position is between, and how far. */
private fun between(p: Float, n: Int): Triple<Int, Int, Float> {
    if (n <= 0) return Triple(0, 0, 0f)
    val lo = floor(p).toInt().coerceIn(0, n - 1)
    val hi = minOf(n - 1, lo + 1)
    return Triple(lo, hi, (p - lo).coerceIn(0f, 1f))
}

/**
 * "Entre colecciones": the fans, the names and the background hang from ONE continuous position
 * ([Float], in stops; 320 = one), so they move together and 1:1 with the finger; past the ends it
 * resists (rubber band). Released, the velocity is projected (`p − v·0.499/320`) to pick the
 * neighbour (at most one from where the finger took it) and it settles on `spring(0.42, 1)`, or
 * 0.86 when thrown, starting at the finger's speed. The body under the names leaves by the middle
 * of the way and the new one comes in from the other side. A selection tick when the centre
 * changes. Tapping the fan only centres it; holding one of yours opens Opciones (18a).
 * Order: the ghost "nueva colección" FIRST, then pinned, the rest, the empty ones, "no puedo
 * esperar" LAST; it opens on the first real collection (never on the ghost).
 */
@Composable
private fun CollectionsCarousel(store: AppStore) {
    val waiting = store.waitingTitles
    val list: List<Entry> = buildList {
        add(Entry.New)
        // Parties right after the ghost (fiesta-app-v2 `list`: "la fiesta de eric" first).
        store.partyCards.forEach { add(Entry.PartyEntry(it)) }
        store.orderedCollections.forEach { add(Entry.Shelf(it)) }
        if (waiting.isNotEmpty()) add(Entry.Auto(waiting))
    }
    val latest by rememberUpdatedState(list)
    var currentId by rememberSaveable { mutableStateOf("") }
    val pos = remember { mutableFloatStateOf(0f) }
    val placed = remember { booleanArrayOf(false) }
    var dragging by remember { mutableStateOf(false) }
    var raw by remember { mutableFloatStateOf(0f) }
    var grabBase by remember { mutableFloatStateOf(0f) }
    var anim by remember { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()
    val haptic = rememberKHaptic()
    val density = LocalDensity.current
    val stepPx = with(density) { STEP.toPx() }
    val reduce = LocalReduceMotion.current

    fun indexOf(id: String, l: List<Entry>): Int = l.indexOfFirst { it.id == id }.takeIf { it >= 0 } ?: minOf(1, l.size - 1)

    fun go(i: Int, velocity: Float = 0f, flung: Boolean = false) {
        val target = i.coerceIn(0, latest.size - 1).toFloat()
        anim?.cancel()
        anim = scope.launch {
            animate(pos.floatValue, target, velocity, spring(dampingRatio = if (flung) 0.86f else 1f, stiffness = CAROUSEL_STIFFNESS)) { v, _ ->
                pos.floatValue = v
            }
        }
    }

    // Placement (first appearance) and every list change (a pin, a new collection): the position
    // follows `currentId`, with no spring. Never while a finger holds it.
    val ids = list.map { it.id }
    LaunchedEffect(ids) {
        if (!placed[0] && currentId == NEW_ID) currentId = ""
        val i = indexOf(currentId, list)
        if (currentId != list[i].id) currentId = list[i].id
        if (!dragging && (anim?.isActive != true) && pos.floatValue != i.toFloat()) pos.floatValue = i.toFloat()
        placed[0] = true
    }
    // The rounding of the position crossed into another stop (finger or spring).
    ActiveEffect {
        snapshotFlow { pos.floatValue.roundToInt() }.distinctUntilChanged().collect { r ->
            val l = latest
            val i = r.coerceIn(0, l.size - 1)
            if (placed[0] && l[i].id != currentId) {
                currentId = l[i].id
                haptic(KHapticEvent.Selection)
            }
        }
    }

    val idx = indexOf(currentId, list)
    val cur = list[idx]
    val tints = list.map { hexesOf(store, it) }
    val brushes = remember(tints, density.density) { tints.map { Tint.feed(it, 760.dp, density.density) } }
    val tails = remember(tints) { tints.map { Tint.feedTail(it) } }
    // The navigation bar continues in the page's tail, between two stops too.
    DockBandEffect {
        val (lo, hi, t) = between(pos.floatValue, tails.size)
        lerp(tails[lo], tails[hi], t)
    }
    val scroll = rememberScrollState()
    val titleScroll = rememberKuraTitleScroll()
    var refreshing by remember { mutableStateOf(false) }
    val maxIndex = (list.size - 1).toFloat()

    val drag = rememberDraggableState { delta ->
        raw -= delta / stepPx
        pos.floatValue = when {
            raw < 0 -> -band(-raw * stepPx, BAND * density.density) / stepPx
            raw > maxIndex -> maxIndex + band((raw - maxIndex) * stepPx, BAND * density.density) / stepPx
            else -> raw
        }
    }

    Box(
        Modifier.fillMaxSize().drawBehind {
            val (lo, hi, t) = between(pos.floatValue, tails.size)
            drawRect(lerp(tails[lo], tails[hi], t))
            // The page's feed gradient (760), scrolling with the content.
            val top = -scroll.value.toFloat()
            val sz = Size(size.width, size.height - top)
            translate(top = top) {
                drawRect(brushes[lo], Offset.Zero, sz)
                if (t > 0f && hi != lo) drawRect(brushes[hi], Offset.Zero, sz, alpha = t)
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            TabTitleBar("tus colecciones", scroll = titleScroll) {
                // The party's own pair (as on its page) once it's loaded — the sheets read it.
                val chips: Any? = (cur as? Entry.Shelf) ?: (cur as? Entry.PartyEntry)?.let { store.party(it.card.id) }
                AnimatedContent(chips, transitionSpec = { fadeIn(tween(300)) togetherWith fadeOut(tween(300)) }, label = "carouselChips") { e ->
                    when (e) {
                        is Entry.Shelf -> CollectionChips(store, e.c)
                        is Party -> PartyChips(store, e)
                        else -> Box(Modifier.size(44.dp))
                    }
                }
            }
            KuraPullToRefresh(
                refreshing = refreshing,
                onRefresh = {
                    scope.launch {
                        refreshing = true
                        // Every collection and your titles again (no skeleton; local writes win).
                        store.refreshLibrary()
                        refreshing = false
                    }
                },
                modifier = Modifier.fillMaxWidth().weight(1f),
            ) {
                Column(Modifier.fillMaxSize().kuraTitleScroll(titleScroll).verticalScroll(scroll).padding(bottom = 140.dp)) {
                    Strips(store)
                    Column(
                        Modifier.fillMaxWidth().draggable(
                            drag,
                            Orientation.Horizontal,
                            onDragStarted = {
                                anim?.cancel()
                                dragging = true
                                val p = pos.floatValue
                                raw = when {
                                    p < 0 -> -unband(-p * stepPx, BAND * density.density) / stepPx
                                    p > maxIndex -> maxIndex + unband((p - maxIndex) * stepPx, BAND * density.density) / stepPx
                                    else -> p
                                }
                                grabBase = raw
                            },
                            onDragStopped = { v ->
                                dragging = false
                                val vx = v / density.density // dp/s
                                val b = grabBase.roundToInt()
                                val tg = (pos.floatValue - vx * 0.499f / STEP.value).roundToInt().coerceIn(b - 1, b + 1)
                                val vi = -vx / STEP.value
                                go(tg, vi, flung = abs(vi) > 1.5f)
                            },
                        ),
                    ) {
                        Fans(store, list, pos, go = { go(it) })
                        Names(list, pos, go = { go(it) }, modifier = Modifier.padding(top = 4.dp))
                    }
                    // The body: gone by the middle of the way, sliding 48 per stop against the finger.
                    Box(
                        Modifier.fillMaxWidth().graphicsLayer {
                            val p = pos.floatValue
                            val fr = p - p.roundToInt()
                            alpha = (1f - abs(fr) * 2f).coerceIn(0f, 1f)
                            translationX = if (reduce) 0f else -fr * 48.dp.toPx()
                        },
                    ) {
                        androidx.compose.runtime.key(cur.id) { Below(store, cur) }
                    }
                }
            }
        }
        KuraFabMenu(
            items = buildList {
                (cur as? Entry.Shelf)?.let { s -> add(KuraFabItem("Agregar títulos", KIcon.Search) { store.present(SheetRoute.AddTitles(s.c.id)) }) }
                add(KuraFabItem("Nueva colección", KIcon.Plus) { store.present(SheetRoute.NewCollection(addingTitleId = null)) })
            },
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp + toastLift(store)),
        )
    }
}

/** How far a FAB rises while a toast sits above the navigation bar (Material's scaffold would do it
 *  for its own FAB slot; ours lives in the page). */
@Composable
internal fun toastLift(store: AppStore): Dp {
    val lift by androidx.compose.animation.core.animateDpAsState(if (store.toast != null) 72.dp else 0.dp, label = "fabLift")
    return lift
}

private fun fanOf(store: AppStore, e: Entry): List<CoverArt> = when (e) {
    is Entry.Shelf -> store.fan(e.c).map { it.art }
    is Entry.Auto -> e.titles.take(3).map { it.art }
    Entry.New -> emptyList()
    is Entry.PartyEntry -> e.card.fan.map { it.art }
}

private fun hexesOf(store: AppStore, e: Entry): List<String> = when (e) {
    is Entry.Shelf -> store.hexes(e.c)
    is Entry.Auto -> AppStore.fanHexes(e.titles.take(3), e.titles)
    Entry.New -> emptyList()
    is Entry.PartyEntry -> e.card.palette
}

/** Offline / "faltan títulos" strips above the fans (the frame draws the offline strip itself). */
@Composable
private fun Strips(store: AppStore) {
    val e = store.loadError(LoadKey.Library)
    if (store.libraryIncomplete && e != null) {
        val scope = rememberCoroutineScope()
        RetryStrip(
            "Faltan títulos en tus colecciones.",
            { scope.launch { store.retryLibraryTitles() } },
            Modifier.padding(horizontal = 12.dp).padding(bottom = 16.dp),
        )
    } else {
        PartiesRetryStrip(store)
    }
}

/** "No se cargaron tus fiestas." + Reintentar (`GET /parties` failed — not the silent 503). */
@Composable
private fun PartiesRetryStrip(store: AppStore) {
    val e = store.loadError(LoadKey.Parties) ?: return
    val scope = rememberCoroutineScope()
    val offline = e == com.tromwey.kura.data.api.KuraApiError.Offline
    RetryStrip(
        if (offline) "Sin conexión. No se cargaron tus fiestas." else "No se cargaron tus fiestas.",
        { scope.launch { store.loadParties(force = true) } },
        Modifier.padding(horizontal = 12.dp).padding(bottom = 16.dp),
        offline = offline,
    )
}

/**
 * The fans within one stop of the position (the 290 band): `translateX(d·320) scale(1 − .08·|d|)`,
 * opacity `1 − 1.2·|d|`. Only the centre one takes touches.
 */
@Composable
private fun Fans(store: AppStore, list: List<Entry>, pos: MutableFloatState, go: (Int) -> Unit) {
    val centre by remember { derivedStateOf { pos.floatValue.roundToInt() } }
    val c = centre.coerceIn(0, list.size - 1)
    Box(Modifier.fillMaxWidth().height(290.dp).padding(top = 14.dp), contentAlignment = Alignment.TopCenter) {
        for (i in (c - 1)..(c + 1)) {
            if (i !in list.indices) continue
            val e = list[i]
            val empty = (e is Entry.Shelf && e.c.titleIds.isEmpty()) || (e is Entry.PartyEntry && e.card.songCount == 0)
            val isCentre = i == c
            val count = (e as? Entry.Shelf)?.c?.titleIds?.size ?: (e as? Entry.Auto)?.titles?.size ?: 0
            val a11y = when (e) {
                is Entry.Shelf -> "${e.name}, $count ${if (count == 1) "título" else "títulos"}"
                is Entry.PartyEntry -> "${e.name}, fiesta, ${PartyCopy.songs(e.card.songCount)}"
                else -> e.name
            }
            val actions = buildList {
                if (i + 1 < list.size) add(CustomAccessibilityAction("Siguiente colección") { go(i + 1); true })
                if (i > 0) add(CustomAccessibilityAction("Colección anterior") { go(i - 1); true })
                if (e is Entry.Shelf) add(CustomAccessibilityAction("Opciones") { store.present(SheetRoute.More(e.c.id)); true })
            }
            androidx.compose.runtime.key(e.id) {
                Box(
                    Modifier
                        .graphicsLayer {
                            val d = i - pos.floatValue
                            val a = abs(d)
                            translationX = d * STEP.toPx()
                            val s = 1f - 0.08f * minOf(1f, a)
                            scaleX = s
                            scaleY = s
                            alpha = (1f - a * 1.2f).coerceIn(0f, 1f)
                        }
                        // Room inside the layer: with alpha < 1 it's drawn offscreen at its own size, and at
                        // the fan's bare 300×225 the tilted back covers (sides) and the cover shadow (below)
                        // got clipped the moment a swipe began (learning 2026-09-30-compose-graphicslayer-…).
                        .padding(start = FAN_BLEED, end = FAN_BLEED, bottom = FAN_BLEED_BOTTOM)
                        .then(
                            when {
                                !isCentre -> Modifier.clearAndSetSemantics { }
                                // A party's fan opens it (design `list`: the centred party goes to its page).
                                e is Entry.PartyEntry -> Modifier.kPressable(onClickLabel = "Abrir ${e.name}") { store.push(Route.PartyRoute(e.card.id)) }
                                    .clearAndSetSemantics {
                                        contentDescription = a11y
                                        customActions = actions
                                    }
                                e is Entry.Shelf -> Modifier.kPressable(onLongPress = { store.present(SheetRoute.More(e.c.id)) }, onClickLabel = null) { }
                                    .clearAndSetSemantics {
                                        contentDescription = a11y
                                        customActions = actions
                                    }
                                // Tapping a fan only centres it (founder): the ghost and the automatic one
                                // are reached by their body (Nueva colección) and their titles.
                                else -> Modifier.clearAndSetSemantics {
                                    contentDescription = if (e is Entry.Auto) "$a11y, $count ${if (count == 1) "título" else "títulos"}" else a11y
                                    customActions = actions
                                }
                            },
                        ),
                ) {
                    // The ghost wears the dashed "+"; an EMPTY collection draws the same ghost without it.
                    FanView(fanOf(store, e), 225.dp, ghost = e == Entry.New || empty, plus = e == Entry.New)
                }
            }
        }
    }
}

/**
 * The strip of names, all from the position: the centre in Newsreader 30; a neighbour pinned 142
 * off-centre (its near edge) at 22 and .45; past that it slides 278 more per stop and fades. A
 * name that doesn't fit ONE line at 30 in 256 drops to 24 in up to TWO lines, and the strip grows
 * 44 → 56 with the position. Tapping a neighbour goes there.
 */
@Composable
private fun Names(list: List<Entry>, pos: MutableFloatState, go: (Int) -> Unit, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val maxName = 256.dp
    val style30 = KuraType.news(30f)
    // Natural width at 30, unconstrained (decides "long").
    val widths: List<Dp> = list.map { e ->
        remember(e.name, density.fontScale) {
            with(density) { measurer.measure(e.name, style30, maxLines = 1).size.width.toDp() }
        }
    }
    val long = widths.map { it > maxName }
    val centre by remember { derivedStateOf { pos.floatValue.roundToInt() } }
    val c = centre.coerceIn(0, list.size - 1)

    Box(
        modifier.fillMaxWidth().layout { m, cons ->
            val (lo, hi, t) = between(pos.floatValue, list.size)
            fun h(i: Int) = if (long.getOrElse(i) { false }) 56f else 44f
            val height = ((h(lo) + (h(hi) - h(lo)) * t).dp).roundToPx()
            val p = m.measure(cons.copy(minHeight = height, maxHeight = height))
            layout(p.width, height) { p.place(0, 0) }
        },
        contentAlignment = Alignment.Center,
    ) {
        for (i in (c - 3)..(c + 3)) {
            if (i !in list.indices) continue
            val e = list[i]
            val isLong = long[i]
            val size = if (isLong) 24f else 30f
            val box = if (isLong) maxName else minOf(widths[i], maxName)
            val neighbour = abs(i - c) == 1
            androidx.compose.runtime.key(e.id) {
                BasicText(
                    e.name,
                    Modifier
                        .width(box + 2.dp)
                        .graphicsLayer {
                            val d = i - pos.floatValue
                            val a = abs(d)
                            val cd = d.coerceIn(-1f, 1f)
                            val scale = (size - (size - 22f) * minOf(1f, a)) / size
                            val w = box.toPx() * scale
                            val px = 142.dp.toPx() * cd + (if (a > 1) (if (d > 0) 1 else -1) * (a - 1) * 278.dp.toPx() else 0f)
                            translationX = px + cd * w / 2
                            scaleX = scale
                            scaleY = scale
                            // Neighbours at .45 (≈3.6:1 on the darkest tint): they're tappable.
                            alpha = if (a <= 1) 1f - 0.55f * a else maxOf(0f, 0.45f * (2 - a))
                        }
                        .then(
                            when {
                                i == c -> Modifier.semanticsHeading()
                                neighbour -> Modifier.kPressable(feel = KPressFeel.Dim, onClickLabel = "Ir a ${e.name}") { go(i) }
                                else -> Modifier.clearAndSetSemantics { }
                            },
                        ),
                    style = KuraType.news(size).copy(textAlign = TextAlign.Center, lineHeight = (size + if (isLong) 2f else 6f).sp),
                    maxLines = if (isLong) 2 else 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun Modifier.semanticsHeading(): Modifier = semantics { heading() }

/**
 * Under the names. A collection of yours: the SAME body as Colección ([CollectionBody], 6b when
 * empty). "No puedo esperar": its line, count and countdowns (holding a title = 9b). The ghost:
 * the phrase and Nueva colección.
 */
@Composable
private fun Below(store: AppStore, e: Entry) {
    when (e) {
        is Entry.Shelf -> CollectionBody(store, e.c, metaTop = 4.dp)
        // Its songs, as a list, like any collection shows its titles (founder, 2026-09-29).
        is Entry.PartyEntry -> PartyCarouselBody(store, e.card)
        is Entry.Auto -> Column {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 32.dp).padding(top = 4.dp, bottom = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                BasicText("se llena sola con lo que aún no sale", style = KuraType.newsItalic(15f).copy(color = KColor.text2, textAlign = TextAlign.Center))
                MonoLabel(WaitingMeta.line(e.titles, store))
            }
            WaitingMasonry(store, e.titles.map { it.art })
        }
        Entry.New -> Column(
            Modifier.fillMaxWidth().padding(horizontal = 32.dp).padding(top = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BasicText(
                "Empieza por lo que no puedes dejar de recomendar. Una colección puede mezclar películas, series y álbumes.",
                style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center, lineHeight = 21.sp),
            )
            GlassButton("Nueva colección", { store.present(SheetRoute.NewCollection(addingTitleId = null)) }, Modifier.padding(top = 6.dp), icon = KIcon.Plus)
        }
    }
}

// MARK: 6c Cargando

/**
 * The real header ("tus colecciones" + the two 44 chips, inert, so nothing jumps when the page
 * lands), then the carousel's shape — the ghost fan at 225 in the same 290 band, the name's bar,
 * the meta's bar and a first row of three columns (póster · disco · póster) — pulsing as one.
 */
@Composable
private fun CollectionsSkeleton() {
    Column(Modifier.fillMaxSize().background(KColor.bg).clearAndSetSemantics { contentDescription = "Cargando colecciones" }) {
        TabTitleBar("tus colecciones") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(KIcon.Share, KIcon.More).forEach { icon ->
                    Box(Modifier.size(44.dp).background(KColor.s2, CircleShape), contentAlignment = Alignment.Center) {
                        KIconView(icon, size = 18.dp)
                    }
                }
            }
        }
        Column(Modifier.fillMaxWidth().kSkeletonPulse(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.height(290.dp).padding(top = 14.dp)) { FanView(emptyList(), 225.dp, ghost = true, plus = false) }
            Box(Modifier.height(44.dp).padding(top = 4.dp), contentAlignment = Alignment.Center) {
                SkeletonShape(Modifier.size(200.dp, 26.dp), radius = 8.dp)
            }
            SkeletonShape(Modifier.padding(top = 12.dp).size(150.dp, 14.dp), radius = 6.dp)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = KSize.margin).padding(top = 34.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                listOf(2f / 3f, 1f, 2f / 3f).forEach { a -> SkeletonShape(Modifier.weight(1f).aspectRatio(a), radius = KRadius.coverL) }
            }
        }
    }
}

// MARK: The launch failed

/** Offline or the server down at launch: say so and offer Reintentar — never a skeleton that doesn't end. */
@Composable
private fun CollectionsFailed(store: AppStore) {
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().background(KColor.bg)) {
        TabTitleBar("tus colecciones") {
            IconChip44(KIcon.Plus, "Nueva colección", { store.present(SheetRoute.NewCollection(addingTitleId = null)) })
        }
        val (title, note) = (store.loadError(LoadKey.Library) ?: com.tromwey.kura.data.api.KuraApiError.Server("")).loadCopy
        LoadErrorBlock(title, note, { scope.launch { store.bootstrap() } }, Modifier.padding(horizontal = 28.dp).padding(top = 58.dp))
    }
}

// MARK: 6a Sin colecciones

/**
 * The ghost fan (three empty slots, the dashed "+" in front — the way in), the phrase in
 * Newsreader 34, one line of body and Nueva colección.
 */
@Composable
private fun NoCollections(store: AppStore) {
    val open = { store.present(SheetRoute.NewCollection(addingTitleId = null)) }
    Column(Modifier.fillMaxSize().background(KColor.bg)) {
        TabTitleBar("tus colecciones") { IconChip44(KIcon.Plus, "Nueva colección", open) }
        // Someone whose only "collection" is a party they joined: a failed `GET /parties` must not
        // read as "you have nothing".
        PartiesRetryStrip(store)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp).padding(top = 52.dp, bottom = 140.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            FanView(emptyList(), 180.dp, Modifier.kPressable(onClickLabel = "Nueva colección", onClick = open), ghost = true, label = "Nueva colección")
            BasicText(
                "aquí va lo que más vale.",
                Modifier.padding(top = 16.dp).semanticsHeading(),
                style = KuraType.emptyPhrase.copy(textAlign = TextAlign.Center),
            )
            BasicText(
                "Empieza por lo que no puedes dejar de recomendar. Una colección puede mezclar películas, series y álbumes.",
                style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center, lineHeight = 21.sp),
            )
            GlassButton("Nueva colección", open, Modifier.padding(top = 6.dp), icon = KIcon.Plus)
        }
    }
}

// MARK: O2a Nueva colección

/**
 * The name in Newsreader ("nombre de la colección", ≤ 40), "Quién la ve" (the account's default; opens the
 * three choices in place) and Crear. From scratch it opens the new collection; from "Guardar en"
 * it saves the title there; from "Mover a" it moves it.
 */
@Composable
fun KuraSheetScope.NewCollectionSheet(store: AppStore, sheet: SheetRoute.NewCollection) {
    val dismiss: () -> Unit = this::close
    var name by rememberSaveable { mutableStateOf("") }
    var privacyName by rememberSaveable { mutableStateOf(store.defaultPrivacy.name) }
    var choosing by rememberSaveable { mutableStateOf(false) }
    val privacy = Privacy.valueOf(privacyName)
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    // Colección | Fiesta (fiesta-app-v2 `create`). Only from scratch: saving a title "en una nueva"
    // is always a normal collection (a party holds songs, never a title).
    var party by rememberSaveable { mutableStateOf(false) }
    var limitIndex by rememberSaveable { mutableStateOf(PartyCopy.limits.indexOf(PartyCopy.defaultLimit)) }
    var creatingParty by remember { mutableStateOf(false) }

    val create = create@{
        if (name.isBlank()) return@create
        if (party) {
            if (creatingParty) return@create
            creatingParty = true
            // Opens the party with its share sheet (`createParty`); a failure says why.
            // On the store's scope: the sheet closes mid-way (and takes its own scope with it),
            // and the share sheet still has to open over the new party.
            store.launch {
                store.createParty(name, PartyCopy.limits[limitIndex])
                creatingParty = false
            }
            return@create
        }
        val id = store.createCollection(name, privacy, adding = sheet.addingTitleId)
        store.dismissSheet()
        val c = store.collection(id)
        val adding = sheet.addingTitleId
        when {
            sheet.movingFrom != null && adding != null && c != null -> {
                store.removeSilently(adding, sheet.movingFrom)
                store.showToast(ToastModel("Movido a ${c.name}", ToastModel.Kind.Info))
            }
            adding == null -> store.push(Route.Collection(id))
            c != null -> store.showToast(ToastModel("Guardado en ${c.name}", ToastModel.Kind.Info))
        }
    }

    SheetHeader("nueva colección", onClose = { dismiss() })
    Column(Modifier.padding(horizontal = 8.dp).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (sheet.addingTitleId == null) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                KindRow(!party, "Colección", "Agrega series, películas o álbumes.") { party = false }
                KindRow(party, "Fiesta", "Cada invitado agrega canciones.") { party = true }
            }
        }
        KuraTextField(
            name,
            { name = it.take(if (party) 60 else AppStore.COLLECTION_NAME_LIMIT) },
            if (party) "la fiesta de…" else "nombre de la colección",
            serif = true,
            imeAction = ImeAction.Done,
            focusRequester = focus,
            keyboardActions = KeyboardActions(onDone = { create() }),
            fill = KColor.glassBg,
        )
        if (party) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BasicText("Canciones por invitado", style = KuraType.ui(14f, com.tromwey.kura.designsystem.UiWeight.SemiBold))
                PartyLimitStepper(PartyCopy.limits[limitIndex], { l -> limitIndex = PartyCopy.limits.indexOf(l).coerceAtLeast(0) })
            }
        } else if (choosing) {
            Column {
                PrivacyOptions(privacy) { p ->
                    privacyName = p.name
                    choosing = false
                }
            }
        } else {
            SettingsRow("Quién la ve", onClick = { choosing = true }) { RowValue(privacy.label, icon = KIcon.ChevronUpDown) }
        }
        SolidButton(if (party) "Crear fiesta" else "Crear", { create() }, enabled = name.isNotBlank() && !creatingParty)
    }
}

/** Colección | Fiesta: a flat choice card, the selected one on the brighter fill (no border). */
@Composable
private fun KindRow(on: Boolean, title: String, note: String, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth()
            .background(if (on) KColor.glassSelected else KColor.glassBg, androidx.compose.foundation.shape.RoundedCornerShape(KRadius.surface))
            .kPressable(feel = KPressFeel.Dim, role = androidx.compose.ui.semantics.Role.RadioButton, onClickLabel = title, onClick = onClick)
            .semantics { selected = on }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        BasicText(title, style = KuraType.ui(16f, com.tromwey.kura.designsystem.UiWeight.SemiBold))
        BasicText(note, style = KuraType.ui(14f).copy(color = KColor.text2))
    }
}
