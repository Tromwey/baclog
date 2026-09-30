package com.tromwey.kura.state

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.view.accessibility.AccessibilityManager
import coil3.SingletonImageLoader
import com.tromwey.kura.data.CoverPalette
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.SecureStore
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.ApiClient
import com.tromwey.kura.data.api.LiveApi
import com.tromwey.kura.data.models.KuraRuntime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// The ONLY place in `state/` that touches Android: it builds the live store (Keystore session, Ktor
// client, DataStore prefs, Coil palette, TalkBack, connectivity). `KuraApp` holds the result for the
// whole process (the screens lane wires it: `val store by lazy { AppStore.create(this) }`).

/**
 * The live store: `LiveApi` over `ApiClient(Session(SecureStore))`, `LocalPrefs.live`, the real clock,
 * a Main.immediate scope for the life of the process, and `ApiClient.sessionExpired` → entrance.
 * Also points `KuraRuntime.bearer` at the session (Coil sends it to `/api/avatar/…`).
 *
 * Connectivity (the offline strip coming back on its own) needs `ACCESS_NETWORK_STATE` in the manifest;
 * without it the store still works and simply never hears "back online" from the system.
 */
fun AppStore.Companion.create(context: Context): AppStore {
    val app = context.applicationContext
    val session = Session(SecureStore(app))
    val client = ApiClient(session = session)
    KuraRuntime.bearer = { session.token }
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val store = AppStore(
        api = LiveApi(client),
        session = session,
        prefs = LocalPrefs.live(app),
        scope = scope,
        platform = AndroidStorePlatform(app),
        expiries = client.sessionExpired,
    )
    watchConnectivity(app, store, scope)
    return store
}

/** The live platform services. The release-notice lane replaces `scheduleReleaseNotice` /
 *  `cancelReleaseNotices` (subclass or wrap) once `ReleaseNotifier` exists. */
open class AndroidStorePlatform(private val context: Context) : StorePlatform {
    private val devicePrefs = context.getSharedPreferences("com.tromwey.kura.device", Context.MODE_PRIVATE)

    override val screenReaderOn: Boolean
        get() = (context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager)?.isTouchExplorationEnabled == true

    override var welcomeSeen: Boolean
        get() = devicePrefs.getBoolean("kura.welcomeSeen", false)
        set(value) { devicePrefs.edit().putBoolean("kura.welcomeSeen", value).apply() }

    override suspend fun extractPalette(url: String): List<String> =
        CoverPalette.extract(context, SingletonImageLoader.get(context), url)
}

private fun watchConnectivity(context: Context, store: AppStore, scope: CoroutineScope) {
    if (context.checkSelfPermission(Manifest.permission.ACCESS_NETWORK_STATE) != PackageManager.PERMISSION_GRANTED) return
    val cm = context.getSystemService(ConnectivityManager::class.java) ?: return
    cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            val ok = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            scope.launch { store.connectivityChanged(ok) }
        }

        override fun onLost(network: Network) {
            scope.launch { store.connectivityChanged(false) }
        }
    })
}
