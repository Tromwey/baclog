package com.tromwey.kura

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.tromwey.kura.app.DebugLaunch
import com.tromwey.kura.app.KuraApp
import com.tromwey.kura.app.KuraRoot

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Before super.onCreate: swaps Theme.Kura.Starting for Theme.Kura once the first frame is ready.
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // Always dark: transparent bars with light icons, whatever the system theme says.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        val app = application as KuraApp
        // DEBUG (src/debug/…/app/DebugLaunch.kt): `--es kuraBearer <jwt>` goes to the Keystore BEFORE the
        // store exists; `--es kuraScreen <name>` then puts the store on that screen (first launch only:
        // a recreated activity keeps whatever the store says now). Release: both are no-ops.
        DebugLaunch.seedSession(app, intent)
        val store = app.store
        val options = DebugLaunch.configure(store, intent, firstLaunch = savedInstanceState == null)
        setContent { KuraRoot(store, options) }
    }
}
