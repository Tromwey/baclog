package com.tromwey.kura.state

import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.KuraApi
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.PeopleKind
import com.tromwey.kura.data.models.PeoplePage
import com.tromwey.kura.data.models.Title
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.PrintStream

/** Regressions of the state review (code, silent failures, security): one test per fix. */
@OptIn(ExperimentalCoroutinesApi::class)
class StateFixesTest {
    private val recs = "9c306af3-78e5-4dfb-8c10-4c026eb6dae5" // "Colección de prueba 2", 1 title
    private val pr = "b95d0019-f01f-4b63-b6f9-8bf2e78b7d9f" // "Colección de prueba 4", 10 titles
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // first of PR, no mark on the server
    private val fresh = "titulo-nuevo"

    private inline fun stderr(block: () -> Unit): String {
        val old = System.err
        val buf = ByteArrayOutputStream()
        System.setErr(PrintStream(buf, true))
        try {
            block()
        } finally {
            System.setErr(old)
        }
        return buf.toString()
    }

    // B
    @Test fun anUnmappedErrorIsLoggedAsABug() = storeTest { h ->
        val out = stderr { h.store.noteError(IllegalStateException("boom")) }
        assertTrue(out, out.contains("bug no mapeado"))
        val quiet = stderr { h.store.noteError(KuraApiError.Offline) }
        assertFalse(quiet, quiet.contains("bug no mapeado"))
    }

    // E
    @Test fun aRefusedSettingGoesBackAndSaysSo() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val was = store.profilePrivate
        h.api.failNext("updateMe", KuraApiError.Server("500"))
        store.profilePrivate = !was
        advanceTimeBy(1_000) // inside the toast's window
        assertEquals(was, store.profilePrivate)
        assertEquals("No se pudo cambiar la privacidad de tu perfil.", store.toast?.text)

        h.api.failNext("updateMe", KuraApiError.Offline)
        store.notifyRecap = !store.notifyRecap
        advanceUntilIdle()
        assertEquals(true, store.notifyRecap)
    }

    @Test fun anOlderFailureNeverUndoesANewerChoice() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("updateMe", KuraApiError.Server("500"))
        store.musicApp = "Spotify"
        store.musicApp = "Tidal"
        advanceUntilIdle()
        assertEquals("Tidal", store.musicApp)
    }

    @Test fun aRefusedNameGoesBack() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val old = store.me.name
        h.api.failNext("updateMe", KuraApiError.Server("500"))
        store.saveProfile("otro nombre", store.me.handle, null, store.profilePrivate, store.showCommon)
        assertEquals("otro nombre", store.me.name)
        advanceTimeBy(1_000)
        assertEquals(old, store.me.name)
        assertEquals("No se pudo cambiar tu nombre.", store.toast?.text)
    }

    // G
    @Test fun turningANoticeOnAsksThePhone() = storeTest(platform = SignOutTest.OrderedPush(mutableListOf()).apply {
        notificationsAllowed = false
    }) { h ->
        val store = h.store
        signedIn(h)
        store.notifyReleases = false
        advanceUntilIdle()
        store.notifyReleases = true
        assertEquals(SheetRoute.NotificationsAsk, store.sheet)
    }

    @Test fun googleOnTheEntranceNeedsTheAndroidClientId() = storeTest { h ->
        h.store.authProviders = AuthProviders(apple = false, googleClientId = "ios.apps.googleusercontent.com", googleAndroidClientId = null)
        assertFalse(h.store.hasSocialSignIn)
        h.store.authProviders = AuthProviders(apple = false, googleClientId = null, googleAndroidClientId = "web.apps.googleusercontent.com")
        assertTrue(h.store.hasSocialSignIn)
    }

    @Test fun googleFailuresInTheVoice() = storeTest { h ->
        val s = h.store
        assertNull(s.googleFailureText("android.credentials.GetCredentialException.TYPE_USER_CANCELED", null))
        assertEquals("No hay una cuenta de Google en este teléfono",
            s.googleFailureText("android.credentials.GetCredentialException.TYPE_NO_CREDENTIAL", null))
        assertEquals("Google no está configurado para esta versión de la app",
            s.googleFailureText("androidx.credentials.TYPE_GET_CREDENTIAL_PROVIDER_CONFIGURATION_EXCEPTION", null))
        assertEquals("Google no está configurado para esta versión de la app",
            s.googleFailureText("androidx.credentials.TYPE_UNKNOWN", "Account reauth failed. [16]"))
        assertEquals("No se pudo entrar con Google", s.googleFailureText("androidx.credentials.TYPE_UNKNOWN", "algo"))
    }

    // K
    @Test fun aFailedUsernameCheckIsUnknownNeverFree() = storeTest { h ->
        h.api.failNext("checkUsername", KuraApiError.Offline)
        assertEquals(UsernameCheck.Unknown, h.store.checkUsername("ana"))
        assertEquals(UsernameCheck.Free, h.store.checkUsername("ana"))
    }

    @Test fun aFailedPickSaysItsOwnStep() = storeTest { h ->
        val store = h.store
        store.onboardingPicks = listOf("a", "b", "c")
        h.api.failNext("onboardingPicks", KuraApiError.Server("500"))
        assertFalse(store.submitPicks())
        assertEquals("No se guardaron tus 3. Vuelve a intentarlo.", store.authError)
        h.api.failNext("onboardingPicks", KuraApiError.NotFound)
        assertFalse(store.submitPicks())
        assertFalse("never the code screen's words", store.authError!!.contains("código"))
    }

    // N
    @Test fun aCollectionReadNeverDropsAnAddStillOnItsWay() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val parked = h.api.hold("createTitleMembership")
        store.add(fresh, recs)
        runCurrent()
        store.loadCollection(recs, force = true)
        assertTrue("the older read keeps the phone's add", fresh in store.collection(recs)!!.titleIds)
        parked.complete(Unit)
        advanceUntilIdle()
        assertTrue(fresh in store.collection(recs)!!.titleIds)
    }

    @Test fun aCollectionReadOlderThanAMarkKeepsTheMark() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val parked = h.api.hold("collection")
        val read = launch { store.loadCollection(pr, force = true) }
        runCurrent()
        store.setMark(yhlq, Mark.Obsessed)
        advanceUntilIdle() // the PUT answered: nothing in flight anymore
        parked.complete(Unit)
        read.join()
        assertEquals(Mark.Obsessed, store.mark(yhlq))
    }

    // P
    @Test fun aStaleToastsButtonDoesNothing() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.remove(yhlq, pr)
        val old = store.toast!!
        store.add(fresh, recs)
        store.tapToastAction(old)
        assertFalse("the replaced Deshacer is not honored", yhlq in store.collection(pr)!!.titleIds)
        assertNotNull(store.toast)
    }

    @Test fun anUndoAfterItsWindowStandsDown() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.remove(yhlq, pr)
        val undo = store.toast!!.action!!
        advanceTimeBy(store.undoWindow.inWholeMilliseconds + 1)
        runCurrent()
        assertEquals(listOf("removeTitleMembership $yhlq $pr"), h.api.callsOf("removeTitleMembership"))
        undo()
        assertFalse("the server already removed it: no local ghost", yhlq in store.collection(pr)!!.titleIds)

        store.move(store.collection(pr)!!.titleIds.first(), pr, recs)
        val moveUndo = store.toast!!.action!!
        advanceTimeBy(store.undoWindow.inWholeMilliseconds + 1)
        runCurrent()
        val before = store.collection(recs)!!.titleIds
        moveUndo()
        assertEquals(before, store.collection(recs)!!.titleIds)
    }

    // Sheets
    @Test fun aNewOrClosedSheetNeverInheritsTheLock() = storeTest { h ->
        val store = h.store
        store.present(SheetRoute.DeleteAccount)
        store.sheetLocked = true
        store.present(SheetRoute.NotificationsAsk)
        assertFalse(store.sheetLocked)
        store.sheetLocked = true
        store.dismissSheet()
        assertFalse(store.sheetLocked)
    }

    // loadMorePeople
    @Test fun aFailedNextPageShowsRetryAndClearsOnRetry() = runTest {
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val fake = FakeKuraApi()
        var failNext = false
        // Someone else's list: a first page with a cursor, then the next page fails once.
        val api = object : KuraApi by fake {
            override suspend fun people(kind: PeopleKind, cursor: String?): PeoplePage {
                if (kind !is PeopleKind.FollowersOf) return fake.people(kind, cursor)
                if (cursor != null && failNext) {
                    failNext = false
                    throw KuraApiError.Server("500")
                }
                return PeoplePage(emptyList(), nextCursor = if (cursor == null) "c1" else null)
            }
        }
        val store = AppStore(api = api, session = Session(InMemoryTokenStore("token")), prefs = LocalPrefs.disabled,
            clock = { FIXED_NOW }, scope = scope)
        try {
            val other = "otra.persona"
            val key = AppStore.peopleListKey(other, following = false)
            store.loadPeopleList(other, following = false)
            assertEquals("c1", store.peopleListMeta[key]?.nextCursor)
            failNext = true
            store.loadMorePeople(other, following = false)
            assertEquals(KuraApiError.Server("500"), store.loadError(LoadKey.PeopleMore(other, following = false)))
            store.loadMorePeople(other, following = false)
            assertNull(store.loadError(LoadKey.PeopleMore(other, following = false)))
            assertNull(store.peopleListMeta[key]?.nextCursor)
        } finally {
            scope.cancel()
        }
    }

    // L
    @Test fun aCoverThatDidntLoadIsTriedAgainNextTime() = storeTest(platform = object : InMemoryStorePlatform(welcomeSeen = true) {
        var calls = 0
        override suspend fun extractPalette(url: String): List<String> {
            calls++
            return if (calls == 1) emptyList() else listOf("#112233", "#445566")
        }
    }) { h ->
        val store = h.store
        signedIn(h)
        val t = Title(id = "sin-paleta", name = "x", format = com.tromwey.kura.data.models.MediaFormat.Film, creator = null,
            palette = emptyList(), coverUrl = "https://example.test/c.jpg")
        store.fillPaletteIfNeeded(t)
        advanceUntilIdle()
        store.fillPaletteIfNeeded(t)
        advanceUntilIdle()
        assertEquals(listOf("#112233", "#445566"), store.title("sin-paleta")?.palette)
    }
}
