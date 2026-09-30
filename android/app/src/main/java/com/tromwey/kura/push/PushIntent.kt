package com.tromwey.kura.push

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.tromwey.kura.MainActivity

/**
 * What a tapped notice opens — the contract with `MainActivity` (the App Links lane reads it in
 * onCreate/onNewIntent and pushes the route with `AppStore.openPush`).
 *
 * Two shapes reach the activity, `target` folds both into ONE string, `title:<id>` | `person:<handle>`:
 * - `kuraOpen` (String extra): the notices kura draws itself — a push while the app is in the
 *   foreground (`KuraMessagingService`) and the local release notice (`ReleaseNoticeWorker`).
 * - The FCM `data` map as flat extras (`type` = "release" + `titleId`, or "follower" + `handle`):
 *   a push with the app in the background is drawn by the SYSTEM, and tapping it opens the launcher
 *   activity with those extras (plus `google.*` keys).
 * Debug: `adb shell am start -n com.tromwey.kura/.MainActivity --es kuraOpen title:<id>`.
 */
object PushIntent {
    const val EXTRA_OPEN = "kuraOpen"

    /** `title:<id>` / `person:<handle>` from either shape; null = not a notice (or a malformed one). */
    fun target(extras: Bundle?): String? {
        if (extras == null) return null
        extras.getString(EXTRA_OPEN)?.let { open -> return open.takeIf(::isTarget) }
        return target(extras.getString("type"), extras.getString("titleId"), extras.getString("handle"))
    }

    /** The FCM `data` map (server: `type` = release | follower). */
    fun target(data: Map<String, String>): String? = target(data["type"], data["titleId"], data["handle"])

    fun target(type: String?, titleId: String?, handle: String?): String? = when (type) {
        "release", "title" -> titleId?.trim()?.takeIf { it.isNotEmpty() }?.let { "title:$it" }
        "follower", "person" -> handle?.trim()?.removePrefix("@")?.takeIf { it.isNotEmpty() }?.let { "person:$it" }
        else -> null
    }

    private fun isTarget(s: String): Boolean =
        (s.startsWith("title:") && s.length > 6) || (s.startsWith("person:") && s.length > 7)

    /** Opens (or brings back) `MainActivity` with `kuraOpen`: onNewIntent when it's alive, onCreate if not. */
    fun contentIntent(context: Context, target: String?, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            target?.let { putExtra(EXTRA_OPEN, it) }
        }
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}
