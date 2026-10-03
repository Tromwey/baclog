package com.tromwey.kura.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.tromwey.kura.designsystem.components.KuraToastHost
import com.tromwey.kura.designsystem.components.KuraToastModel
import com.tromwey.kura.designsystem.components.ToastKind
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.dismissToast
import com.tromwey.kura.state.closeToast
import com.tromwey.kura.state.tapToastAction

/**
 * The store's one toast (`store.toast`) drawn by the design system's [KuraToastHost]: the frame's
 * notice slot (`KuraRoot`) and any surface that covers the frame in its own window (Descubrir's
 * expanded search, `KuraSearchBar(overlay = { StoreToastHost(store) })`) use this same mapping, so
 * "Guardado en … · Deshacer" reads and acts the same wherever it shows. Two hosts may show the same
 * toast at once: the timeout is idempotent by id (only the toast still current is dismissed).
 */
@Composable
fun StoreToastHost(store: AppStore, dockVisible: Boolean = true, modifier: Modifier = Modifier) {
    val toast = store.toast
    val model = remember(toast) { toast?.let { toastModel(store, it) } }
    KuraToastHost(
        toast = model,
        // The store already clears it after `undoWindow` (never a Reintentar); this only closes a stale pill.
        onTimeout = { t -> if (store.toast?.id == t.id) store.dismissToast() },
        modifier = modifier,
        dockVisible = dockVisible,
    )
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
    // A Reintentar never times out: its ✕ accepts that the change stays undone.
    onDismiss = if (t.kind == ToastModel.Kind.Retry) ({ store.closeToast(t) }) else null,
)
