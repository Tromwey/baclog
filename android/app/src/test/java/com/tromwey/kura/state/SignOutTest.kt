package com.tromwey.kura.state

import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.PendingRevoke
import com.tromwey.kura.data.PendingRevokes
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.KuraApi
import com.tromwey.kura.data.api.KuraApiError
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

/**
 * "Cerrar sesión en este teléfono" revokes on the server (`signOutThisDevice`), a sign-out the server
 * didn't confirm is queued (encrypted on the device) and retried, and the push token comes off with the
 * bearer being left — BEFORE it's marked unregistered.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignOutTest {
    private fun jwt(sub: String, sid: String?) = listOf(
        """{"alg":"none"}""",
        """{"sub":"$sub",${sid?.let { "\"sid\":\"$it\"," } ?: ""}"exp":4102444800}""",
        "sig",
    ).joinToString(".") { Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray()) }

    private val bearer = jwt("u1", "sid-1")

    /** Push on the phone, recording when the flag went off relative to the API calls. */
    class OrderedPush(private val log: MutableList<String>) : InMemoryStorePlatform(welcomeSeen = true), PushPlatform {
        override var notificationsAllowed = true
        override var canAskNotifications = true
        override var didOfferNotifications = true
        override var pushToken: String? = null
        override var pushRegistered = false
        var deleted = 0
        override fun storePushToken(token: String) { pushToken = token }
        override fun isPushCurrent(token: String, account: String) = false
        override fun markPushRegistered(token: String, account: String) { pushRegistered = true }
        override fun markPushUnregistered() {
            log += "markPushUnregistered"
            pushRegistered = false
        }
        override suspend fun fetchPushToken(): String? = null
        override suspend fun deletePushToken() {
            deleted++
            pushToken = null
        }
    }

    private class Harness(
        val api: FakeKuraApi,
        val store: AppStore,
        val tokens: InMemoryTokenStore,
        val queue: PendingRevokes,
        val log: MutableList<String>,
        val push: OrderedPush,
    )

    private fun signOutTest(
        token: String? = bearer,
        queued: List<PendingRevoke> = emptyList(),
        body: suspend TestScope.(Harness) -> Unit,
    ) = runTest {
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val api = FakeKuraApi()
        val log = mutableListOf<String>()
        val push = OrderedPush(log).apply { pushToken = "fcm:token-1"; pushRegistered = true }
        val tokens = InMemoryTokenStore(token)
        val queue = PendingRevokes(InMemoryTokenStore()).apply { queued.forEach(::add) }
        // The fake logs its calls; mirror them into `log` to check the order against the push flag.
        val logged = object : KuraApi by api {
            override suspend fun unregisterDevice(pushToken: String, bearer: String?) {
                api.unregisterDevice(pushToken, bearer); log += "unregisterDevice"
            }
            override suspend fun revokeSession(id: String) {
                api.revokeSession(id); log += "revokeSession"
            }
            override suspend fun revokeOwnSession(sid: String, bearer: String) = revokeSession(sid)
            override suspend fun logoutBearer(bearer: String) {
                api.calls += "logoutBearer ${if (bearer == this@SignOutTest.bearer) "old" else "other"}"
                log += "logoutBearer"
            }
            override fun forgetSession() {
                tokens.clear(); api.forgetSession()
            }
            override suspend fun logout() {
                tokens.clear(); api.logout()
            }
        }
        val store = AppStore(
            api = logged, session = Session(tokens), prefs = LocalPrefs.disabled, clock = { FIXED_NOW },
            scope = scope, platform = push, pendingRevokes = queue,
        )
        try {
            store.enterMain()
            store.startIfNeeded()
            testScheduler.runCurrent()
            body(Harness(api, store, tokens, queue, log, push))
        } finally {
            scope.cancel()
        }
    }

    @Test fun thisPhoneRevokesTheSessionWithItsOwnBearerThenForgetsIt() = signOutTest { h ->
        assertTrue(h.store.signOutThisDevice())
        assertEquals(listOf("unregisterDevice fcm:token-1 $bearer"), h.api.callsOf("unregisterDevice"))
        assertEquals(listOf("revokeSession sid-1"), h.api.callsOf("revokeSession"))
        // The push token comes off FIRST (a revoked bearer couldn't remove it), and the flag goes off
        // only after its DELETE.
        assertEquals(listOf("unregisterDevice", "markPushUnregistered", "revokeSession"), h.log.take(3))
        assertEquals(1, h.push.deleted)
        assertNull("the bearer is forgotten", h.tokens.get())
        assertEquals(AppPhase.Onboarding, h.store.phase)
        assertTrue(h.queue.isEmpty)
        assertFalse(h.store.signingOut)
    }

    @Test fun anAlreadyDeadSessionCountsAsRevoked() = signOutTest { h ->
        h.api.failNext("revokeSession", KuraApiError.NotFound)
        assertTrue(h.store.signOutThisDevice())
        assertTrue(h.queue.isEmpty)
    }

    @Test fun offlineStillLeavesButQueuesTheRevocationAndRetriesIt() = signOutTest { h ->
        h.api.failNext("revokeSession", KuraApiError.Offline)
        assertFalse(h.store.signOutThisDevice())
        assertNull(h.tokens.get())
        assertEquals(AppPhase.Onboarding, h.store.phase)
        assertEquals(toastText(AppStore.DEVICE_SIGN_OUT_QUEUED), h.store.toast?.text)
        assertEquals(listOf(PendingRevoke(bearer = bearer, sid = "sid-1", global = false)), h.queue.all())

        // Still offline: it stays for the next reconnect.
        h.api.failNext("revokeSession", KuraApiError.Offline)
        h.store.retryPendingRevokes()
        assertEquals(1, h.queue.all().size)
        // The network is back.
        h.store.retryPendingRevokes()
        assertEquals(listOf("revokeSession sid-1", "revokeSession sid-1", "revokeSession sid-1"), h.api.callsOf("revokeSession"))
        assertTrue(h.queue.isEmpty)
    }

    @Test fun reconnectingRetriesTheQueue() = signOutTest { h ->
        h.api.failNext("revokeSession", KuraApiError.Offline)
        h.store.signOutThisDevice()
        h.store.connectivityChanged(false)
        h.store.connectivityChanged(true)
        advanceUntilIdle()
        assertTrue(h.queue.isEmpty)
    }

    @Test fun aGlobalSignOutTheServerMissedIsQueuedAndItsPushTokenComesOff() = signOutTest { h ->
        h.api.failNext("logout", KuraApiError.Offline)
        h.store.signOut()
        advanceTimeBy(1_000)
        assertEquals(toastText(AppStore.GLOBAL_SIGN_OUT_QUEUED), h.store.toast?.text)
        assertEquals(listOf("unregisterDevice fcm:token-1 $bearer"), h.api.callsOf("unregisterDevice"))
        assertEquals(listOf(PendingRevoke(bearer = bearer, global = true)), h.queue.all())

        // Next launch, signed out: the logout goes with the queued bearer.
        h.store.retryPendingRevokes()
        assertEquals(listOf("logoutBearer old"), h.api.callsOf("logoutBearer"))
        assertTrue(h.queue.isEmpty)
    }

    @Test fun aQueuedGlobalLogoutNeverThrowsOutTheSameAccountSignedInAgain() =
        signOutTest(token = jwt("u1", "sid-2"), queued = listOf(PendingRevoke(bearer = bearer, global = true))) { h ->
            h.store.retryPendingRevokes()
            assertTrue("dropped, not sent", h.api.callsOf("logoutBearer").isEmpty())
            assertTrue(h.queue.isEmpty)
        }

    @Test fun volverInOnboardingRevokesInTheBackground() = signOutTest { h ->
        h.store.signOut(global = false)
        assertEquals("leaves at once", AppPhase.Onboarding, h.store.phase)
        assertNull(h.tokens.get())
        advanceUntilIdle()
        assertEquals(listOf("revokeSession sid-1"), h.api.callsOf("revokeSession"))
    }
}
