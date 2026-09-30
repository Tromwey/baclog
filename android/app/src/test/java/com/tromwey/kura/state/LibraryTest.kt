package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Privacy
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

/** Membership writes, the deferred removal behind Deshacer, and collection edits that fail. */
@OptIn(ExperimentalCoroutinesApi::class)
class LibraryTest {
    private val recs = "9c306af3-78e5-4dfb-8c10-4c026eb6dae5" // "Colección de prueba 2", 1 title
    private val pr = "b95d0019-f01f-4b63-b6f9-8bf2e78b7d9f" // "Colección de prueba 4", 10 titles
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // first of PR
    private val fresh = "titulo-nuevo" // in no collection, no state

    private fun AppStore.tapToast() {
        val t = assertNotNull(toast).let { toast!! }
        tapToastAction(t)
    }

    @Test fun addThenUndoPutsEverythingBackAndTheServerSeesBothInOrder() = storeTest { h ->
        val store = h.store
        signedIn(h)
        // The PUT is still on the wire when the user taps Deshacer.
        val parked = h.api.hold("createTitleMembership")
        store.add(fresh, recs)
        assertEquals(fresh, store.collection(recs)!!.titleIds.first())
        assertNotNull("guardar crea tu estado", store.userTitles[fresh])
        assertEquals("Agregado a Colección de prueba 2", store.toast?.text)
        assertEquals(ToastModel.Kind.Undo, store.toast?.kind)
        runCurrent()

        store.tapToast()
        assertFalse(fresh in store.collection(recs)!!.titleIds)
        assertNull("un título nuevo que no quedó en ninguna colección pierde su estado", store.userTitles[fresh])
        assertNull(store.toast)

        parked.complete(Unit)
        advanceUntilIdle()
        val put = h.api.calls.indexOf("createTitleMembership $fresh $recs")
        val delete = h.api.calls.indexOf("removeTitleMembership $fresh $recs")
        assertTrue(put >= 0 && delete > put) // same WriteKey: the DELETE waits for the PUT
        assertFalse(fresh in store.collection(recs)!!.titleIds)
    }

    @Test fun removeWaitsForTheUndoWindowAndUndoNeverTouchesTheServer() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val before = store.collection(pr)!!.titleIds
        store.remove(yhlq, pr)
        assertFalse(yhlq in store.collection(pr)!!.titleIds)
        assertEquals(listOf(yhlq), store.pendingRemovals(pr))
        assertEquals("Quitado de Colección de prueba 4", store.toast?.text)

        advanceTimeBy(store.undoWindow.inWholeMilliseconds - 1_000)
        assertTrue(h.api.callsOf("removeTitleMembership").isEmpty())
        store.tapToast()
        assertEquals(before, store.collection(pr)!!.titleIds) // back in the same place
        advanceUntilIdle()
        assertTrue("deshacer un quitar no hace round-trip", h.api.callsOf("removeTitleMembership").isEmpty())
        assertTrue(store.pendingRemovals(pr).isEmpty())

        // Without Deshacer the DELETE goes when the window closes.
        store.remove(yhlq, pr)
        advanceTimeBy(store.undoWindow.inWholeMilliseconds + 1)
        runCurrent()
        assertEquals(listOf("removeTitleMembership $yhlq $pr"), h.api.callsOf("removeTitleMembership"))
        assertTrue(store.pendingRemovals(pr).isEmpty())
    }

    @Test fun moveThenUndo() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val fromBefore = store.collection(pr)!!.titleIds
        store.move(yhlq, pr, recs)
        assertFalse(yhlq in store.collection(pr)!!.titleIds)
        assertEquals(yhlq, store.collection(recs)!!.titleIds.first())
        assertEquals(recs, store.lastUsedCollectionId)
        assertEquals("Movido a Colección de prueba 2", store.toast?.text)
        runCurrent()
        store.tapToast()
        assertEquals(fromBefore, store.collection(pr)!!.titleIds)
        assertFalse(yhlq in store.collection(recs)!!.titleIds)
        advanceUntilIdle()
        assertEquals(listOf("createTitleMembership $yhlq $recs"), h.api.callsOf("createTitleMembership"))
        // The add to `recs` is undone on the server; the removal from `pr` never left the phone.
        assertEquals(listOf("removeTitleMembership $yhlq $recs"), h.api.callsOf("removeTitleMembership"))
    }

    @Test fun deletingACollectionDropsItsPendingRemovals() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.remove(yhlq, pr)
        store.deleteCollection(pr)
        assertNull(store.collection(pr))
        assertEquals("Colección borrada", store.toast?.text)
        advanceUntilIdle()
        assertEquals(listOf("deleteCollection $pr"), h.api.callsOf("deleteCollection"))
        assertTrue(h.api.callsOf("removeTitleMembership").isEmpty())
    }

    @Test fun anOptimisticCollectionAdoptsTheServerIdAndItsFirstTitleFollows() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val local = store.createCollection("  Para El Finde  ", Privacy.OnlyMe, adding = fresh)
        assertTrue(local.startsWith("c-"))
        assertEquals("para el finde", store.collection(local)!!.name)
        assertEquals(listOf(fresh), store.collection(local)!!.titleIds)
        runCurrent()
        assertEquals("srv-1", store.canonicalCollectionId(local))
        assertNotNull("el id local sigue encontrándola", store.collection(local))
        assertEquals("srv-1", store.collection(local)!!.id)
        assertEquals("srv-1", store.lastUsedCollectionId)
        // POST first, then the membership against the SERVER id.
        assertTrue(h.api.calls.indexOf("createCollection para el finde OnlyMe") < h.api.calls.indexOf("createTitleMembership $fresh srv-1"))
    }

    @Test fun aCollectionThatFailsToCreateGoesAwayWithRetry() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("createCollection", KuraApiError.Server("500"))
        val local = store.createCollection("rota", Privacy.OnlyMe, adding = fresh)
        runCurrent()
        assertNull(store.collection(local))
        assertNull(store.userTitles[fresh])
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        store.tapToast()
        runCurrent()
        assertNotNull(store.collections.firstOrNull { it.name == "rota" && it.id == "srv-1" })
    }

    @Test fun aFailedRenameGoesBackAndRetryReappliesIt() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("updateCollection", KuraApiError.Server("503"))
        store.editCollection(recs, "Me Lo Dijeron", "")
        assertEquals("me lo dijeron", store.collection(recs)!!.name) // optimistic
        runCurrent()
        // The server kept the old name: so does the phone, and it says so with Reintentar.
        assertEquals("Colección de prueba 2", store.collection(recs)!!.name)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        assertEquals("No se guardaron los cambios de la colección.", store.toast?.text)
        store.tapToast()
        assertEquals("me lo dijeron", store.collection(recs)!!.name)
        runCurrent()
        assertEquals("me lo dijeron", store.collection(recs)!!.name)
        assertEquals(2, h.api.callsOf("updateCollection").size)
    }

    @Test fun aRejectedPrivacySaysWhyWithoutRetry() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("updateCollection", KuraApiError.Invalid(emptyMap(), "Esa visibilidad no existe."))
        store.setPrivacy(recs, Privacy.PublicAccess)
        assertEquals(Privacy.PublicAccess, store.collection(recs)!!.privacy)
        runCurrent()
        assertEquals(Privacy.OnlyMe, store.collection(recs)!!.privacy)
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)
        assertEquals("Esa visibilidad no existe.", store.toast?.text)
    }

    @Test fun pinningMovesThePinAndUndoPutsItBack() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val pinned = store.collections.single { it.pinned }.id
        store.togglePin(recs)
        assertEquals(listOf(recs), store.collections.filter { it.pinned }.map { it.id })
        assertEquals(recs, store.orderedCollections.first().id)
        store.tapToast()
        assertEquals(listOf(pinned), store.collections.filter { it.pinned }.map { it.id })
        runCurrent()
        assertEquals(listOf("setCollectionPinned $recs true", "setCollectionPinned $pinned true"), h.api.callsOf("setCollectionPinned"))
    }

    @Test fun saveToSetsTheExactMembershipAndUndoRestoresIt() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.setMembership(fresh, setOf(recs, pr))
        assertEquals(setOf(recs, pr), store.collectionsContaining(fresh).map { it.id }.toSet())
        assertEquals("Guardado en 2 colecciones", store.toast?.text)
        store.tapToast()
        assertTrue(store.collectionsContaining(fresh).isEmpty())
        assertNull(store.userTitles[fresh])
    }
}
