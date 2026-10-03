package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.WireException
import com.tromwey.kura.data.models.safeReason
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.serialization.builtins.serializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The fixes of the fourth audit cycle (2026-10-01), as the traces that found them: a "crear colección"
 * retried after a library read, a 401 in the middle of a write, a Reintentar that another field's
 * write withdrew, the old value offered again under a newer write, and a timeout closed unretried.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AuditRound4Test {
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // in the library, no mark
    private val c2 = "9c306af3-78e5-4dfb-8c10-4c026eb6dae5" // "Colección de prueba 2", private

    // MARK: 1 · Crear colección: the retry after a library read

    /** The lost POST's collection came in with ANOTHER privacy than the one chosen (it can't, today —
     *  but a same-name one made elsewhere can, e.g. Private on purpose from another device): adopted
     *  exactly as the server has it, said with a notice, and NEVER patched to the phone's choice
     *  (ronda 5: adopting must not publish a collection). */
    @Test fun anAdoptedCollectionKeepsTheServersPrivacy() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.lastOfflineTimedOut = true
        h.api.failNext("createCollection", KuraApiError.Offline)
        store.createCollection("lista nueva", Privacy.PublicAccess)
        runCurrent()
        h.api.collections = h.api.collections +
            KCollection(id = "srv-landed", name = "lista nueva", titleIds = emptyList(), privacy = Privacy.OnlyMe, createdAt = FIXED_NOW)
        store.refreshLibrary()

        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals(1, h.api.callsOf("createCollection").size)
        assertEquals("sigue privada", Privacy.OnlyMe, store.collection("srv-landed")?.privacy)
        assertTrue("ni un PATCH", h.api.callsOf("updateCollection").isEmpty())
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)
        assertEquals(ADOPTED_AS_IS_NOTE, store.toast?.text)
    }

    /** A same-name collection the phone ALREADY had when the POST went out is not "that POST's". */
    @Test fun aHomonymThatWasAlreadyThereIsNotAdopted() = storeTest { h ->
        h.api.collections = h.api.collections +
            KCollection(id = "srv-old", name = "lista nueva", titleIds = emptyList(), privacy = Privacy.OnlyMe, createdAt = FIXED_NOW)
        signedIn(h)
        val store = h.store
        h.api.lastOfflineTimedOut = true
        h.api.failNext("createCollection", KuraApiError.Offline)
        store.createCollection("lista nueva", Privacy.OnlyMe)
        runCurrent()
        store.refreshLibrary()
        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals("la suya no existía: se crea", 2, h.api.callsOf("createCollection").size)
        assertEquals(2, store.collections.count { it.name == "lista nueva" })
    }

    // MARK: 2 · A 401 in the middle of a write never touches the next session

    @Test fun anUnfollowThatGets401DoesNotPutThePersonInTheNextSession() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        store.toggleFollow("nueva")
        runCurrent()
        assertTrue(store.isFollowing("nueva"))
        val old = store.s

        h.api.failNext("setFollowing", KuraApiError.Unauthorized)
        store.toggleFollow("nueva")
        runCurrent()
        assertTrue("la sesión se reemplazó", store.s !== old)
        assertEquals(AppPhase.Onboarding, store.phase)
        assertFalse("el revert no cae en la sesión nueva", store.isFollowing("nueva"))
        assertEquals("ni un Reintentar en la sesión nueva", ToastModel.Kind.Info, store.toast?.kind)
    }

    // MARK: 3 · One Reintentar per field of a collection

    /** A rename fails (its Reintentar waits) → the privacy is changed. The rename's Reintentar is
     *  still pending, comes back when the privacy's Deshacer leaves, and resends the name. */
    @Test fun aPrivacyChangeDoesNotWithdrawTheRetryOfAFailedRename() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("updateCollection", KuraApiError.Server("500"))
        store.editCollection(c2, "otro nombre", "")
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        assertEquals("Colección de prueba 2", store.collection(c2)?.name)
        val retry = store.toast!!

        store.setPrivacy(c2, Privacy.Link)
        runCurrent()
        assertEquals(ToastModel.Kind.Undo, store.toast?.kind)

        advanceTimeBy(store.undoWindow.inWholeMilliseconds + 1)
        runCurrent()
        assertEquals("el Reintentar vuelve", retry.id, store.toast?.id)
        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals("otro nombre", store.collection(c2)?.name)
        assertEquals(Privacy.Link, store.collection(c2)?.privacy)
        assertEquals(
            listOf("updateCollection $c2 otro nombre null null", "updateCollection $c2 null null Link", "updateCollection $c2 otro nombre null null"),
            h.api.callsOf("updateCollection"),
        )
    }

    /** A new write of the SAME field does retire it (it would be resent over the newer name). */
    @Test fun aNewRenameRetiresTheRetryOfTheOlderOne() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("updateCollection", KuraApiError.Server("500"))
        store.editCollection(c2, "otro nombre", "")
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        store.editCollection(c2, "el bueno", "")
        runCurrent()
        assertEquals("el Reintentar del nombre viejo se va", ToastModel.Kind.Undo, store.toast?.kind)
        // Nor is it resent when the network comes back.
        store.connectivityChanged(false)
        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(2, h.api.callsOf("updateCollection").size)
        assertEquals("el bueno", store.collection(c2)?.name)
    }

    // MARK: 4 · With a newer write queued, the old value is not offered again

    @Test fun aFailedMarkUnderANewerOneOffersNoRetry() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("setMark", KuraApiError.Server("500"))
        val first = h.api.hold("setMark")
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        val second = h.api.hold("setMark")
        store.setMark(yhlq, Mark.Obsessed)
        first.complete(Unit)
        runCurrent()
        assertEquals(2, h.api.callsOf("setMark").size)
        assertNull("nada que reintentar del valor viejo", store.toast?.takeIf { it.kind == ToastModel.Kind.Retry })
        assertEquals(Mark.Obsessed, store.mark(yhlq))

        second.complete(Unit)
        advanceUntilIdle()
        assertEquals(Mark.Obsessed, store.mark(yhlq))
        assertEquals(2, h.api.callsOf("setMark").size)
    }

    @Test fun aFailedRenameUnderANewerOneOffersNoRetry() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("updateCollection", KuraApiError.Server("500"))
        val first = h.api.hold("updateCollection")
        store.editCollection(c2, "uno", "")
        runCurrent()
        val second = h.api.hold("updateCollection")
        store.editCollection(c2, "dos", "")
        first.complete(Unit)
        runCurrent()
        assertNull("el nombre nuevo decide", store.toast?.takeIf { it.kind == ToastModel.Kind.Retry })
        assertEquals("dos", store.collection(c2)?.name)
        second.complete(Unit)
        advanceUntilIdle()
        assertEquals("dos", store.collection(c2)?.name)
        assertEquals(2, h.api.callsOf("updateCollection").size)
    }

    // MARK: 5 · A timeout closed without retrying reads the thing again

    @Test fun closingTheRetryOfATimedOutMarkReadsTheTitleAgain() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.lastOfflineTimedOut = true
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        assertNull("revertido a lo confirmado", store.mark(yhlq))
        // The write DID land: only its answer timed out.
        h.api.myTitles = h.api.myTitles + (yhlq to (h.api.myTitles[yhlq]!!.copy(mark = Mark.Liked)))
        val reads = h.api.callsOf("title").size

        store.closeToast(store.toast!!)
        advanceUntilIdle()
        assertEquals(reads + 1, h.api.callsOf("title").size)
        assertEquals("la pantalla toma lo que el servidor tiene", Mark.Liked, store.mark(yhlq))
        assertEquals("y no se reenvía", 1, h.api.callsOf("setMark").size)
    }

    @Test fun closingTheRetryOfAPlainOfflineFailureReadsNothing() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        val reads = h.api.callsOf("title").size
        store.closeToast(store.toast!!)
        advanceUntilIdle()
        assertEquals(reads, h.api.callsOf("title").size)
    }

    // MARK: 6 · Logs never quote kotlinx's message

    @Test fun aDecodingLogSaysOnlyOurOwnWords() {
        val theirs = runCatching { KuraJson.json.decodeFromString(Int.serializer(), "\"qa.person@example.invalid\"") }.exceptionOrNull()
        assertNotNull(theirs)
        assertFalse(safeReason(theirs!!).contains("example.invalid"))
        assertEquals("Falta la llave `id`", safeReason(WireException("Falta la llave `id`")))
    }

    // MARK: 7 · Descubrir por formato: `titlesUnavailable`

    @Test fun aShelfThatFailedKeepsItsKuradasAndAsksAgain() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val key = AppStore.formatKey(MediaFormat.Film, 1)
        h.api.discoverFormatUnavailable = true
        store.loadDiscoverFormat(MediaFormat.Film, 1)
        val first = store.discoverFormats[key]!!
        assertTrue(first.titlesUnavailable)
        assertTrue(first.titles.isEmpty())
        assertTrue("las Kuradas sí se pintan", first.kuradas.isNotEmpty())

        // Not cached as an empty shelf: the next visit asks again, without `force`.
        h.api.discoverFormatUnavailable = false
        store.loadDiscoverFormat(MediaFormat.Film, 1)
        assertEquals(2, h.api.discoverFormatAnswers)
        val second = store.discoverFormats[key]!!
        assertFalse(second.titlesUnavailable)
        assertTrue(second.titles.isNotEmpty())

        // A forced reload whose shelf fails keeps the shelves it had.
        h.api.discoverFormatUnavailable = true
        store.loadDiscoverFormat(MediaFormat.Film, 1, force = true)
        assertEquals(second.titles, store.discoverFormats[key]!!.titles)
        assertFalse(store.discoverFormats[key]!!.titlesUnavailable)
    }
}
