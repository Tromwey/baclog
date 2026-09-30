package com.tromwey.kura.features.title

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
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.loadTitle

// PLACEHOLDER (app shell lane). The title lane replaces this file: keep the package, the file name
// and these signatures (app/Screens.kt calls them).

/** 06 · Ficha (película, serie, álbum). The cover carries `kHeroCover("cover-<id>")`. */
@Composable
fun TitleScreen(store: AppStore, route: Route.TitleRoute) {
    LaunchedEffect(route.id) { store.loadTitle(route.id) }
    val t = store.title(route.id)
    PendingScreen(t?.name ?: "ficha.", store) {
        if (t != null) {
            Cover(t.art, Modifier.kHeroCover("cover-${t.id}"), height = 300.dp)
            t.creator?.let { BasicText(it, style = KuraType.ui(15f).copy(color = KColor.text2)) }
        }
    }
}

/** 26a · Completar (+ reseña). */
@Composable
fun KuraSheetScope.CompleteSheet(store: AppStore, sheet: SheetRoute.Complete) {
    PendingSheet("¿qué te pareció?")
}

/** Guardar en. */
@Composable
fun KuraSheetScope.SaveToSheet(store: AppStore, sheet: SheetRoute.SaveTo) {
    PendingSheet("guardar en.")
}

/** Opciones de la ficha. */
@Composable
fun KuraSheetScope.TitleMoreSheet(store: AppStore, sheet: SheetRoute.TitleMore) {
    PendingSheet("opciones.")
}
