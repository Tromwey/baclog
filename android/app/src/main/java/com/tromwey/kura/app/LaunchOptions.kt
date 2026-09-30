package com.tromwey.kura.app

import androidx.compose.runtime.Composable

/**
 * What the launch intent asked for beyond the normal app (DEBUG `--es kuraScreen …`, see
 * `src/debug/…/app/DebugLaunch.kt`; release always gets [LaunchOptions.Normal]).
 *
 * @param holdSplash the splash stays on screen (a capture of 01 Splash) instead of routing.
 * @param override a whole screen that replaces the app (the design-system gallery).
 */
data class LaunchOptions(
    val holdSplash: Boolean = false,
    val override: (@Composable () -> Unit)? = null,
) {
    companion object {
        val Normal = LaunchOptions()
    }
}
