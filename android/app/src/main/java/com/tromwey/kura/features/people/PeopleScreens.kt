package com.tromwey.kura.features.people

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingScreen
import com.tromwey.kura.app.PendingSheet
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute

// PLACEHOLDER (app shell lane). The people lane replaces this file: keep the package, the file name
// and these signatures (app/Screens.kt calls them).

/** Perfil de otra persona. */
@Composable
fun PersonScreen(store: AppStore, route: Route.PersonRoute) {
    PendingScreen("@${route.handle}", store)
}

/** La colección pública de otra persona (solo lectura). */
@Composable
fun PublicCollectionScreen(store: AppStore, route: Route.PublicCollection) {
    PendingScreen("colección de @${route.handle}.", store)
}

/** Seguidores / siguiendo. */
@Composable
fun FollowersScreen(store: AppStore, route: Route.Followers) {
    PendingScreen(if (route.showFollowing) "siguiendo." else "seguidores.", store)
}

/** También de … (un autor). */
@Composable
fun CreatorScreen(store: AppStore, route: Route.CreatorRoute) {
    PendingScreen(route.name, store)
}

/** K1d / K1e · tu perfil como lo ve alguien que no te sigue. */
@Composable
fun ProfileAsStrangerScreen(store: AppStore) {
    PendingScreen("así te ven.", store)
}

/** Ajustes › privacidad › Cuentas bloqueadas. */
@Composable
fun BlockedAccountsScreen(store: AppStore) {
    PendingScreen("cuentas bloqueadas.", store)
}

/** Opciones de una persona. */
@Composable
fun KuraSheetScope.PersonOptionsSheet(store: AppStore, sheet: SheetRoute.PersonOptions) {
    PendingSheet("@${sheet.handle}")
}

/** Reportar. */
@Composable
fun KuraSheetScope.ReportSheet(store: AppStore, sheet: SheetRoute.Report) {
    PendingSheet("reportar.")
}

/** ¿bloquear a @…? */
@Composable
fun KuraSheetScope.BlockSheet(store: AppStore, sheet: SheetRoute.Block) {
    PendingSheet("¿bloquear a @${sheet.handle}?")
}
