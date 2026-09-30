// Material 3 Expressive detrás de nombres Kura: KuraTopBar = TopAppBar transparente · TabTitleBar = TopAppBarScrollBehavior (exitUntilCollapsed) con la barra dibujada Kura · KuraDock = ShortNavigationBar · KuraToast/KuraToastHost = Snackbar/SnackbarHost · KuraSheet = ModalBottomSheet · SheetRow = ListItem · KuraScaffold = Scaffold. TopVeil y OfflineStrip siguen Kura.
// Revertir: git show android-cromo-kura-v1:android/app/src/main/java/com/tromwey/kura/designsystem/components/Chrome.kt > android/app/src/main/java/com/tromwey/kura/designsystem/components/Chrome.kt (y devolver kDockPosition/DockReach a app/MainTabs.kt, app/KuraRoot.kt, app/Pending.kt)
@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)

package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SheetValue
import androidx.compose.material3.ShortNavigationBar
import androidx.compose.material3.ShortNavigationBarItem
import androidx.compose.material3.ShortNavigationBarItemDefaults
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.rememberBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
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
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraTab
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Twin of ios/Kura/DesignSystem/Components/Chrome.swift in NAME and signature. The chrome that
// operates the app is Material 3 Expressive themed by KuraTheme; TopVeil and OfflineStrip stay Kura.

// MARK: Frame ──────────────────────────────────────────────────────────────────────────────

/**
 * The app's frame — Material's `Scaffold` on bg: [bottomBar] (the [KuraDock]) glued to the bottom
 * edge, [notices] (the toast host, the offline strip) placed by Material right above it, and the
 * content gets the bar's height as bottom padding. No content insets of its own: screens stay
 * edge-to-edge under the status bar, as they were.
 */
@Composable
fun KuraScaffold(
    modifier: Modifier = Modifier,
    bottomBar: @Composable () -> Unit = {},
    notices: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        bottomBar = bottomBar,
        snackbarHost = notices,
        containerColor = KColor.bg,
        contentColor = KColor.text,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        content = content,
    )
}

// MARK: Top chrome ─────────────────────────────────────────────────────────────────────────

/**
 * Top chrome of a pushed screen — a transparent `TopAppBar` (no title) with Volver (left) and
 * [right] (Opciones, compartir…) as 44 tonal icon buttons, still floating over the content (tinted
 * headers show through) at Kura's place: chips at 64 from the screen's TOP EDGE and 24 from the
 * sides. Overlay it on the screen (a `Box` sibling above the scroll content).
 */
@Composable
fun KuraTopBar(onBack: (() -> Unit)?, modifier: Modifier = Modifier, right: @Composable RowScope.() -> Unit = {}) {
    // TopAppBar keeps 4 at each side; the 44 chip sits in Material's 48 touch (measured on device:
    // 4 + 20 lands the chip's edge at Kura's 24).
    val side = KSize.chromeSide - 4.dp
    KFixedChrome {
        TopAppBar(
            title = {},
            // 64 high, the 44 chips centered in it: its top 10 above the chips' 64.
            modifier = modifier.padding(top = KSize.chromeTop - 10.dp),
            navigationIcon = { if (onBack != null) BackChip(onBack, Modifier.padding(start = side)) },
            actions = {
                Row(Modifier.padding(end = side), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = right)
            },
            expandedHeight = 64.dp,
            windowInsets = WindowInsets(0, 0, 0, 0),
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent, scrolledContainerColor = Color.Transparent),
        )
    }
}

/**
 * The band under the clock (and under Volver on a fixed-chrome page) where scrolled content fades
 * out (iOS `TopVeil`): the page's OWN surface, solid to [solid] and clear by [end] — at rest it
 * paints what's already there; scrolled, it separates chrome from content. Not a glow, not glass.
 * Defaults = fixed Volver/Opciones (solid to 64, clear by 124); chips that scroll away: 46 / 64.
 * Put it in the root `Box` above the scroll content and below [KuraTopBar]. (Kura, not Material.)
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
 * How a tab root's big title collapses as its list scrolls (Material's
 * `exitUntilCollapsedScrollBehavior`). Hand it to [TabTitleBar] and put
 * `Modifier.kuraTitleScroll(it)` on the scrolling container (screens never see Material types).
 */
@Stable
class KuraTitleScroll internal constructor(internal val behavior: TopAppBarScrollBehavior)

@Composable
fun rememberKuraTitleScroll(): KuraTitleScroll {
    val behavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    return remember(behavior) { KuraTitleScroll(behavior) }
}

/** Connects a scrolling container to its [TabTitleBar] (a `nestedScroll`). */
fun Modifier.kuraTitleScroll(scroll: KuraTitleScroll): Modifier = nestedScroll(scroll.behavior.nestedScrollConnection)

/**
 * A tab root's title ("tus colecciones") — Newsreader 36 at Kura's place (its top 68 from the
 * screen's TOP EDGE, like iOS and flujos-v2), driven by Material's `TopAppBarScrollBehavior`
 * (`exitUntilCollapsed`, with its snap and fling): as the list scrolls ([scroll] +
 * `Modifier.kuraTitleScroll`) it collapses to a 56 s1 bar under the status bar with the title at
 * 22. [trailing] (one chip) is centered on the title and never moves it. Without [scroll] it simply
 * stays expanded. Put it ABOVE the scrolling content, not inside it.
 *
 * Why not `LargeFlexibleTopAppBar` drawn by Material: it always reserves its 64 action row ABOVE
 * the big title, which put "tus colecciones" at ~124 from the edge instead of 68 (2026-09-30,
 * measured on the emulator). The behavior, nested scroll and motion are still Material's.
 */
@Composable
fun TabTitleBar(title: String, modifier: Modifier = Modifier, scroll: KuraTitleScroll? = null, trailing: @Composable BoxScope.() -> Unit = {}) {
    val density = LocalDensity.current
    val status = with(density) { WindowInsets.statusBars.getTop(this).toDp() }
    // The title line's top lands at KSize.titleTop (68) from the edge whatever the status bar is.
    val lead = (KSize.titleTop - status).coerceAtLeast(8.dp)
    val titleRow = 46.dp
    val expanded = lead + titleRow
    val collapsed = TabTitleBarCollapsed
    val state = scroll?.behavior?.state
    val range = with(density) { (expanded - collapsed).coerceAtLeast(0.dp).toPx() }
    SideEffect { if (state != null && state.heightOffsetLimit != -range) state.heightOffsetLimit = -range }
    val f = state?.collapsedFraction?.coerceIn(0f, 1f) ?: 0f
    val offset = with(density) { (state?.heightOffset ?: 0f).toDp() }
    Box(
        modifier
            .fillMaxWidth()
            .background(lerp(Color.Transparent, KColor.s1, f))
            .statusBarsPadding()
            .height(expanded + offset)
            .clipToBounds(),
    ) {
        Row(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .height(titleRow + (collapsed - titleRow) * f)
                .padding(start = KSize.margin, end = KSize.chromeSide),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                title,
                modifier = Modifier.weight(1f).semantics { heading() },
                style = KuraType.news(36f + (22f - 36f) * f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Box(content = trailing)
        }
    }
}

/** Height of a collapsed [TabTitleBar] under the status bar. */
private val TabTitleBarCollapsed = 56.dp

// MARK: Dock ───────────────────────────────────────────────────────────────────────────────

/** The navigation bar's geometry, for whoever reserves room for it (the frame's padding). */
object KuraDockDefaults {
    /** Height of the bar above the system navigation inset (Material's short navigation bar, 64). */
    val height: Dp = 64.dp
}

/**
 * The 4 tabs — Material's `ShortNavigationBar`, glued to the bottom edge (founder, 2026-09-30):
 * s1 container, the active tab's icon on an s2 pill indicator, label Hanken 600 in text; the rest
 * text-2. Tab change is instant (0 ms, no haptic). [feedDot]: new notifications, as a `Badge`.
 * Pass it as [KuraScaffold]'s `bottomBar`.
 */
@Composable
fun KuraDock(selected: KuraTab, onSelect: (KuraTab) -> Unit, modifier: Modifier = Modifier, feedDot: Boolean = false) {
    KFixedChrome {
        ShortNavigationBar(
            modifier = modifier,
            containerColor = KColor.s1,
            contentColor = KColor.text,
            windowInsets = NavigationBarDefaults.windowInsets,
        ) {
            KuraTab.entries.forEach { tab ->
                val on = tab == selected
                ShortNavigationBarItem(
                    selected = on,
                    onClick = { onSelect(tab) },
                    icon = {
                        BadgedBox(badge = { if (feedDot && tab == KuraTab.Feed) Badge(containerColor = KColor.text) }) {
                            Icon(tab.icon, contentDescription = null, modifier = Modifier.size(22.dp))
                        }
                    },
                    label = {
                        Text(tab.label, style = KuraType.ui(12f, if (on) UiWeight.SemiBold else UiWeight.Medium).inherit(), maxLines = 1)
                    },
                    colors = ShortNavigationBarItemDefaults.colors(
                        selectedIconColor = KColor.text,
                        selectedTextColorTopIconPosition = KColor.text,
                        selectedIndicatorColor = KColor.s2,
                        unselectedIconColor = KColor.text2,
                        unselectedTextColor = KColor.text2,
                    ),
                )
            }
        }
    }
}

// MARK: Toast ("avisos") ───────────────────────────────────────────────────────────────────

/** What a toast offers: nothing ([Info]), Deshacer ([Undo]) or Reintentar with the triangle ([Retry]). */
enum class ToastKind { Info, Undo, Retry }

/** One toast. [id] must change for every new toast (the timer and the animation key on it). */
data class KuraToastModel(val id: Long, val text: String, val kind: ToastKind = ToastKind.Undo, val action: (() -> Unit)? = null)

/**
 * The toast — Material's `Snackbar`: s2, full width, radius 8 (`shapes.extraSmall`), Hanken 15,
 * the action (DESHACER / REINTENTAR, mono) in miel on the right, the triangle leading a Retry.
 */
@Composable
fun KuraToast(text: String, modifier: Modifier = Modifier, kind: ToastKind = ToastKind.Undo, onAction: (() -> Unit)? = null) {
    KFixedChrome {
        Snackbar(
            modifier = modifier.semantics(mergeDescendants = false) { liveRegion = LiveRegionMode.Polite },
            action = if (onAction != null && kind != ToastKind.Info) {
                { KuraTextButton(if (kind == ToastKind.Retry) "Reintentar" else "Deshacer", onAction, mono = true, color = MaterialTheme.colorScheme.tertiary) }
            } else {
                null
            },
            shape = MaterialTheme.shapes.extraSmall,
            containerColor = KColor.s2,
            contentColor = KColor.text,
            actionContentColor = MaterialTheme.colorScheme.tertiary,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (kind == ToastKind.Retry) GlyphIcon(Glyph.Warn, size = 15.dp)
                Text(text, style = KuraType.ui(15f).inherit(), maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** A Kura toast riding Material's snackbar queue (the host renders it with [KuraToast]). */
private class KuraSnackbarVisuals(val model: KuraToastModel) : SnackbarVisuals {
    override val message: String get() = model.text
    override val actionLabel: String? get() = null
    override val withDismissAction: Boolean get() = false
    // Kura's undo window governs, not Material's durations: the host dismisses it itself.
    override val duration: SnackbarDuration get() = SnackbarDuration.Indefinite
}

/**
 * Hosts the one toast (iOS `ToastHost`) — Material's `SnackbarHost` (its fade + scale in/out).
 * The snackbar is `Indefinite`; the host closes it after [KMotion.undoWindowMs] (15 s with
 * TalkBack) and calls [onTimeout] — the store commits a deferred write there. A new [toast] id
 * replaces the one on screen; `null` closes it. Give it to [KuraScaffold]'s `notices`, which puts
 * it above the bar; [dockVisible] false lifts it over the system navigation bar instead.
 */
@Composable
fun KuraToastHost(toast: KuraToastModel?, onTimeout: (KuraToastModel) -> Unit, modifier: Modifier = Modifier, dockVisible: Boolean = true) {
    val host = remember { SnackbarHostState() }
    val context = LocalContext.current
    val timeout by rememberUpdatedState(onTimeout)
    LaunchedEffect(toast?.id) {
        if (toast == null) {
            host.currentSnackbarData?.dismiss()
            return@LaunchedEffect
        }
        coroutineScope {
            // Suspends while shown; a new id cancels this coroutine, which takes the old one down.
            launch { host.showSnackbar(KuraSnackbarVisuals(toast)) }
            delay(KMotion.undoWindowMs(context))
            host.currentSnackbarData?.dismiss()
            timeout(toast)
        }
    }
    SnackbarHost(
        hostState = host,
        modifier = modifier.then(if (dockVisible) Modifier else Modifier.navigationBarsPadding()).padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
    ) { data ->
        val model = (data.visuals as? KuraSnackbarVisuals)?.model ?: return@SnackbarHost
        KuraToast(model.text, kind = model.kind, onAction = model.action)
    }
}

// MARK: Sheets ─────────────────────────────────────────────────────────────────────────────

/**
 * Compact = floating s2 card inset 8, radius 36 all round, Hidden ↔ Expanded; Tall = s1, radius 36
 * on top (Agregar), Hidden ↔ PartiallyExpanded ↔ Expanded.
 */
enum class KuraSheetStyle { Compact, Tall }

/** What a sheet's content can do besides laying out a column: [close] slides it down, then dismisses. */
class KuraSheetScope internal constructor(column: ColumnScope, private val onClose: () -> Unit) : ColumnScope by column {
    fun close() = onClose()
}

/**
 * A sheet — Material's `ModalBottomSheet`: `BottomSheetDefaults.DragHandle` (36×5, white .18),
 * Material's scrim and motion (and predictive back), s2 (Compact) / s1 (Tall), `shapes.extraLarge`
 * (36), no border, no tonal tint. Dismisses by dragging, tapping the scrim or back ([onDismiss] runs
 * once it's gone); the content's `close()` does the same from a button. One at a time: a sheet
 * that opens another replaces it. The content already clears the navigation bar AND the keyboard
 * (`imePadding`): sheet content must not add either. [grabber] false drops the handle (a decision
 * sheet like "¿borrar la colección?", iOS `showsGrabber`); the content then starts 22 below the edge.
 * [locked] (a write in flight, `AppStore.sheetLocked`) makes the sheet refuse to hide: a drag springs
 * back, the scrim and back do nothing — the same sheet stays mounted, so the write that runs under it
 * is never torn down. Content buttons that write disable themselves meanwhile.
 */
@Composable
fun KuraSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    style: KuraSheetStyle = KuraSheetStyle.Compact,
    grabber: Boolean = true,
    locked: Boolean = false,
    content: @Composable KuraSheetScope.() -> Unit,
) {
    val compact = style == KuraSheetStyle.Compact
    val lockedNow by rememberUpdatedState(locked)
    val sheetState = rememberBottomSheetState(
        initialValue = SheetValue.Hidden,
        enabledValues = if (compact) {
            setOf(SheetValue.Hidden, SheetValue.Expanded)
        } else {
            setOf(SheetValue.Hidden, SheetValue.PartiallyExpanded, SheetValue.Expanded)
        },
        confirmValueChange = { it != SheetValue.Hidden || !lockedNow },
    )
    val scope = rememberCoroutineScope()
    val close: () -> Unit = {
        scope.launch { sheetState.hide() }.invokeOnCompletion { if (!sheetState.isVisible) onDismiss() }
    }
    val radius = MaterialTheme.shapes.extraLarge
    // Material wraps the handle slot in a clickable (tap cycles the detents) that paints the theme's
    // press layer: a grey box behind the grabber while it's held or dragged. No indication reaches that
    // wrapper; the content gets the app's back (its rows and buttons keep their ripple).
    val indication = LocalIndication.current
    CompositionLocalProvider(LocalIndication provides NoIndication) {
        ModalBottomSheet(
            onDismissRequest = onDismiss,
            modifier = if (compact) modifier.padding(horizontal = 8.dp).padding(bottom = 8.dp) else modifier,
            sheetState = sheetState,
            shape = if (compact) radius else RoundedCornerShape(topStart = KRadius.sheet, topEnd = KRadius.sheet),
            containerColor = if (compact) KColor.s2 else KColor.s1,
            contentColor = KColor.text,
            tonalElevation = 0.dp,
            scrimColor = BottomSheetDefaults.ScrimColor,
            dragHandle = if (grabber) ({ Grabber() }) else null,
            contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
            properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !locked),
        ) {
            // imePadding HERE: a sheet with a field rises with the keyboard; screens/sheets must not add it.
            CompositionLocalProvider(LocalIndication provides indication) {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp)
                        .padding(top = if (grabber) 0.dp else 22.dp, bottom = if (compact) 26.dp else 0.dp)
                        .navigationBarsPadding().imePadding(),
                ) {
                    KuraSheetScope(this, close).content()
                }
            }
        }
    }
}

/** An indication that draws nothing (the sheet handle's wrapper; see [KuraSheet]). */
private object NoIndication : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = object : Modifier.Node() {}
    override fun equals(other: Any?): Boolean = other === this
    override fun hashCode(): Int = -1
}

/** The sheet grabber — Material's `BottomSheetDefaults.DragHandle` at Kura's 36×5, white .18. */
@Composable
fun Grabber(modifier: Modifier = Modifier) {
    BottomSheetDefaults.DragHandle(modifier.clearAndSetSemantics { }, width = 36.dp, height = 5.dp, color = KColor.grabber)
}

/** Header row of a sheet: Newsreader 26 (or italic 22) + optional mono trailing + 36 close chip. */
@Composable
fun SheetHeader(title: String, modifier: Modifier = Modifier, italic: Boolean = false, trailing: String? = null, onClose: (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(start = 10.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            modifier = Modifier.weight(1f).semantics { heading() },
            style = if (italic) KuraType.newsItalic(22f) else KuraType.news(26f),
            maxLines = 2,
        )
        if (trailing != null) MonoLabel(trailing)
        // glassBg, not s2: the chip sits ON the s2 sheet and must still read as a control.
        if (onClose != null) IconChip44(KIcon.Close, "Cerrar", onClose, size = 36.dp, iconSize = 14.dp, fill = KColor.glassBg)
    }
}

/** The hairline between groups of sheet rows (1, margin 6 · 12) — a content divider (allowed). */
@Composable
fun SheetDivider(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).height(1.dp).background(KColor.sheetDivider))
}

/**
 * A sheet row — Material's `ListItem` on the sheet's own fill: icon (or a DS glyph) in a 24 slot,
 * label Hanken 16/500, optional [note] under it (13, text-2), optional trailing. Press = ripple +
 * the row's corners (18 → 8).
 */
@Composable
fun SheetRow(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: KIcon? = null,
    glyph: Glyph? = null,
    iconColor: Color = KColor.text,
    note: String? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    ListItem(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        leadingContent = {
            Box(Modifier.width(24.dp), contentAlignment = Alignment.Center) {
                when {
                    glyph != null -> GlyphIcon(glyph, size = 16.dp)
                    icon != null -> KIconView(icon, size = 19.dp, color = iconColor)
                }
            }
        },
        trailingContent = { Row(verticalAlignment = Alignment.CenterVertically, content = trailing) },
        supportingContent = note?.let { { Text(it, style = KuraType.note.inherit()) } },
        shapes = ListItemDefaults.shapes(
            shape = RoundedCornerShape(KRadius.surface),
            pressedShape = RoundedCornerShape(KRadius.coverS),
        ),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent, contentColor = KColor.text, supportingContentColor = KColor.text2),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Text(label, style = KuraType.row.inherit(), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// MARK: Offline strip ──────────────────────────────────────────────────────────────────────

/** "Sin conexión. Ves lo guardado en tu teléfono." — s1, radius 18, above the bar. (Kura.) */
@Composable
fun OfflineStrip(modifier: Modifier = Modifier, text: String = "Sin conexión. Ves lo guardado en tu teléfono.") {
    Row(
        modifier.fillMaxWidth().background(KColor.s1, RoundedCornerShape(KRadius.surface)).heightIn(min = 44.dp).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        KIconView(KIcon.WifiSlash, size = 17.dp)
        Text(text, modifier = Modifier.weight(1f).padding(vertical = 10.dp), style = KuraType.ui(14f).copy(color = KColor.text2))
    }
}
