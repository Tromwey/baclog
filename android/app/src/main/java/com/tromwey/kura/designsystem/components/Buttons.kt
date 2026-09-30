package com.tromwey.kura.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight

// Twin of ios/Kura/DesignSystem/Components/Buttons.swift. Android has no Liquid Glass: every
// "glass" control is the iOS 17–25 flat fill (`KColor.glassBg`). No borders, no glows, no ripple.

/**
 * Glass pill button — `rgba(255,255,255,.075)`, Hanken 600, 44 high, padding 14|16 · 16.
 * [glyph] (a DS glyph in its color) or [icon] (an interface icon in text) leads; [trailingIcon] trails.
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
    fill: Color = KColor.glassBg,
    enabled: Boolean = true,
) {
    val lead = glyph != null || icon != null
    Row(
        modifier = modifier
            .kPressable(enabled = enabled, onClick = onClick)
            .then(if (fullWidth) Modifier.fillMaxWidth() else Modifier)
            .height(height)
            .background(fill, CircleShape)
            .padding(start = if (lead) 14.dp else 16.dp, end = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (glyph != null) GlyphIcon(glyph, size = 16.dp)
        if (icon != null) KIconView(icon, size = 17.dp)
        BasicText(title, style = KuraType.ui(fontSize, UiWeight.SemiBold).copy(color = if (enabled) KColor.text else KColor.text2), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (trailingIcon != null) KIconView(trailingIcon, size = 15.dp)
    }
}

/**
 * The one primary action — text fill, bg text, 52 high, full width. [honey] = the screen's ONE
 * accent action (`KColor.accent` + `onAccent`). Disabled = s2 fill, text-2.
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
    val fill by animateColorAsState(
        when {
            !enabled -> KColor.s2
            honey -> KColor.accent
            else -> KColor.text
        },
        KMotion.fade(), label = "solidFill",
    )
    val ink = when {
        !enabled -> KColor.text2
        honey -> KColor.onAccent
        else -> KColor.bg
    }
    Row(
        modifier = modifier
            .kPressable(enabled = enabled, onClick = onClick)
            .fillMaxWidth()
            .height(height)
            .background(fill, CircleShape)
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) KIconView(icon, size = 18.dp, color = ink)
        BasicText(title, style = KuraType.ui(16f, UiWeight.SemiBold).copy(color = ink), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** [SolidButton] in honey — the screen's one accent action. */
@Composable
fun HoneyButton(title: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: KIcon? = null, height: Dp = 52.dp, enabled: Boolean = true) =
    SolidButton(title, onClick, modifier, icon, height, enabled, honey = true)

/**
 * 44 round glass icon chip (Volver, Opciones, +, campana, compartir). [size] < 44 (the 36 close
 * chip of a sheet) still takes a 44 touch. [label] is what TalkBack reads.
 */
@Composable
fun IconChip44(
    icon: KIcon,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    iconSize: Dp = 18.dp,
    fill: Color = KColor.glassBg,
    iconColor: Color = KColor.text,
) {
    Box(
        modifier = modifier
            .size(maxOf(size, KSize.touch))
            .kPressable(onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(size).background(fill, CircleShape), contentAlignment = Alignment.Center) {
            KIconView(icon, size = iconSize, color = iconColor)
        }
    }
}

/** Volver — the 44 chevron chip. */
@Composable
fun BackChip(onClick: () -> Unit, modifier: Modifier = Modifier) =
    IconChip44(KIcon.Back, "Volver", onClick, modifier, iconSize = 20.dp)

/**
 * A text button: literal Hanken 15/600 (or [mono] 11 uppercase, like Deshacer / Reintentar in a
 * toast), no fill, 44 touch. [color] text by default.
 */
@Composable
fun KuraTextButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    mono: Boolean = false,
    color: Color = KColor.text,
) {
    Box(
        modifier = modifier
            .kPressable(feel = KPressFeel.Dim, onClick = onClick)
            .heightIn(min = KSize.touch)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (mono) MonoLabel(title, color = color) else BasicText(title, style = KuraType.ui(15f, UiWeight.SemiBold).copy(color = color), maxLines = 1)
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
 * The one Seguir button: honey where the caller spends the screen's one accent ([honey]),
 * flat glass otherwise; Siguiendo / Solicitado are always flat glass. [handle] makes TalkBack say
 * "Dejar de seguir a @handle" on Siguiendo.
 */
@Composable
fun FollowButton(
    state: FollowState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: FollowSize = FollowSize.Row,
    honey: Boolean = false,
    handle: String? = null,
) {
    val isHoney = state == FollowState.Follow && honey
    val label = if (state == FollowState.Following) handle?.let { "Dejar de seguir a @$it" } ?: "Dejar de seguir" else state.label
    Box(
        modifier = modifier
            .heightIn(min = KSize.touch)
            .kPressable(onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.height(size.height).background(if (isHoney) KColor.accent else KColor.glassBg, CircleShape).padding(horizontal = size.side),
            contentAlignment = Alignment.Center,
        ) {
            BasicText(state.label, style = KuraType.ui(size.font, UiWeight.SemiBold).copy(color = if (isHoney) KColor.onAccent else KColor.text), maxLines = 1)
        }
    }
}

/** The two shapes of the one "guardar" affordance (iOS `SaveChip.Style`). */
enum class SaveChipStyle { Pill, Icon }

/**
 * The one "guardar un título" affordance (frontend.md § "Guardar un título"): the bookmark,
 * outlined until the title is in ≥ 1 collection ([count]), then filled with the count. Flat glass
 * (it's content, never chrome). No haptic: opening the sheet is silent.
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
    val base = modifier.kPressable(onClickLabel = if (count == 0) null else "Cambiar colecciones", onClick = onClick).semantics { contentDescription = a11y }
    when (style) {
        SaveChipStyle.Pill -> Row(
            base.height(44.dp).background(KColor.glassBg, CircleShape).padding(start = if (compact) 12.dp else 14.dp, end = if (compact) 14.dp else 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            mark(16.dp)
            BasicText(
                when (count) {
                    0 -> "Guardar"
                    1 -> "En 1 colección"
                    else -> "En $count colecciones"
                },
                style = KuraType.ui(if (compact) 14f else 15f, UiWeight.SemiBold),
                maxLines = 1,
            )
        }
        SaveChipStyle.Icon -> if (count > 0) {
            Row(
                base.defaultMinSize(minWidth = 44.dp, minHeight = 44.dp).height(44.dp).background(KColor.glassBg, CircleShape).padding(start = 11.dp, end = 13.dp),
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                mark(16.dp)
                BasicText("$count", style = KuraType.mono(12f).copy(color = KColor.text2))
            }
        } else {
            Box(base.size(44.dp).background(KColor.glassBg, CircleShape), contentAlignment = Alignment.Center) { mark(17.dp) }
        }
    }
}

/** Multiple choice mark (sheets): a filled text disc with a check, or a ring. 26. */
@Composable
fun RadioMark(on: Boolean, modifier: Modifier = Modifier) {
    val fill by animateColorAsState(if (on) KColor.text else Color.Transparent, KMotion.fade(), label = "radioMark")
    Box(
        modifier
            .size(26.dp)
            .semantics { selected = on }
            .then(if (on) Modifier else Modifier.border(1.5.dp, KColor.radioRing, CircleShape)) // the ring IS the control's shape (allowed: a radio has no fill to change)
            .background(fill, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (on) KIconView(KIcon.CheckBold, size = 14.dp, color = KColor.bg)
    }
}

/** Single choice mark: a ring with a dot inside when chosen. 26. */
@Composable
fun RadioDot(on: Boolean, modifier: Modifier = Modifier) {
    val ring by animateColorAsState(if (on) KColor.text else KColor.radioRing, KMotion.fade(), label = "radioDot")
    Box(modifier.size(26.dp).semantics { selected = on }.border(1.5.dp, ring, CircleShape), contentAlignment = Alignment.Center) {
        if (on) Box(Modifier.size(12.dp).background(KColor.text, CircleShape))
    }
}
