package com.tromwey.kura.designsystem

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The tinted surface must produce the SAME hex as iOS (`Tint.ends` in Tokens.swift) and the web
 * (`tintEnds` in src/components/kura/tint.ts). Expected values are worked out by hand from the
 * DS formula, not read back from this implementation:
 *
 *   k = 1 − 0.45·0.78 = 0.649
 *   top    = mix(#c53e42, #101013, 0.649)
 *          = (197·.351 + 16·.649, 62·.351 + 16·.649, 66·.351 + 19·.649)
 *          = (79.53, 32.15, 35.50) → (80, 32, 35) = #502023      (L ≈ 0.029 ≤ 0.04: not capped)
 *   bottom = mix(#794244, #0c0c10, 0.729)
 *          = (121·.271 + 12·.729, 66·.271 + 12·.729, 68·.271 + 16·.729)
 *          = (41.54, 26.63, 30.09) → (42, 27, 30) = #2a1b1e      (the DS's own Chihiro tint end)
 */
class TintTest {

    @Test
    fun kIsTheDsConstant() {
        assertEquals(0.649, Tint.k, 1e-9)
    }

    @Test
    fun chihiroPaletteMatchesIos() {
        val (top, bottom) = Tint.ends(listOf("#c53e42", "#794244"))
        assertEquals("#502023", top.hex)
        assertEquals("#2a1b1e", bottom.hex)
    }

    @Test
    fun mixRoundsHalfUpLikeSwift() {
        // 0.5 must round up (Swift `.rounded()`), never to even (Kotlin `round()`).
        val c = KRgb(1.0, 3.0, 5.0).mix(KRgb(2.0, 4.0, 6.0), 0.5)
        assertEquals(KRgb(2.0, 4.0, 6.0), c)
    }

    @Test
    fun secondPaletteMatchesReference() {
        val (top, bottom) = Tint.ends(listOf("#b4562f", "#9b5832"))
        assertEquals("#4a291d", top.hex)
        assertEquals("#332119", bottom.hex)
    }

    @Test
    fun tooCloseEndsTakeTheFarthestColor() {
        // Tone 1 ≈ tone 2 once tinted (ΔE < 13): tone 2 becomes the palette color farthest from tone 1.
        val (top, bottom) = Tint.ends(listOf("#5ca6cb", "#5ca6cc", "#c53e42"))
        assertEquals("#263b47", top.hex)
        assertEquals("#3e1a1e", bottom.hex)
    }

    @Test
    fun palePalettesAreCappedForContrast() {
        val (top, bottom) = Tint.ends(listOf("#ffffff", "#eeeeee"))
        assertTrue(top.relativeLuminance <= Tint.maxLuminance)
        assertTrue(bottom.relativeLuminance <= Tint.maxLuminance)
    }

    @Test
    fun sealInvertsTheObsession() {
        // bg = (0xffffff ^ #c53e42) mixed 72 % to bg; ink = (0xffffff ^ #794244) mixed 55 % to text.
        val bg = KRgb.hex("#c53e42").inverted.mix(KRgb.hex(KColor.bgHex), 0.72)
        val ink = KRgb.hex("#794244").inverted.mix(KRgb.hex(KColor.textHex), 0.55)
        assertEquals("#183e3e", bg.hex)
        assertEquals("#c3dbd7", ink.hex)
    }
}
