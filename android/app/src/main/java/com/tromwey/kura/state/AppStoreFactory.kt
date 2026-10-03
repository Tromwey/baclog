package com.tromwey.kura.state

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.view.accessibility.AccessibilityManager
import coil3.SingletonImageLoader
import com.tromwey.kura.data.CoverPalette
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.PendingRevokes
import com.tromwey.kura.data.SecureStore
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.ApiClient
import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.data.api.LiveApi
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.push.PushNotifications
import com.tromwey.kura.push.PushRegistration
import com.tromwey.kura.push.ReleaseNotifier
import com.tromwey.kura.push.deleteFcmToken
import com.tromwey.kura.push.fetchFcmToken
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// The ONLY place in `state/` that touches Android: it builds the live store (Keystore session, Ktor
// client, DataStore prefs, Coil palette, TalkBack, connectivity, push). `KuraApp` holds the result for the
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
    val api = LiveApi(client)
    val store = AppStore(
        api = api,
        session = session,
        prefs = LocalPrefs.live(app),
        scope = scope,
        platform = AndroidStorePlatform(app),
        expiries = client.sessionExpired,
        pendingRevokes = PendingRevokes(SecureStore(app, PendingRevokes.SLOT)),
    )
    // Signing out on THIS phone: the push token comes off the server with the bearer being forgotten
    // (after the forget nothing could remove it). A global logout doesn't need it: the server's
    // logout deletes every device token of the account.
    api.onForgetSession = { bearer -> store.unregisterPush(bearer) }
    store.watchPushOnMain()
    watchConnectivity(app, store, scope)
    // A sign-out an earlier run couldn't confirm on the server: try it now.
    store.retryPendingRevokesSoon()
    return store
}

/** The live platform services: device prefs, TalkBack, the cover palette, and push (FCM token on the
 *  server + local release notices with WorkManager when it isn't). */
open class AndroidStorePlatform(private val context: Context) : StorePlatform, PushPlatform {
    private val devicePrefs = context.getSharedPreferences("com.tromwey.kura.device", Context.MODE_PRIVATE)
    private val registration = PushRegistration(context)

    override val screenReaderOn: Boolean
        get() = (context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager)?.isTouchExplorationEnabled == true

    override var welcomeSeen: Boolean
        get() = devicePrefs.getBoolean("kura.welcomeSeen", false)
        set(value) { devicePrefs.edit().putBoolean("kura.welcomeSeen", value).apply() }

    override suspend fun extractPalette(url: String): List<String> =
        CoverPalette.extract(context, SingletonImageLoader.get(context), url)

    /** Every way out of a session: no profile photo of the old account stays on the device. Photos come
     *  from `/api/avatar/{key}` with the bearer and Coil's disk cache has no "only these" — so the whole
     *  image cache goes (memory now, disk off the main thread); covers just download again. */
    override fun clearAvatarCache() {
        val loader = SingletonImageLoader.get(context)
        loader.memoryCache?.clear()
        val disk = loader.diskCache ?: return
        Thread({
            try {
                disk.clear()
            } catch (e: Exception) {
                KuraLog.w("KuraStore", "caché de imágenes: ${e.javaClass.simpleName}")
            }
        }, "kura-image-cache-clear").start()
    }

    /** The recap cards shared through the FileProvider (`cache/recap/`, `RecapScreens.shareCard`): they
     *  carry the old account's month, so they go with it. Off the main thread (disk). */
    override fun clearExports() {
        val dir = java.io.File(context.cacheDir, "recap")
        Thread({
            try {
                dir.deleteRecursively()
            } catch (e: Exception) {
                KuraLog.w("KuraStore", "caché del recap: ${e.javaClass.simpleName}")
            }
        }, "kura-recap-cache-clear").start()
    }

    /** Cookies of any in-app web content (WebView's store; the app opens the web in the browser or an
     *  Auth Tab, whose cookies belong to the browser). A phone without a WebView provider has none. */
    override fun clearWebSession() {
        // Off the main thread: `CookieManager.getInstance()` loads the WebView provider (hundreds of ms
        // on a cold process) and `flush()` writes to disk — on the way out of a session, never on the UI.
        Thread({
            try {
                val cookies = android.webkit.CookieManager.getInstance()
                cookies.removeAllCookies(null)
                cookies.flush()
            } catch (e: Exception) {
                KuraLog.w("KuraStore", "sesión web: ${e.javaClass.simpleName}")
            }
        }, "kura-web-session-clear").start()
    }

    // MARK: Release notices (local only while the server doesn't send them)

    override fun scheduleReleaseNotice(title: Title) = ReleaseNotifier.schedule(context, title, registration)

    /** Only `endSession` calls it (every way out of a session): no notice of the old account stays
     *  queued, and this install's token is no longer the server's for any account we know of. */
    override fun cancelReleaseNotices() {
        ReleaseNotifier.cancelAll(context)
        registration.markUnregistered()
    }

    // MARK: Push

    override val notificationsAllowed: Boolean get() = PushNotifications.allowed(context)
    override val canAskNotifications: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
    override var didOfferNotifications: Boolean
        get() = devicePrefs.getBoolean("kura.notificationsOffered", false)
        set(value) { devicePrefs.edit().putBoolean("kura.notificationsOffered", value).apply() }
    override val pushToken: String? get() = registration.token
    override val pushRegistered: Boolean get() = registration.isRegistered
    override fun storePushToken(token: String) = registration.store(token)
    override fun isPushCurrent(token: String, account: String): Boolean = registration.isCurrent(token, account)
    override fun markPushRegistered(token: String, account: String) {
        registration.markRegistered(token, account)
        ReleaseNotifier.cancelAll(context) // the server's push replaces them
    }
    override fun markPushUnregistered() = registration.markUnregistered()
    override suspend fun fetchPushToken(): String? = fetchFcmToken()
    override suspend fun deletePushToken() {
        registration.clearToken()
        deleteFcmToken()
    }
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
