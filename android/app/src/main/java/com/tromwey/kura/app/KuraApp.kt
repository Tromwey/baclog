package com.tromwey.kura.app

import android.app.Application
import android.content.Context
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.designsystem.KHaptic
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.create
import okhttp3.OkHttpClient

/**
 * Process-wide entry point (iOS `KuraApp`). Holds the ONE store for the life of the process: the
 * activity can be recreated (font scale, dark mode, a process kept warm) and the session, the
 * navigation and the Deshacer windows survive it.
 *
 * `store` is lazy on purpose: DEBUG `--es kuraBearer <jwt>` (`DebugLaunch.seedSession`) must write the
 * Keystore session BEFORE the store (and its `Session`) is built — `MainActivity` seeds first, then
 * touches `store`.
 *
 * Also Coil's singleton loader: covers come from the CDNs as-is; profile photos on the API's own
 * `/api/avatar/…` carry the bearer (a private account's photo is served only to its owner, iOS
 * `AvatarStore`), and only there — the token never goes to a third-party host.
 */
class KuraApp : Application(), SingletonImageLoader.Factory {
    val store: AppStore by lazy { AppStore.create(this) }

    override fun onCreate() {
        super.onCreate()
        // Ajustes › Vibraciones (a device preference): read once, before the first haptic.
        KHaptic.init(this)
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader = imageLoader(context)
}

private fun imageLoader(context: Context): ImageLoader {
    val client = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val request = chain.request()
            val origin = KuraRuntime.apiOrigin
            val url = request.url.toString()
            val token = KuraRuntime.bearer()
            if (origin != null && token != null && url.startsWith("$origin/api/avatar/")) {
                chain.proceed(request.newBuilder().header("Authorization", "Bearer $token").build())
            } else {
                chain.proceed(request)
            }
        }
        .build()
    return ImageLoader.Builder(context)
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { client })) }
        .build()
}
