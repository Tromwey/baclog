package com.tromwey.kura.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.LocalReduceMotion
import com.tromwey.kura.designsystem.EsMx
import com.tromwey.kura.designsystem.rememberKHaptic

// Twin of ios/Kura/DesignSystem/Components/Masonry.swift + the onboarding pick grid.

/**
 * Titles dealt across [columns] in order, each to the currently SHORTEST column (a tie goes to the
 * leftmost), with the tiles' real heights (a 2:3 poster is taller than a 1:1 record) — so reading
 * runs along the rows and no column stays empty while there are enough titles (iOS `ColumnsLayout`).
 */
@Composable
fun ColumnsLayout(modifier: Modifier = Modifier, columns: Int = 3, spacingX: Dp = 12.dp, spacingY: Dp = 18.dp, content: @Composable () -> Unit) {
    Layout(content, modifier) { measurables, constraints ->
        val gapX = spacingX.roundToPx()
        val gapY = spacingY.roundToPx()
        val width = if (constraints.hasBoundedWidth) constraints.maxWidth else 350.dp.roundToPx()
        val colW = maxOf(1, (width - gapX * (columns - 1)) / columns)
        val tops = IntArray(maxOf(1, columns))
        val half = 0.5.dp.roundToPx()
        val placed = measurables.map { m ->
            val p = m.measure(Constraints.fixedWidth(colW))
            var col = 0
            for (c in 1 until tops.size) if (tops[c] < tops[col] - half) col = c
            val y = tops[col]
            tops[col] += p.height + gapY
            Triple(p, col, y)
        }
        val tallest = placed.maxOfOrNull { (p, _, y) -> y + p.height } ?: 0
        layout(width, tallest) {
            placed.forEach { (p, col, y) -> p.placeRelative(col * (colW + gapX), y) }
        }
    }
}

/** What a masonry tile wears: nothing, a state glyph, or the wait pill ("4 d" / "17 oct"). */
sealed interface MasonryBadge {
    data object None : MasonryBadge
    data class State(val glyph: Glyph) : MasonryBadge
    data class Wait(val label: String) : MasonryBadge
}

/**
 * "Títulos en columnas": a collection's titles in three independent columns (gap 12 · 18, 20 on
 * the sides). Each tile: the cover at its native form with the state glyph (24) or the wait pill,
 * and the name in Newsreader italic 14, up to two lines (no year — detail lives in the ficha).
 * [onHold] (the owner's 18c sheet) is optional.
 */
@Composable
fun Masonry(
    titles: List<CoverArt>,
    onOpen: (CoverArt) -> Unit,
    modifier: Modifier = Modifier,
    badge: (CoverArt) -> MasonryBadge = { MasonryBadge.None },
    onHold: ((CoverArt) -> Unit)? = null,
    coverModifier: @Composable (CoverArt) -> Modifier = { Modifier },
) {
    // Windowed (`Windowed.kt`): a collection of hundreds composes its first page, then grows as the
    // page scrolls. Dealing to the shortest column is order-stable, so new tiles never move old ones.
    val window = rememberWindow(titles)
    Column(modifier.fillMaxWidth()) {
        ColumnsLayout(Modifier.fillMaxWidth().padding(horizontal = KSize.margin)) {
            window.visible.forEach { t ->
                key(t.id) {
                    MasonryTile(t, badge(t), onOpen = { onOpen(t) }, onHold = onHold?.let { h -> { h(t) } }, coverModifier = coverModifier(t))
                }
            }
        }
        WindowEnd(window)
    }
}

/** One masonry tile (see [Masonry]). [coverModifier] carries the hero's `kHeroCover` when there is one. */
@Composable
fun MasonryTile(title: CoverArt, badge: MasonryBadge, onOpen: () -> Unit, modifier: Modifier = Modifier, onHold: (() -> Unit)? = null, coverModifier: Modifier = Modifier) {
    val a11y = buildString {
        append(title.name)
        when (badge) {
            is MasonryBadge.State -> append(", ${badge.glyph.meaning}")
            is MasonryBadge.Wait -> append(", sale ${badge.label}")
            MasonryBadge.None -> Unit
        }
    }
    Column(
        modifier.kPressable(onLongPress = onHold, onClick = onOpen).clearAndSetSemantics { contentDescription = a11y },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box {
            Cover(title, coverModifier, fluid = true)
            when (badge) {
                MasonryBadge.None -> Unit
                is MasonryBadge.State -> ArtCircle(Modifier.padding(6.dp), 24.dp) { GlyphIcon(badge.glyph, size = 12.dp) }
                is MasonryBadge.Wait -> Row(
                    Modifier.padding(6.dp).height(24.dp).kArtGlass(CircleShape).padding(horizontal = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    GlyphIcon(Glyph.Clock, size = 12.dp)
                    BasicText(badge.label.uppercase(EsMx), style = KuraType.mono(10f, tracking = 0.04f), maxLines = 1)
                }
            }
        }
        BasicText(title.name, style = KuraType.tileWork, maxLines = 2)
    }
}

/**
 * Onboarding "Elige 3": the catalog in three columns (dealt round-robin, gap 12), covers at
 * cover-s with the pick's number (1–3) top-left. Picked tiles shrink to .95 (a fade under reduce
 * motion); once 3 are picked the rest dim to .38. Picking plays `Selection`; a 4th is refused with
 * `Warning` ("say so in the hand"). The caller owns [picks] (ids, in pick order).
 */
@Composable
fun PickGrid(titles: List<CoverArt>, picks: List<String>, onToggle: (CoverArt) -> Unit, modifier: Modifier = Modifier, max: Int = 3) {
    val haptic = rememberKHaptic()
    val full = picks.size >= max
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        for (col in 0 until 3) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                titles.filterIndexed { i, _ -> i % 3 == col }.forEach { t ->
                    val idx = picks.indexOf(t.id).takeIf { it >= 0 }
                    PickTile(t, idx, dimmed = full && idx == null) {
                        when {
                            idx != null -> { onToggle(t); haptic(KHapticEvent.Selection) }
                            !full -> { onToggle(t); haptic(KHapticEvent.Selection) }
                            else -> haptic(KHapticEvent.Warning)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PickTile(t: CoverArt, idx: Int?, dimmed: Boolean, onClick: () -> Unit) {
    val reduce = LocalReduceMotion.current
    val scale by animateFloatAsState(if (idx != null && !reduce) 0.95f else 1f, KMotion.snappy(), label = "pickScale")
    val alpha by animateFloatAsState(if (dimmed) 0.38f else 1f, KMotion.fade(), label = "pickDim")
    Box(
        Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
            }
            .kPressable(onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = t.name
                selected = idx != null
            },
    ) {
        Cover(t, radius = KRadius.coverS, badge = idx?.let { CoverBadge.Number(it + 1) } ?: CoverBadge.None, fluid = true)
    }
}
