package com.tromwey.kura.state

import org.junit.Test
import org.junit.Assert.assertEquals

class ToastTextTest {
    @Test fun oneSentenceLosesItsPeriod() {
        assertEquals("Las fiestas llegan muy pronto", toastText("Las fiestas llegan muy pronto."))
        assertEquals("Ya tienes una fiesta con ese nombre", ToastModel("Ya tienes una fiesta con ese nombre.", ToastModel.Kind.Info).text)
    }

    @Test fun twoSentencesKeepEverything() {
        val two = "Sin conexión. No se guardó tu reseña."
        assertEquals(two, toastText(two))
        assertEquals("¿Seguro? Se borra.", toastText("¿Seguro? Se borra."))
    }

    @Test fun closersAndPlainTextAreUntouched() {
        assertEquals("Listo!", toastText("Listo!"))
        assertEquals("Buscando…", toastText("Buscando…"))
        assertEquals("Guardado", toastText("Guardado"))
    }
}
