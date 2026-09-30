package com.tromwey.kura.features.settings

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingScreen
import com.tromwey.kura.app.PendingSheet
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute

// PLACEHOLDER (app shell lane). The settings lane replaces this file: keep the package, the file
// name and these signatures (app/Screens.kt calls them). The dock hides on all of these.

/** Ajustes. */
@Composable
fun SettingsScreen(store: AppStore) {
    PendingScreen("ajustes.", store)
}

/** Ajustes › privacidad. */
@Composable
fun SettingsPrivacyScreen(store: AppStore) {
    PendingScreen("privacidad.", store)
}

/** Ajustes › app de música. */
@Composable
fun MusicAppScreen(store: AppStore) {
    PendingScreen("app de música.", store)
}

/** Ajustes › Sesiones activas. */
@Composable
fun SessionsScreen(store: AppStore) {
    PendingScreen("sesiones activas.", store)
}

/** Ajustes › Fusionar otra cuenta (fase 2). */
@Composable
fun MergeAccountScreen(store: AppStore) {
    PendingScreen("fusionar cuentas.", store)
}

/** El código de la otra cuenta (fase 2). */
@Composable
fun MergeCodeScreen(store: AppStore) {
    PendingScreen("tu código.", store)
}

/** Qué se mueve y qué desaparece (fase 2). */
@Composable
fun MergeConfirmScreen(store: AppStore) {
    PendingScreen("fusionar cuentas.", store)
}

/** ¿borrar tu cuenta? */
@Composable
fun KuraSheetScope.DeleteAccountSheet(store: AppStore) {
    PendingSheet("¿borrar tu cuenta?")
}

/** Cerrar la sesión de otro dispositivo. */
@Composable
fun KuraSheetScope.RevokeSessionSheet(store: AppStore, sheet: SheetRoute.RevokeSession) {
    PendingSheet("¿cerrar esa sesión?")
}

/** ¿desconectar …? (fase 2). */
@Composable
fun KuraSheetScope.UnlinkIdentitySheet(store: AppStore, sheet: SheetRoute.UnlinkIdentity) {
    PendingSheet("¿desconectar?")
}

/** ¿te avisamos? (antes del permiso del sistema). */
@Composable
fun KuraSheetScope.NotificationsAskSheet(store: AppStore) {
    PendingSheet("¿te avisamos?")
}
