package com.tromwey.kura.features.feed

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingScreen
import com.tromwey.kura.app.PendingTabRoot
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.state.AppStore

// PLACEHOLDER (app shell lane). The feed lane replaces this file: keep the package, the file name
// and these signatures (app/Screens.kt calls them).

/** Tab root · tu feed. */
@Composable
fun FeedScreen(store: AppStore) {
    PendingTabRoot("tu feed") {
        GlassButton("Avisos", onClick = { store.push(Route.Notifications) })
    }
}

/** Avisos (la campana). */
@Composable
fun NotificationsScreen(store: AppStore) {
    PendingScreen("avisos.", store)
}
