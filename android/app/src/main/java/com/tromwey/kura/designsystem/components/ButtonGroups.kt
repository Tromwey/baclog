// Material 3 Expressive (nuevo, no existía en el cromo Kura plano): ReactionGroup/ActionPair = ButtonGroup conectado de ToggleButton · SplitActionButton = SplitButtonLayout · KuraMenu = DropdownMenu · KuraFab = FloatingActionButton · KuraFabMenu = FloatingActionButtonMenu + ToggleFloatingActionButton.
// Revertir: no hay versión en android-cromo-kura-v1 (git show android-cromo-kura-v1:android/app/src/main/java/com/tromwey/kura/designsystem/components/ButtonGroups.kt falla): borrar el archivo y volver a Fan/Pills en los call sites.
@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package com.tromwey.kura.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.text.style.TextAlign
import com.tromwey.kura.designsystem.KFixedChrome
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonGroup
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.FloatingActionButtonMenu
import androidx.compose.material3.FloatingActionButtonMenuItem
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.SplitButtonDefaults
import androidx.compose.material3.SplitButtonLayout
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.ToggleButtonDefaults
import androidx.compose.material3.ToggleButtonShapes
import androidx.compose.material3.ToggleFloatingActionButton
import androidx.compose.material3.ToggleFloatingActionButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.UiWeight

// Groups and the "create" family. Each is the Material 3 Expressive component, themed by KuraTheme;
// state colors stay Kura (pizarra / coral / salvia) and the one accent stays miel.

/** Connected-group shape for item [i] of [n]: leading · middle · trailing (checked = full round). */
@Composable
internal fun connectedShapes(i: Int, n: Int): ToggleButtonShapes = when {
    n == 1 -> ButtonGroupDefaults.connectedLeadingButtonShapes()
    i == 0 -> ButtonGroupDefaults.connectedLeadingButtonShapes()
    i == n - 1 -> ButtonGroupDefaults.connectedTrailingButtonShapes()
    else -> ButtonGroupDefaults.connectedMiddleButtonShapes()
}

/**
 * The three exclusive reactions of "Completar" (iOS `ReactionSlider`'s stops), in their order. The
 * design system never depends on `data/`: `app/UiSupport.kt` maps `Mark` ↔ [KuraReaction].
 */
enum class KuraReaction(val glyph: Glyph, val label: String) {
    Completed(Glyph.Check, "Solo completo"),
    Liked(Glyph.Thumb, "Me gusta"),
    Obsessed(Glyph.Flame, "Me obsesiona"),
    ;

    /** The state color (pizarra / coral / salvia) — the glyph's own. */
    val color: Color get() = glyph.color
}

/**
 * Solo completo / Me gusta / Me obsesiona (founder's order, like iOS) — a connected `ButtonGroup` of three single-choice
 * `ToggleButton`s (replaces the hand-made reaction slider). The chosen one fills with its state
 * color and shows glyph + text; the other two shrink to the glyph. The group animates the widths
 * with the motion scheme. No haptic here: the store plays the reaction's (`StoreHaptic.Reaction`).
 * [containerColor] fills the unchosen ones: s2 on a page; on an s2 sheet pass `KColor.glassBg`
 * (or s1) or they vanish into it.
 */
@Composable
fun ReactionGroup(selected: KuraReaction?, onSelect: (KuraReaction) -> Unit, modifier: Modifier = Modifier, containerColor: Color = KColor.glassBg) {
    val entries = KuraReaction.entries
    val spec = MaterialTheme.motionScheme.fastSpatialSpec<Float>()
    ButtonGroup(
        overflowIndicator = { },
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween),
    ) {
        entries.forEachIndexed { i, r ->
            customItem(
                buttonGroupContent = {
                    val on = r == selected
                    val weight by animateFloatAsState(if (on) 2.4f else 1f, spec, label = "reactionWeight")
                    val source = remember { MutableInteractionSource() }
                    ToggleButton(
                        checked = on,
                        onCheckedChange = { if (!on) onSelect(r) },
                        modifier = Modifier
                            .weight(weight)
                            .animateWidth(source)
                            .height(48.dp)
                            .semantics {
                                role = Role.RadioButton
                                contentDescription = r.label
                            },
                        shapes = connectedShapes(i, entries.size),
                        colors = ToggleButtonDefaults.colors(
                            containerColor = containerColor,
                            contentColor = KColor.text,
                            checkedContainerColor = r.color,
                            checkedContentColor = KColor.bg,
                        ),
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        interactionSource = source,
                    ) {
                        GlyphIcon(r.glyph, size = 17.dp, color = if (on) KColor.bg else null)
                        if (on) {
                            Spacer(Modifier.width(8.dp))
                            Text(r.label, style = KuraType.ui(15f, UiWeight.SemiBold).inherit(), maxLines = 1)
                        }
                    }
                },
                menuContent = { },
            )
        }
    }
}

/** One side of an [ActionPair]: its label, glyph and whether it's on. [checkedColor] fills it when on. */
data class KuraToggle(
    val label: String,
    val checked: Boolean,
    val onCheckedChange: (Boolean) -> Unit,
    val glyph: Glyph? = null,
    val checkedColor: Color = KColor.text,
    val checkedContentColor: Color = KColor.bg,
)

/**
 * The ficha's pair [Completar | Me obsesiona] — a connected `ButtonGroup` of two `ToggleButton`s
 * (2 dp slot). The checked one rounds fully and widens a little while the other gives way.
 * [containerColor] fills the unchecked side (s2; `KColor.glassBg` on an s2 sheet).
 */
@Composable
fun ActionPair(primary: KuraToggle, secondary: KuraToggle, modifier: Modifier = Modifier, containerColor: Color = KColor.glassBg) =
    // Two halves of a phone's width: past 1.3× the labels ("Me obsesiona", "Tu reseña") would be cut,
    // so the pair tops out there and wraps to two lines (at word breaks) before cutting.
    KFixedChrome(maxFontScale = 1.3f) { ActionPairBody(primary, secondary, modifier, containerColor) }

@Composable
private fun ActionPairBody(primary: KuraToggle, secondary: KuraToggle, modifier: Modifier, containerColor: Color) {
    val items = listOf(primary, secondary)
    val spec = MaterialTheme.motionScheme.fastSpatialSpec<Float>()
    ButtonGroup(
        overflowIndicator = { },
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween),
    ) {
        items.forEachIndexed { i, t ->
            customItem(
                buttonGroupContent = {
                    val weight by animateFloatAsState(if (t.checked) 1.18f else 1f, spec, label = "pairWeight")
                    val source = remember { MutableInteractionSource() }
                    ToggleButton(
                        checked = t.checked,
                        onCheckedChange = t.onCheckedChange,
                        modifier = Modifier.weight(weight).animateWidth(source).heightIn(min = 48.dp).semantics { contentDescription = t.label },
                        shapes = connectedShapes(i, items.size),
                        colors = ToggleButtonDefaults.colors(
                            containerColor = containerColor,
                            contentColor = KColor.text,
                            checkedContainerColor = t.checkedColor,
                            checkedContentColor = t.checkedContentColor,
                        ),
                        contentPadding = PaddingValues(horizontal = 14.dp),
                        interactionSource = source,
                    ) {
                        if (t.glyph != null) {
                            GlyphIcon(t.glyph, size = 16.dp, color = if (t.checked) t.checkedContentColor else null)
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(
                            t.label,
                            style = KuraType.ui(15f, UiWeight.SemiBold).inherit().copy(textAlign = TextAlign.Center),
                            maxLines = 2,
                        )
                    }
                },
                menuContent = { },
            )
        }
    }
}

/**
 * The most frequent action a tap away and the rest behind the arrow — `SplitButtonLayout` with
 * `SplitButtonDefaults.LeadingButton` / `TrailingButton` (solid: `primary`), the arrow turns when
 * the menu opens. Compartir ("Copiar link" ▾ Historia, Más) and "Guardar en" (last collection ▾ others).
 */
@Composable
fun SplitActionButton(
    label: String,
    onClick: () -> Unit,
    menu: List<Pair<String, () -> Unit>>,
    modifier: Modifier = Modifier,
    icon: KIcon? = null,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val turn by animateFloatAsState(if (open) 270f else 90f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "splitArrow")
    SplitButtonLayout(
        leadingButton = {
            SplitButtonDefaults.LeadingButton(onClick = onClick, modifier = Modifier.heightIn(min = 44.dp)) {
                if (icon != null) {
                    KIconView(icon, size = 17.dp, color = LocalContentColor.current)
                    Spacer(Modifier.width(8.dp))
                }
                Text(label, style = KuraType.ui(15f, UiWeight.SemiBold).inherit(), maxLines = 1)
            }
        },
        trailingButton = {
            Box {
                SplitButtonDefaults.TrailingButton(
                    checked = open,
                    onCheckedChange = { open = it },
                    modifier = Modifier.heightIn(min = 44.dp).semantics {
                        contentDescription = "Más opciones"
                        stateDescription = if (open) "Abierto" else "Cerrado"
                    },
                ) {
                    KIconView(KIcon.ChevronRight, Modifier.graphicsLayer { rotationZ = turn }, size = 16.dp, color = LocalContentColor.current)
                }
                DropdownMenu(
                    expanded = open,
                    onDismissRequest = { open = false },
                    shape = MaterialTheme.shapes.medium,
                    containerColor = KColor.s2,
                ) {
                    menu.forEach { (text, action) ->
                        DropdownMenuItem(
                            text = { Text(text, style = KuraType.row.inherit()) },
                            onClick = {
                                open = false
                                action()
                            },
                        )
                    }
                }
            }
        },
        modifier = modifier,
    )
}

/** One entry of a [KuraMenu]. [destructive] ones go last, after a hairline — never red (Kura has no red). */
data class KuraMenuItem(
    val label: String,
    val icon: KIcon? = null,
    val destructive: Boolean = false,
    val onClick: () -> Unit,
)

/**
 * A contextual menu (the "…" of a review, options on a row) — Material's `DropdownMenu` themed
 * Kura: s2, radius 18, no border, no tonal tint, Material's ripple on each row, Hanken 16/500.
 * It anchors to its parent: put it in the same `Box` as the chip that opens it. Picking an item
 * closes the menu ([onDismiss]) and then runs it. Destructive items (Reportar, Bloquear) are
 * grouped last under a hairline and keep the text color, like iOS' `ReviewMenu` (no red role).
 */
@Composable
fun KuraMenu(expanded: Boolean, onDismiss: () -> Unit, items: List<KuraMenuItem>, modifier: Modifier = Modifier) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
        modifier = modifier,
        shape = RoundedCornerShape(KRadius.surface),
        containerColor = KColor.s2,
        tonalElevation = 0.dp,
        border = null,
    ) {
        val (safe, destructive) = items.partition { !it.destructive }
        (safe + destructive).forEachIndexed { i, item ->
            if (item.destructive && i == safe.size && safe.isNotEmpty()) {
                Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).height(1.dp).background(KColor.sheetDivider))
            }
            DropdownMenuItem(
                text = { Text(item.label, style = KuraType.row.inherit(), maxLines = 1) },
                onClick = {
                    onDismiss()
                    item.onClick()
                },
                leadingIcon = item.icon?.let { icon -> { KIconView(icon, size = 19.dp, color = KColor.text) } },
                colors = MenuDefaults.itemColors(textColor = KColor.text, leadingIconColor = KColor.text),
                contentPadding = PaddingValues(horizontal = 16.dp),
            )
        }
    }
}

/**
 * Android's canonical "create" — `FloatingActionButton`, 16 corners, TONAL: s2 with the "+" in
 * miel (founder, 2026-10-01: the solid cream one was the brightest thing on the page and beat the
 * fan to the eye). Inside a collection: "Agregar". [label] is what TalkBack reads.
 */
@Composable
fun KuraFab(onClick: () -> Unit, modifier: Modifier = Modifier, icon: KIcon = KIcon.Plus, label: String = "Agregar") {
    FloatingActionButton(
        onClick = onClick,
        modifier = modifier.semantics { contentDescription = label },
        shape = RoundedCornerShape(16.dp),
        // Glass ON art (black at 50 %): the covers it floats over show through, darkened.
        containerColor = KColor.glassArt,
        contentColor = KColor.accent,
        elevation = FloatingActionButtonDefaults.elevation(0.dp, 0.dp, 0.dp, 0.dp),
    ) {
        KIconView(icon, size = 24.dp, color = LocalContentColor.current)
    }
}

/** One action of a [KuraFabMenu]. */
data class KuraFabItem(val label: String, val icon: KIcon, val onClick: () -> Unit)

/**
 * Tus colecciones' "+" — `FloatingActionButtonMenu` with a `ToggleFloatingActionButton`: closed it's
 * the tonal 16-corner FAB (s2, "+" in miel); open it turns into an s2 pill, the "+" rotates to a close in text, and
 * the [items] (Agregar títulos, Nueva colección) unfold above it as tonal pills.
 */
@Composable
fun KuraFabMenu(items: List<KuraFabItem>, modifier: Modifier = Modifier, startExpanded: Boolean = false) {
    var open by rememberSaveable { mutableStateOf(startExpanded) }
    FloatingActionButtonMenu(
        expanded = open,
        button = {
            ToggleFloatingActionButton(
                checked = open,
                onCheckedChange = { open = it },
                modifier = Modifier.semantics {
                    contentDescription = if (open) "Cerrar" else "Crear"
                },
                containerColor = ToggleFloatingActionButtonDefaults.containerColor(
                    initialColor = KColor.glassArt,
                    finalColor = KColor.s2,
                ),
            ) {
                val p = checkedProgress
                KIconView(
                    KIcon.Plus,
                    Modifier.graphicsLayer { rotationZ = 45f * p },
                    size = 24.dp,
                    color = lerp(KColor.accent, KColor.text, p),
                )
            }
        },
        modifier = modifier,
    ) {
        items.forEach { item ->
            FloatingActionButtonMenuItem(
                onClick = {
                    open = false
                    item.onClick()
                },
                text = { Text(item.label, style = KuraType.ui(15f, UiWeight.SemiBold).inherit()) },
                icon = { KIconView(item.icon, Modifier.size(20.dp), size = 20.dp, color = LocalContentColor.current) },
                containerColor = KColor.s2,
                contentColor = KColor.text,
            )
        }
    }
}
