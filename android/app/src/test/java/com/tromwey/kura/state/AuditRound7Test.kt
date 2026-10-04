package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Mark
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * Ronda 7: the birth DATE of the age gate, "tu reseña se borra con la reacción" (no mark that deletes
 * a review goes out unconfirmed; a failed one brings the review back) and the copy of `ip_limit`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AuditRound7Test {
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be" // in the library, no mark
    private val today = LocalDate.of(2026, 10, 1)

    private fun AppStore.tapToast() = tapToastAction(toast!!)

    /** Me gusta + a published review, both confirmed by the server. */
    private suspend fun TestScope.reviewed(h: StoreHarness, text: String = "un disco que no se acaba") {
        signedIn(h)
        h.store.setMark(yhlq, Mark.Liked)
        h.store.publishReview(yhlq, text, spoiler = false)
        runCurrent()
        assertEquals("srv-review", h.store.myReview(yhlq)!!.id)
        h.api.calls.clear()
    }

    // MARK: C · fecha de nacimiento

    @Test fun aRealPastDateBecomesTheWireFormat() {
        assertEquals("1995-03-09", birthDateOrNull("9", "3", "1995", today))
        assertEquals("1995-03-09", birthDateOrNull("09", "03", "1995", today))
        assertEquals("hoy vale: la edad la decide el servidor", "2026-10-01", birthDateOrNull("1", "10", "2026", today))
        assertEquals("29 de febrero en año bisiesto", "2012-02-29", birthDateOrNull("29", "2", "2012", today))
        assertEquals("1900-01-01", birthDateOrNull("1", "1", "1900", today))
    }

    @Test fun aDateThatIsNotOneIsRefusedBeforeTheServer() {
        assertNull("31 de abril", birthDateOrNull("31", "4", "1995", today))
        assertNull("29 de febrero en año no bisiesto", birthDateOrNull("29", "2", "2013", today))
        assertNull("mes 13", birthDateOrNull("1", "13", "1995", today))
        assertNull("día 0", birthDateOrNull("0", "5", "1995", today))
        assertNull("mañana", birthDateOrNull("2", "10", "2026", today))
        assertNull("antes de 1900", birthDateOrNull("31", "12", "1899", today))
        assertNull("año a medias", birthDateOrNull("1", "1", "199", today))
        assertNull("vacío", birthDateOrNull("", "", "", today))
        assertNull("letras", birthDateOrNull("a", "b", "cdef", today))
    }

    @Test fun onboardingSendsTheWholeDateAndSaysTheServersWordsForABadOne() = storeTest { h ->
        val store = h.store
        h.api.hasSession = false
        h.api.signInMe = h.api.me.copy(handle = null, name = "", onboarded = false)
        store.finishSplash()
        store.requestCode("nuevo@correo.com")
        assertTrue(store.verifyCode("123456"))
        assertFalse(store.submitUsername("nuevo", "Nuevo", null))
        assertEquals(BIRTH_DATE_MISSING, store.authError)
        assertTrue(h.api.callsOf("completeOnboarding").isEmpty())

        h.api.failNext("completeOnboarding", KuraApiError.Invalid(mapOf("birthDate" to BIRTH_DATE_INVALID), "Revisa los datos que enviaste."))
        assertFalse(store.submitUsername("nuevo", "Nuevo", "2026-12-31"))
        assertEquals("Esa fecha no es válida.", store.authError)

        assertTrue(store.submitUsername("nuevo", "Nuevo", "1995-03-09"))
        assertEquals("completeOnboarding nuevo 1995-03-09", h.api.callsOf("completeOnboarding").last())
    }

    // MARK: B · la reseña se borra con la reacción

    @Test fun aMarkThatDeletesTheReviewIsNotSentUntilConfirmed() = storeTest { h ->
        val store = h.store
        reviewed(h)
        for (mark in listOf(Mark.Completed, null)) {
            assertTrue(store.markDropsReview(yhlq, mark))
            assertFalse("no sale: espera la confirmación", store.setMark(yhlq, mark))
            runCurrent()
            assertEquals(SheetRoute.DropReview(yhlq, mark), store.sheet)
            assertTrue("nada se mandó", h.api.callsOf("setMark").isEmpty())
            assertEquals(Mark.Liked, store.mark(yhlq))
            assertNotNull("la reseña sigue en pantalla", store.myReview(yhlq))
            store.dismissSheet() // Conservar
        }
        // Me gusta ⇄ Me obsesiona no borra nada: sale sin preguntar.
        assertFalse(store.markDropsReview(yhlq, Mark.Obsessed))
        assertTrue(store.setMark(yhlq, Mark.Obsessed))
        runCurrent()
        assertNull(store.sheet)
        assertEquals(listOf("setMark $yhlq obsessed false"), h.api.callsOf("setMark"))
        assertEquals("srv-review", store.myReview(yhlq)!!.id)
        assertEquals("srv-review", store.userTitles[yhlq]!!.reviewId)
    }

    @Test fun theAwaitedMarkOfTheSheetAsksToo() = storeTest { h ->
        val store = h.store
        reviewed(h)
        assertNotNull("nunca 'éxito': la hoja publicaría una reseña", store.setMarkConfirmed(yhlq, Mark.Completed, preview = false))
        assertEquals(SheetRoute.DropReview(yhlq, Mark.Completed), store.sheet)
        assertTrue(h.api.callsOf("setMark").isEmpty())
        assertNotNull(store.myReview(yhlq))
    }

    @Test fun confirmedItTakesTheReviewOffThePhoneWhenItLands() = storeTest { h ->
        val store = h.store
        reviewed(h)
        assertTrue(store.setMark(yhlq, Mark.Completed, confirmed = true))
        assertNull("optimista: ya no está", store.myReview(yhlq))
        assertNull(store.userTitles[yhlq]!!.reviewId)
        runCurrent()
        assertEquals(listOf("setMark $yhlq completed false"), h.api.callsOf("setMark"))
        assertEquals(Mark.Completed, store.mark(yhlq))
        assertNull(store.myReview(yhlq))
        assertNull(store.userTitles[yhlq]!!.reviewId)
        assertTrue("nadie borra la reseña aparte: se fue con la marca", h.api.callsOf("deleteReview").isEmpty())
        // Sin reseña ya no hay nada que confirmar.
        assertTrue(store.setMark(yhlq, null))
        runCurrent()
        assertNull(store.sheet)
        assertNull(store.mark(yhlq))
    }

    @Test fun aFailedMarkBringsTheReviewBackAndRetryDoesNotAskAgain() = storeTest { h ->
        val store = h.store
        reviewed(h)
        h.api.failNext("setMark", KuraApiError.Offline)
        store.setMark(yhlq, null, confirmed = true)
        assertNull(store.myReview(yhlq))
        runCurrent()
        assertEquals("la marca vuelve a lo último confirmado", Mark.Liked, store.mark(yhlq))
        assertEquals("y la reseña con ella", "un disco que no se acaba", store.myReview(yhlq)!!.text)
        assertEquals("srv-review", store.userTitles[yhlq]!!.reviewId)
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)

        store.tapToast()
        runCurrent()
        assertNull("ya se confirmó una vez", store.sheet)
        assertEquals(2, h.api.callsOf("setMark").size)
        assertNull(store.mark(yhlq))
        assertNull(store.myReview(yhlq))
    }

    @Test fun theAwaitedMarkThatFailsBringsTheReviewBackToo() = storeTest { h ->
        val store = h.store
        reviewed(h)
        h.api.failNext("setMark", KuraApiError.Server("HTTP 500"))
        assertNotNull(store.setMarkConfirmed(yhlq, Mark.Completed, preview = false, confirmed = true))
        assertEquals(Mark.Liked, store.mark(yhlq))
        assertEquals("srv-review", store.myReview(yhlq)!!.id)
        assertEquals("srv-review", store.userTitles[yhlq]!!.reviewId)
    }

    @Test fun aFailedCompletoUnderANewerObsesionaStillBringsTheReviewBack() = storeTest { h ->
        val store = h.store
        reviewed(h)
        h.api.failNext("setMark", KuraApiError.Server("HTTP 500"))
        store.setMark(yhlq, Mark.Completed, confirmed = true)
        store.setMark(yhlq, Mark.Obsessed)
        runCurrent()
        assertEquals(Mark.Obsessed, store.mark(yhlq))
        assertEquals("el servidor nunca la borró", "srv-review", store.myReview(yhlq)!!.id)
        assertEquals("srv-review", store.userTitles[yhlq]!!.reviewId)
    }

    @Test fun theMarkThatDeletesTheReviewRetiresItsPendingPublish() = storeTest { h ->
        val store = h.store
        reviewed(h)
        // An edit that didn't go out waits with its Reintentar…
        h.api.failNext("saveReview", KuraApiError.Offline)
        store.publishReview(yhlq, "otra cosa", spoiler = false)
        runCurrent()
        assertEquals(ToastModel.Kind.Retry, store.toast?.kind)
        // …and Completo (confirmed) lands: the review is gone, nothing resends it.
        store.setMark(yhlq, Mark.Completed, confirmed = true)
        runCurrent()
        assertNull("el Reintentar de la reseña se retira", store.toast?.takeIf { it.kind == ToastModel.Kind.Retry })
        h.api.calls.clear()
        store.connectivityChanged(true)
        runCurrent()
        assertTrue("al volver la red no se reenvía", h.api.callsOf("saveReview").isEmpty())
        assertNull(store.myReview(yhlq))
    }

    @Test fun completoWithTextNeitherSendsNorPaintsAReview() = storeTest { h ->
        val store = h.store
        signedIn(h)
        assertNull(store.setMarkConfirmed(yhlq, Mark.Completed, preview = false))
        store.publishReview(yhlq, "lo que escribí", spoiler = false)
        runCurrent()
        assertNull("no se pinta", store.myReview(yhlq))
        assertNull(store.userTitles[yhlq]!!.reviewId)
        assertTrue("no se manda", h.api.callsOf("saveReview").isEmpty())
        assertEquals("Para reseñar, elige Me gusta o Me obsesiona", store.toast?.text)
    }

    // MARK: A · copy

    @Test fun ipLimitHasItsOwnWords() = storeTest { h ->
        val store = h.store
        h.api.hasSession = false
        h.api.failNext("requestCode", KuraApiError.RateLimited(3000, "ip_limit"))
        assertFalse(store.requestCode("qa@baclog.dev"))
        assertEquals("Demasiados intentos desde esta red. Podrás pedir un código en 50 minutos.", store.authError)
        h.api.failNext("requestCode", KuraApiError.RateLimited(null, "ip_limit"))
        assertFalse(store.requestCode("qa@baclog.dev"))
        assertEquals("Demasiados intentos desde esta red. Pide un código más tarde.", store.authError)
        // The hourly cap is about the email, with the real wait or none — never an invented one.
        h.api.failNext("requestCode", KuraApiError.RateLimited(2400, "hourly_cap"))
        assertFalse(store.requestCode("qa@baclog.dev"))
        assertEquals("Se pidieron demasiados códigos para este correo. Podrás pedir otro en 40 minutos.", store.authError)
        h.api.failNext("requestCode", KuraApiError.RateLimited(null, "hourly_cap"))
        assertFalse(store.requestCode("qa@baclog.dev"))
        assertEquals("Se pidieron demasiados códigos para este correo. Pide otro más tarde.", store.authError)
    }

    @Test fun theSharedCasesSayTheCanonicalPhrase() {
        assertEquals("No se pudo guardar", KuraApiError.Server("HTTP 500").toast)
        assertEquals("Sin conexión", KuraApiError.Offline.toast)
        assertEquals("Demasiados intentos seguidos. Espera un momento.", KuraApiError.RateLimited(null).toast)
        assertEquals("El catálogo no responde. Vuelve a intentarlo en unos minutos.", KuraApiError.Unavailable.toast)
        assertEquals("El código es incorrecto o ya venció. Revísalo o pide otro.", KuraApiError.Unauthorized.authText)
        assertEquals("Se intentó demasiadas veces. Pide otro código más tarde.", KuraApiError.CodeLocked.authText)
        assertEquals("Sin conexión. Revisa tu red y vuelve a intentarlo.", KuraApiError.Offline.authText)
        assertEquals("Termina tu registro para continuar", ONBOARDING_REQUIRED_NOTE)
    }
}
