// Material 3 Expressive detrás de nombres Kura: GlassButton = FilledTonalButton · SolidButton/HoneyButton = Button (primary / tertiary) · IconChip44/BackChip = FilledTonalIconButton · KuraTextButton = TextButton · FollowButton = Button tertiary / FilledTonalButton · SaveChip = FilledTonalButton / FilledTonalIconButton · RadioDot = RadioButton · RadioMark = Checkbox.
// Revertir: git show android-cromo-kura-v1:android/app/src/main/java/com/tromwey/kura/designsystem/components/Buttons.kt > android/app/src/main/java/com/tromwey/kura/designsystem/components/Buttons.kt
@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ButtonShapes
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.IconButtonShapes
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight

// Twin of ios/Kura/DesignSystem/Components/Buttons.swift in NAME and signature; inside, Material 3
// Expressive themed by KuraTheme (android/BRIEF.md › "El cromo es Material 3 Expressive"). At rest they
// read like Kura (flat fills, no border, Hanken 600); pressed, the pill closes its corners to 14
// (`shapes.small`) with Material's ripple instead of Kura's hand-made scale. No shadows, no glows.

/** Kura's press morph for every pill button: round at rest, `shapes.small` (14) while pressed. */
@Composable
internal fun kuraButtonShapes(): ButtonShapes = ButtonDefaults.shapes(shape = CircleShape, pressedShape = MaterialTheme.shapes.small)

/** Same morph for the 44 icon chips: circle → 14 while pressed. */
@Composable
internal fun kuraIconShapes(): IconButtonShapes = IconButtonDefaults.shapes(shape = CircleShape, pressedShape = MaterialTheme.shapes.small)

/** A Kura text style whose color comes from the Material component (content / disabled color). */
internal fun TextStyle.inherit(): TextStyle = copy(color = Color.Unspecified)

/**
 * Tonal pill button (was "glass") — `FilledTonalButton` on `secondaryContainer` (s2), Hanken 600,
 * 44 high, padding 14|16 · 16. [glyph] (a DS glyph in its color) or [icon] (an interface icon)
 * leads; [trailingIcon] trails. [fill] overrides the container (e.g. `KColor.glassBg` over a tint).
 */
@Composable
fun GlassButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: KIcon? = null,
    glyph: Glyph? = null,
    trailingIcon: KIcon? = null,
    height: Dp = 44.dp,
    fontSize: Float = 15f,
    fullWidth: Boolean = false,
    fill: Color = MaterialTheme.colorScheme.secondaryContainer,
    enabled: Boolean = true,
) {
    val lead = glyph != null || icon != null
    FilledTonalButton(
        onClick = onClick,
        shapes = kuraButtonShapes(),
        modifier = modifier.then(if (fullWidth) Modifier.fillMaxWidth() else Modifier).height(height),
        enabled = enabled,
        colors = ButtonDefaults.filledTonalButtonColors(
            containerColor = fill,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            disabledContainerColor = fill,
            disabledContentColor = KColor.text2,
        ),
        contentPadding = PaddingValues(start = if (lead) 14.dp else 16.dp, end = 16.dp),
    ) {
        if (glyph != null) {
            GlyphIcon(glyph, size = 16.dp)
            Spacer(Modifier.width(8.dp))
        }
        if (icon != null) {
            KIconView(icon, size = 17.dp, color = LocalContentColor.current)
            Spacer(Modifier.width(8.dp))
        }
        Text(title, style = KuraType.ui(fontSize, UiWeight.SemiBold).inherit(), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (trailingIcon != null) {
            Spacer(Modifier.width(8.dp))
            KIconView(trailingIcon, size = 15.dp, color = LocalContentColor.current)
        }
    }
}

/**
 * The one primary action — `Button` with `primary` (text) / `onPrimary` (bg), 52 high, full width.
 * [honey] = the screen's ONE accent action: `tertiary` (miel) / `onTertiary`. Disabled = text at
 * .38 with bg ink at .6.
 */
@Composable
fun SolidButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: KIcon? = null,
    height: Dp = 52.dp,
    enabled: Boolean = true,
    honey: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    Button(
        onClick = onClick,
        shapes = kuraButtonShapes(),
        modifier = modifier.fillMaxWidth().height(height),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (honey) scheme.tertiary else scheme.primary,
            contentColor = if (honey) scheme.onTertiary else scheme.onPrimary,
            // Disabled reads as "the same button, not yet": text at .38 with bg ink at .6 (distinct
            // from the tonal s2 buttons, and visible on an s2 sheet). No border.
            disabledContainerColor = KColor.text.copy(alpha = 0.38f),
            disabledContentColor = KColor.bg.copy(alpha = 0.6f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        if (icon != null) {
            KIconView(icon, size = 18.dp, color = LocalContentColor.current)
            Spacer(Modifier.width(8.dp))
        }
        Text(title, style = KuraType.ui(16f, UiWeight.SemiBold).inherit(), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** [SolidButton] in honey (`tertiary`) — the screen's one accent action. */
@Composable
fun HoneyButton(title: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: KIcon? = null, height: Dp = 52.dp, enabled: Boolean = true) =
    SolidButton(title, onClick, modifier, icon, height, enabled, honey = true)

/**
 * 44 round icon chip (Volver, Opciones, +, campana, compartir) — `FilledTonalIconButton`, circle →
 * 14 while pressed. [size] < 44 (the 36 close chip of a sheet) still gets Material's 48 touch.
 * [label] is what TalkBack reads.
 */
@Composable
fun IconChip44(
    icon: KIcon,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    iconSize: Dp = 18.dp,
    fill: Color = MaterialTheme.colorScheme.secondaryContainer,
    iconColor: Color = KColor.text,
) {
    FilledTonalIconButton(
        onClick = onClick,
        shapes = kuraIconShapes(),
        modifier = modifier.size(size).semantics { contentDescription = label },
        colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = fill, contentColor = iconColor),
    ) {
        KIconView(icon, size = iconSize, color = iconColor)
    }
}

/** Volver — the 44 chevron chip. */
@Composable
fun BackChip(onClick: () -> Unit, modifier: Modifier = Modifier) =
    IconChip44(KIcon.Back, "Volver", onClick, modifier, iconSize = 20.dp)

/**
 * A text button — `TextButton`: literal Hanken 15/600 (or [mono] 11 uppercase, like Deshacer /
 * Reintentar in a toast), no fill, 44 touch. [color] text by default.
 */
@Composable
fun KuraTextButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    mono: Boolean = false,
    color: Color = KColor.text,
) {
    TextButton(
        onClick = onClick,
        shapes = kuraButtonShapes(),
        modifier = modifier.heightIn(min = KSize.touch),
        colors = ButtonDefaults.textButtonColors(contentColor = color),
        contentPadding = PaddingValues(horizontal = 12.dp),
    ) {
        if (mono) MonoLabel(title, color = color) else Text(title, style = KuraType.ui(15f, UiWeight.SemiBold).inherit(), maxLines = 1)
    }
}

/** Where a follow stands, from the viewer's side (iOS `FollowState`). */
enum class FollowState(val label: String) { Follow("Seguir"), Following("Siguiendo"), Requested("Solicitado") }

/** Sizes of the one Seguir button (iOS `FollowButton.Size`): font · side padding · height. */
enum class FollowSize(val font: Float, val side: Dp, val height: Dp) {
    /** 36 pill in a list row (Descubrir, Avisos, onboarding). */
    Row(14f, 16.dp, 36.dp),
    /** 40 pill in Seguidores / Siguiendo. */
    List(14f, 16.dp, 40.dp),
    /** The feed's suggestion card: honey 44 · 20 · 15. */
    Card(15f, 20.dp, 44.dp),
    /** A profile's hero, 48. */
    Hero(16f, 28.dp, 48.dp),
}

/**
 * The one Seguir button: `Button` in `tertiary` (miel) where the caller spends the screen's one
 * accent ([honey]), `FilledTonalButton` otherwise; Siguiendo / Solicitado are always tonal.
 * [handle] makes TalkBack say "Dejar de seguir a @handle" on Siguiendo. [fill] = the tonal
 * container (s2; on an s2 sheet pass `KColor.glassBg`).
 */
@Composable
fun FollowButton(
    state: FollowState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: FollowSize = FollowSize.Row,
    honey: Boolean = false,
    handle: String? = null,
    fill: Color = KColor.s2,
) {
    val isHoney = state == FollowState.Follow && honey
    val label = if (state == FollowState.Following) handle?.let { "Dejar de seguir a @$it" } ?: "Dejar de seguir" else state.label
    val m = modifier.height(size.height).semantics { contentDescription = label }
    val padding = PaddingValues(horizontal = size.side)
    val text: @Composable () -> Unit = {
        Text(state.label, style = KuraType.ui(size.font, UiWeight.SemiBold).inherit(), maxLines = 1)
    }
    if (isHoney) {
        val scheme = MaterialTheme.colorScheme
        Button(
            onClick = onClick,
            shapes = kuraButtonShapes(),
            modifier = m,
            colors = ButtonDefaults.buttonColors(containerColor = scheme.tertiary, contentColor = scheme.onTertiary),
            contentPadding = padding,
        ) { text() }
    } else {
        FilledTonalButton(
            onClick = onClick,
            shapes = kuraButtonShapes(),
            modifier = m,
            colors = ButtonDefaults.filledTonalButtonColors(containerColor = fill, contentColor = KColor.text),
            contentPadding = padding,
        ) { text() }
    }
}

/** The two shapes of the one "guardar" affordance (iOS `SaveChip.Style`). */
enum class SaveChipStyle { Pill, Icon }

/**
 * The one "guardar un título" affordance (frontend.md § "Guardar un título"): the bookmark,
 * outlined until the title is in ≥ 1 collection ([count]), then filled with the count. Tonal
 * (`FilledTonalButton`, or `FilledTonalIconButton` for the empty 44 circle). No haptic: opening the
 * sheet is silent.
 * [Pill]: "Guardar" / "En 1 colección" / "En N colecciones" (ficha, recomendada).
 * [Icon]: 44 circle; saved keeps the fill as a 44 capsule with the count in mono (lists).
 */
@Composable
fun SaveChip(
    count: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: SaveChipStyle = SaveChipStyle.Icon,
    compact: Boolean = false,
) {
    val a11y = when (count) {
        0 -> "Guardar"
        1 -> "Guardado en 1 colección"
        else -> "Guardado en $count colecciones"
    }
    val mark: @Composable (Dp) -> Unit = { s ->
        if (count > 0) GlyphIcon(Glyph.Bookmark, size = s, color = KColor.text) else KIconView(KIcon.BookmarkOutline, size = s)
    }
    val base = modifier.semantics {
        contentDescription = a11y
        if (count > 0) {
            onClick(label = "Cambiar colecciones") {
                onClick()
                true
            }
        }
    }
    when (style) {
        SaveChipStyle.Pill -> FilledTonalButton(
            onClick = onClick,
            shapes = kuraButtonShapes(),
            modifier = base.height(44.dp),
            contentPadding = PaddingValues(start = if (compact) 12.dp else 14.dp, end = if (compact) 14.dp else 16.dp),
        ) {
            mark(16.dp)
            Spacer(Modifier.width(8.dp))
            Text(
                when (count) {
                    0 -> "Guardar"
                    1 -> "En 1 colección"
                    else -> "En $count colecciones"
                },
                style = KuraType.ui(if (compact) 14f else 15f, UiWeight.SemiBold).inherit(),
                maxLines = 1,
            )
        }
        SaveChipStyle.Icon -> if (count > 0) {
            FilledTonalButton(
                onClick = onClick,
                shapes = kuraButtonShapes(),
                modifier = base.height(44.dp),
                contentPadding = PaddingValues(start = 11.dp, end = 13.dp),
            ) {
                mark(16.dp)
                Spacer(Modifier.width(5.dp))
                Text("$count", style = KuraType.mono(12f).copy(color = KColor.text2))
            }
        } else {
            FilledTonalIconButton(onClick = onClick, shapes = kuraIconShapes(), modifier = base.size(44.dp)) { mark(17.dp) }
        }
    }
}

/**
 * Multiple choice mark (sheets: "Guardar en", "Mover a") — Material's `Checkbox`, checked in text
 * with a bg check, unchecked in the Kura ring color. Display only: the row carries the click.
 * In a 26 slot so rows keep their Kura geometry.
 */
@Composable
fun RadioMark(on: Boolean, modifier: Modifier = Modifier) {
    Box(modifier.size(26.dp).semantics { selected = on }, contentAlignment = Alignment.Center) {
        Checkbox(
            checked = on,
            onCheckedChange = null,
            colors = CheckboxDefaults.colors(checkedColor = KColor.text, checkmarkColor = KColor.bg, uncheckedColor = KColor.radioRing),
        )
    }
}

/** Single choice mark — Material's `RadioButton` tinted text / Kura ring. Display only; 26 slot. */
@Composable
fun RadioDot(on: Boolean, modifier: Modifier = Modifier) {
    Box(modifier.size(26.dp).semantics { selected = on }, contentAlignment = Alignment.Center) {
        RadioButton(
            selected = on,
            onClick = null,
            colors = RadioButtonDefaults.colors(selectedColor = KColor.text, unselectedColor = KColor.radioRing),
        )
    }
}
