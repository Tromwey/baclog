package com.tromwey.kura.features.discover

import org.junit.Assert.assertEquals
import org.junit.Test

class DiscoverLabelsTest {
    @Test
    fun hoursUseTheSpanishComma() {
        // es-MX formats decimals with a period; Kura (iOS, web) writes "3,9 h".
        assertEquals("8,7 h", hoursLabel(522))
        assertEquals("3,9 h", hoursLabel(234))
        assertEquals("12 h", hoursLabel(720))
    }

    @Test
    fun foldKeepsIndicesSoTheHighlightLandsOnTheMatch() {
        val name = "El viaje de Chihiro"
        assertEquals(name.length, SearchIndex.fold(name).length)
        assertEquals("el viaje de chihiro", SearchIndex.fold(name))
        assertEquals("pelicula accion", SearchIndex.fold("Película Acción"))
        assertEquals(12, SearchIndex.fold(name).indexOf(SearchIndex.fold("CHIHIRO")))
    }

    @Test
    fun correctionDistance() {
        assertEquals(1, SearchIndex.distance("mononoke", "mononokee"))
        assertEquals(0, SearchIndex.distance("chihiro", "chihiro"))
        assertEquals(3, SearchIndex.distance("", "abc"))
    }
}
