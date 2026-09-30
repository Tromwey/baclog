package com.tromwey.kura.state

import androidx.compose.runtime.snapshotFlow
import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.data.models.Route
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.time.Duration.Companion.milliseconds

// Push: permission, the FCM token on the server, local vs. remote release notices and a tapped
// notice → route — twin of the push half of iOS `AppStore+AccountLink.swift`. The Android services
// are behind `PushPlatform` (live: `AndroidStorePlatform`); a platform without it (tests, previews)
// makes every function here a no-op.

/** What push needs from the phone. `AndroidStorePlatform` implements it over FCM, WorkManager and
 *  `NotificationManager`; the store never sees Firebase. */
interface PushPlatform {
    /** The phone lets kura show notices (`POST_NOTIFICATIONS` on 13+, the app's switch before). */
    val notificationsAllowed: Boolean
    /** A system prompt exists to ask (Android 13+). Before 13 notices are on by default. */
    val canAskNotifications: Boolean
    /** kura's own "¿te avisamos?" was already offered on this install (once, never nagging). */
    var didOfferNotifications: Boolean
    val pushToken: String?
    /** This install's token is on the server for the current account (release notices come as push). */
    val pushRegistered: Boolean
    fun storePushToken(token: String)
    fun isPushCurrent(token: String, account: String): Boolean
    /** The `PUT` answered 204: remembered for a week, and every pending LOCAL release notice goes. */
    fun markPushRegistered(token: String, account: String)
    fun markPushUnregistered()
    /** Asks FCM for this install's token (null = none: no Play services, offline, Firebase off). */
    suspend fun fetchPushToken(): String?
    /** Signing out on this phone: FCM forgets this install's token (a new one is minted on the next
     *  sign-in) and the stored copy goes. Default: nothing (tests, previews). */
    suspend fun deletePushToken() {}
}

private val AppStore.push: PushPlatform? get() = platform as? PushPlatform

/** The token of the `PUT` in flight (one per process: a cold start's two triggers never send two). */
private var registeringToken: String? = null

/** True while the server sends this install the release notices (so nothing local is scheduled). */
val AppStore.pushRegistered: Boolean get() = push?.pushRegistered == true

/**
 * Every time the app comes back to the front with the tabs up (and right after the system's
 * permission prompt, which pauses the activity): allowed → the token goes (or stays) on the server;
 * taken away → it comes off, so release notices fall back to local ones. Returns "allowed".
 */
suspend fun AppStore.refreshNotificationStatus(): Boolean {
    val p = push ?: return false
    val allowed = p.notificationsAllowed
    if (allowed) {
        registerPushIfNeeded()
    } else if (p.pushRegistered && api.hasSession) {
        unregisterPush()
    }
    return allowed
}

/**
 * Once per install, after the tabs are up: if the phone hasn't been asked yet (13+), kura's own
 * sheet says what the notices are before the system prompt. Never over another sheet.
 */
suspend fun AppStore.offerNotificationsIfNeeded() {
    val p = push ?: return
    if (p.notificationsAllowed || !p.canAskNotifications || p.didOfferNotifications) return
    if (sheet != null || pendingSheet != null) return
    delay(900.milliseconds)
    if (sheet != null || phase != AppPhase.Main || p.notificationsAllowed) return
    p.didOfferNotifications = true
    present(SheetRoute.NotificationsAsk)
}

/** A notices switch turned on: allowed → register; not yet → "¿te avisamos?" (which asks the system). */
fun AppStore.askNotificationsIfNeeded() {
    val p = push ?: return
    when {
        p.notificationsAllowed -> scope.launch { registerPushIfNeeded() }
        p.canAskNotifications && sheet == null -> present(SheetRoute.NotificationsAsk)
    }
}

/** With a session and the tabs up, and notices allowed: ask FCM for the token (every launch: it can
 *  rotate) and put it on the server. Never asks for permission. */
suspend fun AppStore.registerPushIfNeeded() {
    val p = push ?: return
    if (phase != AppPhase.Main || !api.hasSession || !p.notificationsAllowed) return
    val token = p.fetchPushToken() ?: return
    didReceivePushToken(token)
}

/**
 * FCM handed this install's token (on request, or rotated: `onNewToken`) → `PUT /me/devices/{token}`
 * with `provider = "fcm"` (idempotent; skipped when this token + account went up less than a week
 * ago). Once the server has it, release notices come as push and the pending local ones go.
 */
fun AppStore.didReceivePushToken(token: String) {
    val p = push ?: return
    p.storePushToken(token)
    if (!api.hasSession || phase != AppPhase.Main || !p.notificationsAllowed) return
    val account = session.subject ?: return
    if (p.isPushCurrent(token, account) || registeringToken == token) return
    registeringToken = token
    val session = s
    scope.launch {
        try {
            api.registerDevice(pushToken = token, environment = null, provider = "fcm")
            // Registered for the account that asked: if it signed out meanwhile, the exit already
            // marked this install unregistered, and that stands.
            if (s === session) p.markPushRegistered(token, account)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            // Not the person's problem right now: the next launch registers again.
            KuraLog.api("push: PUT me/devices/:id falló (${e.javaClass.simpleName})")
        } finally {
            if (registeringToken == token) registeringToken = null
        }
    }
}

/**
 * This install's token off the server: signing out on THIS phone (`bearer` = the one being forgotten,
 * captured before the forget — `LiveApi.onForgetSession`), or notices taken away (the live session).
 * Best effort: the flag goes off either way, so release notices fall back to local ones.
 */
fun AppStore.unregisterPush(bearer: String? = null) {
    val p = push ?: return
    val token = p.pushToken
    if (token == null) {
        p.markPushUnregistered()
        return
    }
    scope.launch {
        try {
            api.unregisterDevice(token, bearer)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            KuraLog.api("push: DELETE me/devices/:id falló (${e.javaClass.simpleName})")
        } finally {
            // AFTER the DELETE (either way): while it's out, the server may still send, and the flag
            // must not turn local notices on under a push that's still coming.
            p.markPushUnregistered()
        }
    }
}

/**
 * Signing out: this install's token comes off the server with `bearer` (the session being left, sent
 * explicitly — it's about to be forgotten or revoked), THEN it's marked unregistered (so release notices
 * fall back to local ones) and FCM forgets it. Awaited, best effort: a failure is logged, never shown
 * (revoking the session on the server drops its device tokens too).
 */
internal suspend fun AppStore.releasePushToken(bearer: String) {
    val p = push ?: return
    val token = p.pushToken
    if (token != null) {
        try {
            api.unregisterDevice(token, bearer)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            KuraLog.api("push: DELETE me/devices/:id al salir falló (${e.javaClass.simpleName})")
        }
    }
    p.markPushUnregistered()
    try {
        p.deletePushToken()
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        KuraLog.api("push: deleteToken falló (${e.javaClass.simpleName})")
    }
}

/**
 * A tapped notice → the route to open (`PushIntent.target`: `title:<id>` | `person:<handle>`), or
 * null. Pure: the caller (`MainActivity`, App Links lane) pushes it or queues it until the tabs are up.
 */
fun AppStore.openPush(target: String?): Route? {
    val t = target?.trim() ?: return null
    return when {
        t.startsWith("title:") -> t.removePrefix("title:").takeIf { it.isNotEmpty() }?.let { Route.TitleRoute(it) }
        t.startsWith("person:") -> t.removePrefix("person:").removePrefix("@").takeIf { it.isNotEmpty() }?.let { Route.PersonRoute(it) }
        else -> null
    }
}

/**
 * Wired once by `AppStore.create`: each time the tabs come up with a session (cold start, or right
 * after signing in), sync the token with the permission, then offer "¿te avisamos?" once.
 * (iOS does both at the end of `startIfNeeded`.)
 */
internal fun AppStore.watchPushOnMain() {
    if (push == null) return
    scope.launch {
        snapshotFlow { phase }.collect { ph ->
            if (ph != AppPhase.Main) return@collect
            // The tabs are up once the bootstrap ran (the library first, then the sheets it queued).
            var waited = 0
            while (!didBootstrap && phase == AppPhase.Main && waited < 30_000) {
                delay(200.milliseconds); waited += 200
            }
            if (phase != AppPhase.Main) return@collect
            // Register if allowed — or take the token off if the permission went away while the app
            // was dead (revoking it kills the process, so no resume ever saw it).
            refreshNotificationStatus()
            offerNotificationsIfNeeded()
        }
    }
}
