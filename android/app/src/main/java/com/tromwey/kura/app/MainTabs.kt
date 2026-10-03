package com.tromwey.kura.app

import androidx.activity.compose.BackHandler
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.core.ExperimentalTransitionApi
import androidx.compose.animation.core.Transition
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.createChildTransition
import androidx.compose.animation.core.updateTransition
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.SaveableStateHolder
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalFocusManager
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.designsystem.EntryHost
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KuraTab
import com.tromwey.kura.designsystem.LocalReduceMotion
import com.tromwey.kura.designsystem.components.KuraDock
import com.tromwey.kura.designsystem.components.KuraHeroLayout
import com.tromwey.kura.designsystem.components.LocalHeroVisibilityScope
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.hasUnread
import com.tromwey.kura.state.path
import com.tromwey.kura.state.pop
import com.tromwey.kura.state.select
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * The system's predictive back (Android 13+; the twin of iOS's interactive swipe-to-go-back): while
 * the finger drags, the page slides right with it and the page below — alive — comes back from its
 * quarter; letting go pops with the stack's spring from where the finger left it, cancelling
 * springs back. `false` = back still pops, with no preview under the finger.
 */
internal const val PREDICTIVE_BACK = true

/**
 * Four tabs (iOS `MainTabs`). Each tab owns a stack (`store.paths[tab]`, root = the tab's screen).
 * Switching tabs is instant (0 ms) and keeps each tab's place, like iOS's `TabView`: a tab is
 * composed when it's first OPENED (never at launch — its loads run then, learning
 * 2026-09-24-ios-tabs-montadas-al-arrancar-cargan-antes-de-tiempo) and from then on it stays
 * composed, not drawn, while another tab shows. Inside a tab the stack is LIVE too ([TabStack]).
 * What a page must know about that is `LocalEntryActive` (designsystem/EntryActive.kt).
 * The navigation bar ([MainDock]) is NOT drawn here: it's the `bottomBar` of `KuraRoot`'s
 * `KuraScaffold` (Material 3 Expressive's `ShortNavigationBar`, glued to the bottom edge), which
 * gives this content its height as bottom padding.
 */
@Composable
fun MainTabs(store: AppStore) {
    LaunchedEffect(Unit) { store.startIfNeeded() }
    val tab = store.tab
    val tabs = rememberSaveableStateHolder()
    // Not snapshot state on purpose: it only ever grows with the tab being composed right now.
    val visited = remember { mutableSetOf<Tab>() }
    visited.add(tab)
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Tab.entries.forEach { t ->
            if (t in visited) {
                key(t) {
                    Box(Modifier.fillMaxSize().placedIf(t == tab)) {
                        tabs.SaveableStateProvider(t.name) { TabStack(t, store, visible = t == tab) }
                    }
                }
            }
        }
    }
    // System back at a secondary tab's root goes to Colecciones (Android's "back to the start
    // destination"); at Colecciones' root the system takes it (leaves the app). Inside a stack the
    // tab's own handler pops ([TabStack]).
    BackHandler(enabled = store.path(tab).isEmpty() && tab != Tab.Collections) { store.select(Tab.Collections) }
}

/** Measured always, placed only when [placed]: an unplaced page isn't drawn, hit or read by TalkBack. */
private fun Modifier.placedIf(placed: Boolean): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints)
    layout(p.width, p.height) { if (placed) p.place(0, 0) }
}

/**
 * The navigation bar of the tabs: 4 destinations, `store.select`, the feed's badge = `hasUnread`.
 * `KuraRoot` shows it (in its scaffold's `bottomBar`) where `store.dockVisible(tab)` says — tab
 * roots and the browsing pushes.
 */
@Composable
fun MainDock(store: AppStore) {
    KuraDock(
        selected = KuraTab.valueOf(store.tab.name),
        onSelect = { store.select(Tab.valueOf(it.name)) },
        feedDot = store.hasUnread,
    )
}

/** The predictive back gesture in flight (or frozen after it committed, until its pop settles). */
@Stable
private class BackDrag {
    var topKey by mutableStateOf<String?>(null)
    var belowKey by mutableStateOf<String?>(null)
    var fraction by mutableFloatStateOf(0f)
    var live by mutableStateOf(false)

    fun begin(top: String, below: String) {
        topKey = top
        belowKey = below
        fraction = 0f
        live = true
    }

    fun clear() {
        topKey = null
        belowKey = null
        fraction = 0f
        live = false
    }
}

/**
 * A tab's stack with LIVE entries (iOS `NavigationStack`): the top [MAX_LIVE_ENTRIES] entries of the
 * path stay composed, so Volver finds the page below exactly as it was (scroll, loaded lists,
 * fields, half-played animations) instead of rebuilding it from saved state. Only the top entry is
 * placed — a covered one is measured but not placed: not drawn, not hit, not in TalkBack's tree —
 * plus the two that move during a transition. Entries deeper than the window leave composition and
 * come back from the [SaveableStateHolder] (also what a process death restores from); an entry that
 * leaves the stack leaves composition when its animation ends and its saved state is forgotten.
 *
 * The choreography is the one this stack always had, now driven by one [Transition] over the top
 * entry: push = the new page slides in from the right over the old one (which recedes a quarter);
 * pop = the reverse, the leaving page on top. Reduce motion: everything cross-fades and the cover
 * doesn't fly. The slide keeps Kura's own `KMotion.spring` (not Material's scheme) ON PURPOSE: it
 * rides with the shared cover's 320 ms spring, and two curves would tear the cover off its page.
 * Inside the tab's [KuraHeroLayout]: `Modifier.kHeroCover(key)` on the card below and the same key
 * on the page above fly the cover. Only the settled top and the two moving entries get a hero
 * scope — a covered page with a registered cover would be a permanent "match" for the page above.
 */
@OptIn(ExperimentalTransitionApi::class)
@Composable
private fun TabStack(tab: Tab, store: AppStore, visible: Boolean) {
    val path = store.path(tab)
    val top = topEntry(path)
    val saved = rememberSaveableStateHolder()
    val reduce = LocalReduceMotion.current
    val scope = rememberCoroutineScope()
    val drag = remember { BackDrag() }

    // Forget the saved state of the entries that left the stack (a popped page starts fresh next time).
    val inStack = remember(path) { stackEntries(path).map { it.key }.toSet() }
    var known by remember { mutableStateOf(inStack) }
    LaunchedEffect(inStack) {
        (known - inStack).forEach(saved::removeState)
        known = inStack
    }

    // A field focused on the page that just got covered must not keep the keyboard.
    val focus = LocalFocusManager.current
    var focusedOn by remember { mutableStateOf(top.key) }
    LaunchedEffect(top.key) {
        if (focusedOn != top.key) {
            focusedOn = top.key
            focus.clearFocus(force = true)
        }
    }

    val transition = updateTransition(top, label = "stack-${tab.name}")
    val settled = transition.currentState == transition.targetState && !transition.isRunning
    val moving = if (settled) emptyList() else listOf(
        transition.segment.initialState, transition.segment.targetState, transition.currentState, transition.targetState,
    )
    LaunchedEffect(settled, drag.live) { if (settled && !drag.live) drag.clear() }

    PredictiveBackHandler(enabled = visible && path.isNotEmpty()) { progress ->
        val entries = stackEntries(store.path(tab))
        val from = entries.last()
        // No preview over a transition still running (a second back right after the first) nor
        // under reduce motion: the pop itself is all there is to see.
        val preview = PREDICTIVE_BACK && !reduce && entries.size > 1 && !drag.live && drag.topKey == null
        try {
            progress.collect { event ->
                if (preview) {
                    if (!drag.live) drag.begin(from.key, entries[entries.size - 2].key)
                    drag.fraction = event.progress.coerceIn(0f, 1f)
                }
            }
            if (preview) drag.live = false
            if (store.tab == tab && topEntry(store.path(tab)).key == from.key) store.pop()
        } catch (e: CancellationException) {
            if (preview && drag.live) {
                scope.launch {
                    animate(drag.fraction, 0f, animationSpec = KMotion.spring()) { v, _ -> drag.fraction = v }
                    drag.live = false
                }
            }
            throw e
        }
    }

    KuraHeroLayout(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize()) {
            composedEntries(path, moving).forEach { entry ->
                key(entry.key) {
                    StackPage(
                        entry = entry,
                        top = top,
                        transition = transition,
                        moving = moving.any { it.key == entry.key },
                        tabVisible = visible,
                        drag = drag,
                        saved = saved,
                    ) {
                        val route = entry.route
                        if (route == null) TabRootScreen(tab, store) else RouteScreen(route, store)
                    }
                }
            }
        }
    }
}

private class EntryVisibilityScope(override val transition: Transition<EnterExitState>) : AnimatedVisibilityScope

/** One entry of the stack: where it sits, whether it's placed at all, and what its page gets to know. */
@OptIn(ExperimentalTransitionApi::class)
@Composable
private fun StackPage(
    entry: StackEntry,
    top: StackEntry,
    transition: Transition<StackEntry>,
    moving: Boolean,
    tabVisible: Boolean,
    drag: BackDrag,
    saved: SaveableStateHolder,
    content: @Composable () -> Unit,
) {
    val reduce = LocalReduceMotion.current
    val isTop = entry.key == top.key
    val offset = transition.animateFloat({ KMotion.spring() }, label = "x") { restingOffset(entry, it, reduce) }
    val alpha = transition.animateFloat({ KMotion.fade() }, label = "alpha") { restingAlpha(entry, it, reduce) }
    // The shared cover reads its destination's enter/exit state from here.
    val enterExit = transition.createChildTransition(label = "hero") {
        when {
            it.key == entry.key -> EnterExitState.Visible
            entry.depth > it.depth -> EnterExitState.PreEnter
            else -> EnterExitState.PostExit
        }
    }
    val heroScope = remember(enterExit) { EntryVisibilityScope(enterExit) }
    val uncovering = drag.belowKey == entry.key
    val placed = isTop || moving || uncovering

    Box(
        Modifier.fillMaxSize().layout { measurable, constraints ->
            val p = measurable.measure(constraints)
            val lookingAhead = isLookingAhead
            layout(p.width, p.height) {
                if (!placed) return@layout
                // The lookahead pass sees every page at rest: that's where a flying cover lands.
                if (lookingAhead) {
                    p.place(0, 0)
                    return@layout
                }
                val x = draggedOffset(
                    base = offset.value,
                    asTop = if (drag.topKey == entry.key) drag.fraction else 0f,
                    asBelow = if (uncovering) drag.fraction else 0f,
                )
                val a = alpha.value
                if (x == 0f && a == 1f) p.place(0, 0)
                else p.placeWithLayer((x * p.width).roundToInt(), 0) { this.alpha = a }
            }
        },
    ) {
        CompositionLocalProvider(LocalHeroVisibilityScope provides if (isTop || moving) heroScope else null) {
            EntryHost(active = isEntryActive(tabVisible, entry, top)) {
                saved.SaveableStateProvider(entry.key) {
                    // Opaque: a push slides this page over the one below.
                    Box(Modifier.fillMaxSize().background(KColor.bg)) { content() }
                }
            }
        }
    }
}
