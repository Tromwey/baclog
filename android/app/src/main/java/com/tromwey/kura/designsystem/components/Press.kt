package com.tromwey.kura.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KHaptic
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.LocalReduceMotion

// CONTENT ONLY since 2026-09-30 (android/BRIEF.md › "El cromo es Material 3 Expressive"): every
// button, chip, tab, field and chrome row is a Material component with its own ripple + shape
// morph (designsystem/components/Buttons.kt, Controls.kt, Chrome.kt, ButtonGroups.kt). `kPressable`
// stays for what SHOWS content and isn't Material — covers, cards, the fan, masonry tiles, content
// rows (FanPickRow) — and there it keeps Kura's no-ripple press. Never put it on a new button:
// use `GlassButton` / `SolidButton` / `IconChip44` / `KuraTextButton`.

/**
 * How a pressed piece of content reads (iOS `KPressFeel`): covers and cards dim + shrink
 * ([Scale]); full-width content rows get the row fill instead ([Row]) — a shrinking row looks
 * broken. [Row.inset]: how far the fill sits inside the row's bounds (negative bleeds past them).
 * [Dim]: dim only (content whose shape must not move).
 */
sealed interface KPressFeel {
    data object Scale : KPressFeel
    data object Dim : KPressFeel
    data class Row(val inset: Dp = 8.dp) : KPressFeel
}

/**
 * Tap (and optional long press) on CONTENT with touch-down feedback and no ripple (iOS `kPressable`):
 * press-in is instant, release springs back with `KMotion.release`; with reduce motion only the
 * dim stays. Scrolling still wins (the press cancels once the finger travels). A long press
 * that fires plays `KHapticEvent.Firm` through `KHaptic`. TalkBack gets a button with
 * [onClickLabel] and, when there's a long press, the "Opciones" action ([onLongClickLabel]).
 */
fun Modifier.kPressable(
    feel: KPressFeel = KPressFeel.Scale,
    enabled: Boolean = true,
    role: Role? = Role.Button,
    onClickLabel: String? = null,
    onLongClickLabel: String? = "Opciones",
    onLongPress: (() -> Unit)? = null,
    onClick: () -> Unit,
): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val reduce = LocalReduceMotion.current
    val view = LocalView.current
    val scaleFeel = feel == KPressFeel.Scale || feel == KPressFeel.Dim
    val alpha by animateFloatAsState(
        targetValue = if (scaleFeel && pressed) 0.72f else 1f,
        animationSpec = if (pressed) snap() else KMotion.release(),
        label = "kPressAlpha",
    )
    val scale by animateFloatAsState(
        targetValue = if (feel == KPressFeel.Scale && pressed && !reduce) 0.97f else 1f,
        animationSpec = if (pressed) snap() else KMotion.release(),
        label = "kPressScale",
    )
    val rowFill by animateFloatAsState(
        targetValue = if (feel is KPressFeel.Row && pressed) 1f else 0f,
        animationSpec = if (pressed) snap() else KMotion.fade(),
        label = "kPressRow",
    )
    val density = LocalDensity.current
    val base = if (feel is KPressFeel.Row) {
        val insetPx = with(density) { feel.inset.toPx() }
        val r = with(density) { KRadius.surface.toPx() }
        Modifier.drawBehind {
            if (rowFill > 0f) {
                drawRoundRect(
                    color = KColor.rowPressed.copy(alpha = KColor.rowPressed.alpha * rowFill),
                    topLeft = Offset(insetPx, 0f),
                    size = Size(size.width - 2 * insetPx, size.height),
                    cornerRadius = CornerRadius(r, r),
                )
            }
        }
    } else {
        Modifier.graphicsLayer {
            this.alpha = alpha
            scaleX = scale
            scaleY = scale
        }
    }
    base.combinedClickable(
        interactionSource = source,
        indication = null,
        enabled = enabled,
        onClickLabel = onClickLabel,
        role = role,
        onLongClickLabel = if (onLongPress != null) onLongClickLabel else null,
        onLongClick = onLongPress?.let { hold -> { KHaptic.play(view, KHapticEvent.Firm); hold() } },
        hapticFeedbackEnabled = false,
        onClick = onClick,
    )
}

/** The pressed fill of a sheet/settings row, as a plain background (for rows drawn by hand). */
fun Modifier.kRowPressedFill(pressed: Boolean): Modifier =
    if (pressed) background(KColor.rowPressed, RoundedCornerShape(KRadius.surface)) else this
