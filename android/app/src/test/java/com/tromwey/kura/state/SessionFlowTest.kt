package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.OnboardingStep
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.time.Duration.Companion.seconds

/** Launch, per-resource load, sign-in and the way out (a 401). */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionFlowTest {
    private val pinned = "82806df6-4498-4b0f-ac2e-516b22f1b27e"

    @Test fun bootstrapLoadsEveryResourceThenHydratesWhatsMissing() = storeTest { h ->
        val store = h.store
        signedIn(h)
        assertEquals(AppPhase.Main, store.phase)
        assertEquals(LoadState.Loaded, store.loadState)
        // GET /me + /collections + /me/titles + /me/following in parallel, then /titles?ids= for the rest.
        for (name in listOf("me", "collections", "myTitles", "people")) assertTrue("falta $name", h.api.callsOf(name).isNotEmpty())
        val hydrate = h.api.callsOf("titles")
        assertEquals(1, hydrate.size)
        assertTrue(h.api.calls.indexOf(hydrate.single()) > h.api.calls.indexOf("collections"))
        assertEquals("qa_founder", store.me.handle)
        assertEquals(4, store.collections.size)
        assertEquals(46, store.userTitles.size)
        assertEquals(setOf("qa_persona_07", "qa_persona_06", "qa_persona_04", "qa_persona_08", "qa_persona_09", "qa_persona_05"), store.following)
        // Every library title is known (the cards never draw half-empty) and nothing says "incompleto".
        assertTrue(store.libraryIds.all { store.title(it) != null })
        assertFalse(store.libraryIncomplete)
        // The pinned one leads "tus colecciones" and is the preselected "guardar en".
        assertEquals(pinned, store.orderedCollections.first().id)
        assertEquals(pinned, store.lastUsedCollectionId)
        assertTrue(h.platform.welcomeSeen)
    }

    @Test fun offlineLaunchFailsWithRetryAndRecovers() = storeTest { h ->
        val store = h.store
        h.api.failNext("me", KuraApiError.Offline)
        signedIn(h)
        assertEquals(LoadState.Failed, store.loadState)
        assertEquals(KuraApiError.Offline, store.loadError(LoadKey.Library))
        assertTrue(store.offline)
        // The network comes back: the store retries the launch on its own.
        store.connectivityChanged(false)
        store.connectivityChanged(true)
        advanceUntilIdle()
        assertEquals(LoadState.Loaded, store.loadState)
        assertNull(store.loadError(LoadKey.Library))
        assertFalse(store.offline)
    }

    @Test fun titlesThatFailToHydrateSayIncompleteUntilRetried() = storeTest { h ->
        val store = h.store
        h.api.failNext("titles", KuraApiError.Server("500"))
        signedIn(h)
        assertEquals(LoadState.Loaded, store.loadState)
        assertTrue(store.libraryIncomplete)
        assertNotNull(store.loadError(LoadKey.Library))
        store.retryLibraryTitles()
        assertFalse(store.libraryIncomplete)
        assertNull(store.loadError(LoadKey.Library))
    }

    @Test fun codeSignInGoesStraightToTheTabs() = storeTest { h ->
        val store = h.store
        h.api.hasSession = false
        store.finishSplash()
        assertEquals(AppPhase.Onboarding, store.phase)
        assertEquals(OnboardingStep.Welcome, store.onboardingStep)
        assertNotNull("la entrada pregunta qué botones pintar", store.authProviders)

        assertFalse(store.requestCode("no-es-correo"))
        assertEquals("Ese correo no parece válido. Revísalo.", store.authError)
        assertTrue(store.requestCode("  Persona@Correo.COM "))
        assertEquals("persona@correo.com", store.authEmail)
        assertTrue(store.verifyCode(" 123456 "))
        assertTrue(h.api.calls.contains("signIn persona@correo.com 123456"))
        assertEquals(AppPhase.Main, store.phase)
        assertTrue(h.platform.welcomeSeen)
        store.startIfNeeded()
        assertEquals(LoadState.Loaded, store.loadState)
    }

    @Test fun aWrongCodeStaysOnTheEntranceWithItsReason() = storeTest { h ->
        val store = h.store
        h.api.hasSession = false
        store.finishSplash()
        store.requestCode("persona@correo.com")
        h.api.failNext("signIn", KuraApiError.Unauthorized)
        assertFalse(store.verifyCode("000000"))
        assertEquals("El código no coincide o ya caducó.", store.authError)
        assertEquals(AppPhase.Onboarding, store.phase)
        assertNull("un 401 del código no es una sesión que termina", store.toast)
    }

    @Test fun aNewAccountGoesThroughUsernamePicksAndPeople() = storeTest { h ->
        val store = h.store
        h.api.hasSession = false
        h.api.signInMe = h.api.me.copy(handle = null, name = "", onboarded = false)
        store.finishSplash()
        store.requestCode("nuevo@correo.com")
        assertTrue(store.verifyCode("123456"))
        assertEquals(AppPhase.Onboarding, store.phase)
        assertEquals(OnboardingStep.Username, store.onboardingStep)

        assertFalse("sin año no hay cuenta", store.submitUsername("nuevo", "Nuevo", null))
        assertEquals("Falta tu año de nacimiento.", store.authError)
        assertTrue(store.submitUsername("nuevo", "Nuevo", 1995))
        assertEquals(OnboardingStep.Pick, store.onboardingStep)
        advanceUntilIdle()
        assertTrue(store.onboardingGrid.isNotEmpty())

        store.onboardingPicks = store.onboardingGrid.take(3).map { it.id }
        assertTrue(store.submitPicks())
        assertEquals(OnboardingStep.People, store.onboardingStep)
        assertTrue(store.onboardingPeopleLoaded)
        store.onboardingPicks.forEach { assertEquals(com.tromwey.kura.data.models.Mark.Obsessed, store.mark(it)) }
        store.finishOnboarding()
        assertEquals(AppPhase.Main, store.phase)
    }

    @Test fun underageIsItsOwnScreen() = storeTest { h ->
        val store = h.store
        h.api.hasSession = false
        h.api.signInMe = h.api.me.copy(handle = null, name = "", onboarded = false)
        store.finishSplash()
        store.requestCode("nuevo@correo.com")
        store.verifyCode("123456")
        h.api.failNext("completeOnboarding", KuraApiError.Forbidden("underage"))
        assertFalse(store.submitUsername("peque", "Peque", 2016))
        assertEquals(OnboardingStep.Underage, store.onboardingStep)
    }

    @Test fun sessionExpiredGoesBackToTheEntranceAndDropsTheAccount() = storeTest { h ->
        val store = h.store
        signedIn(h)
        assertTrue(store.collections.isNotEmpty())
        // A write of the old account still in flight: its late failure must never surface.
        val parked = h.api.hold("setFollowing")
        h.api.failNext("setFollowing", KuraApiError.Server("500"))
        store.toggleFollow("qa_persona_06")
        runCurrent()

        launch { h.expiries.emit(Unit) }
        runCurrent()
        assertEquals(AppPhase.Onboarding, store.phase)
        assertEquals(OnboardingStep.Signup, store.onboardingStep) // the welcome was already passed here
        assertTrue(store.collections.isEmpty())
        assertTrue(store.userTitles.isEmpty())
        assertTrue(store.following.isEmpty())
        assertEquals("Tu sesión terminó. Entra de nuevo.", store.toast?.text)
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)

        parked.complete(Unit)
        runCurrent()
        assertEquals("Tu sesión terminó. Entra de nuevo.", store.toast?.text)
        assertTrue(store.following.isEmpty())
        // The toast goes by itself after the window.
        testScheduler.advanceTimeBy(store.undoWindow.inWholeMilliseconds + 1)
        runCurrent()
        assertNull(store.toast)
    }

    @Test fun signOutWaitsForTheServerAndSaysSoWhenItDidNotConfirm() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("logout", KuraApiError.Offline)
        store.signOut()
        assertTrue(store.signingOut)
        advanceUntilIdle()
        assertFalse(store.signingOut)
        assertEquals(AppPhase.Onboarding, store.phase)
        assertTrue(store.collections.isEmpty())
        assertTrue(h.api.calls.contains("logout"))
    }

    @Test fun theUndoWindowIsLongerWithTalkBack() = storeTest(platform = object : InMemoryStorePlatform() {
        override val screenReaderOn = true
    }) { h ->
        assertEquals(15.seconds, h.store.undoWindow)
    }
}
