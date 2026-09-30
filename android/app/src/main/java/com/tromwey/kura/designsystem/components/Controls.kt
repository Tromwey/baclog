// Material 3 Expressive detrás de nombres Kura: MonoSegmented = ButtonGroup conectado de ToggleButton · ChipRow = FilterChip · KuraSwitch = Switch · KuraTextField = TextField (filled, sin línea) · GroupedList/SettingsRow = SegmentedListItem · KuraSearchBar = SearchBar + ExpandedFullScreenSearchBar.
// Revertir: git show android-cromo-kura-v1:android/app/src/main/java/com/tromwey/kura/designsystem/components/Controls.kt > android/app/src/main/java/com/tromwey/kura/designsystem/components/Controls.kt
@file:OptIn(ExperimentalMaterial3ExpressiveApi::class, ExperimentalMaterial3Api::class)

package com.tromwey.kura.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material3.ButtonGroup
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.ExpandedFullScreenSearchBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.ListItemShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.SearchBarValue
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.ToggleButtonDefaults
import androidx.compose.material3.rememberSearchBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
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
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.rememberKHaptic

// Twin of ios/Kura/DesignSystem/Components/Controls.swift (+ GlassField from Chrome.swift) in NAME
// and signature; inside, Material 3 Expressive themed by KuraTheme.

/**
 * Mono segmented control (Todas / Cine / Series / Música) — a connected `ButtonGroup` of
 * single-choice `ToggleButton`s, 2 dp apart: the chosen segment fills in text (bg ink), rounds
 * fully and widens a little; labels in Red Hat Mono. Selecting plays `Selection`. [fill] is the
 * unchosen segments' container.
 */
@Composable
fun <T> MonoSegmented(
    options: List<Pair<T, String>>,
    selection: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    height: Dp = 36.dp,
    fill: Color = MaterialTheme.colorScheme.secondaryContainer,
) {
    val haptic = rememberKHaptic()
    val spec = MaterialTheme.motionScheme.fastSpatialSpec<Float>()
    ButtonGroup(
        overflowIndicator = { },
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween),
    ) {
        options.forEachIndexed { i, (value, label) ->
            customItem(
                buttonGroupContent = {
                    val on = value == selection
                    val weight by animateFloatAsState(if (on) 1.2f else 1f, spec, label = "segmentWeight")
                    val source = remember { MutableInteractionSource() }
                    ToggleButton(
                        checked = on,
                        onCheckedChange = {
                            if (!on) {
                                onSelect(value)
                                haptic(KHapticEvent.Selection)
                            }
                        },
                        modifier = Modifier.weight(weight).animateWidth(source).height(height).semantics { role = Role.Tab },
                        shapes = connectedShapes(i, options.size),
                        colors = ToggleButtonDefaults.colors(
                            containerColor = fill,
                            contentColor = KColor.text2,
                            checkedContainerColor = MaterialTheme.colorScheme.primary,
                            checkedContentColor = MaterialTheme.colorScheme.onPrimary,
                        ),
                        contentPadding = PaddingValues(horizontal = 8.dp),
                        interactionSource = source,
                    ) {
                        Text(label.uppercase(EsMx), style = KuraType.mono(11f, tracking = 0.1f).inherit(), maxLines = 1)
                    }
                },
                menuContent = { },
            )
        }
    }
}

/** Scrolling row of `FilterChip`s (Todo / Cine / Series / Música / Personas), 40 high, mono labels. */
@Composable
fun <T> ChipRow(options: List<Pair<T, String>>, selection: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val haptic = rememberKHaptic()
    Row(
        modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = KSize.margin),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (value, label) ->
            val on = value == selection
            FilterChip(
                selected = on,
                onClick = {
                    onSelect(value)
                    haptic(KHapticEvent.Selection)
                },
                label = { Text(label.uppercase(EsMx), style = KuraType.mono(11f, tracking = 0.1f).inherit(), maxLines = 1) },
                modifier = Modifier.height(40.dp).semantics { role = Role.Tab },
                shape = CircleShape,
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    labelColor = KColor.text2,
                    selectedContainerColor = MaterialTheme.colorScheme.primary,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                ),
                border = null,
            )
        }
    }
}

/**
 * The switch — Material's `Switch`: on = salvia track (Kura's "hecho" green — honey is once per
 * screen and a settings list has several) with a bg thumb carrying a salvia check; off = s2 track,
 * text-3 thumb and outline (the system's, the only outline in Kura). Turning it on plays `Tap`.
 * [label] is what TalkBack reads.
 */
@Composable
fun KuraSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, label: String, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val haptic = rememberKHaptic()
    Switch(
        checked = checked,
        onCheckedChange = { on ->
            onCheckedChange(on)
            if (on) haptic(KHapticEvent.Tap)
        },
        modifier = modifier.semantics { contentDescription = label },
        enabled = enabled,
        thumbContent = if (checked) {
            { KIconView(KIcon.CheckBold, size = SwitchDefaults.IconSize, color = KColor.completed) }
        } else {
            null
        },
        colors = SwitchDefaults.colors(
            checkedThumbColor = KColor.bg,
            checkedTrackColor = KColor.completed,
            checkedBorderColor = Color.Transparent,
            checkedIconColor = KColor.completed,
            uncheckedThumbColor = KColor.text3,
            uncheckedTrackColor = KColor.s2,
            uncheckedBorderColor = KColor.text3,
            disabledCheckedTrackColor = KColor.completed.copy(alpha = 0.38f),
            disabledUncheckedTrackColor = KColor.s2,
        ),
    )
}

/**
 * Text field — Material's filled `TextField` with no indicator line (no borders): radius 16, s2 at
 * rest, a brighter fill on focus (fill change, like Kura), optional floating [label] (pizarra when
 * focused), [error] under it in `KColor.fieldError` (Material's `error` role — never red).
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
    label: String? = null,
    error: String? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val style = if (serif) KuraType.news(20f) else KuraType.ui(16f)
    val clear = clearable && value.isNotEmpty()
    TextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth().then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier),
        textStyle = style,
        label = label?.let { { Text(it, style = KuraType.ui(12f).inherit()) } },
        placeholder = { Text(placeholder, style = style.inherit(), maxLines = 1) },
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 4.dp)) {
                if (clear) IconChip44(KIcon.Close, "Borrar texto", { onValueChange("") }, size = 32.dp, iconSize = 13.dp, fill = Color.Transparent, iconColor = KColor.text2)
                trailing()
            }
        },
        supportingText = error?.let { { Text(it, style = KuraType.ui(13f).inherit()) } },
        isError = error != null,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = keyboardActions,
        singleLine = true,
        shape = RoundedCornerShape(KRadius.field),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = KColor.glassFocused,
            unfocusedContainerColor = KColor.s2,
            disabledContainerColor = KColor.s2,
            errorContainerColor = KColor.s2,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent,
            errorIndicatorColor = Color.Transparent,
            cursorColor = KColor.text,
            focusedLabelColor = KColor.liked,
            unfocusedLabelColor = KColor.text3,
            focusedPlaceholderColor = KColor.text3,
            unfocusedPlaceholderColor = KColor.text3,
            focusedTextColor = KColor.text,
            unfocusedTextColor = KColor.text,
            errorLabelColor = KColor.fieldError,
            errorSupportingTextColor = KColor.fieldError,
            errorCursorColor = KColor.fieldError,
        ),
    )
}

/** Whether a row sits inside a [GroupedList] (its rows become segments; dividers become the 2 dp slot). */
private val LocalInGroupedList = staticCompositionLocalOf { false }

/**
 * Grouped settings list — Material's segmented list: rows are `SegmentedListItem`s on s1, 2 dp
 * apart, big corners (18) at the top of the first and the bottom of the last, small ones inside
 * (Android 16's Ajustes). The group clips the outer corners, so rows don't need their index.
 */
@Composable
fun GroupedList(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    CompositionLocalProvider(LocalInGroupedList provides true) {
        Column(
            modifier.fillMaxWidth().clip(RoundedCornerShape(KRadius.surface)),
            verticalArrangement = Arrangement.spacedBy(ListItemDefaults.SegmentedGap),
            content = content,
        )
    }
}

/**
 * Content hairline between rows (white .06, inset 16) — allowed: content divider. Inside a
 * [GroupedList] it draws nothing: the segmented list's 2 dp slot already separates the rows.
 */
@Composable
fun ListDivider(modifier: Modifier = Modifier, inset: Dp = 16.dp) {
    if (LocalInGroupedList.current) return
    Box(modifier.fillMaxWidth().padding(start = inset).height(1.dp).background(KColor.listDivider))
}

/**
 * A settings row — `SegmentedListItem`: title (+ note in 13 text-2), trailing value/chevron or a
 * switch; with [onClick], ripple + the pressed corner morph. On s1 inside a [GroupedList];
 * transparent on its own.
 */
@Composable
fun SettingsRow(
    title: String,
    modifier: Modifier = Modifier,
    note: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val grouped = LocalInGroupedList.current
    val inner = RoundedCornerShape(4.dp)
    val shapes = ListItemShapes(
        shape = inner,
        selectedShape = inner,
        pressedShape = RoundedCornerShape(KRadius.surface),
        focusedShape = inner,
        hoveredShape = inner,
        draggedShape = RoundedCornerShape(KRadius.surface),
    )
    val colors = ListItemDefaults.segmentedColors(
        containerColor = if (grouped) KColor.s1 else Color.Transparent,
        contentColor = KColor.text,
        supportingContentColor = KColor.text2,
        trailingContentColor = KColor.text2,
    )
    val supporting: (@Composable () -> Unit)? = note?.let { { Text(it, style = KuraType.note.inherit()) } }
    val trail: @Composable () -> Unit = { Row(verticalAlignment = Alignment.CenterVertically, content = trailing) }
    val padding = PaddingValues(start = 16.dp, end = 14.dp, top = 8.dp, bottom = 8.dp)
    if (onClick != null) {
        SegmentedListItem(
            onClick = onClick,
            shapes = shapes,
            modifier = modifier.fillMaxWidth(),
            supportingContent = supporting,
            trailingContent = trail,
            colors = colors,
            contentPadding = padding,
        ) { Text(title, style = KuraType.body16.inherit()) }
    } else {
        SegmentedListItem(
            shapes = shapes,
            modifier = modifier.fillMaxWidth(),
            supportingContent = supporting,
            trailingContent = trail,
            colors = colors,
            contentPadding = padding,
        ) { Text(title, style = KuraType.body16.inherit()) }
    }
}

/** Value + chevron for a settings row (`chevronRight` pushes a page, [KIcon.ChevronUpDown] opens choices). */
@Composable
fun RowValue(text: String, modifier: Modifier = Modifier, icon: KIcon = KIcon.ChevronRight) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = KuraType.ui(15f).copy(color = KColor.text2), maxLines = 1)
        KIconView(icon, size = 14.dp, color = KColor.text2)
    }
}

/**
 * Descubrir's search — Material's `SearchBar` (56 pill on s1) that opens into an
 * `ExpandedFullScreenSearchBar` with Material's transition; [content] fills the expanded page
 * (recientes, resultados). Controlled from outside like a Kura field: [query] / [onQueryChange]
 * and [expanded] / [onExpandedChange] (system back collapses it and reports `false`).
 */
@Composable
fun KuraSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Busca una película, serie o álbum",
    onSearch: (String) -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    val state = rememberSearchBarState(initialValue = if (expanded) SearchBarValue.Expanded else SearchBarValue.Collapsed)
    val text = rememberTextFieldState(query)
    val latestQuery by rememberUpdatedState(query)
    val latestOnQuery by rememberUpdatedState(onQueryChange)
    val latestOnExpanded by rememberUpdatedState(onExpandedChange)
    LaunchedEffect(query) { if (text.text.toString() != query) text.setTextAndPlaceCursorAtEnd(query) }
    LaunchedEffect(text) { snapshotFlow { text.text.toString() }.collect { if (it != latestQuery) latestOnQuery(it) } }
    LaunchedEffect(expanded) { if (expanded) state.animateToExpanded() else state.animateToCollapsed() }
    LaunchedEffect(state) { snapshotFlow { state.currentValue }.collect { latestOnExpanded(it == SearchBarValue.Expanded) } }

    val inputColors = SearchBarDefaults.inputFieldColors(
        focusedTextColor = KColor.text,
        unfocusedTextColor = KColor.text,
        cursorColor = KColor.text,
        focusedPlaceholderColor = KColor.text3,
        unfocusedPlaceholderColor = KColor.text3,
        focusedLeadingIconColor = KColor.text2,
        unfocusedLeadingIconColor = KColor.text2,
    )
    val input: @Composable () -> Unit = {
        SearchBarDefaults.InputField(
            textFieldState = text,
            searchBarState = state,
            onSearch = onSearch,
            textStyle = KuraType.ui(16f),
            placeholder = { Text(placeholder, style = KuraType.ui(16f).inherit(), maxLines = 1) },
            leadingIcon = { KIconView(KIcon.Search, size = 18.dp, color = KColor.text2) },
            colors = inputColors,
        )
    }
    SearchBar(
        state = state,
        inputField = input,
        modifier = modifier,
        colors = SearchBarDefaults.colors(containerColor = KColor.s1, dividerColor = Color.Transparent),
    )
    ExpandedFullScreenSearchBar(
        state = state,
        inputField = input,
        colors = SearchBarDefaults.colors(containerColor = KColor.bg, dividerColor = KColor.sheetDivider),
        content = content,
    )
}
