package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Review
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** What the screen lanes asked for: the stale-read race on reviews, Quitar de tus colecciones, the store's
 *  own `launch`, recent-search edits and a forced reload of a Descubrir format. */
@OptIn(ExperimentalCoroutinesApi::class)
class SecondRoundTest {
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // in "PR ta bien cabron", no mark
    private val pr = "5c75d6dd-1e73-45e2-a4b8-78ea0168fa1d"
    private val recs = "4f69f303-e6a1-4f76-95e3-e4b53763d0af"

    private fun serverReview(handle: String, spoiler: Boolean) = Review(
        id = "srv-review", authorId = handle, titleId = yhlq, text = "un disco que no se acaba", mark = Mark.Liked,
        spoiler = spoiler, date = Instant.parse("2026-09-28T00:00:00Z"),
    )

    // MARK: 1 · a GET that started before a review write never overwrites it

    @Test fun aTitleReadOlderThanAReviewEditKeepsTheEdit() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.titleReviews[yhlq] = listOf(serverReview(store.me.handle, spoiler = false))
        store.loadTitle(yhlq)
        assertFalse(store.myReview(yhlq)!!.spoiler)

        // Completar (the ficha): the mark is awaited, then it re-reads the ficha — that GET is parked.
        val staleRead = h.api.hold("title")
        assertNull(store.setMarkConfirmed(yhlq, Mark.Liked, preview = false))
        runCurrent()
        assertEquals(2, h.api.callsOf("title").size)
        // …and the edited review (now a spoiler) is saved while the GET is still out.
        store.publishReview(yhlq, "un disco que no se acaba", spoiler = true)
        runCurrent()
        assertEquals(1, h.api.callsOf("saveReview").size)
        assertTrue(store.myReview(yhlq)!!.spoiler)

        // The old answer lands AFTER the PUT finished: it must not undo the edit.
        staleRead.complete(Unit)
        runCurrent()
        assertTrue("una lectura vieja pisó la reseña", store.myReview(yhlq)!!.spoiler)
        assertEquals(Mark.Liked, store.mark(yhlq))

        // A read that starts after the write is the truth again.
        h.api.titleReviews[yhlq] = listOf(serverReview(store.me.handle, spoiler = true).copy(text = "editada en la web"))
        store.loadTitle(yhlq, force = true)
        assertEquals("editada en la web", store.myReview(yhlq)!!.text)
    }

    @Test fun aTitleReadOlderThanADeleteDoesNotBringTheReviewBack() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.titleReviews[yhlq] = listOf(serverReview(store.me.handle, spoiler = false))
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        store.loadTitle(yhlq)
        assertNotNull(store.myReview(yhlq))

        val staleRead = h.api.hold("title")
        store.launch { store.loadTitle(yhlq, force = true) }
        runCurrent()
        store.deleteReview(yhlq)
        runCurrent()
        assertEquals(1, h.api.callsOf("deleteReview").size)
        staleRead.complete(Unit)
        runCurrent()
        assertNull(store.myReview(yhlq))
    }

    // MARK: 2 · Quitar de tus colecciones

    @Test fun removeFromLibraryWaitsForTheUndoWindowAndUndoPutsEverythingBack() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.setMark(yhlq, Mark.Liked)
        store.publishReview(yhlq, "un disco que no se acaba", spoiler = false)
        runCurrent()
        val prBefore = store.collection(pr)!!.titleIds
        val containing = store.collectionsContaining(yhlq).map { it.id }.toSet()
        assertTrue(pr in containing)

        store.removeFromLibrary(yhlq)
        assertTrue(store.collectionsContaining(yhlq).isEmpty())
        assertNull(store.userTitles[yhlq])
        assertNull(store.myReview(yhlq))
        assertFalse(yhlq in store.libraryIds)
        assertEquals(ToastModel.Kind.Undo, store.toast?.kind)
        assertTrue(store.toast!!.text.startsWith("Quitado de"))

        advanceTimeBy(store.undoWindow.inWholeMilliseconds - 1_000)
        assertTrue(h.api.callsOf("removeFromLibrary").isEmpty())
        store.tapToastAction(store.toast!!)
        assertEquals(prBefore, store.collection(pr)!!.titleIds)
        assertEquals(containing, store.collectionsContaining(yhlq).map { it.id }.toSet())
        assertEquals(Mark.Liked, store.mark(yhlq))
        assertNotNull(store.myReview(yhlq))
        advanceUntilIdle()
        assertTrue("deshacer no hace round-trip", h.api.callsOf("removeFromLibrary").isEmpty())

        store.removeFromLibrary(yhlq)
        advanceTimeBy(store.undoWindow.inWholeMilliseconds + 1)
        runCurrent()
        assertEquals(listOf("removeFromLibrary $yhlq"), h.api.callsOf("removeFromLibrary"))
        assertTrue(h.api.callsOf("removeTitleMembership").isEmpty())
    }

    @Test fun savingItAgainInsideTheWindowSendsTheRemovalFirst() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.removeFromLibrary(yhlq)
        val removalToast = store.toast!!
        store.add(yhlq, recs)
        assertTrue(store.toast != removalToast) // its Deshacer can't be honored any more
        runCurrent()
        val delete = h.api.calls.indexOf("removeFromLibrary $yhlq")
        val put = h.api.calls.indexOf("createTitleMembership $yhlq $recs")
        assertTrue(delete >= 0 && put > delete)
        advanceUntilIdle()
        assertEquals(1, h.api.callsOf("removeFromLibrary").size)
        assertEquals(listOf(recs), store.collectionsContaining(yhlq).map { it.id })
        assertNotNull(store.userTitles[yhlq])
    }

    // MARK: 3 · the store's own scope

    @Test fun launchOutlivesItsCallerAndRoutesFailures() = storeTest { h ->
        val store = h.store
        signedIn(h)
        var ran = false
        store.launch { ran = true }
        store.launch { throw KuraApiError.Offline }
        runCurrent()
        assertTrue(ran)
        assertTrue(store.offline)
    }

    // MARK: 4 · recent searches

    @Test fun forgetOneSearchOrAll() = storeTest { h ->
        val store = h.store
        store.noteSearch("bad bunny")
        store.noteSearch("Severance")
        store.noteSearch("mala")
        store.forgetSearch("SEVERANCE")
        assertEquals(listOf("mala", "bad bunny"), store.recentSearches)
        store.clearRecentSearches()
        assertTrue(store.recentSearches.isEmpty())
    }

    // MARK: 5 · Descubrir por formato, forced

    @Test fun aForcedFormatReloadAsksAgainAndAFailureKeepsTheShelves() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.loadDiscoverFormat(MediaFormat.Film, 1)
        store.loadDiscoverFormat(MediaFormat.Film, 1)
        assertEquals("una vez por sesión", 1, h.api.discoverFormatAnswers)
        val shelves = store.discoverFormats[AppStore.formatKey(MediaFormat.Film, 1)]!!
        assertTrue(shelves.titles.isNotEmpty())

        store.loadDiscoverFormat(MediaFormat.Film, 1, force = true)
        assertEquals(2, h.api.discoverFormatAnswers)

        h.api.failNext("discoverFormat", KuraApiError.Offline)
        store.loadDiscoverFormat(MediaFormat.Film, 1, force = true)
        assertEquals(shelves.titles.size, store.discoverFormats[AppStore.formatKey(MediaFormat.Film, 1)]!!.titles.size)
        assertTrue(store.offline)
    }
}
