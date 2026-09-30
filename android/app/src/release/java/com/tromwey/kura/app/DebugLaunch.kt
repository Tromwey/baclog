package com.tromwey.kura.app

import android.content.Context
import android.content.Intent
import com.tromwey.kura.state.AppStore

/** Release twin of src/debug's DebugLaunch: no debug screens, no seeded sessions ship. */
object DebugLaunch {
    @Suppress("UNUSED_PARAMETER")
    fun seedSession(context: Context, intent: Intent?) = Unit

    @Suppress("UNUSED_PARAMETER")
    fun configure(store: AppStore, intent: Intent?, firstLaunch: Boolean): LaunchOptions = LaunchOptions.Normal
}
