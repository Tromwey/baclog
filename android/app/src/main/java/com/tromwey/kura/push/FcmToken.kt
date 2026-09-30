package com.tromwey.kura.push

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * This install's FCM registration token, or null (Firebase off, no Play services, offline).
 *
 * `getToken()`/`onNewToken` are deprecated in firebase-messaging 25 in favor of `register()` /
 * `onRegistered`, which is opt-in (`firebase_messaging_installation_id_enabled`) and a different
 * registration scheme the server (FCM HTTP v1 with registration tokens, API.md §2.4) wasn't built or
 * tested against. Kept on purpose until a lane moves client and server together.
 */
@Suppress("DEPRECATION")
internal suspend fun fetchFcmToken(): String? {
    if (!FirebaseBoot.isStarted) return null
    val messaging = FirebaseMessaging.getInstance()
    // Auto-init starts OFF (manifest): no token exists until notices are allowed. From here on FCM
    // keeps it fresh itself (a rotation → `KuraMessagingService.onNewToken`).
    messaging.isAutoInitEnabled = true
    return suspendCancellableCoroutine { c ->
        messaging.token.addOnCompleteListener { task ->
            if (!task.isSuccessful) Log.w(PushLog.TAG, "Sin token FCM (${task.exception?.javaClass?.simpleName})")
            if (c.isActive) c.resume(if (task.isSuccessful) task.result else null)
        }
    }
}
