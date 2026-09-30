package com.tromwey.kura.designsystem.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KFixedChrome
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KShadow
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraTab
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.LocalReduceMotion
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.kShadow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Twin of ios/Kura/DesignSystem/Components/Chrome.swift, always the iOS 17–25 flat fallback.

// MARK: Top chrome ─────────────────────────────────────────────────────────────────────────

/**
 * Top chrome of a pushed screen: Volver (left) and [right] (Opciones, compartir…) as 44 chips at
 * 64 from the screen's TOP EDGE (not the status bar inset — edge-to-edge, like iOS) and 24 from
 * the sides. Overlay it on the screen (a `Box` sibling above the scroll content).
 */
@Composable
fun KuraTopBar(onBack: (() -> Unit)?, modifier: Modifier = Modifier, right: @Composable RowScope.() -> Unit = {}) {
    KFixedChrome {
        Row(
            modifier.fillMaxWidth().padding(top = KSize.chromeTop, start = KSize.chromeSide, end = KSize.chromeSide),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) BackChip(onBack)
            Spacer(Modifier.weight(1f))
            right()
        }
    }
}

/**
 * The band under the clock (and under Volver on a fixed-chrome page) where scrolled content fades
 * out (iOS `TopVeil`): the page's OWN surface, solid to [solid] and clear by [end] — at rest it
 * paints what's already there; scrolled, it separates chrome from content. Not a glow, not glass.
 * Defaults = fixed Volver/Opciones (solid to 64, clear by 124); chips that scroll away: 46 / 64.
 * Put it in the root `Box` above the scroll content and below [KuraTopBar].
 */
@Composable
fun TopVeil(modifier: Modifier = Modifier, color: Color = KColor.bg, solid: Dp = KSize.chromeTop, end: Dp = KSize.pushedTitleTop) {
    val stop = (solid / end).coerceIn(0f, 1f)
    Box(
        modifier
            .fillMaxWidth()
            .height(end)
            .clearAndSetSemantics { }
            .background(Brush.verticalGradient(0f to color, stop to color, 1f to color.copy(alpha = 0f))),
    )
}

/**
 * A tab root's title row ("tus colecciones"): Newsreader 36 at [KSize.titleTop] on the 20 margin;
 * the trailing chip is centered on the title at 24 from the side and never moves it.
 */
@Composable
fun TabTitleBar(title: String, modifier: Modifier = Modifier, trailing: @Composable BoxScope.() -> Unit = {}) {
    Box(modifier.fillMaxWidth().padding(top = KSize.titleTop, start = KSize.margin, end = KSize.chromeSide)) {
        BasicText(title, modifier = Modifier.align(Alignment.CenterStart).semantics { heading() }, style = KuraType.screenTitle)
        Box(Modifier.align(Alignment.CenterEnd), content = trailing)
    }
}

// MARK: Dock ───────────────────────────────────────────────────────────────────────────────

/**
 * The floating dock: 4 tabs, `#14141a` at 92 % (flat, no backdrop blur on Android), capsule,
 * float shadow. Selected tab = white .14 fill, text; the rest text-2. Tab change is instant (0 ms,
 * no haptic). [feedDot]: new notifications. Position it at the bottom center, [KSize.dockBottom]
 * above the navigation bar.
 */
@Composable
fun KuraDock(selected: KuraTab, onSelect: (KuraTab) -> Unit, modifier: Modifier = Modifier, feedDot: Boolean = false) {
    KFixedChrome {
        Row(
            modifier
                .kShadow(KShadow.Float, CircleShape)
                .background(KColor.dock, CircleShape)
                .padding(6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            KuraTab.entries.forEach { tab ->
                val on = tab == selected
                val ink = if (on) KColor.text else KColor.text2
                Column(
                    Modifier
                        .kPressable(feel = KPressFeel.Dim, onClickLabel = tab.label) { onSelect(tab) }
                        .semantics(mergeDescendants = true) { this.selected = on }
                        .background(if (on) KColor.dockActive else Color.Transparent, CircleShape)
                        .padding(vertical = 10.dp, horizontal = 22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Box {
                        Image(tab.icon, contentDescription = null, modifier = Modifier.size(21.dp), colorFilter = ColorFilter.tint(ink))
                        if (feedDot && tab == KuraTab.Feed) {
                            Box(Modifier.align(Alignment.TopEnd).offset(x = 3.dp, y = (-1).dp).size(7.dp).background(KColor.text, CircleShape))
                        }
                    }
                    BasicText(tab.label, style = KuraType.ui(10f, UiWeight.Medium).copy(fontSize = KuraType.fixed(10f), color = ink), maxLines = 1)
                }
            }
        }
    }
}

// MARK: Toast ("avisos") ───────────────────────────────────────────────────────────────────

/** What a toast offers: nothing ([Info]), Deshacer ([Undo]) or Reintentar with the triangle ([Retry]). */
enum class ToastKind { Info, Undo, Retry }

/** One toast. [id] must change for every new toast (the timer and the animation key on it). */
data class KuraToastModel(val id: Long, val text: String, val kind: ToastKind = ToastKind.Undo, val action: (() -> Unit)? = null)

/** The toast pill: s2 capsule, min 52, Hanken 15, action in mono, float shadow. */
@Composable
fun KuraToast(text: String, modifier: Modifier = Modifier, kind: ToastKind = ToastKind.Undo, onAction: (() -> Unit)? = null) {
    KFixedChrome {
        Row(
            modifier
                .fillMaxWidth()
                .kShadow(KShadow.Float, CircleShape)
                .background(KColor.s2, CircleShape)
                .heightIn(min = 52.dp)
                .padding(start = 18.dp, end = 8.dp)
                .semantics(mergeDescendants = false) { liveRegion = LiveRegionMode.Polite },
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (kind == ToastKind.Retry) GlyphIcon(Glyph.Warn, size = 15.dp)
            BasicText(text, modifier = Modifier.weight(1f).padding(vertical = 8.dp), style = KuraType.ui(15f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (onAction != null && kind != ToastKind.Info) {
                KuraTextButton(if (kind == ToastKind.Retry) "Reintentar" else "Deshacer", onAction, mono = true)
            }
        }
    }
}

/**
 * Hosts the one toast over the dock (iOS `ToastHost`): slides up + fades in (a fade with reduce
 * motion), stays [KMotion.undoWindowMs] (15 s with TalkBack), then calls [onTimeout] — the store
 * commits a deferred write there. [dockVisible] lifts it above the dock. Put it at the bottom of
 * the root `Box`.
 */
@Composable
fun KuraToastHost(toast: KuraToastModel?, onTimeout: (KuraToastModel) -> Unit, modifier: Modifier = Modifier, dockVisible: Boolean = true) {
    val reduce = LocalReduceMotion.current
    val context = LocalContext.current
    var shown by remember { mutableStateOf(toast) }
    if (toast != null) shown = toast
    if (toast != null) {
        LaunchedEffect(toast.id) {
            delay(KMotion.undoWindowMs(context))
            onTimeout(toast)
        }
    }
    AnimatedVisibility(
        visible = toast != null,
        modifier = modifier.navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = if (dockVisible) KSize.toastOverDock else 12.dp),
        enter = if (reduce) fadeIn(KMotion.fade()) else slideInVertically(KMotion.snappy()) { it } + fadeIn(KMotion.fade()),
        exit = if (reduce) fadeOut(KMotion.fade()) else slideOutVertically(KMotion.snappy()) { it } + fadeOut(KMotion.fade()),
    ) {
        shown?.let { t -> KuraToast(t.text, kind = t.kind, onAction = t.action) }
    }
}

// MARK: Sheets ─────────────────────────────────────────────────────────────────────────────

/** Compact = floating s2 card inset 8, radius 36 all round; Tall = s1, radius 36 on top (Agregar). */
enum class KuraSheetStyle { Compact, Tall }

/** What a sheet's content can do besides laying out a column: [close] slides it down, then dismisses. */
class KuraSheetScope internal constructor(column: ColumnScope, private val onClose: () -> Unit) : ColumnScope by column {
    fun close() = onClose()
}

/**
 * A Kura sheet on Material's `ModalBottomSheet` (technical base only — nothing Material shows):
 * s2/s1 fill, own 36×5 grabber, radius 36, scrim `rgba(4,4,6,.32)`, no border, no tonal tint.
 * Dismisses by dragging or tapping the scrim ([onDismiss] runs once it's gone); the content's
 * `close()` does the same from a button. One at a time: a sheet that opens another replaces it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KuraSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    style: KuraSheetStyle = KuraSheetStyle.Compact,
    content: @Composable KuraSheetScope.() -> Unit,
) {
    val compact = style == KuraSheetStyle.Compact
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val close: () -> Unit = {
        scope.launch { sheetState.hide() }.invokeOnCompletion { if (!sheetState.isVisible) onDismiss() }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = if (compact) modifier.padding(horizontal = 8.dp).padding(bottom = 8.dp) else modifier,
        sheetState = sheetState,
        shape = if (compact) RoundedCornerShape(KRadius.sheet) else RoundedCornerShape(topStart = KRadius.sheet, topEnd = KRadius.sheet),
        containerColor = if (compact) KColor.s2 else KColor.s1,
        contentColor = KColor.text,
        tonalElevation = 0.dp,
        scrimColor = KColor.scrim,
        dragHandle = { Grabber(Modifier.padding(top = 10.dp, bottom = 8.dp)) },
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(bottom = if (compact) 26.dp else 0.dp).navigationBarsPadding()) {
            KuraSheetScope(this, close).content()
        }
    }
}

/** The sheet grabber, 36×5, white .18. */
@Composable
fun Grabber(modifier: Modifier = Modifier) {
    Box(modifier.clearAndSetSemantics { }.size(36.dp, 5.dp).background(KColor.grabber, CircleShape))
}

/** Header row of a sheet: Newsreader 26 (or italic 22) + optional mono trailing + 36 close chip. */
@Composable
fun SheetHeader(title: String, modifier: Modifier = Modifier, italic: Boolean = false, trailing: String? = null, onClose: (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(start = 10.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(
            title,
            modifier = Modifier.weight(1f).semantics { heading() },
            style = if (italic) KuraType.newsItalic(22f) else KuraType.news(26f),
            maxLines = 2,
        )
        if (trailing != null) MonoLabel(trailing)
        if (onClose != null) IconChip44(KIcon.Close, "Cerrar", onClose, size = 36.dp, iconSize = 14.dp)
    }
}

/** The hairline between groups of sheet rows (1, margin 6 · 12) — a content divider (allowed). */
@Composable
fun SheetDivider(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).height(1.dp).background(KColor.sheetDivider))
}

/** 54 sheet row: icon (or a DS glyph) in a 24 slot, label Hanken 16/500, optional trailing. Row press = fill. */
@Composable
fun SheetRow(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: KIcon? = null,
    glyph: Glyph? = null,
    iconColor: Color = KColor.text,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier
            .fillMaxWidth()
            .kPressable(feel = KPressFeel.Row(0.dp), onClick = onClick)
            .heightIn(min = 54.dp)
            .padding(horizontal = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(24.dp), contentAlignment = Alignment.Center) {
            when {
                glyph != null -> GlyphIcon(glyph, size = 16.dp)
                icon != null -> KIconView(icon, size = 19.dp, color = iconColor)
            }
        }
        BasicText(label, modifier = Modifier.weight(1f), style = KuraType.row, maxLines = 1, overflow = TextOverflow.Ellipsis)
        trailing()
    }
}

// MARK: Offline strip ──────────────────────────────────────────────────────────────────────

/** "Sin conexión. Ves lo guardado en tu teléfono." — s1, radius 18, above the content. */
@Composable
fun OfflineStrip(modifier: Modifier = Modifier, text: String = "Sin conexión. Ves lo guardado en tu teléfono.") {
    Row(
        modifier.fillMaxWidth().background(KColor.s1, RoundedCornerShape(KRadius.surface)).heightIn(min = 44.dp).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        KIconView(KIcon.WifiSlash, size = 17.dp)
        BasicText(text, modifier = Modifier.weight(1f).padding(vertical = 10.dp), style = KuraType.ui(14f).copy(color = KColor.text2))
    }
}

/**
 * Where the dock floats: bottom center, 10 above the navigation bar inset (= the DS's 34 from the
 * screen edge on a gesture-nav phone, whose inset is 24). `KuraDock(…, Modifier.align(BottomCenter).kDockPosition())`.
 */
fun Modifier.kDockPosition(): Modifier = navigationBarsPadding().padding(bottom = 10.dp)

/** How far the dock reaches above the navigation bar (its ~70 height + 10): pad scroll content with it (+ the nav inset). */
val DockReach: Dp = 80.dp
