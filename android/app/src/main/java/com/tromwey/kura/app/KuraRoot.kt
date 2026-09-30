package com.tromwey.kura.app

import android.view.View
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
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
import com.tromwey.kura.designsystem.components.KuraToastHost
import com.tromwey.kura.designsystem.components.KuraToastModel
import com.tromwey.kura.designsystem.components.OfflineStrip
import com.tromwey.kura.designsystem.components.ToastKind
import com.tromwey.kura.features.onboarding.OnboardingFlow
import com.tromwey.kura.features.onboarding.SplashScreen
import com.tromwey.kura.state.AppPhase
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetStyle
import com.tromwey.kura.state.StoreEvent
import com.tromwey.kura.state.ToastModel

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
        val dock = store.phase == AppPhase.Main && store.dockVisible(store.tab)
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
            AnimatedContent(
                targetState = store.phase,
                modifier = Modifier.fillMaxSize().padding(padding),
                transitionSpec = { fadeIn(fade) togetherWith fadeOut(fade) },
                label = "phase",
            ) { phase ->
                when (phase) {
                    AppPhase.Splash -> SplashScreen(store, hold = options.holdSplash)
                    AppPhase.Onboarding -> OnboardingFlow(store)
                    AppPhase.Main -> MainTabs(store)
                }
            }
        }
        SheetHost(store)
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
        val toast = store.toast
        val model = remember(toast) { toast?.let { toastModel(store, it) } }
        AnimatedVisibility(
            visible = toast == null && store.offline && store.phase == AppPhase.Main,
            enter = fadeIn(KMotion.fastEffects()),
            exit = fadeOut(KMotion.fastEffects()),
            modifier = Modifier.then(if (dockVisible) Modifier else Modifier.navigationBarsPadding())
                .padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
        ) {
            OfflineStrip()
        }
        KuraToastHost(
            toast = model,
            // The store already clears it after `undoWindow`; this only closes a stale pill.
            onTimeout = { t -> if (store.toast?.id == t.id) store.dismissToast() },
            dockVisible = dockVisible,
        )
    }
}

private fun toastModel(store: AppStore, t: ToastModel) = KuraToastModel(
    id = t.id,
    text = t.text,
    kind = when (t.kind) {
        ToastModel.Kind.Undo -> ToastKind.Undo
        ToastModel.Kind.Retry -> ToastKind.Retry
        ToastModel.Kind.Info -> ToastKind.Info
    },
    action = t.action?.let { { store.tapToastAction(t) } },
)

/**
 * The sheet host (iOS `SheetHost`): `store.sheet` → one `KuraSheet` with the route's style. A new
 * route replaces the old sheet. Scrim tap / drag / system back go through
 * `dismissSheetInteractively()`: while `sheetLocked` (a write in flight) the sheet refuses and comes
 * back up — Material's sheet has already hidden itself by then, so the host re-mounts it.
 */
@Composable
private fun SheetHost(store: AppStore) {
    val sheet = store.sheet ?: return
    var reopen by remember { mutableIntStateOf(0) }
    key(sheet, reopen) {
        KuraSheet(
            onDismiss = {
                if (store.sheet == sheet && !store.dismissSheetInteractively()) reopen++
            },
            style = if (sheet.style == SheetStyle.Tall) KuraSheetStyle.Tall else KuraSheetStyle.Compact,
        ) {
            SheetContent(sheet, store)
        }
    }
}
