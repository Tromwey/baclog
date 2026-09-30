package com.tromwey.kura.features.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FeedKind
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KShadow
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.HoneyButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KPill
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraPullToRefresh
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.TabTitleBar
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.kShadow
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.LoadState
import com.tromwey.kura.state.bootstrap
import com.tromwey.kura.state.hasUnread
import com.tromwey.kura.state.isFollowing
import com.tromwey.kura.state.loadFeed
import com.tromwey.kura.state.loadMoreFeed
import com.tromwey.kura.state.loadOnboardingPeople
import com.tromwey.kura.state.toggleFollow
import com.tromwey.kura.state.visibleFeed
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

// Feed v10 (iOS `FeedView`): a STACK of tinted cards. Each card pins under the header and the next
// one slides over it, raising a band of its own colour behind the header as it arrives. Tiers
// L 620 / M 500 / S 370 (capped so the next card's edge always shows), snap per card, the "hit"
// haptic when a card reaches the top. See `.claude/knowledge/state/frontend.md` § Feed.

/** How far a card's surface runs past its own height, so the card rising from underneath always
 *  mounts over colour instead of bare bg. */
private val Ext = 120.dp

/** The neutral tint (no cover, no person palette): iOS `palette(nil)`. */
private val Neutral = listOf("#6c6b76")

/**
 * E1 stays up once shown until you leave the tab (following the first suggestion used to flip the
 * feed to "quiet" on the spot and take the other suggestions with it). Per account; a push inside
 * the feed tab keeps it, switching tabs clears it.
 */
private object FeedMemory {
    var holdEmptyFor by mutableStateOf<String?>(null)
}

/** Tab root · tu feed. */
@Composable
fun FeedScreen(store: AppStore) {
    val scope = rememberCoroutineScope()
    val holdEmpty = FeedMemory.holdEmptyFor == store.me.id
    // Only the visible tab is composed (MainTabs): this runs when the feed is OPENED and every time
    // it comes back from a push — so a followed set that changed meanwhile reloads it (feedStale).
    LaunchedEffect(Unit) {
        if (store.feedStale) store.loadFeed(force = true) else store.loadFeed()
    }
    DisposableEffect(Unit) {
        onDispose { if (store.tab != Tab.Feed) FeedMemory.holdEmptyFor = null }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(KColor.bg)) {
        val density = LocalDensity.current
        val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
        // The header's real height (TabTitleBar: status bar + its expanded 96); measured, with the
        // same sum as the first frame's guess.
        var hdr by remember { mutableStateOf(statusTop + 96.dp) }
        val header: @Composable (Modifier) -> Unit = { m ->
            FeedHeader(store, m.onSizeChanged { with(density) { hdr = it.height.toDp() } })
        }
        // The tiers are fractions of the screen below the status bar (iOS: below its header top).
        val base = maxHeight - statusTop
        val viewport = maxHeight
        val events = store.visibleFeed

        when {
            store.loadState == LoadState.Failed -> Plain(header) {
                // The launch failed: "nobody you follow" would be a lie — we don't know yet.
                val (t, n) = (store.loadError(LoadKey.Library) ?: KuraApiError.Unsupported).loadCopy
                LoadErrorBlock(t, n, onRetry = { scope.launch { store.bootstrap() } }, titleSize = 32f)
            }
            // Only once the launch loaded: before `/me` + `/me/following` land, "nobody followed" is a guess.
            holdEmpty || (store.loadState == LoadState.Loaded && store.following.isEmpty() && store.me.followingCount == 0) -> {
                LaunchedEffect(store.me.id) { FeedMemory.holdEmptyFor = store.me.id }
                FeedEmpty(store, header)
            }
            !store.feedLoaded && events.isEmpty() && store.loadError(LoadKey.Feed) != null -> Plain(header) {
                val (t, n) = store.loadError(LoadKey.Feed)!!.loadCopy
                LoadErrorBlock(t, n, onRetry = { scope.launch { store.loadFeed(force = true) } }, titleSize = 32f)
            }
            !store.feedLoaded && events.isEmpty() -> FeedSkeleton(hdr, tierHeight(FeedEvent.Tier.M, base), header)
            events.isEmpty() -> Plain(header) { Quiet(store) }
            else -> FeedStack(store, events, hdr, base, viewport, header)
        }
    }
}

/** Three fixed heights; the fraction only caps them so the next card always shows. */
private fun tierHeight(t: FeedEvent.Tier, base: Dp): Dp = when (t) {
    FeedEvent.Tier.L -> minOf(620.dp, base * 0.72f)
    FeedEvent.Tier.M -> minOf(500.dp, base * 0.58f)
    FeedEvent.Tier.S -> minOf(370.dp, base * 0.44f)
}

/** A card is never lit by nothing: the cover's palette, else the author's. */
private fun palette(store: AppStore, e: FeedEvent): List<String> {
    when (val k = e.kind) {
        is FeedKind.Burst -> {
            val first = k.titleIds.firstOrNull()?.let { store.title(it)?.palette }.orEmpty()
            val last = k.titleIds.lastOrNull()?.let { store.title(it)?.palette }.orEmpty()
            first.firstOrNull()?.let { a -> return listOf(a, if (last.size > 1) last[1] else a) }
        }
        is FeedKind.Suggestion -> store.person(k.personId)?.hexes?.takeIf { it.isNotEmpty() }?.let { return it }
        else -> e.titleId?.let { store.title(it) }?.palette?.takeIf { it.isNotEmpty() }?.let { return it }
    }
    return store.person(e.authorId)?.hexes?.takeIf { it.isNotEmpty() } ?: Neutral
}

// MARK: Header

/** "tu feed" (the tab's big title, like every tab) + the bell with its dot. Transparent over the
 *  stack: the card on top paints the band behind it. Static (it doesn't collapse): the stack pins
 *  its cards on this line, and a bar that shrinks to s1 would cover the bands and move the line. */
@Composable
private fun FeedHeader(store: AppStore, modifier: Modifier) {
    val unread = store.hasUnread
    TabTitleBar("tu feed", modifier) {
        Box {
            IconChip44(KIcon.Bell, if (unread) "Notificaciones, hay nuevas" else "Notificaciones", onClick = { store.push(Route.Notifications) }, iconSize = 17.dp)
            if (unread) {
                Box(
                    Modifier.align(Alignment.TopEnd).offset(x = (-9).dp, y = 8.dp).size(12.dp)
                        .background(KColor.bg.copy(alpha = 0.6f), CircleShape).padding(2.dp)
                        .background(KColor.text, CircleShape).clearAndSetSemantics { },
                )
            }
        }
    }
}

/** A state that isn't the stack (error, quiet): the header over bg and the content below it. */
@Composable
private fun Plain(header: @Composable (Modifier) -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().background(KColor.bg)) {
        header(Modifier)
        Box(Modifier.padding(start = 28.dp, end = 28.dp, top = 36.dp)) { content() }
    }
}

/** Followed people, nothing from them yet. */
@Composable
private fun Quiet(store: AppStore) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        BasicText("tu gente anda tranquila.", style = KuraType.news(32f))
        BasicText("Cuando completen, se obsesionen o reseñen algo, aparece aquí.", style = KuraType.ui(15f).copy(color = KColor.text2))
        GlassButton("Buscar más gente", onClick = { store.select(Tab.Discover) }, Modifier.padding(top = 6.dp), icon = KIcon.Search)
    }
}

// MARK: E1 · feed vacío

/** Nobody followed yet: "tu gente todavía no llega." + the onboarding's people to follow (the first
 *  three of `GET me/onboarding/people`), all at once (the screen's honey) or one by one. */
@Composable
private fun FeedEmpty(store: AppStore, header: @Composable (Modifier) -> Unit) {
    LaunchedEffect(Unit) { store.loadOnboardingPeople() }
    val people = store.onboardingPeople.take(3).map { store.person(it.id) ?: it }
    Column(Modifier.fillMaxSize().background(KColor.bg)) {
        header(Modifier)
        Column(
            Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 28.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BasicText("tu gente todavía no llega.", style = KuraType.news(30f))
            BasicText(
                "Sigue a quien comparte tus obsesiones y aquí vas a ver lo que completan y les obsesiona.",
                style = KuraType.ui(14f).copy(color = KColor.text2),
            )
            if (people.isNotEmpty()) {
                val all = people.all { store.isFollowing(it.id) }
                val m = Modifier.padding(top = 18.dp, bottom = 6.dp)
                if (all) {
                    GlassButton("Siguiendo a los ${people.size}", onClick = {}, m, height = 52.dp, fontSize = 16f, fullWidth = true)
                } else {
                    HoneyButton("Seguir a los ${people.size}", onClick = {
                        people.filter { !store.isFollowing(it.id) }.forEach { store.toggleFollow(it.id) }
                    }, m)
                }
            }
            people.forEach { p ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp)
                        .kPressable(KPressFeel.Row(inset = (-10).dp), onClickLabel = "Ver el perfil de @${p.handle}") { store.push(Route.PersonRoute(p.handle)) },
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Seal(p.initials, p.hexes, size = 44.dp, photo = p.photo)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        BasicText("@${p.handle}", style = KuraType.ui(16f, UiWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        p.why?.takeIf { it.isNotEmpty() }?.let { MonoLabel(it) }
                    }
                    FollowButton(
                        if (store.isFollowing(p.id)) FollowState.Following else FollowState.Follow,
                        onClick = { store.toggleFollow(p.id) },
                        handle = p.handle,
                    )
                }
            }
        }
    }
}

// MARK: Stack

private class StackRow(val event: FeedEvent, val index: Int, val height: Dp, /** layout top at rest, px */ val top: Float, val palette: List<String>)

@Composable
private fun FeedStack(store: AppStore, events: List<FeedEvent>, hdr: Dp, base: Dp, viewport: Dp, header: @Composable (Modifier) -> Unit) {
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val hdrPx = with(density) { hdr.toPx() }
    // Card 0 runs up behind the header (its slot = hdr + its height); each next card starts where
    // the previous card's height ends. Recomputed per composition: palettes can arrive later.
    val rows = run {
        var above = 0f
        events.mapIndexed { i, e ->
            val h = tierHeight(e.tier, base)
            val row = StackRow(e, i, h, if (i == 0) 0f else hdrPx + above, palette(store, e))
            above += with(density) { h.toPx() }
            row
        }
    }
    val tailTop = hdrPx + rows.sumOf { with(density) { it.height.toPx() }.toDouble() }.toFloat()
    val tops by rememberUpdatedState(rows.map { it.top } + tailTop)
    val listState = rememberLazyListState()
    val offset: () -> Float = {
        val i = listState.firstVisibleItemIndex
        (tops.getOrNull(i) ?: tops.last()) + listState.firstVisibleItemScrollOffset
    }

    // Snap: card 0 to the top, every other card under the header; the tail = the last card snapped.
    val lastH = with(density) { rows.last().height.toPx() }
    val snap = remember(hdrPx, lastH) {
        object : SnapPosition {
            override fun position(layoutSize: Int, itemSize: Int, beforeContentPadding: Int, afterContentPadding: Int, itemIndex: Int, itemCount: Int): Int =
                when (itemIndex) {
                    0 -> 0
                    itemCount - 1 -> (hdrPx + lastH).toInt()
                    else -> hdrPx.toInt()
                }
        }
    }

    // The hit: card i ≥ 1 pins when the stack has scrolled by its top less hdr.
    val haptic = rememberKHaptic()
    val hits = remember(density) { FeedHits(density.density) { haptic(it) } }
    val marks = rows.drop(1).map { it.top - hdrPx }
    LaunchedEffect(marks) { hits.setMarks(marks) }
    LaunchedEffect(listState) {
        // The drag and its fling are two scrolls with a frame of "not scrolling" between them: only a
        // stop that lasts (and no finger down) ends the user's run.
        snapshotFlow { listState.isScrollInProgress }.distinctUntilChanged().collectLatest {
            if (!it) {
                delay(150)
                if (!hits.fingerDown) hits.stopped()
            }
        }
    }
    LaunchedEffect(listState) { snapshotFlow { offset() }.collect { hits.scrolled(it) } }

    // A refresh that brings a new first card: the list would keep the old one in view by its key,
    // off its snap line. The stack starts over from the top instead.
    val firstId = rows.first().event.id
    LaunchedEffect(firstId) {
        if (listState.firstVisibleItemIndex != 0 || listState.firstVisibleItemScrollOffset != 0) listState.scrollToItem(0)
    }

    var refreshing by remember { mutableStateOf(false) }
    val moreError = store.loadError(LoadKey.FeedMore)
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        // The pull indicator comes out under the header: the refresh box starts at hdr and the list
        // is laid out hdr taller, shifted up, so the first card still runs up behind the header.
        KuraPullToRefresh(
            refreshing = refreshing,
            onRefresh = {
                scope.launch {
                    refreshing = true
                    store.loadFeed(force = true)
                    refreshing = false
                }
            },
            modifier = Modifier.fillMaxSize().padding(top = hdr),
        ) {
            LazyColumn(
                state = listState,
                flingBehavior = rememberSnapFlingBehavior(listState, snap),
                modifier = Modifier.fillMaxWidth()
                    // A finger on the stack: what moves it now (the drag, its fling, the snap) is the user's.
                    .pointerInput(hits) {
                        awaitEachGesture {
                            awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                            hits.userDriven = true
                            hits.fingerDown = true
                            do {
                                val e = awaitPointerEvent(PointerEventPass.Initial)
                            } while (e.changes.any { it.pressed })
                            hits.fingerDown = false
                        }
                    }
                    .layout { m, c ->
                    val extra = hdrPx.toInt()
                    val p = m.measure(c.copy(minHeight = c.maxHeight + extra, maxHeight = c.maxHeight + extra))
                    layout(c.maxWidth, c.maxHeight) { p.place(0, -extra) }
                },
            ) {
                itemsIndexed(rows, key = { _, r -> r.event.id }) { _, row ->
                    StackCard(store, row, hdr, hdrPx, offset)
                }
                item(key = "tail") {
                    val last = rows.last()
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(maxOf(viewport - hdr - last.height, 0.dp) + Ext)
                            .zIndex(if (moreError != null) rows.size.toFloat() else -1f)
                            .background(Tint.ends(last.palette).second.color),
                    ) {
                        // The next page loads when the END of the stack comes into view, re-armed per page.
                        LaunchedEffect(last.event.id) { store.loadMoreFeed() }
                        if (moreError != null) {
                            RetryStrip(
                                if (moreError == KuraApiError.Offline) "Sin conexión. No se cargó lo anterior." else "No se cargó lo anterior.",
                                onRetry = { scope.launch { store.loadMoreFeed(retry = true) } },
                                modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 16.dp),
                                offline = moreError == KuraApiError.Offline,
                            )
                        }
                    }
                }
            }
        }
        header(Modifier)
        store.loadError(LoadKey.Feed)?.let { e ->
            // A refresh failed over a feed already on screen: say it's old.
            RetryStrip(
                if (e == KuraApiError.Offline) "Sin conexión. Ves tu feed de antes." else "No se pudo actualizar tu feed.",
                onRetry = { scope.launch { store.loadFeed(force = true) } },
                modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = hdr),
                offline = e == KuraApiError.Offline,
            )
        }
    }
}

/**
 * One card of the stack: it pins under the header (card 0 at the top) and, in its last 140 before
 * pinning, raises its own surface (the band) over the header, its upward shadow fading as it
 * goes. Everything that follows the scroll is read in the layer (no recomposition per frame).
 */
@Composable
private fun StackCard(store: AppStore, row: StackRow, hdr: Dp, hdrPx: Float, offset: () -> Float) {
    val density = LocalDensity.current
    val first = row.index == 0
    val slot = row.height + if (first) hdr else 0.dp
    val pin = if (first) 0f else hdrPx
    val shape = if (first) RoundedCornerShape(0.dp) else RoundedCornerShape(topStart = KRadius.screen, topEnd = KRadius.screen)
    val lift = hdr + KRadius.screen
    val liftPx = with(density) { lift.toPx() }
    val span = with(density) { 140.dp.toPx() }
    fun progress(): Float = ((1f - (row.top - offset() - hdrPx) / span)).coerceIn(0f, 1f)
    fun rise(p: Float) = liftPx * p * p * (3 - 2 * p)

    Box(
        Modifier
            .fillMaxWidth()
            .height(slot)
            .zIndex(row.index.toFloat())
            .graphicsLayer { translationY = maxOf(0f, pin - (row.top - offset())) },
    ) {
        if (!first) {
            val bandShape = RoundedCornerShape(topStart = KRadius.screen, topEnd = KRadius.screen)
            val band = Modifier.fillMaxWidth().wrapContentHeight(Alignment.Top, unbounded = true).height(lift + KRadius.screen * 2)
            // The stack's shadow casts UPWARD, rides with the band (same shape, same rise) and fades
            // over the whole way up. ModulateAlpha, NOT the default: with alpha < 1 the default layer
            // renders offscreen at the box's size and clips the blur that falls above it — the shadow
            // vanished the instant the band started rising (founder, Pixel 4, 2026-09-30).
            Box(
                band.graphicsLayer {
                    val p = progress()
                    translationY = -rise(p)
                    alpha = 1f - p
                    compositingStrategy = CompositingStrategy.ModulateAlpha
                }.kShadow(KShadow.Stack, bandShape),
            )
        }
        val brush = remember(row.palette) { Tint.card(row.palette) }
        val surface = remember { Path() }
        Box(
            Modifier
                .fillMaxWidth()
                .wrapContentHeight(Alignment.Top, unbounded = true)
                .height(slot + Ext)
                .then(
                    if (first) {
                        Modifier.background(brush, shape)
                    } else {
                        // The band IS the card: one path from the risen top to the bottom, painted with the
                        // card's own brush in the card's coordinates (the shader is sized to this box, so above
                        // its top the 168° gradient simply continues). A separate flat band left the card's
                        // rounded corners readable against it once pinned (founder, Pixel 4, 2026-09-30).
                        Modifier.drawBehind {
                            val r = KRadius.screen.toPx()
                            surface.rewind()
                            surface.addRoundRect(
                                RoundRect(0f, -rise(progress()), size.width, size.height, topLeftCornerRadius = CornerRadius(r), topRightCornerRadius = CornerRadius(r)),
                            )
                            drawPath(surface, brush)
                        }
                    },
                ),
        ) {
            FeedCard(store, row.event, row.height, if (first) hdr else 0.dp)
        }
    }
}

// MARK: Skeleton

/**
 * The stack's shape while `GET /feed` runs — the SAME geometry as the stack at rest (founder,
 * 2026-09-27): card 0 (M) runs up behind the header, card 1 (M) starts at hdr + M with its corners
 * and its resting band's shadow. Neutral tint: the colour is the one thing a skeleton can't know.
 */
@Composable
private fun FeedSkeleton(hdr: Dp, h: Dp, header: @Composable (Modifier) -> Unit) {
    val card = Tint.card(Neutral)
    val top = Tint.ends(Neutral).first.color
    val round = RoundedCornerShape(topStart = KRadius.screen, topEnd = KRadius.screen)
    Box(Modifier.fillMaxSize().background(KColor.bg).clearAndSetSemantics { contentDescription = "Cargando tu feed" }) {
        Box(Modifier.fillMaxWidth().height(hdr + h + Ext).background(card)) { SkeletonCard(h, hdr) }
        Box(Modifier.fillMaxWidth().padding(top = hdr + h)) {
            Box(Modifier.fillMaxWidth().height(hdr + KRadius.screen * 3).kShadow(KShadow.Stack, round).background(top, round))
            Box(Modifier.fillMaxWidth().wrapContentHeight(Alignment.Top, unbounded = true).height(h + Ext).background(card, round)) {
                SkeletonCard(h, 0.dp)
            }
        }
        header(Modifier)
    }
}

/** An M card whose title fits one line: chip 36 · 14 · 2:3 cover filling the art · 14 · pill 30 · 9 ·
 *  one italic 26 line (a hidden text gives the height) · 22 to the edge. */
@Composable
private fun SkeletonCard(h: Dp, topInset: Dp) {
    Column(
        Modifier.fillMaxWidth().height(h + topInset)
            .padding(start = 20.dp, end = 20.dp, top = FeedCardInset.top + topInset, bottom = FeedCardInset.bottom),
        verticalArrangement = Arrangement.spacedBy(FeedCardInset.gap),
    ) {
        Box(Modifier.width(168.dp).height(36.dp).background(KColor.glassBg, CircleShape), contentAlignment = Alignment.CenterStart) {
            Skeleton(Modifier.padding(start = 4.dp).size(28.dp), radius = 999.dp)
        }
        BoxWithConstraints(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
            val w = minOf(maxWidth, maxHeight * (2f / 3f))
            Skeleton(Modifier.width(w).height(w * 1.5f))
        }
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Box(Modifier.width(150.dp).height(KPill.card.height).background(KColor.glassBg, CircleShape))
            SkeletonLine()
        }
    }
}

@Composable
private fun SkeletonLine(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
        BasicText("Título", style = KuraType.newsItalic(26f).copy(color = KColor.bg.copy(alpha = 0f)))
        Skeleton(Modifier.width(210.dp).height(22.dp), radius = 6.dp)
    }
}
