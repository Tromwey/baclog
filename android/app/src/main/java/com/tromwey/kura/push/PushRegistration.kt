package com.tromwey.kura.push

import android.content.Context
import com.tromwey.kura.data.api.GoogleNonce

/**
 * The FCM token and whether THIS account has it on the server (`PUT /me/devices/{token}` with
 * `provider = "fcm"`) — twin of iOS `PushRegistration`. Plain private prefs on purpose: a push token
 * isn't a credential (it only lets our server address this install).
 *
 * Local vs. remote release notices: while `isRegistered`, the server sends "… ya salió", so
 * `ReleaseNotifier` schedules nothing local and the pending locals are cancelled (they'd arrive
 * twice). Every way out of a session marks it unregistered, which turns locals back on.
 */
class PushRegistration(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("com.tromwey.kura.push", Context.MODE_PRIVATE)

    val token: String? get() = prefs.getString(TOKEN, null)
    val isRegistered: Boolean get() = prefs.getBoolean(REGISTERED, false)

    /** A new or rotated token isn't on the server yet. */
    fun store(token: String) {
        if (prefs.getString(TOKEN, null) != token) {
            prefs.edit().putString(TOKEN, token).putBoolean(REGISTERED, false).apply()
        }
    }

    /** `PUT` answered 204 for this token and account: skip the next cold-start `PUT` for a week. */
    fun markRegistered(token: String, account: String, nowMs: Long = System.currentTimeMillis()) {
        prefs.edit()
            .putBoolean(REGISTERED, true)
            .putString(LAST_FP, fingerprint(token, account))
            .putLong(LAST_AT, nowMs)
            .apply()
    }

    /** This install's token is NOT (or no longer) on the server for the current account: sign-out,
     *  deleted account, a 401, the permission taken away. The next session always `PUT`s again. */
    fun markUnregistered() {
        prefs.edit().putBoolean(REGISTERED, false).remove(LAST_FP).remove(LAST_AT).apply()
    }

    /** True when the `PUT` already succeeded for exactly this token and account less than
     *  `MAX_AGE_MS` ago (the server may prune a token FCM calls `UNREGISTERED`; the app never hears). */
    fun isCurrent(token: String, account: String, nowMs: Long = System.currentTimeMillis()): Boolean {
        if (!isRegistered) return false
        val fp = prefs.getString(LAST_FP, null) ?: return false
        val age = nowMs - prefs.getLong(LAST_AT, 0L)
        return fp == fingerprint(token, account) && age in 0 until MAX_AGE_MS
    }

    /** `token|sha256(account)`: the user id itself never lands in prefs. */
    private fun fingerprint(token: String, account: String) = "$token|${GoogleNonce.sha256(account)}"

    private companion object {
        const val TOKEN = "kura.push.token"
        const val REGISTERED = "kura.push.registered"
        const val LAST_FP = "kura.push.lastFingerprint"
        const val LAST_AT = "kura.push.lastAt"
        const val MAX_AGE_MS = 7L * 24 * 3600 * 1000
    }
}
