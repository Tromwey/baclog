package com.tromwey.kura.features.collections

import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingSheet
import com.tromwey.kura.app.PendingTabRoot
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadState
import com.tromwey.kura.state.SheetRoute

// PLACEHOLDER (app shell lane). The collections lane replaces this file: keep the package, the file
// name and these signatures (app/Screens.kt calls them).

/** Tab root · 02 Tus colecciones (+ vacía, cargando, sin conexión). */
@Composable
fun CollectionsScreen(store: AppStore) {
    PendingTabRoot("tus colecciones") {
        val state = when (store.loadState) {
            LoadState.Loading -> "cargando…"
            LoadState.Failed -> "no se pudo cargar."
            LoadState.Loaded -> "${store.collections.size} colecciones"
        }
        BasicText(state, style = KuraType.ui(15f).copy(color = KColor.text2))
        store.orderedCollections.take(6).forEach { c ->
            GlassButton(c.name, onClick = { store.push(Route.Collection(c.id)) })
        }
        GlassButton("Nueva colección", onClick = { store.present(SheetRoute.NewCollection(addingTitleId = null)) })
        GlassButton("Probar aviso", onClick = { store.undoToast("Aviso de prueba") {} })
    }
}

/** O2a · Nueva colección. */
@Composable
fun KuraSheetScope.NewCollectionSheet(store: AppStore, sheet: SheetRoute.NewCollection) {
    PendingSheet("nueva colección.")
}
