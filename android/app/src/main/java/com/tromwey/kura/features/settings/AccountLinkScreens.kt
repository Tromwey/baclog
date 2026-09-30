package com.tromwey.kura.features.settings

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingScreen
import com.tromwey.kura.app.PendingSheet
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute

// Inicio de sesión · fusionar cuentas (fase 2 on Android, iOS `+AccountLink`) — the account-link
// lane's file. Placeholders until it lands: each one keeps the contract signature `app/Screens.kt`
// calls, so the lane only replaces bodies.

/** Ajustes › Fusionar otra cuenta. */
@Composable
fun MergeAccountScreen(store: AppStore) {
    PendingScreen("fusionar cuentas.", store)
}

/** The 6-digit code sent to the other account's email. */
@Composable
fun MergeCodeScreen(store: AppStore) {
    PendingScreen("el código.", store)
}

/** What moves and what disappears, then `POST /me/merge`. */
@Composable
fun MergeConfirmScreen(store: AppStore) {
    PendingScreen("fusionar.", store)
}

/** Ajustes › Inicio de sesión › "¿desconectar…?" (`DELETE /me/identities/{p}`). */
@Composable
fun KuraSheetScope.UnlinkIdentitySheet(store: AppStore, sheet: SheetRoute.UnlinkIdentity) {
    PendingSheet("¿desconectar ${sheet.provider.label}?")
}
