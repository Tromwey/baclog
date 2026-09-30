package com.tromwey.kura.app

import android.view.View
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.tromwey.kura.designsystem.KHaptic
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KuraTheme
import com.tromwey.kura.designsystem.components.KuraScaffold
import com.tromwey.kura.designsystem.components.KuraSheet
import com.tromwey.kura.designsystem.components.KuraSheetStyle
import com.tromwey.kura.designsystem.components.OfflineStrip
import com.tromwey.kura.features.onboarding.OnboardingFlow
import com.tromwey.kura.features.party.InviteLandingScreen
import com.tromwey.kura.features.onboarding.SplashScreen
import com.tromwey.kura.state.AppPhase
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadState
import com.tromwey.kura.state.SheetStyle
import com.tromwey.kura.state.StoreEvent
import com.tromwey.kura.state.openPendingLink

/**
 * RootRouter (iOS `RootView`): splash → entrance/onboarding → the tabs, cross-faded, inside the app's
 * frame (`KuraScaffold` = Material's `Scaffold`): the navigation bar ([MainDock]) glued to the bottom
 * edge while the tabs want it, the one toast and the offline strip right above it (Material places
 * them), the content padded by the bar, and the sheet host over everything. Also where the store's
 * side effects play (haptics, TalkBack announcements) and where the app's foreground/background
 * reaches the store (the clock, the disk flush).
 */
@Composable
fun KuraRoot(store: AppStore, options: LaunchOptions = LaunchOptions.Normal) {
    KuraTheme {
        val override = options.override
        if (override != null) {
            override()
            return@KuraTheme
        }
        StoreEffects(store)
        // The invite landing covers the tabs whole (a dead link seen signed in): no bar under it.
        val dock = store.phase == AppPhase.Main && store.dockVisible(store.tab) && store.inviteLanding == null
        val barSpec = KMotion.defaultSpatial<IntSize>()
        val fade = KMotion.defaultEffects<Float>()
        KuraScaffold(
            bottomBar = {
                // The bar leaves a pushed page (Ajustes, a ficha…) by shrinking, so the page grows into
                // its room instead of jumping when it's gone.
                AnimatedVisibility(
                    visible = dock,
                    enter = expandVertically(barSpec) + fadeIn(fade),
                    exit = shrinkVertically(barSpec) + fadeOut(fade),
                ) { MainDock(store) }
            },
            notices = { NoticeLayer(store, dock) },
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                AnimatedContent(
                    targetState = store.phase,
                    modifier = Modifier.fillMaxSize(),
                    transitionSpec = { fadeIn(fade) togetherWith fadeOut(fade) },
                    label = "phase",
                ) { phase ->
                    when (phase) {
                        AppPhase.Splash -> SplashScreen(store, hold = options.holdSplash)
                        AppPhase.Onboarding -> OnboardingFlow(store)
                        AppPhase.Main -> MainTabs(store)
                    }
                }
                // A party invite opened signed out (`/f/{token}`, AppStoreLinks → AppStoreParties): over
                // every phase, under the sheets and the toast.
                val landing = store.inviteLanding
                var shownLanding by remember { mutableStateOf(landing) }
                if (landing != null && shownLanding != landing) shownLanding = landing
                AnimatedVisibility(visible = landing != null, enter = fadeIn(fade), exit = fadeOut(fade)) {
                    // The last token stays drawn while it fades out.
                    shownLanding?.let { InviteLandingScreen(store, it) }
                }
            }
        }
        PendingLinks(store)
        SheetHost(store)
    }
}

/**
 * A link or notice that arrived before the tabs (cold start, the splash, signed out): opened once they're
 * up and the library read landed (iOS `startIfNeeded` → `openPendingLink`). A sign-in brings the tabs
 * back, so it opens after it too.
 */
@Composable
private fun PendingLinks(store: AppStore) {
    val ready = store.phase == AppPhase.Main && store.loadState != LoadState.Loading
    LaunchedEffect(store, ready) {
        if (ready) store.openPendingLink()
    }
}

/** Haptics + announcements from the store, and the scene phase (iOS `.onChange(of: scenePhase)`). */
@Composable
private fun StoreEffects(store: AppStore) {
    val view = LocalView.current
    LaunchedEffect(store, view) {
        store.events.collect { e ->
            when (e) {
                is StoreEvent.Haptic -> KHaptic.play(view, e.kind.event)
                is StoreEvent.Announce -> announce(view, e.text)
            }
        }
    }
    // Resume/pause = iOS active/inactive: the clock catches up and ticks each minute while we're in
    // front; leaving writes the per-account prefs to disk.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { store.sceneBecameActive() }
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { store.sceneWentInactive() }
}

/** TalkBack doesn't see a toast slide in over the dock: say it (with "Deshacer disponible"). */
@Suppress("DEPRECATION")
private fun announce(view: View, text: String) {
    // Deprecated in API 36 in favour of live regions; the toast pill is also a polite live region,
    // but a region that APPEARS isn't reliably read, and iOS announces explicitly too.
    view.announceForAccessibility(text)
}

/**
 * The one toast (iOS `ToastHost`, a Material snackbar) and, while nothing is being said, the offline
 * strip in the same slot: the scaffold puts them right above the bar when it shows; without it they
 * sit 12 above the system navigation bar. One notice at a time.
 */
@Composable
private fun NoticeLayer(store: AppStore, dockVisible: Boolean) {
    Column {
        AnimatedVisibility(
            visible = store.toast == null && store.offline && store.phase == AppPhase.Main,
            enter = fadeIn(KMotion.fastEffects()),
            exit = fadeOut(KMotion.fastEffects()),
            modifier = Modifier.then(if (dockVisible) Modifier else Modifier.navigationBarsPadding())
                .padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
        ) {
            // Nothing of the library arrived yet (an offline launch): there's nothing "saved on the
            // phone" to look at, so say what will happen instead.
            if (store.loadState == LoadState.Loaded) OfflineStrip()
            else OfflineStrip(text = "Sin conexión. Cuando vuelva la red cargamos tus colecciones.")
        }
        StoreToastHost(store, dockVisible = dockVisible)
    }
}

/**
 * The sheet host (iOS `SheetHost`): `store.sheet` → one `KuraSheet` with the route's style. A new
 * route replaces the old sheet. While `sheetLocked` (a write in flight) the sheet itself refuses to
 * hide — drag, scrim and back are off (`KuraSheet(locked)`) — so nothing is ever re-mounted: the content,
 * its state and whatever it's writing stay exactly as they are. A dismissal that still arrives while
 * locked can only be the content's own `close()`, and that is honored.
 */
@Composable
private fun SheetHost(store: AppStore) {
    val sheet = store.sheet ?: return
    key(sheet) {
        KuraSheet(
            onDismiss = { if (store.sheet == sheet) store.dismissSheet() },
            style = if (sheet.style == SheetStyle.Tall) KuraSheetStyle.Tall else KuraSheetStyle.Compact,
            grabber = sheet.showsGrabber,
            locked = store.sheetLocked,
        ) {
            SheetContent(sheet, store)
        }
    }
}
