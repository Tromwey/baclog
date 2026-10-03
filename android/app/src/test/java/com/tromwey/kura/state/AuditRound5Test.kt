package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.PartyExportFlow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The fixes of the fifth (last) audit cycle (2026-10-01). Everything here is asserted by what the person
 * sees (the notice on screen) and what goes out (a request resent or not) — never by the store's
 * internal keys.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AuditRound5Test {
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // in the library, no mark
    private val c2 = "9c306af3-78e5-4dfb-8c10-4c026eb6dae5" // "Colección de prueba 2", private

    /** The network went and came back: whatever is still queued is resent. */
    private fun TestScope.reconnect(store: AppStore) {
        store.connectivityChanged(false)
        store.connectivityChanged(true)
        advanceUntilIdle()
    }

    private fun homonym(privacy: Privacy, createdAt: java.time.Instant = FIXED_NOW) =
        KCollection(id = "srv-other", name = "lista nueva", titleIds = emptyList(), privacy = privacy, createdAt = createdAt)

    // MARK: 1 · Crear colección: adopting never publishes, and only a lost answer adopts

    /** Offline, plain (the POST never left): a same-name PRIVATE collection made meanwhile on another
     *  device is not "that POST's" — the retry creates the one asked, and touches nothing of the other. */
    @Test fun aPlainOfflineCreateNeverAdoptsAHomonym() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("createCollection", KuraApiError.Offline)
        store.createCollection("lista nueva", Privacy.PublicAccess)
        runCurrent()
        h.api.collections = h.api.collections + homonym(Privacy.OnlyMe)
        val reads = h.api.callsOf("collections").size

        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals("se crea la suya", 2, h.api.callsOf("createCollection").size)
        assertEquals("sin leer la biblioteca para adoptar", reads, h.api.callsOf("collections").size)
        assertTrue(h.api.callsOf("updateCollection").isEmpty())
    }

    /** A timeout, and a homonym created well after the attempt failed: not inside its window. */
    @Test fun aHomonymCreatedLongAfterTheFailureIsNotAdopted() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.lastOfflineTimedOut = true
        h.api.failNext("createCollection", KuraApiError.Offline)
        store.createCollection("lista nueva", Privacy.PublicAccess)
        runCurrent()
        h.api.collections = h.api.collections + homonym(Privacy.OnlyMe, FIXED_NOW.plusSeconds(600))

        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals(2, h.api.callsOf("createCollection").size)
        assertTrue(h.api.callsOf("updateCollection").isEmpty())
    }

    // MARK: 2 · A definitive answer to "crear colección" is said once, never retried

    @Test fun aRejectedCreateSaysWhyAndIsNotResent() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("createCollection", KuraApiError.Invalid(emptyMap(), "Ya tienes demasiadas colecciones."))
        store.createCollection("lista nueva", Privacy.OnlyMe)
        runCurrent()
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)
        assertEquals("Ya tienes demasiadas colecciones.", store.toast?.text)
        assertTrue(store.collections.none { it.name == "lista nueva" })

        reconnect(store)
        assertEquals("ni GET ni POST al reconectar", 1, h.api.callsOf("createCollection").size)
    }

    @Test fun aRateLimitedCreateIsNotResentEither() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("createCollection", KuraApiError.RateLimited(30))
        store.createCollection("lista nueva", Privacy.OnlyMe)
        runCurrent()
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)
        reconnect(store)
        assertEquals(1, h.api.callsOf("createCollection").size)
    }

    @Test fun aCreateRefusedForOnboardingGoesToItsOneHandler() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.me = h.api.me.copy(onboarded = false)
        h.api.failNext("createCollection", KuraApiError.Forbidden("onboarding_required"))
        store.createCollection("lista nueva", Privacy.OnlyMe)
        runCurrent()
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)
        assertEquals(ONBOARDING_REQUIRED_NOTE, store.toast?.text)
        assertEquals(AppPhase.Onboarding, store.phase)
        assertEquals(1, h.api.callsOf("createCollection").size)
    }

    @Test fun aCreateThatFailedOn5xxStillOffersReintentar() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("createCollection", KuraApiError.Server("500"))
        store.createCollection("lista nueva", Privacy.OnlyMe)
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals(2, h.api.callsOf("createCollection").size)
        assertEquals(1, store.collections.count { it.name == "lista nueva" })
    }

    // MARK: 3 · The Reintentar parked under a Deshacer (`restoreParkedRetry`)

    /** A rename fails (Reintentar) and a privacy change covers it with its Deshacer. */
    private fun TestScope.parkARenameRetry(h: StoreHarness): ToastModel {
        val store = h.store
        h.api.failNext("updateCollection", KuraApiError.Server("500"))
        store.editCollection(c2, "otro nombre", "")
        runCurrent()
        val retry = store.toast!!
        assertEquals(ToastModel.Kind.Retry, retry.kind)
        store.setPrivacy(c2, Privacy.Link)
        runCurrent()
        assertEquals(ToastModel.Kind.Undo, store.toast?.kind)
        return retry
    }

    private fun TestScope.closeTheWindow(store: AppStore) {
        advanceTimeBy(store.undoWindow.inWholeMilliseconds + 1)
        runCurrent()
    }

    /** Round 8 (founder): whatever covers it (a Deshacer, then an Info), the write stays queued: its
     *  Reintentar is back when they leave, and the reconnection resends it. */
    @Test fun anInfoOverTheDeshacerDoesNotTakeTheQueuedRetry() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val retry = parkARenameRetry(h)

        store.showToast(ToastModel("Link copiado", ToastModel.Kind.Info))
        closeTheWindow(store)
        assertEquals("vuelve", retry.id, store.toast?.id)
        reconnect(store)
        assertEquals(
            "y se reenvía",
            listOf("updateCollection $c2 otro nombre null null", "updateCollection $c2 null null Link", "updateCollection $c2 otro nombre null null"),
            h.api.callsOf("updateCollection"),
        )
        assertEquals("otro nombre", store.collection(c2)?.name)
        assertNull(store.toast)
    }

    @Test fun aParkedRetryDoesNotComeBackOnceANewerWriteReplacedIt() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val retry = parkARenameRetry(h)

        store.editCollection(c2, "el bueno", "") // a newer name: the old one must never be offered again
        runCurrent()
        closeTheWindow(store)
        assertNotEquals(retry.id, store.toast?.id)
        assertNull(store.toast)
        assertEquals("el bueno", store.collection(c2)?.name)
        reconnect(store)
        assertEquals("el nombre viejo no se reenvía", 1, h.api.callsOf("updateCollection").count { it.contains("otro nombre") })
    }

    @Test fun aParkedRetryDoesNotComeBackForACollectionThatIsGone() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val retry = parkARenameRetry(h)

        // Deleted from another device: the next read of it answers 404 and it leaves the screen.
        h.api.collections = h.api.collections.filter { it.id != c2 }
        store.loadCollection(c2, force = true)
        assertNull(store.collection(c2))
        closeTheWindow(store)
        assertNotEquals(retry.id, store.toast?.id)
        reconnect(store)
        assertEquals(1, h.api.callsOf("updateCollection").count { it.contains("otro nombre") })
    }

    @Test fun aParkedRetryDoesNotComeBackInAnotherSession() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val retry = parkARenameRetry(h)

        store.signOut(global = false)
        runCurrent()
        assertEquals(AppPhase.Onboarding, store.phase)
        closeTheWindow(store)
        assertNotEquals(retry.id, store.toast?.id)
        assertNull(store.toast?.takeIf { it.kind == ToastModel.Kind.Retry })
        // Nor does the stale pill do anything if it is still on screen for a frame.
        store.tapToastAction(retry)
        runCurrent()
        assertEquals(1, h.api.callsOf("updateCollection").count { it.contains("otro nombre") })
    }

    @Test fun aParkedRetryStillComesBackWhenNothingReplacedIt() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val retry = parkARenameRetry(h)
        closeTheWindow(store)
        assertEquals(retry.id, store.toast?.id)
    }

    // MARK: 4 · Borrar una colección takes the failed saves in it along

    @Test fun deletingACollectionDropsTheFailedSaveInItWithoutReadingItAgain() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.lastOfflineTimedOut = true // a timeout: its Reintentar would read the collection again if closed
        h.api.failNext("createTitleMembership", KuraApiError.Offline)
        store.add("t-nuevo", c2)
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        val reads = h.api.callsOf("collection").size

        store.deleteCollection(c2)
        advanceUntilIdle()
        assertNull(store.collection(c2))
        assertEquals("no se relee una colección borrada", reads, h.api.callsOf("collection").size)
        reconnect(store)
        assertEquals("ni se reenvía el guardado", 1, h.api.callsOf("createTitleMembership").size)
        assertNull("no vuelve a pantalla", store.collection(c2))
    }

    // MARK: 5 · A read that was out while a write went and came back

    @Test fun aCollectionReadDoesNotUndoARenameResolvedWhileItWasOut() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val gate = h.api.hold("collection")
        val read = launch { store.loadCollection(c2, force = true) }
        runCurrent()

        store.editCollection(c2, "nombre nuevo", "") // issued AND answered while the GET is out
        runCurrent()
        assertEquals(1, h.api.callsOf("updateCollection").size)

        gate.complete(Unit) // the answer is from before the rename
        runCurrent()
        read.join()
        assertEquals("nombre nuevo", store.collection(c2)?.name)
    }

    @Test fun aTimedOutCompletarReadsTheTitleAgain() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.lastOfflineTimedOut = true
        h.api.failNext("setMark", KuraApiError.Offline)
        // The write DID land: only its answer timed out.
        h.api.myTitles = h.api.myTitles + (yhlq to (h.api.myTitles[yhlq]!!.copy(mark = Mark.Liked)))
        val reads = h.api.callsOf("title").size

        assertEquals(KuraApiError.Offline, store.setMarkConfirmed(yhlq, Mark.Liked, preview = false))
        advanceUntilIdle()
        assertEquals(reads + 1, h.api.callsOf("title").size)
        assertEquals("la pantalla toma lo que el servidor tiene", Mark.Liked, store.mark(yhlq))
        assertEquals(1, h.api.callsOf("setMark").size)
    }

    @Test fun aCompletarThatFailedOfflineReadsNothing() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("setMark", KuraApiError.Offline)
        val reads = h.api.callsOf("title").size
        assertEquals(KuraApiError.Offline, store.setMarkConfirmed(yhlq, Mark.Liked, preview = false))
        advanceUntilIdle()
        assertEquals(reads, h.api.callsOf("title").size)
        assertNull(store.mark(yhlq))
    }

    // MARK: 6 · TIDAL: a step that passes nothing

    @Test fun aStepWithoutProgressWaitsBeforeAskingAgain() = partyTest { h ->
        // "in progress", not busy, and nothing passed — twice — then it moves and finishes.
        h.api.exportSteps.add(h.api.export(ExportState.Status.InProgress, 0))
        h.api.exportSteps.add(h.api.export(ExportState.Status.InProgress, 0))
        h.api.exportSteps.add(h.api.export(ExportState.Status.InProgress, 1))
        h.api.exportSteps.add(h.api.export(ExportState.Status.Done, 2))
        signedIn(h)
        h.store.loadParty(h.api.party.id)
        h.store.loadMusicServices()
        val t0 = testScheduler.currentTime
        h.store.startPartyExport(h.api.party.id, MusicProvider.Tidal)
        runCurrent()
        assertEquals("el segundo step espera su segundo", 1, h.api.callsOf("stepTidalExport").size)
        advanceUntilIdle()
        assertEquals(PartyExportFlow.Step.Done, h.store.partyExport!!.step)
        assertEquals(4, h.api.callsOf("stepTidalExport").size)
        assertTrue("una pausa por cada step sin avance", testScheduler.currentTime - t0 >= 2_000)
    }

    @Test fun anExportThatStopsMovingFailsRetryableAfterTheStallCap() = partyTest { h ->
        h.api.exportSteps.add(h.api.export(ExportState.Status.InProgress, 0)) // forever, nothing passes
        signedIn(h)
        h.store.loadParty(h.api.party.id)
        h.store.loadMusicServices()
        val t0 = testScheduler.currentTime
        h.store.startPartyExport(h.api.party.id, MusicProvider.Tidal)
        advanceUntilIdle()
        val flow = h.store.partyExport!!
        assertEquals(PartyExportFlow.Step.Failed, flow.step)
        assertEquals(TIDAL_UNFINISHED, flow.failure)
        assertEquals(TIDAL_MAX_STALLED, h.api.callsOf("stepTidalExport").size)
        assertTrue("nunca un bucle sin pausa", testScheduler.currentTime - t0 >= (TIDAL_MAX_STALLED - 1) * 1_000L)
    }

    // MARK: 7 · The code screen: locked, and a 401 after coming back from Main

    @Test fun aLockedCodeSaysToAskForAnotherOne() = storeTest { h ->
        val store = h.store
        h.api.failNext("signIn", KuraApiError.CodeLocked)
        assertFalse(store.verifyCode("123456"))
        assertEquals("Se intentó demasiadas veces. Pide otro código más tarde.", store.authError)

        h.api.failNext("signIn", KuraApiError.Unauthorized)
        assertFalse(store.verifyCode("123456"))
        assertEquals("sin `reason`, como siempre", "El código es incorrecto o ya venció. Revísalo o pide otro.", store.authError)
    }

    /** Main → `onboarding_required` sends the account back to O1b → Volver → the entrance. A wrong
     *  code there is a wrong code, never "Tu sesión terminó". */
    @Test fun aWrongCodeAfterBeingSentBackToOnboardingIsNotAnExpiredSession() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        h.api.me = h.api.me.copy(onboarded = false)
        h.api.failNext("setFollowing", KuraApiError.Forbidden("onboarding_required"))
        store.toggleFollow("nueva")
        runCurrent()
        assertEquals(AppPhase.Onboarding, store.phase)
        assertEquals(OnboardingStep.Username, store.onboardingStep)

        store.signOut(global = false) // Volver on O1b
        runCurrent()
        closeTheWindow(store)
        h.api.failNext("signIn", KuraApiError.Unauthorized)
        assertFalse(store.verifyCode("123456"))
        assertEquals("El código es incorrecto o ya venció. Revísalo o pide otro.", store.authError)
        assertNull("ni un aviso de sesión terminada", store.toast)
    }
}
