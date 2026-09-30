package com.tromwey.kura

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.tromwey.kura.app.DebugLaunch
import com.tromwey.kura.app.DeepLink
import com.tromwey.kura.app.KuraApp
import com.tromwey.kura.app.KuraRoot
import com.tromwey.kura.push.PushIntent
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.openPushTarget
import com.tromwey.kura.state.openWebLink
import com.tromwey.kura.state.tidalCallback

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
        // Both honor their extras only from `adb shell` (`DebugLaunch.fromShell`): the activity is exported.
        DebugLaunch.seedSession(this, intent)
        val store = app.store
        val options = DebugLaunch.configure(this, store, intent, firstLaunch = savedInstanceState == null)
        setContent { KuraRoot(store, options) }
        // A link / notice tap that launched us. Not on a recreation (the store already acted on it) nor on
        // a relaunch from Recents (the intent is the old one).
        if (savedInstanceState == null) openFrom(intent, store)
    }

    /** singleTask (manifest): App Links from other apps and notice taps land here when we're alive. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openFrom(intent, (application as KuraApp).store)
    }

    /**
     * The three ways in: a notice (`PushIntent.target`: our own `kuraOpen` or the system-drawn FCM data),
     * the TIDAL connect fallback (`kura://music/tidal/…`, AppStoreMusicExport.kt) and an App Link
     * (`https://get-kura.app/…`, state/AppStoreLinks.kt). Consumed = stripped from the intent, so nothing
     * opens twice.
     */
    private fun openFrom(intent: Intent?, store: AppStore) {
        intent ?: return
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return
        PushIntent.target(intent.extras)?.let { target ->
            store.openPushTarget(target)
            PUSH_EXTRAS.forEach(intent::removeExtra)
        }
        val data = intent.data ?: return
        if (intent.action != Intent.ACTION_VIEW) return
        intent.data = null
        if (data.scheme == "kura" && data.host == "music") {
            // Never log it: `ref` + `claim` finish linking a TIDAL account.
            store.tidalCallback(data.toString())
            return
        }
        val url = data.toString()
        if (store.openWebLink(url, debug = BuildConfig.DEBUG)) return
        // Our site but a page the app doesn't have (Android < 15 sends every path of the host): the
        // browser, not a dropped tap.
        if (DeepLink.isOurs(url, debug = BuildConfig.DEBUG)) openInBrowser(data)
    }

    /**
     * Straight to the browser, BY PACKAGE: a plain ACTION_VIEW would resolve to kura again (the verified
     * handler). The browser is whatever answers a neutral https link (the default one, or the first when
     * there's no default); the manifest's `<queries>` makes browsers visible to us (Android 11+).
     */
    private fun openInBrowser(uri: Uri) {
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).addCategory(Intent.CATEGORY_BROWSABLE)
        val browser = resolve(probe)?.activityInfo?.packageName
            ?.takeIf { it != "android" && it != packageName } // "android" = the chooser: no default browser
            ?: query(probe).map { it.activityInfo.packageName }.firstOrNull { it != packageName }
        if (browser == null) {
            Log.w("KuraLinks", "no browser for a web-only page")
            return
        }
        val view = Intent(Intent.ACTION_VIEW, uri)
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(browser)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivity(view)
        } catch (_: ActivityNotFoundException) {
            Log.w("KuraLinks", "the browser refused a web-only page")
        }
    }

    private fun resolve(intent: Intent): ResolveInfo? =
        if (Build.VERSION.SDK_INT >= 33) {
            packageManager.resolveActivity(intent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()))
        } else {
            @Suppress("DEPRECATION")
            packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        }

    private fun query(intent: Intent): List<ResolveInfo> =
        if (Build.VERSION.SDK_INT >= 33) {
            packageManager.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            packageManager.queryIntentActivities(intent, 0)
        }

    private companion object {
        /** Both notice shapes (PushIntent): kura's own extra and the FCM data map as flat extras. */
        val PUSH_EXTRAS = listOf(PushIntent.EXTRA_OPEN, "type", "titleId", "handle")
    }
}
