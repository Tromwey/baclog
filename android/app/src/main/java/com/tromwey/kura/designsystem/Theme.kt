package com.tromwey.kura.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

/** True when the system removed animations (see [KMotion.reduceMotion]). Provided by [KuraTheme]. */
val LocalReduceMotion = staticCompositionLocalOf { false }

/**
 * Kura's root theme — always dark. Since 2026-09-30 the chrome is Material 3 Expressive
 * (android/BRIEF.md › "El cromo es Material 3 Expressive"): this wraps everything in
 * [MaterialExpressiveTheme] with Kura's tokens ([KuraColorScheme], [KuraShapes],
 * [kuraTypography]) and the expressive motion scheme, so every Material component that the
 * `designsystem/components/` wrappers use speaks Kura. Indication is Material's: the theme
 * provides its ripple (drawn in the component's content color — text on tonal/transparent, bg on
 * the solid button — never Material purple) and every Material component uses it; only
 * `Modifier.kPressable` (content: covers, cards, the fan) opts out with `indication = null`. Content (covers, fan, seal, pills, glyphs)
 * never reads the Material theme: it keeps using [KColor] / [KuraType] directly.
 * Also provides reduce-motion (re-read on every resume, so toggling it in Ajustes del sistema
 * applies when you come back), reads the Vibraciones preference once and sets the text selection
 * colors (no Material purple) — inside the Material theme, so ours win.
 */
@Composable
fun KuraTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    var reduce by remember { mutableStateOf(KMotion.reduceMotion(context)) }
    // An effect, not `remember { … }` (Compose 1.12 lint: a remember returning Unit is an error).
    // KuraApp already reads it at process start; this re-read covers previews/tests.
    LaunchedEffect(context) { KHaptic.init(context) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { reduce = KMotion.reduceMotion(context) }
    // Mono is a fixed-size voice (ignores fontScale), so it's read in composition, not a constant.
    val labelSmall = KuraType.mono(11f, tracking = 0.08f).noColor()
    val typography = remember(labelSmall) { kuraTypography(labelSmall) }
    MaterialExpressiveTheme(
        colorScheme = KuraColorScheme,
        motionScheme = MotionScheme.expressive(),
        shapes = KuraShapes,
        typography = typography,
    ) {
        CompositionLocalProvider(
            LocalReduceMotion provides reduce,
            LocalTextSelectionColors provides TextSelectionColors(handleColor = KColor.text, backgroundColor = KColor.text.copy(alpha = 0.28f)),
            content = content,
        )
    }
}

/**
 * Material roles from Kura's tokens (android/BRIEF.md): `primary` = text (the solid button),
 * `secondaryContainer` = s2 (tonal), `tertiary` = miel (the ONE accent action per screen),
 * surfaces = bg / s1 / s2, `outline*` transparent (no borders), `error` = desaturated coral
 * `#d9a08c` for field validation only (no red), no dynamic color, no tonal tint. Every role is
 * set, so no Material purple can leak from a default.
 */
val KuraColorScheme: ColorScheme = darkColorScheme(
    primary = KColor.text,
    onPrimary = KColor.bg,
    primaryContainer = KColor.s2,
    onPrimaryContainer = KColor.text,
    inversePrimary = KColor.bg,
    secondary = KColor.text2,
    onSecondary = KColor.bg,
    secondaryContainer = KColor.s2,
    onSecondaryContainer = KColor.text,
    tertiary = KColor.accent,
    onTertiary = KColor.onAccent,
    tertiaryContainer = KColor.accent,
    onTertiaryContainer = KColor.onAccent,
    background = KColor.bg,
    onBackground = KColor.text,
    surface = KColor.bg,
    onSurface = KColor.text,
    surfaceVariant = KColor.s2,
    onSurfaceVariant = KColor.text2,
    surfaceTint = Color.Transparent,
    inverseSurface = KColor.text,
    inverseOnSurface = KColor.bg,
    error = KColor.fieldError,
    onError = KColor.bg,
    errorContainer = KColor.s2,
    onErrorContainer = KColor.fieldError,
    outline = Color.Transparent,
    outlineVariant = Color.Transparent,
    // Opaque: Material applies its own scrim alpha (`BottomSheetDefaults.ScrimColor` = this at .32).
    scrim = Color(4, 4, 6),
    surfaceBright = KColor.s2,
    surfaceDim = KColor.bg,
    surfaceContainerLowest = KColor.bg,
    surfaceContainerLow = KColor.s1,
    surfaceContainer = KColor.s2,
    surfaceContainerHigh = KColor.s2,
    surfaceContainerHighest = KColor.s2,
    primaryFixed = KColor.text,
    primaryFixedDim = KColor.text2,
    onPrimaryFixed = KColor.bg,
    onPrimaryFixedVariant = KColor.s2,
    secondaryFixed = KColor.s2,
    secondaryFixedDim = KColor.s1,
    onSecondaryFixed = KColor.text,
    onSecondaryFixedVariant = KColor.text2,
    tertiaryFixed = KColor.accent,
    tertiaryFixedDim = KColor.accent,
    onTertiaryFixed = KColor.onAccent,
    onTertiaryFixedVariant = KColor.onAccent,
)

/** Material's shape scale on Kura's radii: 8 (cover S) · 14 (cover L) · 18 (surface) · 26 (screen) · 36 (sheet). */
val KuraShapes = Shapes(
    extraSmall = RoundedCornerShape(KRadius.coverS),
    small = RoundedCornerShape(KRadius.coverL),
    medium = RoundedCornerShape(KRadius.surface),
    large = RoundedCornerShape(KRadius.screen),
    extraLarge = RoundedCornerShape(KRadius.sheet),
)

/**
 * Material's type scale on [KuraType]: display/headline = Newsreader roman (lowercase titles),
 * title = Newsreader italic (works), body/label = Hanken, labelSmall = Red Hat Mono 11 (+8 %,
 * fixed size — passed in because it's read in composition). No color in any style: a Material
 * component's content color (onPrimary on a solid button…) must win.
 */
fun kuraTypography(labelSmall: TextStyle): Typography = Typography(
    displayLarge = KuraType.profile.noColor(), // 40
    displayMedium = KuraType.screenTitle.noColor(), // 36
    displaySmall = KuraType.emptyPhrase.noColor(), // 34
    headlineLarge = KuraType.news(30f).noColor(),
    headlineMedium = KuraType.news(26f).noColor(), // sheet header
    headlineSmall = KuraType.section.noColor(), // 24
    titleLarge = KuraType.newsItalic(22f).noColor(),
    titleMedium = KuraType.rowWork.noColor(), // italic 19
    titleSmall = KuraType.tileWork.noColor(), // italic 14
    bodyLarge = KuraType.body16.noColor(),
    bodyMedium = KuraType.body.noColor(), // 15
    bodySmall = KuraType.ui(13f).noColor(),
    labelLarge = KuraType.button.noColor(), // 15 / 600
    labelMedium = KuraType.ui(13f, UiWeight.Medium).noColor(),
    labelSmall = labelSmall,
)

private fun TextStyle.noColor(): TextStyle = copy(color = Color.Unspecified)

/** `KHaptic.play` bound to the current view: `val haptic = rememberKHaptic(); haptic(KHapticEvent.Tap)`. */
@Composable
fun rememberKHaptic(): (KHapticEvent?) -> Unit {
    val view = LocalView.current
    return remember(view) { { e -> KHaptic.play(view, e) } }
}
