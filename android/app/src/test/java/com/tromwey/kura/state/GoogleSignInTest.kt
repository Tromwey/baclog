package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.KuraJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/** Google on Android: the button hangs on `google.androidClientId`, and a token the server refuses
 *  (401, what `POST auth/google` answers for "bad") is a toast at the entrance — never a crash. */
class GoogleSignInTest {
    @Test fun androidClientIdIsItsOwnField() {
        val p = KuraJson.json.decodeFromString(
            AuthProviders.serializer(),
            """{"apple":true,"google":{"clientId":"ios.apps.googleusercontent.com","androidClientId":"web.apps.googleusercontent.com"}}""",
        )
        assertEquals("ios.apps.googleusercontent.com", p.googleClientId)
        assertEquals("web.apps.googleusercontent.com", p.googleAndroidClientId)
        val iosOnly = KuraJson.json.decodeFromString(AuthProviders.serializer(), """{"apple":true,"google":{"clientId":"ios","androidClientId":null}}""")
        assertNull("sin id web no hay botón en Android", iosOnly.googleAndroidClientId)
        assertNull(KuraJson.json.decodeFromString(AuthProviders.serializer(), """{"apple":true,"google":null}""").googleAndroidClientId)
    }

    @Test fun aRefusedTokenIsAToastAtTheEntrance() = storeTest { h ->
        h.store.phase = AppPhase.Onboarding
        h.api.failNext("signInWithGoogle", KuraApiError.Unauthorized)
        h.store.signInWithGoogle("bad")
        assertEquals(AppPhase.Onboarding, h.store.phase)
        assertEquals("No se pudo entrar con Google. Vuelve a intentarlo.", h.store.toast?.text)
        assertFalse(h.store.authBusy)
    }
}
