package com.tromwey.kura.state

import com.tromwey.kura.data.api.Items
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FeedKind
import com.tromwey.kura.data.models.FeedPage
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.Title
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The fixes of the third audit cycle (2026-10-01), as the traces that found them: a tap that fails,
 * another tap, the network coming back. A failed write reverts to what the SERVER last confirmed, a
 * newer write retires the older Reintentar of the same thing, and a title that left the library takes
 * its pending writes with it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AuditRound3Test {
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // in the library, no mark

    // MARK: 1 · Completar (the awaited mark) and the Reintentar of an older mark

    /** Me gusta fails offline (its Reintentar waits) → Completar's "Me obsesiona" goes through → the
     *  network comes back. The old "Me gusta" must NOT be resent over the new mark. */
    @Test fun aConfirmedMarkRetiresTheOlderRetryOfTheSameTitle() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.connectivityChanged(false)
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        assertNull(store.setMarkConfirmed(yhlq, Mark.Obsessed, preview = false))
        assertEquals(Mark.Obsessed, store.mark(yhlq))
        assertNull("el Reintentar viejo se liquida", store.toast)

        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(listOf("setMark $yhlq liked false", "setMark $yhlq obsessed false"), h.api.callsOf("setMark"))
        assertEquals(Mark.Obsessed, store.mark(yhlq))
    }

    /** Completar's mark fails while a newer `setMark` is already queued: the newer one decides — the
     *  failure must not put the screen back under it. */
    @Test fun aConfirmedMarkThatFailsDoesNotRevertUnderANewerMark() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("setMark", KuraApiError.Server("500"))
        val gate = h.api.hold("setMark")
        var answer: KuraApiError? = null
        launch { answer = store.setMarkConfirmed(yhlq, Mark.Liked, preview = false) }
        runCurrent()
        store.setMark(yhlq, Mark.Obsessed)
        gate.complete(Unit)
        runCurrent()
        assertNotNull("la hoja se entera del fallo", answer)
        assertEquals(2, h.api.callsOf("setMark").size)
        assertEquals("la marca nueva (ya en el servidor) sigue en pantalla", Mark.Obsessed, store.mark(yhlq))
    }

    // MARK: 2 · A revert goes back to what the server confirmed

    @Test fun twoMarksLostOfflineEndOnTheServersMarkNotOnTheFirstTap() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("setMark", KuraApiError.Offline, times = 2)
        store.setMark(yhlq, Mark.Liked)
        store.setMark(yhlq, Mark.Obsessed)
        assertEquals(Mark.Obsessed, store.mark(yhlq))
        runCurrent()
        assertEquals(2, h.api.callsOf("setMark").size)
        assertNull("el servidor no tiene marca: la pantalla tampoco", store.mark(yhlq))
    }

    @Test fun aMarkLostAfterOneThatLandedGoesBackToTheOneThatLanded() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.setMark(yhlq, Mark.Liked)      // lands
        runCurrent()
        h.api.failNext("setMark", KuraApiError.Offline, times = 2)
        store.setMark(yhlq, Mark.Obsessed)   // lost
        store.setMark(yhlq, Mark.Completed)  // lost
        runCurrent()
        assertEquals(3, h.api.callsOf("setMark").size)
        assertEquals(Mark.Liked, store.mark(yhlq))
    }

    @Test fun twoRenamesLostOfflineEndOnTheServersName() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val c = store.collections.first()
        h.api.failNext("updateCollection", KuraApiError.Offline, times = 2)
        store.editCollection(c.id, "bbb", c.vibe ?: "")
        store.editCollection(c.id, "ccc", c.vibe ?: "")
        assertEquals("ccc", store.collection(c.id)!!.name)
        runCurrent()
        assertEquals(2, h.api.callsOf("updateCollection").size)
        assertEquals("el servidor sigue con el nombre de antes", c.name, store.collection(c.id)!!.name)
    }

    @Test fun followThenUnfollowLostOfflineEndsNotFollowingAndWithNothingToRetry() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        val count = store.me.followingCount
        h.api.failNext("setFollowing", KuraApiError.Offline, times = 2)
        store.toggleFollow("nueva")
        store.toggleFollow("nueva")
        runCurrent()
        assertEquals(2, h.api.callsOf("setFollowing").size)
        assertFalse(store.isFollowing("nueva"))
        assertEquals(count, store.me.followingCount)
        // The server already has what was asked: no Reintentar, and the reconnection resends nothing.
        assertNull(store.toast?.takeIf { it.kind == ToastModel.Kind.Retry })
        store.connectivityChanged(false)
        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(2, h.api.callsOf("setFollowing").size)
    }

    @Test fun aFailedFollowDoesNotRevertUnderANewerFollow() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        h.api.failNext("setFollowing", KuraApiError.Server("500"))
        val gate = h.api.hold("setFollowing")
        store.toggleFollow("nueva") // follow: fails
        runCurrent()
        store.toggleFollow("nueva") // unfollow
        store.toggleFollow("nueva") // follow again: lands
        gate.complete(Unit)
        runCurrent()
        assertEquals(3, h.api.callsOf("setFollowing").size)
        assertTrue("el fallo viejo no deshace el follow que sí llegó", store.isFollowing("nueva"))
    }

    // MARK: 3 · A title that left the library takes its pending writes with it

    @Test fun aPendingMarkDoesNotComeBackAfterQuitarDeTusColecciones() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.connectivityChanged(false)
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Obsessed)
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        store.removeFromLibrary(yhlq)
        assertEquals("el Reintentar del título se va con él", ToastModel.Kind.Undo, store.toast?.kind)
        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals("la obsesión no se reenvía", 1, h.api.callsOf("setMark").size)
        assertEquals(listOf("removeFromLibrary $yhlq"), h.api.callsOf("removeFromLibrary"))
    }

    /** Round 8 (founder): another toast covering the Reintentar no longer takes the write out of the
     *  queue — it is resent with the rest when the network is back. */
    @Test fun aRetryWhoseToastWasReplacedIsStillResent() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        store.connectivityChanged(false)
        h.api.failNext("setFollowing", KuraApiError.Offline)
        store.toggleFollow("nueva")
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        store.showToast(ToastModel("Link copiado", ToastModel.Kind.Info))
        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(2, h.api.callsOf("setFollowing").size)
        assertTrue(store.isFollowing("nueva"))
    }

    @Test fun savingATitleAgainRetiresTheFailedRemovalOfIt() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.connectivityChanged(false)
        h.api.failNext("removeFromLibrary", KuraApiError.Offline)
        store.removeFromLibrary(yhlq)
        advanceUntilIdle() // the Deshacer window closes, the DELETE fails, everything comes back
        assertTrue(yhlq in store.libraryIds)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals("el Quitar viejo no se reenvía sobre la marca", 1, h.api.callsOf("removeFromLibrary").size)
        assertEquals(Mark.Liked, store.mark(yhlq))
    }

    // MARK: 4 · The feed doesn't say "todo en calma" with pages left

    @Test fun aFirstPageOfOnlyMutedPeopleAsksForTheNext() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadFeed(force = true)
        advanceUntilIdle()
        assertNotNull(store.feedCursor)
        store.s.muted = store.feed.map { it.authorId }.toSet()
        assertTrue(store.visibleFeed.isEmpty())
        val before = h.api.callsOf("feed").size

        store.loadFeed(force = true)
        advanceUntilIdle()
        val asked = h.api.callsOf("feed").drop(before)
        assertEquals("feed null", asked.first())
        assertTrue("pidió la página siguiente antes de callar", asked.size >= 2)
    }

    // MARK: 6 · A "crear colección" whose answer was lost isn't created twice

    @Test fun retryingACreateWhoseAnswerWasLostAdoptsTheCollectionInsteadOfATwin() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.lastOfflineTimedOut = true // a timeout: the only failure after which the POST may have landed
        h.api.failNext("createCollection", KuraApiError.Offline)
        store.createCollection("lista nueva", Privacy.OnlyMe)
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        assertTrue(store.collections.none { it.name == "lista nueva" })
        // The POST had landed: only its answer was lost.
        h.api.collections = h.api.collections +
            KCollection(id = "srv-landed", name = "lista nueva", titleIds = emptyList(), privacy = Privacy.OnlyMe, createdAt = FIXED_NOW)
        // A library read between the failure and the retry (pull to refresh, the reconnection's
        // bootstrap) brings it in: it's "known" by then, and it is STILL that POST's collection.
        store.refreshLibrary()
        assertEquals(1, store.collections.count { it.name == "lista nueva" })
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals("ni un POST más", 1, h.api.callsOf("createCollection").size)
        assertEquals("lista nueva", store.collection("srv-landed")?.name)
        assertEquals("ni una gemela en pantalla", 1, store.collections.count { it.name == "lista nueva" })
    }

    @Test fun retryingACreateThatNeverLandedCreatesIt() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("createCollection", KuraApiError.Offline)
        store.createCollection("lista nueva", Privacy.OnlyMe)
        runCurrent()
        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals(2, h.api.callsOf("createCollection").size)
        assertEquals(1, store.collections.count { it.name == "lista nueva" })
    }

    // MARK: 10 · 11 · Decoding

    @Test fun onePageWithASingleUnknownRowIsAnEmptyPageTwoAreAContractError() {
        val one = """{"items":[{"id":"e1","kind":"listened","at":"2026-09-29T00:00:00Z"}],"nextCursor":"c2"}"""
        val page = KuraJson.json.decodeFromString(FeedPage.serializer(), one)
        assertTrue(page.items.isEmpty())
        assertEquals("c2", page.nextCursor)
        assertTrue(KuraJson.json.decodeFromString(Items(Title.serializer()), """[{"id":"t2","name":"b","format":"podcast","palette":[]}]""").isEmpty())
        assertThrows(SerializationException::class.java) {
            KuraJson.json.decodeFromString(
                FeedPage.serializer(),
                """{"items":[{"id":"e1","kind":"listened","at":"2026-09-29T00:00:00Z"},{"id":"e2","kind":"danced","at":"2026-09-29T00:00:00Z"}]}""",
            )
        }
    }

    @Test fun aSuggestionWithoutCommonHasNoCommonLine() {
        val raw = KuraJson.json.parseToJsonElement(com.tromwey.kura.data.Fixtures.text("feed_suggestion"))
        val event = kotlinx.serialization.json.JsonObject(raw.jsonObjectOf("event").mapValues { (k, v) ->
            if (k == "suggest") kotlinx.serialization.json.JsonObject((v as kotlinx.serialization.json.JsonObject) + ("common" to kotlinx.serialization.json.JsonNull)) else v
        })
        val k = KuraJson.json.decodeFromJsonElement(FeedEvent.serializer(), event).kind as FeedKind.Suggestion
        assertEquals("sin línea de comunes (la card la pinta solo si no está vacía)", "", k.social)
    }

    private fun kotlinx.serialization.json.JsonElement.jsonObjectOf(key: String) =
        (this as kotlinx.serialization.json.JsonObject)[key] as kotlinx.serialization.json.JsonObject
}
