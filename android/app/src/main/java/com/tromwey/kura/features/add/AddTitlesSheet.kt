package com.tromwey.kura.features.add

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingSheet
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute

// PLACEHOLDER (app shell lane). The add lane replaces this file: keep the package, the file name
// and this signature (app/Screens.kt calls it). The host draws it as the TALL sheet.

/** 05 · 27a/27b Agregar títulos (sugerencias, buscando). */
@Composable
fun KuraSheetScope.AddTitlesSheet(store: AppStore, sheet: SheetRoute.AddTitles) {
    PendingSheet("agregar títulos.")
}
