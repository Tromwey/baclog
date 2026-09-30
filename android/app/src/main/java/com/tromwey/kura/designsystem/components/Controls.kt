package com.tromwey.kura.designsystem.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.EsMx
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KShadow
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.kShadow
import com.tromwey.kura.designsystem.rememberKHaptic

// Twin of ios/Kura/DesignSystem/Components/Controls.swift (+ GlassField from Chrome.swift).

/**
 * Mono segmented control on a glass track (Todas / Cine / Series / Música): segments 36 high,
 * the selected one filled white .14 (fill change, no border). Selecting plays `Selection`.
 */
@Composable
fun <T> MonoSegmented(
    options: List<Pair<T, String>>,
    selection: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 36.dp,
    fill: androidx.compose.ui.graphics.Color = KColor.glassBg,
) {
    val haptic = rememberKHaptic()
    Row(modifier.fillMaxWidth().background(fill, CircleShape).padding(5.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEach { (value, label) ->
            val on = value == selection
            val bg by animateColorAsState(if (on) KColor.dockActive else androidx.compose.ui.graphics.Color.Transparent, KMotion.fade(), label = "segment")
            Box(
                Modifier
                    .weight(1f)
                    .height(height)
                    .clip(CircleShape)
                    .background(bg)
                    .semantics { this.selected = on }
                    .kPressable(feel = KPressFeel.Dim, role = Role.Tab) {
                        if (!on) {
                            onSelect(value)
                            haptic(KHapticEvent.Selection)
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                BasicText(label.uppercase(EsMx), style = KuraType.mono(11f, tracking = 0.1f).copy(color = if (on) KColor.text else KColor.text2), maxLines = 1)
            }
        }
    }
}

/** Scrolling mono chip row (Todo / Cine / Series / Música / Personas), 40 high, 44 touch. */
@Composable
fun <T> ChipRow(options: List<Pair<T, String>>, selection: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val haptic = rememberKHaptic()
    Row(
        modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = KSize.margin),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (value, label) ->
            val on = value == selection
            Box(
                Modifier
                    .semantics { this.selected = on }
                    .kPressable(feel = KPressFeel.Dim, role = Role.Tab) {
                        onSelect(value)
                        haptic(KHapticEvent.Selection)
                    }
                    .padding(vertical = 2.dp)
                    .height(40.dp)
                    .background(if (on) KColor.glassSelected else KColor.glassBg, CircleShape)
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                BasicText(label.uppercase(EsMx), style = KuraType.mono(11f, tracking = 0.1f).copy(color = if (on) KColor.text else KColor.text2), maxLines = 1)
            }
        }
    }
}

/**
 * The switch: on = salvia (Kura's "hecho" green — honey is once per screen and a settings list
 * has several), off = white .14; the knob is text. 51×31 like the iOS control it mirrors, knob
 * slides with `snappy` (a fade under reduce motion is not needed: the knob's move IS the state).
 * Turning it on plays `Tap`. [label] is what TalkBack reads.
 */
@Composable
fun KuraSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, label: String, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val haptic = rememberKHaptic()
    val track by animateColorAsState(if (checked) KColor.completed else KColor.dockActive, KMotion.fade(), label = "switchTrack")
    val x by animateDpAsState(if (checked) 22.dp else 2.dp, KMotion.snappy(), label = "switchKnob")
    Box(
        modifier
            .heightIn(min = KSize.touch)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { on ->
                onCheckedChange(on)
                if (on) haptic(KHapticEvent.Tap)
            }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(51.dp, 31.dp).background(track, CircleShape)) {
            Box(
                Modifier
                    .offset(x = x, y = 2.dp)
                    .size(27.dp)
                    .kShadow(KShadow.Control, CircleShape, opacity = 0.5f)
                    .background(if (enabled) KColor.text else KColor.text3, CircleShape),
            )
        }
    }
}

/**
 * Glass text field: radius 16, 52 high, no border; focus = the fill brightens (white .075 → .12).
 * [serif] = Newsreader 20 (a collection name), otherwise Hanken 16. [clearable] adds the "x".
 */
@Composable
fun KuraTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    serif: Boolean = false,
    clearable: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Done,
    focusRequester: FocusRequester? = null,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val fill by animateColorAsState(if (focused) KColor.glassFocused else KColor.glassBg, KMotion.fade(), label = "fieldFill")
    val style = if (serif) KuraType.news(20f) else KuraType.ui(16f)
    Row(
        modifier.fillMaxWidth().height(52.dp).background(fill, RoundedCornerShape(KRadius.field)).padding(start = 18.dp, end = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f).then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier),
            textStyle = style,
            singleLine = true,
            cursorBrush = SolidColor(KColor.text),
            interactionSource = source,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, keyboardType = keyboardType, imeAction = imeAction),
            keyboardActions = keyboardActions,
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) BasicText(placeholder, style = style.copy(color = KColor.text3), maxLines = 1)
                    inner()
                }
            },
        )
        if (clearable && value.isNotEmpty()) {
            Box(
                Modifier.size(KSize.touch).kPressable(feel = KPressFeel.Dim, onClickLabel = "Borrar texto") { onValueChange("") },
                contentAlignment = Alignment.Center,
            ) { KIconView(KIcon.Close, size = 14.dp, color = KColor.text2) }
        }
        trailing()
    }
}

/** Grouped settings list: s1, radius 18, rows separated by [ListDivider]. */
@Composable
fun GroupedList(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(KRadius.surface)).background(KColor.s1), content = content)
}

/** Content hairline between grouped rows (white .06, inset 16) — allowed: content divider. */
@Composable
fun ListDivider(modifier: Modifier = Modifier, inset: Dp = 16.dp) {
    Box(modifier.fillMaxWidth().padding(start = inset).height(1.dp).background(KColor.listDivider))
}

/** A 52 settings row: title (+ note in 13 text-2), trailing value/chevron or a switch. */
@Composable
fun SettingsRow(
    title: String,
    modifier: Modifier = Modifier,
    note: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.kPressable(feel = KPressFeel.Row(0.dp), onClick = onClick) else Modifier)
            .heightIn(min = KSize.rowSettings)
            .padding(start = 16.dp, end = 14.dp, top = if (note == null) 0.dp else 8.dp, bottom = if (note == null) 0.dp else 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(title, style = KuraType.body16)
            if (note != null) BasicText(note, style = KuraType.note)
        }
        trailing()
    }
}

/** Value + chevron for a settings row (`chevronRight` pushes a page, [KIcon.ChevronUpDown] opens choices). */
@Composable
fun RowValue(text: String, modifier: Modifier = Modifier, icon: KIcon = KIcon.ChevronRight) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        BasicText(text, style = KuraType.ui(15f).copy(color = KColor.text2), maxLines = 1)
        KIconView(icon, size = 14.dp, color = KColor.text2)
    }
}
