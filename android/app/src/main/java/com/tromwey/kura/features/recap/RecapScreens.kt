package com.tromwey.kura.features.recap

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingScreen
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.state.AppStore

// Recap (fase 2 on Android) — the recap lane's file. Placeholders until it lands: each one keeps the
// contract signature `app/Screens.kt` calls, so the lane only replaces bodies.

/** A month's recap (`route.era` null = the newest). */
@Composable
fun RecapScreen(store: AppStore, route: Route.Recap) {
    PendingScreen("recap.", store)
}

/** Every past recap, newest first. */
@Composable
fun RecapHistoryScreen(store: AppStore) {
    PendingScreen("recaps.", store)
}

/** The shareable recap card (`route.era` null = the newest). */
@Composable
fun RecapShareScreen(store: AppStore, route: Route.RecapShare) {
    PendingScreen("compartir recap.", store)
}
