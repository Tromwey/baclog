package com.tromwey.kura.push

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.tromwey.kura.BuildConfig
import com.tromwey.kura.app.KuraApp
import com.tromwey.kura.state.didReceivePushToken

/**
 * FCM's side of push (twin of iOS `KuraAppDelegate`). The server sends
 * `{ notification: { title, body? }, data: { type, titleId? | handle? } }` (API.md §2.4):
 * - app in the BACKGROUND: the system draws it (channel "kura", `ic_stat_kura`) and never calls us;
 *   the tap brings the `data` as extras (`PushIntent.target`).
 * - app in the FOREGROUND: it lands here and kura draws it the same way, with `kuraOpen`.
 * A new or rotated token goes to the store (`PUT /me/devices/{token}` when there's a session).
 */
class KuraMessagingService : FirebaseMessagingService() {
    @Deprecated("firebase-messaging 25 prefers onRegistered (opt-in scheme); see fetchFcmToken")
    override fun onNewToken(token: String) {
        if (BuildConfig.DEBUG) Log.d(PushLog.TAG, "token FCM: $token")
        val app = application as? KuraApp ?: return
        // The store is main-thread state; FCM calls from its own thread.
        Handler(Looper.getMainLooper()).post { app.store.didReceivePushToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"]
        val target = PushIntent.target(message.data)
        PushNotifications.show(this, id = (target ?: message.messageId ?: title).hashCode(), title = title, body = body, target = target)
    }
}
