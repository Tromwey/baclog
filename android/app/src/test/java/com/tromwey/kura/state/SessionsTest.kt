package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ajustes › Sesiones activas (`AppStoreAccountLink.kt`) over the real `GET /me/sessions` fixture. */
@OptIn(ExperimentalCoroutinesApi::class)
class SessionsTest {
    @Test fun loadPutsThisDeviceFirstThenTheMostRecentlySeen() = storeTest { h ->
        val store = h.store
        signedIn(h)
        assertNull("nada antes de pedirla", store.deviceSessions)
        store.loadSessions()
        val list = store.deviceSessions!!
        assertEquals(10, list.size)
        assertTrue(list.first().current)
        assertEquals("Teléfono 1", list.first().title)
        // The rest by lastSeenAt, newest first: Teléfono 2 (05:11) before Teléfono 3 (19:04 the day before).
        assertEquals(listOf("Teléfono 2", "Teléfono 3"), list.drop(1).take(2).map { it.title })
        val seen = list.drop(1).map { it.lastSeenAt!! }
        assertEquals(seen.sortedDescending(), seen)
        assertNull(store.loadError(LoadKey.Sessions))
    }

    @Test fun aFailedReadIsALoadErrorAndKeepsNothing() = storeTest { h ->
        val store = h.store
        signedIn(h)
        h.api.failNext("sessions", KuraApiError.Unavailable)
        store.loadSessions()
        assertNull(store.deviceSessions)
        assertEquals(KuraApiError.Unavailable, store.loadError(LoadKey.Sessions))
        store.loadSessions()
        assertNotNull(store.deviceSessions)
        assertNull(store.loadError(LoadKey.Sessions))
    }

    @Test fun revokeDropsTheRowOnlyAfterTheServerAnswered() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.loadSessions()
        val other = store.deviceSessions!![1]
        assertTrue(store.revokeSession(other))
        assertEquals(listOf("revokeSession ${other.id}"), h.api.callsOf("revokeSession"))
        assertFalse(store.deviceSessions!!.any { it.id == other.id })
        assertEquals(9, store.deviceSessions!!.size)
        assertEquals("Cerraste la sesión en ${other.title}", store.toast?.text)
    }

    @Test fun aGoneSessionJustCatchesTheListUp() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.loadSessions()
        val other = store.deviceSessions!![2]
        h.api.failNext("revokeSession", KuraApiError.NotFound)
        assertTrue(store.revokeSession(other))
        assertFalse(store.deviceSessions!!.any { it.id == other.id })
        assertNull("sin aviso: ya no estaba", store.toast)
    }

    @Test fun aFailureKeepsTheRowAndReintentarSendsItAgain() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.loadSessions()
        val other = store.deviceSessions!![1]
        h.api.failNext("revokeSession", KuraApiError.Offline)
        assertFalse(store.revokeSession(other))
        assertTrue(store.deviceSessions!!.any { it.id == other.id })
        assertEquals("Sin conexión. La sesión sigue abierta.", store.toast?.text)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals(2, h.api.callsOf("revokeSession").size)
        assertFalse(store.deviceSessions!!.any { it.id == other.id })
    }

    @Test fun leavingTheSessionForgetsTheList() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.loadSessions()
        assertNotNull(store.deviceSessions)
        store.signOut(global = false)
        assertNull("la cuenta siguiente empieza sin la lista de la anterior", store.deviceSessions)
        assertTrue(h.api.callsOf("logout").isEmpty())
    }
}
