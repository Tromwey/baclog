package com.tromwey.kura.state

import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.KuraApi
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.LinkOutcome
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.MergeProof
import com.tromwey.kura.data.models.MergeSource
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Ajustes › Inicio de sesión and Fusionar otra cuenta (`AppStoreAccountLink.kt`). The link/merge
 * endpoints are scripted here on top of `FakeKuraApi` (which leaves them unused): the real fixtures
 * for everything else, these answers for §2.5.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AccountLinkTest {

    /** `FakeKuraApi` plus the §2.5 endpoints, each logged in `base.calls` and failable with `failNext`. */
    private class LinkApi(val base: FakeKuraApi = FakeKuraApi()) : KuraApi by base {
        var providers = AuthProviders(apple = true, googleClientId = "ios.apps.googleusercontent.com", googleAndroidClientId = "web.apps.googleusercontent.com")
        var linkOutcome: LinkOutcome = LinkOutcome.Linked
        var proof = MergeProof(
            mergeToken = "merge.jws",
            source = MergeSource(handle = "vieja", name = "Vieja", email = "vieja@example.com", counts = MergeSource.Counts(12, 2, 3, 4, 5), isPublic = false),
        )
        private val failures = HashMap<String, ArrayDeque<Throwable>>()

        fun failNext(name: String, error: Throwable) {
            failures.getOrPut(name) { ArrayDeque() }.addLast(error)
        }

        private suspend fun <T> call(name: String, vararg args: Any?, body: () -> T): T {
            yield()
            base.calls += (listOf(name) + args.map { it.toString() }).joinToString(" ")
            failures[name]?.removeFirstOrNull()?.let { throw it }
            return body()
        }

        override suspend fun authProviders(): AuthProviders = call("authProviders") { providers }
        override suspend fun linkGoogle(idToken: String): LinkOutcome = call("linkGoogle", idToken) { linkOutcome }
        override suspend fun unlinkIdentity(provider: IdentityProvider) = call("unlinkIdentity", provider.rawValue) {}
        override suspend fun requestMergeCode(email: String) = call("requestMergeCode", email) {}
        override suspend fun verifyMergeCode(email: String, code: String): MergeProof = call("verifyMergeCode", email, code) {
            if (code == "000000") throw KuraApiError.Forbidden("proof_rejected")
            proof
        }
        override suspend fun merge(token: String): Me = call("merge", token) { base.me }
    }

    private class Harness(val api: LinkApi, val store: AppStore)

    private fun linkTest(body: suspend TestScope.(Harness) -> Unit) = runTest {
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val api = LinkApi()
        val store = AppStore(
            api = api,
            session = Session(InMemoryTokenStore("token")),
            prefs = LocalPrefs.disabled,
            clock = { FIXED_NOW },
            scope = scope,
            expiries = MutableSharedFlow(),
        )
        try {
            store.enterMain()
            store.startIfNeeded()
            testScheduler.runCurrent()
            body(Harness(api, store))
        } finally {
            scope.cancel()
        }
    }

    private fun LinkApi.callsOf(name: String) = base.callsOf(name)

    // MARK: Identities

    @Test fun loadReadsTheIdentitiesAndTheAndroidClientId() = linkTest { h ->
        val store = h.store
        assertNull(store.identities)
        store.loadIdentities()
        assertEquals("qa.founder@example.invalid", store.identities?.email)
        assertEquals("web.apps.googleusercontent.com", store.googleLinkClientId)
        assertTrue(store.canRun(IdentityProvider.Google))
        assertFalse("Apple nunca corre en Android", store.canRun(IdentityProvider.Apple))
        assertNull(store.loadError(LoadKey.Identities))
    }

    @Test fun withoutTheAndroidClientIdGoogleCantRun() = linkTest { h ->
        h.api.providers = AuthProviders(apple = true, googleClientId = "ios.apps.googleusercontent.com", googleAndroidClientId = null)
        h.store.loadIdentities()
        assertFalse(h.store.canRun(IdentityProvider.Google))
        // Nothing starts: no Credential Manager, no POST.
        var asked = false
        h.store.connectGoogle { asked = true; GoogleCredential.Token("t") }
        assertFalse(asked)
        assertTrue(h.api.callsOf("linkGoogle").isEmpty())
    }

    @Test fun aFailedReadIsALoadError() = linkTest { h ->
        h.api.base.failNext("identities", KuraApiError.Unavailable)
        h.store.loadIdentities()
        assertNull(h.store.identities)
        assertEquals(KuraApiError.Unavailable, h.store.loadError(LoadKey.Identities))
    }

    @Test fun connectingGoogleLinksItAndSaysSo() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        store.connectGoogle { GoogleCredential.Token("id.token") }
        assertEquals(listOf("linkGoogle id.token"), h.api.callsOf("linkGoogle"))
        assertEquals("Google conectada. Ya puedes entrar con Google.", store.toast?.text)
        assertNull(store.identityBusy)
    }

    @Test fun aCancelledSheetSaysNothingAndSendsNothing() = linkTest { h ->
        h.store.loadIdentities()
        h.store.connectGoogle { GoogleCredential.Cancelled }
        assertTrue(h.api.callsOf("linkGoogle").isEmpty())
        assertNull(h.store.toast)
        assertNull(h.store.identityBusy)
    }

    @Test fun noGoogleAccountOnThePhoneIsAToast() = linkTest { h ->
        h.store.loadIdentities()
        h.store.connectGoogle { GoogleCredential.NoAccount }
        assertEquals("No hay una cuenta de Google en este teléfono", h.store.toast?.text)
    }

    @Test fun aGoogleOfAnotherAccountGoesToTheMergeConfirmation() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        store.push(Route.Settings)
        h.api.linkOutcome = LinkOutcome.Mergeable(h.api.proof)
        store.connectGoogle { GoogleCredential.Token("id.token") }
        assertEquals(h.api.proof, store.mergeProof)
        assertEquals(Route.MergeConfirm, store.path(store.tab).last())
    }

    @Test fun providerAlreadyLinkedExplainsWhatToDo() = linkTest { h ->
        h.store.loadIdentities()
        h.api.failNext("linkGoogle", KuraApiError.Conflict("provider_already_linked", "x"))
        h.store.connectGoogle { GoogleCredential.Token("id.token") }
        assertEquals("Ya tienes otra cuenta de Google conectada. Desconéctala primero.", h.store.toast?.text)
    }

    @Test fun disconnectDropsTheLinkAfterTheServerAnswered() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        assertTrue(store.disconnect(IdentityProvider.Apple))
        assertEquals(listOf("unlinkIdentity apple"), h.api.callsOf("unlinkIdentity"))
        assertEquals(false, store.identities?.link(IdentityProvider.Apple)?.linked)
        assertEquals("Desconectaste Apple. Sigues entrando con tu correo.", store.toast?.text)
    }

    @Test fun lastWayInKeepsTheLinkAndSaysWhy() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        h.api.failNext("unlinkIdentity", KuraApiError.Conflict("last_way_in", "x"))
        assertFalse(store.disconnect(IdentityProvider.Apple))
        assertEquals(true, store.identities?.link(IdentityProvider.Apple)?.linked)
        assertEquals(LAST_WAY_IN_TEXT, store.toast?.text)
    }

    @Test fun aFailedDisconnectOffersReintentar() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        h.api.failNext("unlinkIdentity", KuraApiError.Offline)
        assertFalse(store.disconnect(IdentityProvider.Apple))
        assertEquals("Sin conexión. Apple sigue conectada.", store.toast?.text)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        store.tapToastAction(store.toast!!)
        runCurrent()
        assertEquals(2, h.api.callsOf("unlinkIdentity").size)
        assertEquals(false, store.identities?.link(IdentityProvider.Apple)?.linked)
    }

    // MARK: Merge

    @Test fun anInvalidOrOwnEmailNeverReachesTheServer() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        assertFalse(store.requestMergeCode("no-es-correo"))
        assertEquals("Ese correo no parece válido. Revísalo.", store.mergeError)
        assertFalse(store.requestMergeCode("  QA.Founder@example.invalid "))
        assertEquals("Ese es el correo de esta cuenta. Escribe el de la otra.", store.mergeError)
        assertTrue(h.api.callsOf("requestMergeCode").isEmpty())
    }

    @Test fun requestingACodeKeepsTheEmailNormalized() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        assertTrue(store.requestMergeCode("  Vieja@Example.com "))
        assertEquals(listOf("requestMergeCode vieja@example.com"), h.api.callsOf("requestMergeCode"))
        assertEquals("vieja@example.com", store.mergeEmail)
        assertNull(store.mergeError)
        assertFalse(store.mergeBusy)
    }

    @Test fun rateLimitedSaysHowLongAndBlocksTheResend() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        h.api.failNext("requestMergeCode", KuraApiError.RateLimited(2400, "hourly_cap"))
        assertFalse(store.requestMergeCode("vieja@example.com"))
        assertEquals("Se pidieron demasiados códigos para ese correo. Podrás pedir otro en 40 min.", store.mergeError)
        assertNotNull(store.mergeRetryAt)
        assertEquals("sin código prometido, no avanza", "", store.mergeEmail)
        // No `reason` (an older server, the per-IP limiter): just too fast.
        h.api.failNext("requestMergeCode", KuraApiError.RateLimited(45))
        assertFalse(store.requestMergeCode("vieja@example.com"))
        assertEquals("Demasiados intentos seguidos. Espera 45 s y vuelve a intentarlo.", store.mergeError)
    }

    /** 429 `cooldown`: the code already sent still works — on to the code screen, nothing failed. */
    @Test fun aCooldownGoesOnToTheCodeScreen() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        h.api.failNext("requestMergeCode", KuraApiError.RateLimited(40, "cooldown"))
        assertTrue(store.requestMergeCode("vieja@example.com"))
        assertEquals("vieja@example.com", store.mergeEmail)
        assertNull(store.mergeError)
        assertNotNull("Enviar otro código espera", store.mergeRetryAt)
    }

    @Test fun waitLabel() {
        assertEquals("45 s", mergeWaitLabel(45))
        assertEquals("40 min", mergeWaitLabel(2400))
        assertEquals("2 min", mergeWaitLabel(91))
    }

    @Test fun aWrongCodeSaysSoAndStaysPut() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        store.push(Route.Settings)
        store.push(Route.MergeAccount)
        store.requestMergeCode("vieja@example.com")
        store.push(Route.MergeCode)
        store.verifyMergeCode("000000")
        assertEquals("El código es incorrecto o ya venció. Revísalo o pide otro.", store.mergeError)
        assertNull(store.mergeProof)
        assertEquals(Route.MergeCode, store.path(store.tab).last())
    }

    @Test fun theRightCodeOpensTheConfirmation() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        store.requestMergeCode("vieja@example.com")
        store.verifyMergeCode("123456")
        assertEquals(listOf("verifyMergeCode vieja@example.com 123456"), h.api.callsOf("verifyMergeCode"))
        assertEquals(h.api.proof, store.mergeProof)
        assertEquals(Route.MergeConfirm, store.path(store.tab).last())
    }

    @Test fun confirmMergeAppliesMeReloadsAndGoesBackToAjustes() = linkTest { h ->
        val store = h.store
        store.select(Tab.Profile)
        store.push(Route.Settings)
        store.push(Route.MergeAccount)
        store.push(Route.MergeCode)
        store.loadIdentities()
        store.requestMergeCode("vieja@example.com")
        store.verifyMergeCode("123456")
        val bootstrapsBefore = h.api.callsOf("me").size
        store.confirmMerge()
        runCurrent()
        assertEquals(listOf("merge merge.jws"), h.api.callsOf("merge"))
        assertEquals(listOf(Route.Settings), store.path(Tab.Profile))
        assertNull(store.mergeProof)
        assertEquals("", store.mergeEmail)
        assertEquals("Listo. Todo lo de @vieja ya está aquí.", store.toast?.text)
        assertTrue("la biblioteca se vuelve a pedir", h.api.callsOf("me").size > bootstrapsBefore)
        assertNotNull("inicio de sesión se relee", store.identities)
    }

    @Test fun anExpiredTokenGoesBackToChoose() = linkTest { h ->
        val store = h.store
        store.select(Tab.Profile)
        store.push(Route.Settings)
        store.push(Route.MergeAccount)
        store.mergeProof = h.api.proof
        store.push(Route.MergeConfirm)
        h.api.failNext("merge", KuraApiError.Conflict("merge_token_invalid", "x"))
        store.confirmMerge()
        assertNull(store.mergeProof)
        assertEquals(listOf(Route.Settings, Route.MergeAccount), store.path(Tab.Profile))
        assertEquals("Pasaron más de 10 minutos. Vuelve a probar que la otra cuenta es tuya.", store.toast?.text)
    }

    @Test fun underageNeverMerges() = linkTest { h ->
        val store = h.store
        store.select(Tab.Profile)
        store.push(Route.Settings)
        store.mergeProof = h.api.proof
        store.push(Route.MergeConfirm)
        h.api.failNext("merge", KuraApiError.Forbidden("underage"))
        store.confirmMerge()
        assertEquals(listOf(Route.Settings), store.path(Tab.Profile))
        assertEquals("Una de las dos cuentas es de alguien menor de 13 años. No se pueden fusionar.", store.toast?.text)
    }

    @Test fun offlineMovesNothingAndOffersReintentar() = linkTest { h ->
        val store = h.store
        store.mergeProof = h.api.proof
        h.api.failNext("merge", KuraApiError.Offline)
        store.confirmMerge()
        assertEquals(h.api.proof, store.mergeProof)
        assertEquals("Sin conexión. No se movió nada.", store.toast?.text)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        assertFalse(store.sheetLocked)
    }

    @Test fun cancelDropsTheProof() = linkTest { h ->
        val store = h.store
        store.push(Route.Settings)
        store.mergeProof = h.api.proof
        store.push(Route.MergeConfirm)
        store.cancelMerge()
        assertNull(store.mergeProof)
        assertEquals(Route.Settings, store.path(store.tab).last())
    }

    @Test fun leavingTheSessionForgetsIdentitiesAndTheProof() = linkTest { h ->
        val store = h.store
        store.loadIdentities()
        store.mergeProof = h.api.proof
        store.signOut(global = false)
        assertNull(store.identities)
        assertNull("la prueba de fusión no sobrevive a otra cuenta", store.mergeProof)
    }
}
