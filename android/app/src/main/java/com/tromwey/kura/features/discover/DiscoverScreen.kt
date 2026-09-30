package com.tromwey.kura.features.discover

import androidx.compose.runtime.Composable
import com.tromwey.kura.app.PendingTabRoot
import com.tromwey.kura.state.AppStore

// PLACEHOLDER (app shell lane). The discover lane replaces this file: keep the package, the file
// name and this signature (app/Screens.kt calls it). Search mode sets `store.dockHidden`.

/** Tab root · Descubrir. */
@Composable
fun DiscoverScreen(store: AppStore) {
    PendingTabRoot("descubrir")
}
