package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KShadow
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.kShadow

// Twin of ios/Kura/DesignSystem/Components/Cover.swift.

/** A cover's native form: poster 2:3 (film, series) or record 1:1 (album). */
enum class CoverShape(val aspect: Float) { Poster(2f / 3f), Album(1f) }

/**
 * What the design system needs to draw a title's cover — screens map their model to this (the DS
 * never depends on `data/`). [palette] = the cover's two (or more) dominant hex, first = tone 1.
 */
@Immutable
data class CoverArt(
    val id: String,
    val name: String,
    val url: String?,
    val palette: List<String>,
    val shape: CoverShape = CoverShape.Poster,
)

/** What sits on a cover's top-left corner (iOS `CoverBadge`). */
sealed interface CoverBadge {
    data object None : CoverBadge
    /** Grid pill: 26 circle, glass-art, the state glyph at 13 (obsesión / me gusta / completo). */
    data class State(val glyph: Glyph) : CoverBadge
    /** Waiting pill: clock + "14 h" / "16 oct". */
    data class Waiting(val label: String) : CoverBadge
    /** Selection number (onboarding "Elige 3"). */
    data class Number(val n: Int) : CoverBadge
    /** Plain check (chosen cover). */
    data object Chosen : CoverBadge
}

/**
 * A cover: the image, the palette as a 160° gradient while it loads or if it fails, the DS radius
 * (cover-l 14 by default, cover-s 8 in rows/grids) and the cover shadow. Size: give [width] or
 * [height] (the other comes from the shape), or [fluid] to fill the width at the shape's aspect.
 * [onMissingPalette] runs once when the palette is empty (the store extracts it on-device).
 */
@Composable
fun Cover(
    art: CoverArt,
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp? = null,
    radius: Dp = KRadius.coverL,
    badge: CoverBadge = CoverBadge.None,
    shadow: Boolean = true,
    badgeHeight: Dp = 26.dp,
    fluid: Boolean = false,
    onMissingPalette: ((CoverArt) -> Unit)? = null,
) {
    if (onMissingPalette != null && art.palette.isEmpty()) {
        LaunchedEffect(art.id) { onMissingPalette(art) }
    }
    val shape = RoundedCornerShape(radius)
    val a = art.shape.aspect
    val sized = when {
        fluid -> Modifier.fillMaxWidth().aspectRatio(a)
        width != null && height != null -> Modifier.size(width, height)
        width != null -> Modifier.size(width, width / a)
        height != null -> Modifier.size(height * a, height)
        else -> Modifier.size(100.dp, 100.dp / a)
    }
    Box(
        modifier
            .then(sized)
            .then(if (shadow) Modifier.kShadow(KShadow.Cover, shape) else Modifier)
            .clip(shape)
            .clearAndSetSemantics { contentDescription = coverDescription(art.name, badge) },
    ) {
        CoverImage(art.url, art.palette, Modifier.fillMaxSize())
        CoverBadgeView(badge, badgeHeight, Modifier.align(Alignment.TopStart).padding(6.dp))
    }
}

private fun coverDescription(name: String, badge: CoverBadge): String = when (badge) {
    is CoverBadge.State -> "$name, ${badge.glyph.meaning}"
    is CoverBadge.Waiting -> "$name, sale ${badge.label}"
    else -> name
}

@Composable
private fun CoverBadgeView(badge: CoverBadge, badgeHeight: Dp, modifier: Modifier) {
    when (badge) {
        CoverBadge.None -> Unit
        is CoverBadge.State -> ArtCircle(modifier, 26.dp) { GlyphIcon(badge.glyph, size = 13.dp) }
        is CoverBadge.Waiting -> WaitingPill(badge.label, modifier, badgeHeight)
        is CoverBadge.Number -> ArtCircle(modifier, 26.dp) { BasicText("${badge.n}", style = KuraType.mono(12f)) }
        CoverBadge.Chosen -> ArtCircle(modifier, 26.dp) { KIconView(KIcon.CheckBold, size = 13.dp) }
    }
}

/**
 * The image itself over its palette fallback (160° between the two raw hex). The image fades in
 * over 240 ms (the tint timing) the first time; from Coil's memory cache it appears at once.
 * Coil decodes at the drawn size (never the CDN's 600×600 for a 40 thumb).
 */
@Composable
fun CoverImage(url: String?, palette: List<String>, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val fallback = remember(palette) { com.tromwey.kura.designsystem.Tint.coverFallback(palette) }
    Box(modifier.background(fallback)) {
        if (url != null) {
            val request = remember(url) { ImageRequest.Builder(context).data(url).crossfade(240).build() }
            AsyncImage(model = request, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

/** A dashed empty slot with "+" (the only borders allowed: mock affordances). */
@Composable
fun EmptyCoverSlot(modifier: Modifier = Modifier, width: Dp = 160.dp, height: Dp = 240.dp, radius: Dp = KRadius.coverL, plus: Boolean = true) {
    Box(
        modifier
            .size(width, height)
            .background(Color.White.copy(alpha = 0.03f), RoundedCornerShape(radius))
            .dashedOutline(radius),
        contentAlignment = Alignment.Center,
    ) {
        if (plus) KIconView(KIcon.Plus, size = 26.dp, color = KColor.text2)
    }
}

/** The dashed mock-affordance outline (1.5, dash 6/5, white .18). Exempt from "no borders". */
fun Modifier.dashedOutline(radius: Dp): Modifier = drawBehind {
    val w = 1.5.dp.toPx()
    val r = radius.toPx()
    drawRoundRect(
        color = Color.White.copy(alpha = 0.18f),
        topLeft = androidx.compose.ui.geometry.Offset(w / 2, w / 2),
        size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w),
        cornerRadius = CornerRadius(r, r),
        style = Stroke(width = w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))),
    )
}
