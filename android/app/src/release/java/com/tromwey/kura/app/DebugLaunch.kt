package com.tromwey.kura.app

import android.app.Activity
import android.content.Intent
import com.tromwey.kura.state.AppStore

/** Release twin of src/debug's DebugLaunch: no debug screens, no seeded sessions ship. */
object DebugLaunch {
    @Suppress("UNUSED_PARAMETER")
    fun seedSession(activity: Activity, intent: Intent?) = Unit

    @Suppress("UNUSED_PARAMETER")
    fun configure(activity: Activity, store: AppStore, launchIntent: Intent?, firstLaunch: Boolean): LaunchOptions = LaunchOptions.Normal
}
