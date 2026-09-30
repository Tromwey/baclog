package com.tromwey.kura.state

import com.tromwey.kura.data.PendingRevoke
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.api.KuraLog
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import java.util.WeakHashMap

// Leaving a session on THIS phone for real: the bearer is revoked on the server (not just forgotten
// here), this install's push token comes off, and whatever the server didn't confirm (offline, 5xx) is
// queued ENCRYPTED (`pendingRevokes`) and retried on the next launch and when the network comes back.
// (iOS forgets the Keychain item only; the security review asked Android to revoke — a forgotten bearer
// that stays alive on the server is a stolen-phone risk.)

private const val TAG = "KuraSession"

/**
 * Ajustes › "Cerrar sesión en este teléfono": captures the bearer and its `sid`, takes this install's
 * push token off with that bearer (`DELETE /me/devices/{token}`, then FCM forgets it), revokes the
 * session (`DELETE /me/sessions/{sid}` with that bearer), THEN forgets it and goes to the entrance.
 * True = the server confirmed (or the session was already dead: 401/404). False = it didn't (offline,
 * 5xx): the local session ends anyway, the revocation is queued and a toast says we'll retry.
 * Runs on the store's scope: the screen that called it may go away, the sign-out still finishes.
 */
suspend fun AppStore.signOutThisDevice(): Boolean {
    if (signingOut) return false
    val bearer = session.token
    if (bearer == null) {
        api.forgetSession()
        leaveSession(null)
        return true
    }
    val sid = session.sid
    signingOut = true
    val work = scope.async {
        val revoked = try {
            releasePushToken(bearer)
            revokeOwn(bearer, sid)
        } finally {
            signingOut = false
        }
        if (!revoked) queueRevoke(bearer, sid)
        api.forgetSession()
        leaveSession(if (revoked) null else AppStore.DEVICE_SIGN_OUT_QUEUED)
        revoked
    }
    return work.await()
}

/** `signOut(global = false)` (Volver in onboarding, underage): the person already left; the server hears
 *  it in the background, queued if it can't. Never a toast. */
internal suspend fun AppStore.revokeInBackground(bearer: String, sid: String?) {
    releasePushToken(bearer)
    if (!revokeOwn(bearer, sid)) queueRevoke(bearer, sid)
}

/** `DELETE /me/sessions/{sid}` with `bearer`. True = gone (204, or 401/404: already dead). */
private suspend fun AppStore.revokeOwn(bearer: String, sid: String?): Boolean {
    if (sid == null) {
        // A bearer from before sessions carried `sid` (fase 4d): nothing names it on the server. It
        // can't be queued either; it dies with its expiry or the next global sign-out.
        KuraLog.w(TAG, "bearer sin sid: no se puede revocar solo esta sesión")
        return true
    }
    return try {
        api.revokeOwnSession(sid, bearer)
        true
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        when (e) {
            KuraApiError.Unauthorized, KuraApiError.NotFound -> true
            is KuraApiError -> false
            else -> {
                KuraLog.e(TAG, "revocar sesión: bug no mapeado", e)
                false
            }
        }
    }
}

private fun AppStore.queueRevoke(bearer: String, sid: String?) {
    if (sid == null) return
    pendingRevokes.add(PendingRevoke(bearer = bearer, sid = sid, global = false))
}

/** One retry run at a time per store (a launch and a reconnect can both ask). */
private val retrying = WeakHashMap<AppStore, Boolean>()

/** `retryPendingRevokes` on the store's scope (the factory at launch; `connectivityChanged` on reconnect). */
fun AppStore.retryPendingRevokesSoon() {
    if (pendingRevokes.isEmpty) return
    scope.launch { retryPendingRevokes() }
}

/**
 * Every queued sign-out, oldest first: a device one → `DELETE /me/sessions/{sid}`; a global one →
 * `POST auth/logout`, both with the queued bearer. Done (204, 401, 404) → out of the queue. Offline →
 * stop, the next reconnect tries again. Anything else → it stays for the next launch.
 *
 * A queued GLOBAL logout of the account signed in here right now is dropped instead of sent: logging out
 * everywhere would also throw out the session the person just opened again on this phone.
 */
suspend fun AppStore.retryPendingRevokes() {
    if (synchronized(retrying) { retrying.put(this, true) } == true) return
    try {
        for (p in pendingRevokes.all()) {
            if (p.global) {
                val current = session.subject
                if (current != null && current == Session.claimString(p.bearer, "sub")) {
                    KuraLog.w(TAG, "logout global en cola descartado: la misma cuenta volvió a entrar aquí")
                    pendingRevokes.remove(p)
                    continue
                }
            }
            val done = try {
                if (p.global) api.logoutBearer(p.bearer) else api.revokeOwnSession(p.sid ?: "", p.bearer)
                true
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                when (e) {
                    KuraApiError.Unauthorized, KuraApiError.NotFound -> true
                    KuraApiError.Offline -> return
                    else -> {
                        KuraLog.w(TAG, "reintento de cierre de sesión falló (${e.javaClass.simpleName})")
                        false
                    }
                }
            }
            if (done) pendingRevokes.remove(p)
        }
    } finally {
        synchronized(retrying) { retrying.remove(this) }
    }
}
