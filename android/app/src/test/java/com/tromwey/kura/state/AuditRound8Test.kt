package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Privacy
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round 8 (2026-10-01, two founder decisions): "Borrar también sus títulos" (`DELETE …?purge=1`) and the
 * retry QUEUE — every write that failed for the network is resent when it comes back, not only the one
 * whose notice is still on screen. Asserted by what the person sees and what goes out.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AuditRound8Test {
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // first of "Colección de prueba 4"
    private val c2 = "9c306af3-78e5-4dfb-8c10-4c026eb6dae5" // "Colección de prueba 2", private
    private val pr = "b95d0019-f01f-4b63-b6f9-8bf2e78b7d9f" // "Colección de prueba 4", 10 titles

    private fun TestScope.reconnect(store: AppStore) {
        store.connectivityChanged(false)
        store.connectivityChanged(true)
        advanceUntilIdle()
    }

    /** yhlq with Me gusta and a published review, both on the server; yhlq is ONLY in `pr`. */
    private suspend fun TestScope.reviewed(h: StoreHarness) {
        signedIn(h)
        val store = h.store
        for (c in store.collectionsContaining(yhlq)) if (c.id != pr) store.removeSilently(yhlq, c.id)
        store.setMark(yhlq, Mark.Liked)
        store.publishReview(yhlq, "un disco que no se acaba", spoiler = false)
        advanceUntilIdle()
        assertEquals("srv-review", store.myReview(yhlq)!!.id)
        assertEquals(listOf(pr), store.collectionsContaining(yhlq).map { it.id })
        h.api.calls.clear()
    }

    // MARK: 1 · Borrar colección, con y sin sus títulos

    @Test fun deletingKeepsTheTitlesStateByDefault() = storeTest { h ->
        val store = h.store
        reviewed(h)
        store.deleteCollection(pr)
        advanceUntilIdle()
        assertEquals("sin parámetro", listOf("deleteCollection $pr"), h.api.callsOf("deleteCollection"))
        assertEquals(Mark.Liked, store.mark(yhlq))
        assertNotNull(store.myReview(yhlq))
    }

    @Test fun deletingWithItsTitlesTakesTheStateOfTheOnesOnlyThere() = storeTest { h ->
        val store = h.store
        reviewed(h)
        val shared = store.collection(pr)!!.titleIds.firstOrNull { t -> store.collectionsContaining(t).size > 1 }
        val other = store.collection(pr)!!.titleIds.first { it != yhlq && it != shared }
        store.add(other, c2, toast = false) // in two collections: it is NOT purged
        store.setMark(other, Mark.Obsessed)
        advanceUntilIdle()
        val reviews = store.account!!.stats.reviews

        store.deleteCollection(pr, purge = true)
        assertNull("la marca se va al instante", store.mark(yhlq))
        assertNull(store.userTitles[yhlq])
        assertNull("y la reseña propia", store.myReview(yhlq))
        assertEquals("y su conteo", maxOf(0, reviews - 1), store.account!!.stats.reviews)
        assertEquals("el que está en otra colección conserva todo", Mark.Obsessed, store.mark(other))
        advanceUntilIdle()
        assertEquals(listOf("deleteCollection $pr purge"), h.api.callsOf("deleteCollection"))
        assertNull(store.collection(pr))
    }

    @Test fun aPurgeThatFailsPutsEverythingBackAndRetriesTheSameWay() = storeTest { h ->
        val store = h.store
        reviewed(h)
        val reviews = store.account!!.stats.reviews
        // A failed mark of the title waits in the queue: the purge takes it, the revert brings it back.
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Obsessed)
        runCurrent()
        assertEquals(Mark.Liked, store.mark(yhlq))
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        h.api.failNext("deleteCollection", KuraApiError.Offline)
        store.deleteCollection(pr, purge = true)
        assertNull(store.userTitles[yhlq])
        advanceUntilIdle()
        assertNotNull("la colección vuelve", store.collection(pr))
        assertEquals("con la marca", Mark.Liked, store.mark(yhlq))
        assertEquals("la reseña", "un disco que no se acaba", store.myReview(yhlq)?.text)
        assertEquals("srv-review", store.userTitles[yhlq]!!.reviewId)
        assertEquals("el conteo", reviews, store.account!!.stats.reviews)
        assertEquals("y los dos pendientes en un solo aviso", retryQueueText(2), store.toast?.text)

        store.tapToastAction(store.toast!!)
        advanceUntilIdle()
        assertEquals("el reintento borra igual", listOf("deleteCollection $pr purge", "deleteCollection $pr purge"), h.api.callsOf("deleteCollection"))
        assertNull(store.collection(pr))
        assertNull(store.userTitles[yhlq])
        assertNull(store.toast?.takeIf { it.kind == ToastModel.Kind.Retry })
    }

    @Test fun aPurgeAnswered404CountsAsDone() = storeTest { h ->
        val store = h.store
        reviewed(h)
        h.api.failNext("deleteCollection", KuraApiError.NotFound)
        store.deleteCollection(pr, purge = true)
        advanceUntilIdle()
        assertNull(store.collection(pr))
        assertNull(store.userTitles[yhlq])
        assertNull(store.myReview(yhlq))
        assertNull(store.toast?.takeIf { it.kind == ToastModel.Kind.Retry })
    }

    @Test fun aPurgeDropsTheQueuedWritesOfItsTitles() = storeTest { h ->
        val store = h.store
        reviewed(h)
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Obsessed)
        runCurrent()
        store.deleteCollection(pr, purge = true)
        advanceUntilIdle()
        reconnect(store)
        assertEquals("la marca pendiente no se reenvía sobre un título purgado", 1, h.api.callsOf("setMark").size)
        assertNull(store.userTitles[yhlq])
    }

    // MARK: 2 · La cola de reintentos

    /** Three changes with no network, on three different things: all three land on reconnecting — the
     *  screen went back each time, and ends as the server has it. */
    @Test fun threeChangesWithoutNetworkAllLandOnReconnecting() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        store.connectivityChanged(false)
        h.api.failNext("setMark", KuraApiError.Offline)
        h.api.failNext("setFollowing", KuraApiError.Offline)
        h.api.failNext("updateCollection", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Obsessed)
        runCurrent()
        assertEquals("solo: su propio aviso", ToastModel.Kind.Retry, store.toast?.kind)
        store.toggleFollow("nueva")
        runCurrent()
        assertEquals(retryQueueText(2), store.toast?.text)
        store.editCollection(c2, "otro nombre", "")
        runCurrent()
        // The rename's Deshacer went first; the failure's notice replaced it.
        assertEquals("un solo aviso, que dice cuántos", retryQueueText(3), store.toast?.text)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        // Nothing stays painted while it waits: the screen is the server's.
        assertNull(store.mark(yhlq))
        assertFalse(store.isFollowing("nueva"))
        assertEquals("Colección de prueba 2", store.collection(c2)?.name)

        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(2, h.api.callsOf("setMark").size)
        assertEquals(2, h.api.callsOf("setFollowing").size)
        assertEquals(2, h.api.callsOf("updateCollection").size)
        assertEquals("en el orden en que fallaron", listOf("setMark", "setFollowing", "updateCollection"),
            h.api.calls.takeLast(3).map { it.substringBefore(' ') })
        assertEquals(Mark.Obsessed, store.mark(yhlq))
        assertTrue(store.isFollowing("nueva"))
        assertEquals("otro nombre", store.collection(c2)?.name)
        assertNull(store.toast)
    }

    @Test fun reintentarResendsEverythingQueued() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        h.api.failNext("setMark", KuraApiError.Server("500"))
        h.api.failNext("setFollowing", KuraApiError.Server("500"))
        store.setMark(yhlq, Mark.Liked)
        store.toggleFollow("nueva")
        runCurrent()
        assertEquals(retryQueueText(2), store.toast?.text)
        store.tapToastAction(store.toast!!)
        advanceUntilIdle()
        assertEquals(Mark.Liked, store.mark(yhlq))
        assertTrue(store.isFollowing("nueva"))
        assertNull(store.toast)
    }

    /** Two changes of the SAME thing with no network: one waits (the last asked), one is sent. */
    @Test fun twoChangesOfTheSameThingSendOnlyTheLast() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.connectivityChanged(false)
        h.api.failNext("setMark", KuraApiError.Offline, times = 2)
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        store.setMark(yhlq, Mark.Obsessed)
        runCurrent()
        assertNull(store.mark(yhlq))
        assertEquals("uno solo en la cola: su propio texto", "Sin conexión.", store.toast?.text)

        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(listOf("setMark $yhlq obsessed false"), h.api.callsOf("setMark").drop(2))
        assertEquals(Mark.Obsessed, store.mark(yhlq))
    }

    /** A queued change overtaken by a later write of the same thing that DID land is never resent. */
    @Test fun aQueuedChangeOvertakenByASuccessIsNotResent() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        h.api.failNext("setMark", KuraApiError.Offline)
        h.api.failNext("setFollowing", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Liked)
        store.toggleFollow("nueva")
        runCurrent()
        assertEquals(retryQueueText(2), store.toast?.text)

        store.setMark(yhlq, Mark.Obsessed) // lands
        runCurrent()
        assertEquals("queda solo el follow, con su texto", ToastModel.Kind.Retry, store.toast?.kind)
        assertTrue(store.toast!!.text != retryQueueText(2))
        reconnect(store)
        assertEquals("Me gusta no se reenvía", listOf("setMark $yhlq liked false", "setMark $yhlq obsessed false"), h.api.callsOf("setMark"))
        assertEquals(Mark.Obsessed, store.mark(yhlq))
        assertTrue(store.isFollowing("nueva"))
    }

    @Test fun deletingTheCollectionOrRemovingTheTitleDiscardsTheirQueuedWrites() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("updateCollection", KuraApiError.Offline)
        h.api.failNext("setMark", KuraApiError.Offline)
        store.editCollection(c2, "otro nombre", "")
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        assertEquals(retryQueueText(2), store.toast?.text)

        store.deleteCollection(c2)
        store.removeFromLibrary(yhlq)
        advanceUntilIdle() // the Deshacer window closes: the DELETE of the title goes
        assertNull("nada queda ofrecido", store.toast)
        reconnect(store)
        assertEquals(1, h.api.callsOf("updateCollection").size)
        assertEquals(1, h.api.callsOf("setMark").size)
        assertNull(store.collection(c2))
        assertFalse(yhlq in store.libraryIds)
    }

    /** A definitive answer (403 / 409) is said once and never queued; one that fails definitively on
     *  the resend leaves the queue and nothing painted. */
    @Test fun aDefinitiveFailureIsNotQueuedNorLeftPainted() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        h.api.failNext("setMark", KuraApiError.Forbidden("view_only"))
        store.connectivityChanged(false)
        store.connectivityChanged(true)
        advanceTimeBy(store.retryAfterReconnect.inWholeMilliseconds + 1)
        runCurrent()
        assertEquals(2, h.api.callsOf("setMark").size)
        assertNull("nada pintado", store.mark(yhlq))
        assertEquals("dicho una vez, sin Reintentar", ToastModel.Kind.Info, store.toast?.kind)
        advanceTimeBy(store.undoWindow.inWholeMilliseconds + 1)
        runCurrent()
        assertNull(store.toast)
        reconnect(store)
        assertEquals("no se vuelve a enviar", 2, h.api.callsOf("setMark").size)
    }

    @Test fun theCrossGivesUpEverythingQueued() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        h.api.failNext("setMark", KuraApiError.Offline)
        h.api.failNext("setFollowing", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Liked)
        store.toggleFollow("nueva")
        runCurrent()
        store.closeToast(store.toast!!)
        assertNull(store.toast)
        reconnect(store)
        assertEquals(1, h.api.callsOf("setMark").size)
        assertEquals(1, h.api.callsOf("setFollowing").size)
    }

    @Test fun theQueueEndsWithTheSession() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        store.signOut(global = false)
        runCurrent()
        assertNull(store.toast?.takeIf { it.kind == ToastModel.Kind.Retry })
        reconnect(store)
        assertEquals(1, h.api.callsOf("setMark").size)
    }

    @Test fun theQueueIsCapped() = storeTest { h ->
        signedIn(h)
        val store = h.store
        var ran = 0
        repeat(RETRY_QUEUE_LIMIT + 5) { i -> store.retryToast("No se pudo guardar.", "test|$i") { ran += 1 } }
        assertEquals(retryQueueText(RETRY_QUEUE_LIMIT), store.toast?.text)
        store.tapToastAction(store.toast!!)
        assertEquals(RETRY_QUEUE_LIMIT, ran)
    }
}
