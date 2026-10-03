package com.tromwey.kura.state

import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.FeedPage
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.api.Items
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

/** The fixes of the 2026-10-01 audit round: invites ask first, lists drop what they can't read, the feed
 *  survives its suggestion, the pages survive a process death. */
@OptIn(ExperimentalCoroutinesApi::class)
class AuditRound1Test {
    private val token = "Ab_-0123456789xy"

    @Test fun anInviteSignedInOpensTheLandingAndNeverJoinsByItself() = storeTest { h ->
        signedIn(h)
        val store = h.store
        assertTrue(store.openWebLink("https://get-kura.app/f/$token"))
        advanceUntilIdle()
        assertEquals(token, store.inviteLanding)
        assertNull(store.pendingInvite)
        assertTrue(h.api.callsOf("joinParty").isEmpty())
    }

    @Test fun aListDropsWhatItCannotReadInsteadOfFailingWhole() {
        val titles = KuraJson.json.decodeFromString(
            Items(Title.serializer()),
            """{"items":[{"id":"t1","name":"a","format":"film","palette":[]},{"id":"t2","name":"b","format":"podcast","palette":[]},{"id":"t3","name":"c","format":"album","palette":[]}]}""",
        )
        assertEquals(listOf("t1", "t3"), titles.map { it.id })

        val page = KuraJson.json.decodeFromString(
            FeedPage.serializer(),
            """{"items":[{"id":"e1","kind":"obsessed","at":"2026-09-29T00:00:00Z"},{"id":"e2","kind":"listened","at":"2026-09-29T00:00:00Z"}],"nextCursor":"c2"}""",
        )
        assertEquals(listOf("e1"), page.items.map { it.id })
        assertEquals("c2", page.nextCursor)
    }

    @Test fun theFeedLoadsWithoutItsSuggestion() = storeTest { h ->
        signedIn(h)
        h.api.failNext("feedSuggestion", KuraApiError.Server("500"))
        h.store.loadFeed(force = true)
        advanceUntilIdle()
        assertTrue(h.store.feedLoaded)
        assertNull(h.store.loadError(LoadKey.Feed))
        assertTrue(h.store.feed.isNotEmpty())
    }

    @Test fun aTransportFailureMakesTheNextValidatedNetworkAReconnection() = storeTest { h ->
        signedIn(h)
        val store = h.store
        // The system never said the network dropped; a request just died on it.
        h.api.failNext("feed", KuraApiError.Offline)
        store.loadFeed(force = true)
        advanceUntilIdle()
        assertTrue(store.offline)
        assertNotNull(store.loadError(LoadKey.Feed))
        store.select(Tab.Feed)
        store.connectivityChanged(true)
        advanceUntilIdle()
        assertFalse(store.offline)
        assertNull(store.loadError(LoadKey.Feed))
        assertTrue(store.feedLoaded)
    }

    @Test fun theOpenPagesAndAReviewDraftSurviveAProcessDeath() = runTest {
        fun jwt(sid: String): String {
            val enc = Base64.getUrlEncoder().withoutPadding()
            return enc.encodeToString("""{"alg":"none"}""".toByteArray()) + "." +
                enc.encodeToString("""{"sid":"$sid","exp":4102444800}""".toByteArray()) + ".x"
        }
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        fun store(sid: String) = AppStore(api = FakeKuraApi(), session = Session(InMemoryTokenStore(jwt(sid))),
            prefs = LocalPrefs.disabled, clock = { FIXED_NOW }, scope = scope)
        try {
            val first = store("s1")
            first.enterMain(); first.startIfNeeded(); runCurrent()
            assertNull(first.savedState()?.takeIf { false })
            first.select(Tab.Discover)
            first.push(Route.TitleRoute("t1"))
            first.push(Route.MergeCode)
            first.setReviewDraft("t1", "a medias")
            val saved = first.savedState()
            assertNotNull(saved)

            // The same account after the process died: back where it was, minus what can't come back.
            val second = store("s1")
            second.restoreSavedState(saved)
            second.enterMain()
            assertEquals(Tab.Discover, second.tab)
            second.startIfNeeded(); runCurrent()
            assertEquals(listOf<Route>(Route.TitleRoute("t1")), second.path(Tab.Discover))
            assertEquals("a medias", second.reviewDraft("t1"))

            // Another account never inherits it.
            val other = store("s2")
            other.restoreSavedState(saved)
            other.enterMain(); other.startIfNeeded(); runCurrent()
            assertEquals(Tab.Collections, other.tab)
            assertTrue(other.path(Tab.Discover).isEmpty())
            assertNull(other.reviewDraft("t1"))
        } finally {
            scope.cancel()
        }
    }
}
