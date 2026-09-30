package com.tromwey.kura.features.collectiondetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.PendingScreen
import com.tromwey.kura.app.PendingSheet
import com.tromwey.kura.app.art
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.loadCollection

// PLACEHOLDER (app shell lane). The collection lane replaces this file: keep the package, the file
// name and these signatures (app/Screens.kt calls them).

/** 03 Colección (grouped / shelved / lista, estrenos). */
@Composable
fun CollectionDetailScreen(store: AppStore, route: Route.Collection) {
    LaunchedEffect(route.id) { store.loadCollection(route.id) }
    val c = store.collection(route.id)
    PendingScreen(c?.name ?: "colección.", store) {
        if (c != null) {
            BasicText("${c.titleIds.size} títulos", style = KuraType.ui(15f).copy(color = KColor.text2))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                store.titlesIn(c).take(3).forEach { t ->
                    Cover(
                        t.art,
                        Modifier.kHeroCover("cover-${t.id}").kPressable { store.push(Route.TitleRoute(t.id)) },
                        height = 120.dp,
                        radius = KRadius.coverS,
                    )
                }
            }
            GlassButton("Opciones", onClick = { store.present(SheetRoute.More(c.id)) })
        }
    }
}

/** 19 · "no puedo esperar" (the automatic collection). */
@Composable
fun WaitingCollectionScreen(store: AppStore) {
    PendingScreen("no puedo esperar.", store)
}

/** 9a · hold on a fan (the short options). */
@Composable
fun KuraSheetScope.CollectionQuickSheet(store: AppStore, sheet: SheetRoute.CollectionQuick) {
    PendingSheet("opciones.")
}

/** 18a · Opciones (the full list). */
@Composable
fun KuraSheetScope.CollectionMoreSheet(store: AppStore, sheet: SheetRoute.More) {
    PendingSheet("opciones.")
}

/** O3a · Ordenar. */
@Composable
fun KuraSheetScope.SortSheet(store: AppStore, sheet: SheetRoute.Sort) {
    PendingSheet("ordenar.")
}

/** O2b · Editar (nombre + frase). */
@Composable
fun KuraSheetScope.EditCollectionSheet(store: AppStore, sheet: SheetRoute.Rename) {
    PendingSheet("editar.")
}

/** K1a · Quién la ve. */
@Composable
fun KuraSheetScope.PrivacySheet(store: AppStore, sheet: SheetRoute.Privacy) {
    PendingSheet("quién la ve.")
}

/** O5 · Compartir. */
@Composable
fun KuraSheetScope.ShareCollectionSheet(store: AppStore, sheet: SheetRoute.Share) {
    PendingSheet("compartir.")
}

/** 35a · Borrar colección (no grabber). */
@Composable
fun KuraSheetScope.DeleteCollectionSheet(store: AppStore, sheet: SheetRoute.DeleteCollection) {
    PendingSheet("¿borrar la colección?")
}

/** 18c · hold on a title (9b when `collectionId` is null). */
@Composable
fun KuraSheetScope.TitleActionsSheet(store: AppStore, sheet: SheetRoute.TitleActions) {
    PendingSheet("acciones.")
}

/** O4a · Mover a. */
@Composable
fun KuraSheetScope.MoveToSheet(store: AppStore, sheet: SheetRoute.MoveTo) {
    PendingSheet("mover a.")
}

/** O3b · Reordenar. */
@Composable
fun KuraSheetScope.ReorderSheet(store: AppStore, sheet: SheetRoute.Reorder) {
    PendingSheet("editar el orden.")
}
