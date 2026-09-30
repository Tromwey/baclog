package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.OnboardingStep
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import kotlin.time.Duration.Companion.seconds

/** The E2E sweep's findings (2026-09-30): launch routing, offline writes, the entrance's 429/403, search caps. */
@OptIn(ExperimentalCoroutinesApi::class)
class SweepFixesTest {
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // in the library, no mark

    // MARK: 1 · an unfinished onboarding survives a killed process

    @Test fun aStoredTokenStillAsksWhoThisIsAndResumesO1b() = storeTest { h ->
        val store = h.store
        h.api.me = h.api.me.copy(handle = null, onboarded = false)
        store.finishSplash()
        assertTrue("GET /me antes de las pestañas", h.api.callsOf("me").isNotEmpty())
        assertEquals(AppPhase.Onboarding, store.phase)
        assertEquals(OnboardingStep.Username, store.onboardingStep)
    }

    @Test fun aFinishedAccountGoesToTheTabs() = storeTest { h ->
        h.store.finishSplash()
        assertEquals(AppPhase.Main, h.store.phase)
    }

    @Test fun anOfflineLaunchRoutesOnceTheLibraryReadAnswers() = storeTest { h ->
        val store = h.store
        h.api.failNext("me", KuraApiError.Offline)
        store.finishSplash()
        assertEquals("sin red: las pestañas (con Reintentar)", AppPhase.Main, store.phase)
        h.api.me = h.api.me.copy(handle = null, onboarded = false)
        store.startIfNeeded()
        runCurrent()
        assertEquals(AppPhase.Onboarding, store.phase)
        assertEquals(OnboardingStep.Username, store.onboardingStep)
    }

    // MARK: 2 · a write that fails offline is reverted, stays offered, and goes again with the network

    @Test fun anOfflineMarkRevertsKeepsItsRetryAndResendsWhenTheNetworkComesBack() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.connectivityChanged(false)
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Liked)
        runCurrent()
        assertNull("la pantalla vuelve a lo que tiene el servidor", store.mark(yhlq))
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        advanceTimeBy(30.seconds)
        runCurrent()
        assertEquals("Reintentar no caduca", ToastModel.Kind.Retry, store.toast?.kind)

        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(2, h.api.callsOf("setMark").size)
        assertEquals(Mark.Liked, store.mark(yhlq))
        assertNull("la escritura pasó: el aviso se va", store.toast)
    }

    @Test fun closingTheRetryKeepsTheRevertAndNothingIsResent() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.connectivityChanged(false)
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, Mark.Obsessed)
        runCurrent()
        store.closeToast(store.toast!!)
        assertNull(store.toast)
        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(1, h.api.callsOf("setMark").size)
        assertNull(store.mark(yhlq))
    }

    @Test fun anOfflineSaveLeavesTheCollectionAndReintentarPutsItBack() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val c = store.collections.first()
        val outside = store.collections.flatMap { it.titleIds }.first { it !in c.titleIds }
        h.api.failNext("createTitleMembership", KuraApiError.Offline)
        store.add(outside, c.id)
        assertTrue(outside in store.collection(c.id)!!.titleIds)
        runCurrent()
        assertFalse("el servidor no lo guardó", outside in store.collection(c.id)!!.titleIds)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        store.tapToastAction(store.toast!!)
        runCurrent()
        assertTrue(outside in store.collection(c.id)!!.titleIds)
        assertEquals(2, h.api.callsOf("createTitleMembership").size)
        assertTrue(store.toast?.kind != ToastModel.Kind.Retry)
    }

    @Test fun anOfflineRemovalComesBackWithItsState() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val c = store.collections.first { it.titleIds.isNotEmpty() }
        val t = c.titleIds.first()
        val state = store.userTitles[t]
        h.api.failNext("removeTitleMembership", KuraApiError.Offline)
        store.removeSilently(t, c.id)
        runCurrent()
        assertTrue(t in store.collection(c.id)!!.titleIds)
        assertEquals(state?.mark, store.userTitles[t]?.mark)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
    }

    @Test fun anOfflineCollectionDeleteBringsItBack() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val c = store.collections.last()
        h.api.failNext("deleteCollection", KuraApiError.Offline)
        store.deleteCollection(c.id)
        assertNull(store.collection(c.id))
        runCurrent()
        assertEquals(c.id, store.collection(c.id)?.id)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
    }

    @Test fun anUndoToastStillCloses() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.undoToast("Nombre cambiado") {}
        advanceTimeBy(6.seconds)
        runCurrent()
        assertNull(store.toast)
    }

    // MARK: 5 · 6 · the entrance

    @Test fun anUnderageAccountComingBackThroughTheCodeSeesTheThirteenScreen() = storeTest { h ->
        val store = h.store
        h.api.hasSession = false
        h.api.failNext("signIn", KuraApiError.Forbidden("underage"))
        assertFalse(store.verifyCode("123456"))
        assertEquals(OnboardingStep.Underage, store.onboardingStep)
        assertNull(store.authError)
    }

    @Test fun aCodeAlreadySentOpensTheCodeScreenWithTheWait() {
        var clock = Instant.parse("2026-09-29T18:00:00Z")
        storeTest(clock = { clock }) { h ->
            val store = h.store
            h.api.hasSession = false
            h.api.failNext("requestCode", KuraApiError.RateLimited(60))
            assertTrue("el código de antes sigue sirviendo", store.requestCode("qa@baclog.dev"))
            assertTrue(store.codeAlreadySent)
            assertEquals("qa@baclog.dev", store.authEmail)
            assertNull(store.authError)
            assertEquals(60, store.codeResendWait())
            clock = clock.plusSeconds(15)
            assertEquals(45, store.codeResendWait())
            // Volver and the same email again: the wait already known is kept, not restarted at 60.
            h.api.failNext("requestCode", KuraApiError.RateLimited(60))
            assertTrue(store.requestCode("qa@baclog.dev"))
            assertEquals(45, store.codeResendWait())
            clock = clock.plusSeconds(45)
            assertEquals(0, store.codeResendWait())
            assertTrue(store.requestCode("qa@baclog.dev"))
            assertFalse(store.codeAlreadySent)
            assertEquals(60, store.codeResendWait())
        }
    }

    // MARK: 3 · Google says "no account" as an instant cancel on some Play services builds

    @Test fun anInstantCancelIsNoAccountAndASlowOneIsTheUserClosingTheSheet() = storeTest { h ->
        val type = "android.credentials.GetCredentialException.TYPE_USER_CANCELED"
        assertEquals("No hay una cuenta de Google en este teléfono.", h.store.googleFailureText(type, null, 90))
        assertNull(h.store.googleFailureText(type, null, 2_400))
        assertNull(h.store.googleFailureText(type, null))
    }

    // MARK: 10 · search caps

    @Test fun aLongSearchIsClippedPerEndpointAndPeopleFailingKeepsTheTitles() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("people", KuraApiError.Invalid(emptyMap(), ""))
        val q = "a".repeat(80)
        store.runSearch(q)
        assertEquals("search ${"a".repeat(80)}", h.api.callsOf("search").single())
        assertTrue(h.api.callsOf("people").last().contains("a".repeat(60) + ")"))
        assertFalse(h.api.callsOf("people").last().contains("a".repeat(61)))
        assertNull(store.searchError)
        assertTrue(store.searchResults.isNotEmpty())
        assertTrue(store.searchPeople.isEmpty())
    }
}
