package com.tromwey.kura.push

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

/**
 * Firebase, started by hand (`KuraApp.onCreate`) instead of by `FirebaseInitProvider` + the
 * google-services Gradle plugin: the manifest removes the provider (`tools:node="remove"`) and these
 * options are the ones in `app/google-services.json` (Firebase project `kura-a1f94`, its own project —
 * not the Google Cloud one that holds the OAuth clients). None of them is a secret: they ship inside
 * every build and only identify the app to FCM. `FirebaseBootTest` fails if they drift from the JSON.
 *
 * Only FCM uses it (no Analytics, no Crashlytics). The Firebase app id is bound to the package
 * `com.tromwey.kura`: a lane build (`-PkuraAppIdSuffix`) boots fine but FCM refuses its token.
 */
object FirebaseBoot {
    const val PROJECT_ID = "kura-a1f94"
    const val APPLICATION_ID = "1:744452121919:android:f64698eed2d188cf0a9f8a"
    const val API_KEY = "AIzaSyD0Habj1OzTGfEXbdZixbS5ATtQPTqVv3U"
    const val GCM_SENDER_ID = "744452121919"

    /** Idempotent. False when Firebase couldn't start (the app runs on, just without remote push). */
    fun start(context: Context): Boolean = try {
        if (FirebaseApp.getApps(context).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId(PROJECT_ID)
                .setApplicationId(APPLICATION_ID)
                .setApiKey(API_KEY)
                .setGcmSenderId(GCM_SENDER_ID)
                .build()
            FirebaseApp.initializeApp(context, options)
        }
        true
    } catch (e: RuntimeException) {
        Log.w(PushLog.TAG, "Firebase no arrancó (${e.javaClass.simpleName}); sin push remoto")
        false
    }

    val isStarted: Boolean get() = try {
        FirebaseApp.getInstance(); true
    } catch (_: IllegalStateException) {
        false
    }
}

internal object PushLog {
    const val TAG = "KuraPush"
}
