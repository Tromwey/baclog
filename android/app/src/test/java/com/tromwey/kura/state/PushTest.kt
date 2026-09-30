package com.tromwey.kura.state

import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.models.Route
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

/** Push in the store (`AppStorePush.kt`): the FCM token on the server, local vs. remote, taps → route. */
@OptIn(ExperimentalCoroutinesApi::class)
class PushTest {
    /** A JWT-shaped bearer (`sub` is the account the registration is fingerprinted with). */
    private val bearer = listOf("""{"alg":"none"}""", """{"sub":"u1","exp":4102444800}""", "sig")
        .joinToString(".") { Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray()) }

    class FakePush : InMemoryStorePlatform(welcomeSeen = true), PushPlatform {
        override var notificationsAllowed = true
        override var canAskNotifications = true
        override var didOfferNotifications = false
        override var pushToken: String? = null
        override var pushRegistered = false
        var current: Pair<String, String>? = null
        var fcmToken: String? = "fcm:token-1"
        var localNoticesCancelled = 0
        override fun storePushToken(token: String) {
            if (pushToken != token) { pushToken = token; pushRegistered = false }
        }
        override fun isPushCurrent(token: String, account: String) = pushRegistered && current == (token to account)
        override fun markPushRegistered(token: String, account: String) {
            pushRegistered = true; current = token to account; localNoticesCancelled++
        }
        override fun markPushUnregistered() { pushRegistered = false; current = null }
        override suspend fun fetchPushToken() = fcmToken
    }

    private fun pushTest(body: suspend TestScope.(FakeKuraApi, AppStore, FakePush) -> Unit) = runTest {
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val api = FakeKuraApi()
        val platform = FakePush()
        val store = AppStore(
            api = api, session = Session(InMemoryTokenStore(bearer)), prefs = LocalPrefs.disabled,
            clock = { FIXED_NOW }, scope = scope, platform = platform,
        )
        try {
            store.enterMain()
            store.startIfNeeded()
            testScheduler.runCurrent()
            body(api, store, platform)
        } finally {
            scope.cancel()
        }
    }

    @Test fun tokenGoesUpAsFcmOnceThenIsSkipped() = pushTest { api, store, push ->
        store.registerPushIfNeeded()
        advanceUntilIdle()
        assertEquals(listOf("registerDevice fcm:token-1 fcm"), api.callsOf("registerDevice"))
        assertTrue(store.pushRegistered)
        assertEquals("registering cancels the pending local notices", 1, push.localNoticesCancelled)
        store.didReceivePushToken("fcm:token-1")
        advanceUntilIdle()
        assertEquals("same token + account: no second PUT", 1, api.callsOf("registerDevice").size)
        store.didReceivePushToken("fcm:rotated")
        advanceUntilIdle()
        assertEquals("a rotated token goes up", "registerDevice fcm:rotated fcm", api.callsOf("registerDevice").last())
    }

    @Test fun nothingGoesUpWithoutPermission() = pushTest { api, store, push ->
        push.notificationsAllowed = false
        store.registerPushIfNeeded()
        store.didReceivePushToken("fcm:token-1")
        advanceUntilIdle()
        assertTrue(api.callsOf("registerDevice").isEmpty())
        assertEquals("the token is kept for later", "fcm:token-1", push.pushToken)
    }

    @Test fun aFailedPutStaysUnregistered() = pushTest { api, store, _ ->
        api.failNext("registerDevice", com.tromwey.kura.data.api.KuraApiError.Offline)
        store.didReceivePushToken("fcm:token-1")
        advanceUntilIdle()
        assertFalse(store.pushRegistered)
    }

    @Test fun permissionTakenAwayTakesTheTokenOff() = pushTest { api, store, push ->
        store.didReceivePushToken("fcm:token-1")
        advanceUntilIdle()
        push.notificationsAllowed = false
        assertFalse(store.refreshNotificationStatus())
        advanceUntilIdle()
        assertEquals(listOf("unregisterDevice fcm:token-1 null"), api.callsOf("unregisterDevice"))
        assertFalse("release notices fall back to local ones", store.pushRegistered)
    }

    @Test fun signingOutOnThisPhoneUsesTheForgottenBearer() = pushTest { api, store, _ ->
        store.didReceivePushToken("fcm:token-1")
        advanceUntilIdle()
        store.unregisterPush(bearer = "the.old.bearer")
        advanceUntilIdle()
        assertEquals(listOf("unregisterDevice fcm:token-1 the.old.bearer"), api.callsOf("unregisterDevice"))
        assertFalse(store.pushRegistered)
    }

    @Test fun offersTheSheetOncePerInstall() = pushTest { _, store, push ->
        push.notificationsAllowed = false
        store.offerNotificationsIfNeeded()
        assertEquals(SheetRoute.NotificationsAsk, store.sheet)
        store.dismissSheet()
        store.offerNotificationsIfNeeded()
        assertNull("never twice", store.sheet)
    }

    @Test fun tappedNoticeRoutes() = pushTest { _, store, _ ->
        assertEquals(Route.TitleRoute("abc"), store.openPush("title:abc"))
        assertEquals(Route.PersonRoute("ana"), store.openPush("person:@ana"))
        assertNull(store.openPush("title:"))
        assertNull(store.openPush("party:x"))
        assertNull(store.openPush(null))
    }
}
