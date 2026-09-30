package com.tromwey.kura.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.Tint

/** Which recipe of the one tinted surface (sistema-de-diseno · superficie teñida). */
sealed interface TintStyle {
    /** 168° between the two ends — feed cards, collection cards, blocks inside a page. */
    data object Card : TintStyle

    /**
     * A header outside the feed: 168° (or 180° with [vertical]) that fades into `bg` in its last
     * third — `linear-gradient(168deg, a, b 66%, #0b0b0d)`.
     */
    data class Header(val vertical: Boolean = false) : TintStyle

    /**
     * A whole page (iOS `FeedSurface`, founder's "degradado único" 2026-09-27): tone 1 at the
     * top-left, tone 2 by [span] along the 168° line, then the page continues in tone 2. 760 on
     * Tus colecciones, 900 elsewhere. Put it BEHIND the scroll content so it scrolls with it.
     */
    data class Feed(val span: Dp = 900.dp) : TintStyle
}

/**
 * The only way color enters the UI: a cover's palette dragged toward black, `k = 1 − 0.45·0.78`
 * (`Tint` in Tokens.kt, twin of iOS `Tint`). No palette = no color (`bg`, or s1 → bg for a
 * header). No glow, no blur, no aura, no borders.
 */
@Composable
fun TintedSurface(
    palette: List<String>?,
    modifier: Modifier = Modifier,
    style: TintStyle = TintStyle.Card,
    shape: Shape = RectangleShape,
    content: @Composable BoxScope.() -> Unit = {},
) {
    Box(modifier.kTint(palette, style, shape), content = content)
}

/** [TintedSurface] as a modifier (background only). */
@Composable
fun Modifier.kTint(palette: List<String>?, style: TintStyle = TintStyle.Card, shape: Shape = RectangleShape): Modifier {
    val density = LocalDensity.current.density
    val brush: Brush = remember(palette, style, density) {
        when (style) {
            TintStyle.Card -> if (palette.isNullOrEmpty()) null else Tint.card(palette)
            is TintStyle.Header -> Tint.header(palette, style.vertical)
            is TintStyle.Feed -> Tint.feed(palette.orEmpty(), style.span, density)
        } ?: androidx.compose.ui.graphics.SolidColor(KColor.s1)
    }
    return background(brush, shape)
}

/**
 * The color a page wears under its surface, faded 240 ms when the first cover's palette arrives
 * ("el tinte entra con fundido de 240 ms"). Use it for flat fills that follow the tint (the
 * dock's band, an overscroll fill).
 */
@Composable
fun animatedTintTail(palette: List<String>?): androidx.compose.ui.graphics.Color {
    val target = Tint.feedTail(palette.orEmpty())
    val c by animateColorAsState(target, KMotion.tint(), label = "tintTail")
    return c
}
