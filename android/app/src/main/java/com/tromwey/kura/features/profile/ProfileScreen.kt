package com.tromwey.kura.features.profile

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingScreen
import com.tromwey.kura.app.PendingTabRoot
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.state.AppStore

// PLACEHOLDER (app shell lane). The profile lane replaces this file: keep the package, the file
// name and these signatures (app/Screens.kt calls them).

/** Tab root · tu perfil. */
@Composable
fun ProfileScreen(store: AppStore) {
    PendingTabRoot(store.me.handle.ifEmpty { "tu perfil" }.let { if (it.startsWith("tu ")) it else "@$it" }) {
        GlassButton("Ajustes", onClick = { store.push(Route.Settings) })
    }
}

/** Editar perfil. */
@Composable
fun EditProfileScreen(store: AppStore) {
    PendingScreen("editar perfil.", store)
}
