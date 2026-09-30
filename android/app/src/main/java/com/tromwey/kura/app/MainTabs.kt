package com.tromwey.kura.app

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KuraTab
import com.tromwey.kura.designsystem.LocalReduceMotion
import com.tromwey.kura.designsystem.components.HeroDestination
import com.tromwey.kura.designsystem.components.KuraDock
import com.tromwey.kura.designsystem.components.KuraHeroLayout
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.hasUnread

/**
 * Four tabs (iOS `MainTabs`). Each tab owns a stack (`store.paths[tab]`, root = the tab's screen).
 * Switching tabs is instant (0 ms) and keeps each tab's place: only the visible tab is composed (a
 * tab's loads run when it's OPENED, not at launch — learning
 * 2026-09-24-ios-tabs-montadas-al-arrancar-cargan-antes-de-tiempo), and every screen's
 * `rememberSaveable` state (scroll, fields) survives in a [rememberSaveableStateHolder].
 * The navigation bar ([MainDock]) is NOT drawn here: it's the `bottomBar` of `KuraRoot`'s
 * `KuraScaffold` (Material 3 Expressive's `ShortNavigationBar`, glued to the bottom edge), which
 * gives this content its height as bottom padding.
 */
@Composable
fun MainTabs(store: AppStore) {
    LaunchedEffect(Unit) { store.startIfNeeded() }
    val tab = store.tab
    val tabs = rememberSaveableStateHolder()
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        key(tab) {
            tabs.SaveableStateProvider(tab.name) { TabStack(tab, store) }
        }
    }
    // System back: pop the tab's stack; at a secondary tab's root go to Colecciones (Android's
    // "back to the start destination"); at Colecciones' root the system takes it (leaves the app).
    val depth = store.path(tab).size
    BackHandler(enabled = depth > 0) { store.pop() }
    BackHandler(enabled = depth == 0 && tab != Tab.Collections) { store.select(Tab.Collections) }
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

/** One entry of a tab's stack: `route` null = the tab's root. */
private data class StackEntry(val depth: Int, val route: Route?) {
    val key: String get() = "$depth|$route"
}

/**
 * A tab's stack as ONE [AnimatedContent] over its top entry, inside the tab's [KuraHeroLayout]:
 * every entry is wrapped in [HeroDestination], so a `Modifier.kHeroCover(key)` on the card below and
 * the same key on the page above fly the cover (320 ms spring) while the page slides. Push = the new
 * page slides in from the right over the old one (which recedes a quarter); pop = the reverse, the
 * leaving page on top. Reduce motion: everything cross-fades and the cover doesn't fly.
 * The slide keeps Kura's own `KMotion.spring` (not Material's scheme) ON PURPOSE: it rides with the
 * shared cover's 320 ms spring, and two curves would tear the cover off its page.
 */
@Composable
private fun TabStack(tab: Tab, store: AppStore) {
    val path = store.path(tab)
    val entries = rememberSaveableStateHolder()
    val reduce = LocalReduceMotion.current

    // Forget the saved state of the entries that left the stack (a popped page starts fresh next time).
    val live = remember(path) { (0..path.size).map { StackEntry(it, path.getOrNull(it - 1)).key }.toSet() }
    var known by remember { mutableStateOf(live) }
    LaunchedEffect(live) {
        (known - live).forEach(entries::removeState)
        known = live
    }

    KuraHeroLayout(Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = StackEntry(path.size, path.lastOrNull()),
            contentKey = { it.key },
            transitionSpec = { stackTransition(initialState.depth, targetState.depth, reduce) },
            label = "stack-${tab.name}",
        ) { entry ->
            HeroDestination(this) {
                entries.SaveableStateProvider(entry.key) {
                    // Opaque: a push slides this page over the one below.
                    Box(Modifier.fillMaxSize().background(KColor.bg)) {
                        val route = entry.route
                        if (route == null) TabRootScreen(tab, store) else RouteScreen(route, store)
                    }
                }
            }
        }
    }
}

private fun stackTransition(from: Int, to: Int, reduce: Boolean): ContentTransform = when {
    reduce || from == to -> fadeIn(KMotion.fade()) togetherWith fadeOut(KMotion.fade())
    to > from -> slideInHorizontally(KMotion.spring()) { it } togetherWith slideOutHorizontally(KMotion.spring()) { -it / 4 }
    else -> (slideInHorizontally(KMotion.spring()) { -it / 4 } togetherWith slideOutHorizontally(KMotion.spring()) { it })
        .apply { targetContentZIndex = -1f }
}
