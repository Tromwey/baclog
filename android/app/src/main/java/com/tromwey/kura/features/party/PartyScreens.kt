package com.tromwey.kura.features.party

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingScreen
import com.tromwey.kura.app.PendingSheet
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute

// Colecciones de fiesta + llevar a otra app (fase 2 on Android) — the party lane's file (iOS
// `Features/Party`). Placeholders until it lands: each one keeps the contract signature
// `app/Screens.kt` calls, so the lane only replaces bodies (it may split them into more files).

// MARK: Screens

/** A party (host and members only). */
@Composable
fun PartyScreen(store: AppStore, route: Route.PartyRoute) {
    PendingScreen("fiesta.", store)
}

/** Its song search ("Buscar canción"), full screen with Cancelar. */
@Composable
fun PartySearchScreen(store: AppStore, route: Route.PartySearch) {
    PendingScreen("buscar canción.", store)
}

// MARK: Sheets

/** "ya estás dentro." after joining by the link. */
@Composable
fun KuraSheetScope.PartyWelcomeSheet(store: AppStore, sheet: SheetRoute.PartyWelcome) {
    PendingSheet("ya estás dentro.")
}

/** "ya pusiste tus 3." */
@Composable
fun KuraSheetScope.PartyCapSheet(store: AppStore, sheet: SheetRoute.PartyCap) {
    PendingSheet("ya pusiste tus 3.")
}

/** A song: Quitar de la colección · Quitar y bloquear. */
@Composable
fun KuraSheetScope.PartySongSheet(store: AppStore, sheet: SheetRoute.PartySong) {
    PendingSheet("canción.")
}

/** "invita a la fiesta." */
@Composable
fun KuraSheetScope.PartyShareSheet(store: AppStore, sheet: SheetRoute.PartyShare) {
    PendingSheet("invita a la fiesta.")
}

/** Opciones (host's or guest's). */
@Composable
fun KuraSheetScope.PartyOptionsSheet(store: AppStore, sheet: SheetRoute.PartyOptions) {
    PendingSheet("opciones.")
}

/** "el link." */
@Composable
fun KuraSheetScope.PartyLinkSheet(store: AppStore, sheet: SheetRoute.PartyLink) {
    PendingSheet("el link.")
}

/** "llévala a otra app." */
@Composable
fun KuraSheetScope.PartyExportSheet(store: AppStore, sheet: SheetRoute.PartyExport) {
    PendingSheet("llévala a otra app.")
}

/** "¿salir ahora?" while the export is passing the songs. */
@Composable
fun KuraSheetScope.PartyExportLeaveSheet(store: AppStore, sheet: SheetRoute.PartyExportLeave) {
    PendingSheet("¿salir ahora?")
}

/** Editar la fiesta. */
@Composable
fun KuraSheetScope.PartyEditSheet(store: AppStore, sheet: SheetRoute.PartyEdit) {
    PendingSheet("editar.")
}

/** Bloqueados de la fiesta. */
@Composable
fun KuraSheetScope.PartyBlockedSheet(store: AppStore, sheet: SheetRoute.PartyBlocked) {
    PendingSheet("bloqueados.")
}

/** Borrar la fiesta. */
@Composable
fun KuraSheetScope.PartyDeleteSheet(store: AppStore, sheet: SheetRoute.PartyDelete) {
    PendingSheet("¿borrar la fiesta?")
}

/** A guest's "¿salir de la fiesta?". */
@Composable
fun KuraSheetScope.PartyLeaveSheet(store: AppStore, sheet: SheetRoute.PartyLeave) {
    PendingSheet("¿salir de la fiesta?")
}
