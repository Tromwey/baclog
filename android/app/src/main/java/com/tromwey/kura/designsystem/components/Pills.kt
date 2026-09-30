package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.EsMx
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KuraType

// Twin of ios/Kura/DesignSystem/Components/Pills.swift (+ the badges of Cover.swift).
// Heights come from `font + 2·v` (CSS `line-height: 1`), never from vertical padding — see
// frontend.md § "Píldoras y botones · auditoría de padding medida".

/** The DS's glass mono pills (sistema-de-diseno · pillVariants), one spec per variant. */
object KPill {
    data class Spec(val glyph: Dp, val font: Float, val v: Dp, val h: Dp, val gap: Dp) {
        val height: Dp get() = font.dp + v * 2
    }

    /** Card: glifo 13 · mono 12 · 9/14 · gap 8 → 30 high (feed, cabecera de obra, hoja de completar). */
    val card = Spec(glyph = 13.dp, font = 12f, v = 9.dp, h = 14.dp, gap = 8.dp)

    /** Ribbon: glifo 12 · conteo mono 12 · 7/12 · gap 7 → 26 high (perfil). */
    val ribbon = Spec(glyph = 12.dp, font = 12f, v = 7.dp, h = 12.dp, gap = 7.dp)
}

/** Card pill (`KPill.card`): glyph + UPPERCASE mono label on glass. Max two per object. */
@Composable
fun StatusPill(glyph: Glyph, label: String, modifier: Modifier = Modifier) {
    val s = KPill.card
    Row(
        modifier.clearAndSetSemantics { contentDescription = label }.height(s.height).background(KColor.glassBg, CircleShape).padding(horizontal = s.h),
        horizontalArrangement = Arrangement.spacedBy(s.gap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlyphIcon(glyph, size = s.glyph)
        BasicText(label.uppercase(EsMx), style = KuraType.mono(s.font, tracking = 0.06f), maxLines = 1)
    }
}

/** Ribbon pill (`KPill.ribbon`): glyph + a count, the profile's one count per state. */
@Composable
fun RibbonPill(glyph: Glyph, value: String, modifier: Modifier = Modifier) {
    val s = KPill.ribbon
    Row(
        modifier.height(s.height).background(KColor.glassBg, CircleShape).padding(horizontal = s.h),
        horizontalArrangement = Arrangement.spacedBy(s.gap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlyphIcon(glyph, size = s.glyph)
        BasicText(value, style = KuraType.mono(s.font), maxLines = 1)
    }
}

/** "Denso": glyph 14 + mono 12 count in text-2, no container, wrapping (the ficha's ribbon). */
@Composable
fun CountRibbon(items: List<Pair<Glyph, String>>, modifier: Modifier = Modifier, contentDescription: String? = null) {
    FlowRow(
        modifier.then(if (contentDescription != null) Modifier.clearAndSetSemantics { this.contentDescription = contentDescription } else Modifier),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items.forEach { (g, n) ->
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                GlyphIcon(g, size = 14.dp)
                BasicText(n, style = KuraType.mono(12f).copy(color = KColor.text2))
            }
        }
    }
}

/**
 * Glass-art: the one surface for small badges ON artwork — `rgba(11,11,13,.5)`, dark on every
 * OS. iOS lays it over a blur; Android draws it flat (no backdrop blur in Compose).
 */
fun Modifier.kArtGlass(shape: Shape = CircleShape): Modifier = background(KColor.glassArt, shape)

/** Glass-art circle over artwork (grid pill: 26, glyph 13). */
@Composable
fun ArtCircle(modifier: Modifier = Modifier, size: Dp = 26.dp, content: @Composable BoxScope.() -> Unit) {
    Box(modifier.size(size).kArtGlass(CircleShape), contentAlignment = Alignment.Center, content = content)
}

/** Clock + date over a cover ("no puedo esperar"): "14 h" / "16 oct". Mono 11 (10 under 26). */
@Composable
fun WaitingPill(label: String, modifier: Modifier = Modifier, height: Dp = 26.dp) {
    Row(
        modifier.height(height).kArtGlass(CircleShape).padding(start = 7.dp, end = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlyphIcon(Glyph.Clock, size = 12.5.dp)
        BasicText(label.uppercase(EsMx), style = KuraType.mono(if (height < 26.dp) 10f else 11f, tracking = 0.04f), maxLines = 1)
    }
}

/** "auto" — the automatic collection's pill ("no puedo esperar"): clock 12 + mono 10, art glass. */
@Composable
fun AutoPill(modifier: Modifier = Modifier) {
    Row(
        modifier.height(24.dp).kArtGlass(CircleShape).padding(horizontal = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlyphIcon(Glyph.Clock, size = 12.dp)
        BasicText("AUTO", style = KuraType.mono(10f, tracking = 0.08f), maxLines = 1)
    }
}

/**
 * Mono state pill without a glyph (e.g. "SOLO YO", "NUEVA"): the card spec's box, text-2 by default.
 * For a pill with a glyph use [StatusPill].
 */
@Composable
fun MonoPill(label: String, modifier: Modifier = Modifier, selected: Boolean = false) {
    val s = KPill.card
    Box(
        modifier.height(s.height).background(if (selected) KColor.glassSelected else KColor.glassBg, CircleShape).padding(horizontal = s.h),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(label.uppercase(EsMx), style = KuraType.mono(11f, tracking = 0.08f).copy(color = if (selected) KColor.text else KColor.text2), maxLines = 1)
    }
}
