package com.tromwey.kura.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.tromwey.kura.R

/**
 * kura's ONE notification channel ("kura", default importance: sound, no heads-up nag) and the notices
 * kura draws itself. A push in the background is drawn by the system in this same channel with this
 * same icon (manifest `default_notification_channel_id` / `default_notification_icon`).
 */
object PushNotifications {
    const val CHANNEL_ID = "kura"

    /** Before anything can be posted (and before FCM draws one): `KuraApp.onCreate`. */
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, context.getString(R.string.push_channel_name), NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = context.getString(R.string.push_channel_description)
        manager.createNotificationChannel(channel)
    }

    /** What the phone lets kura show: `POST_NOTIFICATIONS` on 13+, the app's switch in older ones. */
    fun allowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** Draws one notice; a tap opens `target` (`PushIntent`). Silently nothing without permission. */
    fun show(context: Context, id: Int, title: String, body: String?, target: String?) {
        if (!allowed(context)) return
        ensureChannel(context)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_kura)
            .setContentTitle(title)
            .apply { if (!body.isNullOrBlank()) setContentText(body) }
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(PushIntent.contentIntent(context, target, id))
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (e: SecurityException) {
            Log.w(PushLog.TAG, "Sin permiso para avisar (${e.javaClass.simpleName})")
        }
    }
}
