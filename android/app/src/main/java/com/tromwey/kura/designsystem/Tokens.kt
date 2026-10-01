package com.tromwey.kura.designsystem

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.accessibility.AccessibilityManager
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.spring as composeSpring
import androidx.compose.animation.core.tween
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

// Twin of ios/Kura/DesignSystem/Tokens.swift — same names, same numbers. Change both or neither.

// MARK: Hex color math ──────────────────────────────────────────────────────────────────────

/**
 * A color in sRGB 0…255, for the palette math the design system specifies (`mix`, inversion).
 * Everything the DS describes as "mezclado X % hacia Y" goes through here so the numbers match
 * the web mocks and iOS exactly (iOS `RGB`).
 */
data class KRgb(val r: Double, val g: Double, val b: Double) {

    /** The DS `mix(a, b, k)`: `k` is how far toward [other] (0 = this, 1 = other). */
    fun mix(other: KRgb, k: Double): KRgb {
        val t = k.coerceIn(0.0, 1.0)
        return KRgb(
            roundHalfUp(r * (1 - t) + other.r * t),
            roundHalfUp(g * (1 - t) + other.g * t),
            roundHalfUp(b * (1 - t) + other.b * t),
        )
    }

    /** WCAG relative luminance (0 = black, 1 = white) — the web's `relativeLuminance`. */
    val relativeLuminance: Double
        get() = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

    /** CIE76 ΔE — the web's `deltaE` (src/components/kura/tint.ts). */
    fun deltaE(o: KRgb): Double {
        val p = lab()
        val q = o.lab()
        return sqrt((p[0] - q[0]).pow(2) + (p[1] - q[1]).pow(2) + (p[2] - q[2]).pow(2))
    }

    /** `0xffffff ^ hex` — the seal's inversion. */
    val inverted: KRgb get() = KRgb(255 - r, 255 - g, 255 - b)

    val color: Color get() = Color(r.toInt(), g.toInt(), b.toInt())

    /** `#rrggbb`, lowercase (what the tests and the web compare). */
    val hex: String get() = "#%02x%02x%02x".format(r.toInt(), g.toInt(), b.toInt())

    /** CIE L*a*b* (D65) — only to measure how far apart two tint ends read. */
    private fun lab(): DoubleArray {
        val rr = lin(r)
        val gg = lin(g)
        val bb = lin(b)
        val x = (0.4124 * rr + 0.3576 * gg + 0.1805 * bb) / 0.95047
        val y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
        val z = (0.0193 * rr + 0.1192 * gg + 0.9505 * bb) / 1.08883
        fun f(t: Double) = if (t > 0.008856) t.pow(1.0 / 3) else 7.787 * t + 16.0 / 116
        return doubleArrayOf(116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))
    }

    companion object {
        fun hex(hex: String): KRgb {
            val s = hex.trim().removePrefix("#")
            val v = s.toLongOrNull(16) ?: 0L
            return KRgb(((v shr 16) and 0xff).toDouble(), ((v shr 8) and 0xff).toDouble(), (v and 0xff).toDouble())
        }

        private fun lin(v: Double): Double {
            val x = v / 255
            return if (x <= 0.04045) x / 12.92 else ((x + 0.055) / 1.055).pow(2.4)
        }

        /** Swift's `.rounded()` (half away from zero). Kotlin's `round()` is half-even: never use it here. */
        private fun roundHalfUp(x: Double): Double = floor(x + 0.5)
    }
}

/** `#rrggbb` (or `rrggbb`) → opaque [Color]; [alpha] 0…1. */
fun kHex(hex: String, alpha: Float = 1f): Color = KRgb.hex(hex).color.copy(alpha = alpha)

// MARK: Color tokens ────────────────────────────────────────────────────────────────────────

/**
 * Kura color tokens, copied from `sistema-de-diseno.dc.html`. No red anywhere; honey ([accent])
 * appears once per screen (Seguir, or the screen's one accent action).
 */
object KColor {
    const val bgHex = "#0b0b0d"
    const val s1Hex = "#141417"
    const val s2Hex = "#1c1c21"
    const val textHex = "#f4f3ee"

    val bg = Color(0xFF0B0B0D)
    val s1 = Color(0xFF141417)
    val s2 = Color(0xFF1C1C21)
    val text = Color(0xFFF4F3EE)
    val text2 = Color(0xFFB9B8C2)
    val text3 = Color(0xFF8F8E9B)
    /** `rgba(255,255,255,.075)`: glass buttons, pills, chips (flat on Android — no Liquid Glass). */
    val glassBg = Color.White.copy(alpha = 0.075f)
    /** `rgba(11,11,13,.5)`: a pill sitting ON a cover. */
    val glassArt = Color(11, 11, 13).copy(alpha = 0.5f)
    /** Graphite at 82 %: what FLOATS over scrolling covers (the "+", its menu). Present on the dark
     *  page (art glass is black on black there) and still lets a cover show through, darkened. */
    val glassFloat = Color(0xFF1C1C21).copy(alpha = 0.82f)
    /** Selected glass `rgba(255,255,255,.22)` — pressed/selected state of a glass control. */
    val glassSelected = Color.White.copy(alpha = 0.22f)
    /** Focus fill of a glass field (fill change instead of a ring — no borders). */
    val glassFocused = Color.White.copy(alpha = 0.12f)
    val accent = Color(0xFFEFCE8D)
    val onAccent = Color(0xFF0B0B0D)
    /** Field validation only (Material's `error` role) — desaturated coral, never red (founder, 2026-09-30). */
    val fieldError = Color(0xFFD9A08C)

    const val obsessedHex = "#ec8e76"
    const val likedHex = "#9cbae1"
    const val completedHex = "#a0cba0"
    const val waitingHex = "#b9a6e8"
    /** coral — Me obsesiona. */
    val obsessed = Color(0xFFEC8E76)
    /** pizarra — Me gusta. */
    val liked = Color(0xFF9CBAE1)
    /** salvia — Completo (and every "on" switch). */
    val completed = Color(0xFFA0CBA0)
    /** lavanda — aviso de estreno (clock + date), only that. */
    val waiting = Color(0xFFB9A6E8)

    /** Sheet grabber `rgba(255,255,255,.18)`. */
    val grabber = Color.White.copy(alpha = 0.18f)
    /** Radio ring `rgba(244,243,238,.24)`. */
    val radioRing = text.copy(alpha = 0.24f)
    /** Hairline between groups of sheet rows (a content divider: allowed). */
    val sheetDivider = Color.White.copy(alpha = 0.08f)
    /** Hairline between grouped settings rows. */
    val listDivider = Color.White.copy(alpha = 0.06f)
    /** Pressed fill of a full-width row (a row never shrinks). */
    val rowPressed = Color.White.copy(alpha = 0.06f)

    /** Party seals: one muted tone each, picked stably from the handle. No red. */
    val sealHexes = listOf("#c98b6b", "#6f8a9a", "#a58bb0", "#8a9a6f", "#c9a25a", "#b0898f")
    val sealInk = Color(0xFF1C1916)
    val sealSomeone = Color(0xFF2C2C30)

    /** Fixed art tiles with no cover to tint from: the recap tile and "no puedo esperar"'s lead. */
    val recapTile = listOf(Color(0xFF49291D), Color(0xFF34211A))
    val waitingLead = listOf(Color(0xFF3A5A70), Color(0xFF1C2A35))
}

// MARK: Radii / sizes ───────────────────────────────────────────────────────────────────────

object KRadius {
    /** Small cover: rows, grid, thumbnails. */
    val coverS = 8.dp
    /** Large cover: cards, headers, ribbon. */
    val coverL = 14.dp
    /** Groups, panels, grouped rows. */
    val surface = 18.dp
    /** Screen card: feed, recap, collection card, sheet (DS). */
    val screen = 26.dp
    /** Sheets on device (iOS KRadius.sheet). */
    val sheet = 36.dp
    /** Text fields. */
    val field = 16.dp
}

object KSize {
    /** Minimum touch target. */
    val touch = 44.dp
    /** Volver / Opciones: 64 from the screen's top edge (not from the safe area)… */
    val chromeTop = 64.dp
    /** …and 24 from the sides. */
    val chromeSide = 24.dp
    /** Top of a tab root's title (tus colecciones, descubrir, tu feed). */
    val titleTop = chromeTop + 4.dp
    /** Top of the content under the back chip on a pushed screen. */
    val pushedTitleTop = 124.dp
    /** Screen side margin (20–24). */
    val margin = 20.dp
    /** Settings / sheet row. */
    val rowSettings = 52.dp
    /** People / notification row. */
    val rowPeople = 72.dp
    /** Title row in a list. */
    val rowTitle = 80.dp
}

// MARK: Shadows (dark depth only — no glows) ────────────────────────────────────────────────

/**
 * The DS box-shadows, as CSS draws them (`Modifier.dropShadow` takes blur, spread and offset
 * like CSS). Only dark neutral depth: never light or colored.
 */
enum class KShadow(val blur: Dp, val spread: Dp, val y: Dp, val color: Color) {
    /** `0 18px 36px -16px rgba(0,0,0,.88)` — every cover. */
    Cover(36.dp, (-16).dp, 18.dp, Color.Black.copy(alpha = 0.88f)),
    /** `0 -8px 18px rgba(0,0,0,.42)` — a card riding on another (feed). */
    Stack(18.dp, 0.dp, (-8).dp, Color.Black.copy(alpha = 0.42f)),
}

/** Draws [s] behind the content, shaped like [shape]. Put it BEFORE the clip/background. */
fun Modifier.kShadow(s: KShadow, shape: Shape = RectangleShape, opacity: Float = 1f): Modifier =
    dropShadow(shape, Shadow(radius = s.blur, color = s.color, spread = s.spread, offset = DpOffset(0.dp, s.y), alpha = opacity))

// MARK: Tinted surfaces ─────────────────────────────────────────────────────────────────────

/** The only way color enters the UI: a cover's palette dragged toward black (iOS `Tint`). */
object Tint {
    /** `k = 1 − 0.45 · 0.78` */
    const val k: Double = 1 - 0.45 * 0.78
    val topTarget = KRgb.hex("#101013")
    val bottomTarget = KRgb.hex("#0c0c10")

    /** How far apart (CIE76 ΔE, tinted) tone 1 and tone 2 must be before tone 2 stops being the second color. */
    const val minEndsDelta = 13.0

    /** The brightest a tint end may be (WCAG 1.4.3: text-2 keeps ≥ 5.8:1 on it). */
    const val maxLuminance = 0.04

    /**
     * The two ends — `mix(h1, #101013, k)` / `mix(h2, #0c0c10, k + .08)`, each capped at
     * [maxLuminance]. Tone 2 is the palette's second color unless the two land closer than
     * [minEndsDelta]; then it's the palette color whose tinted end is FARTHEST from tone 1.
     * Twin of iOS `Tint.ends` and the web's `tintEnds`.
     */
    fun ends(palette: List<String>): Pair<KRgb, KRgb> {
        val first = palette.firstOrNull() ?: "#6c6b76"
        val top = capLuminance(KRgb.hex(first).mix(topTarget, k), topTarget)
        fun bottom(hex: String) = capLuminance(KRgb.hex(hex).mix(bottomTarget, minOf(1.0, k + 0.08)), bottomTarget)
        var end = bottom(if (palette.size > 1) palette[1] else first)
        var gap = top.deltaE(end)
        if (gap < minEndsDelta) {
            for (hex in palette.drop(2)) {
                val c = bottom(hex)
                val d = top.deltaE(c)
                if (d > gap) {
                    end = c
                    gap = d
                }
            }
        }
        return top to end
    }

    /** Pull [c] toward [ink] just enough that its luminance is ≤ [maxLuminance] (16 bisection steps). */
    fun capLuminance(c: KRgb, ink: KRgb): KRgb {
        if (c.relativeLuminance <= maxLuminance) return c
        var lo = 0.0
        var hi = 1.0
        repeat(16) {
            val mid = (lo + hi) / 2
            if (c.mix(ink, mid).relativeLuminance > maxLuminance) lo = mid else hi = mid
        }
        return c.mix(ink, hi)
    }

    /** Card surface: 168° between the two ends (feed, collection cards, blocks inside a page). */
    fun card(palette: List<String>): Brush {
        val (a, b) = ends(palette)
        return cssLinearGradient(168.0, listOf(0f to a.color, 1f to b.color))
    }

    /**
     * A header that fades into `bg` in its last third, at 168° (or 180° with [vertical]):
     * `linear-gradient(168deg, a, b 66%, #0b0b0d)` — the DS tints block. Without a palette,
     * [neutralHeader] (no cover, no color).
     */
    fun header(palette: List<String>?, vertical: Boolean = false): Brush {
        if (palette.isNullOrEmpty()) return neutralHeader
        val (a, b) = ends(palette)
        return cssLinearGradient(if (vertical) 180.0 else 168.0, listOf(0f to a.color, 0.66f to b.color, 1f to KColor.bg))
    }

    /** Without a cover there is no color: s1 → bg. */
    val neutralHeader: Brush = Brush.verticalGradient(listOf(KColor.s1, KColor.bg))

    /** Onboarding (O1/O2) only: the three picks blended top to bottom, fading to bg. */
    fun header3(palettes: List<List<String>>): Brush {
        val tops = palettes.take(3).map { ends(it).first.color }
        if (tops.isEmpty()) return neutralHeader
        val stops = tops.mapIndexed { i, c -> (i.toFloat() / tops.size * 0.66f) to c } + (1f to KColor.bg)
        return object : ShaderBrush() {
            override fun createShader(size: Size): Shader = LinearGradientShader(
                from = Offset(size.width * 0.2f, 0f), to = Offset(size.width * 0.8f, size.height),
                colors = stops.map { it.second }, colorStops = stops.map { it.first },
            )
        }
    }

    /** The top edge of a header/card (its palette's first end), or s1 without one. */
    fun headerTop(palette: List<String>?): Color =
        if (palette.isNullOrEmpty()) KColor.s1 else ends(palette).first.color

    /** Palette fallback for a cover still loading / failed: 160° between the two raw hex. */
    fun coverFallback(palette: List<String>): Brush {
        val a = kHex(palette.firstOrNull() ?: KColor.s2Hex)
        val b = kHex(palette.getOrNull(1) ?: palette.firstOrNull() ?: KColor.s2Hex)
        return cssLinearGradient(160.0, listOf(0f to a, 1f to b))
    }

    /** The feed gradient's ends, or null without a palette ("sin portada no hay color"). */
    fun feedEnds(hexes: List<String>): Pair<Color, Color>? {
        if (hexes.isEmpty()) return null
        val (a, b) = ends(hexes)
        return a.color to b.color
    }

    /** The color a feed-gradient page continues in (under the dock's band): tone 2, or bg. */
    fun feedTail(hexes: List<String>): Color = feedEnds(hexes)?.second ?: KColor.bg

    /** Its first tone (what an overscroll shows above the top), or bg. */
    fun feedTop(hexes: List<String>): Color = feedEnds(hexes)?.first ?: KColor.bg

    /**
     * The feed gradient over a whole page (iOS `FeedSurface`): CSS
     * `linear-gradient(168deg, a 0px, b {span}px, b 100%)` — tone 1 at the top-left corner, tone 2
     * by [span] along the gradient line, then the page CONTINUES in tone 2. Anchored in dp, so a
     * long page never stretches it. 760 on Tus colecciones, 900 on every other page.
     */
    fun feed(hexes: List<String>, span: Dp, density: Float): Brush {
        val e = feedEnds(hexes) ?: return androidx.compose.ui.graphics.SolidColor(KColor.bg)
        val rad = 168.0 * PI / 180
        val dx = (sin(rad) * span.value * density).toFloat()
        val dy = (-cos(rad) * span.value * density).toFloat()
        return object : ShaderBrush() {
            override fun createShader(size: Size): Shader {
                // At 168° the CSS "0" line passes through the top-left corner.
                val start = cssGradientLine(168.0, size).first
                return LinearGradientShader(start, Offset(start.x + dx, start.y + dy), listOf(e.first, e.second), tileMode = TileMode.Clamp)
            }
        }
    }
}

/**
 * CSS `linear-gradient(<deg>deg, …)` on any box: the gradient line runs through the center at
 * [deg] (0 = up, clockwise) and is `|w·sin| + |h·cos|` long, exactly like the browser.
 */
fun cssLinearGradient(deg: Double, stops: List<Pair<Float, Color>>): Brush = object : ShaderBrush() {
    override fun createShader(size: Size): Shader {
        val (from, to) = cssGradientLine(deg, size)
        return LinearGradientShader(from, to, stops.map { it.second }, stops.map { it.first }, TileMode.Clamp)
    }
}

/** Start and end of the CSS gradient line for [deg] over [size]. */
fun cssGradientLine(deg: Double, size: Size): Pair<Offset, Offset> {
    val rad = deg * PI / 180
    val dirX = sin(rad).toFloat()
    val dirY = (-cos(rad)).toFloat()
    val half = (abs(size.width * dirX) + abs(size.height * dirY)) / 2
    val c = Offset(size.width / 2, size.height / 2)
    return Offset(c.x - dirX * half, c.y - dirY * half) to Offset(c.x + dirX * half, c.y + dirY * half)
}

// MARK: Motion ──────────────────────────────────────────────────────────────────────────────

/**
 * Every Kura curve comes from here (DS "movimiento"; iOS `KMotion`); component motion is
 * Material's scheme ([fastSpatial] / [defaultSpatial] / [fastEffects] / [defaultEffects]). SwiftUI's
 * `spring(response:dampingFraction:)` maps to Compose as `stiffness = (2π / response)²`,
 * `dampingRatio = dampingFraction`. Rules:
 * - Tap-driven state changes are critically damped springs (no bounce): [snappy].
 * - Bounce only after a drag that carries momentum: [momentum].
 * - Fades (tint, opacity, color) are eases: [tint], [fade].
 * - Press: instant in, [release] out (`Modifier.kPressable`).
 * - Reduce motion (animations off in the system): anything spatial becomes a fade — use
 *   [spatial], which reads it; covers never zoom, skeletons stand still.
 */
object KMotion {
    private fun stiffness(response: Double) = ((2 * PI / response).pow(2)).toFloat()

    /** Shared cover, reaction morph: 320 ms spring, barely damped past critical. */
    fun <T> spring(): FiniteAnimationSpec<T> = composeSpring(dampingRatio = 0.86f, stiffness = stiffness(0.32))
    /** Tap-driven toggles/selections: quick, no overshoot. */
    fun <T> snappy(): FiniteAnimationSpec<T> = composeSpring(dampingRatio = 0.92f, stiffness = stiffness(0.28))
    /** Settles a drag that had momentum (bounce allowed here only). */
    fun <T> momentum(): FiniteAnimationSpec<T> = composeSpring(dampingRatio = 0.68f, stiffness = stiffness(0.32))
    /** Press release (press-in is instant). */
    fun <T> release(): FiniteAnimationSpec<T> = composeSpring(dampingRatio = 0.9f, stiffness = stiffness(0.3))
    /** Tint fade, 240 ms. */
    fun <T> tint(): FiniteAnimationSpec<T> = tween(durationMillis = 240, easing = EaseInOut)
    /** Opacity / color fades, 200 ms. */
    fun <T> fade(): FiniteAnimationSpec<T> = tween(durationMillis = 200, easing = EaseInOut)
    // Component motion (since 2026-09-30) is Material's `MotionScheme.expressive()` (KuraTheme):
    // buttons, groups, bar, sheet, snackbar, search, FAB animate themselves; the frame's own fades
    // read the scheme through these. Kura's springs above stay for the shared cover (and the stack
    // slide that rides with it), the tint, content presses and the masonry pick.
    /** Material's fast spatial spring (small components moving). */
    @Composable
    @ReadOnlyComposable
    fun <T> fastSpatial(): FiniteAnimationSpec<T> = MaterialTheme.motionScheme.fastSpatialSpec()
    /** Material's default spatial spring (a panel, a bar). */
    @Composable
    @ReadOnlyComposable
    fun <T> defaultSpatial(): FiniteAnimationSpec<T> = MaterialTheme.motionScheme.defaultSpatialSpec()
    /** Material's fast effects spring (opacity/color of a small piece). */
    @Composable
    @ReadOnlyComposable
    fun <T> fastEffects(): FiniteAnimationSpec<T> = MaterialTheme.motionScheme.fastEffectsSpec()
    /** Material's default effects spring (a screen-sized fade). */
    @Composable
    @ReadOnlyComposable
    fun <T> defaultEffects(): FiniteAnimationSpec<T> = MaterialTheme.motionScheme.defaultEffectsSpec()

    /** Skeleton pulse: one leg of the 1.6 s cycle (autoreverses). */
    const val pulseLegMs = 800
    /** Toast on screen (undo window); with TalkBack on, [undoWindowAccessibleMs]. */
    const val undoWindowMs = 5_000L
    const val undoWindowAccessibleMs = 15_000L

    /** CSS/SwiftUI `ease-in-out`. */
    val EaseInOut = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

    /** A spatial animation, or a fade when reduce motion is on. */
    fun <T> spatial(spec: AnimationSpec<T>, reduce: Boolean): AnimationSpec<T> = if (reduce) fade() else spec

    /**
     * The system's "remove animations": Developer options / Accessibility set the animator or
     * transition scale to 0. Read it per activity resume (see `KuraTheme`), not per frame.
     */
    fun reduceMotion(context: Context): Boolean {
        val cr = context.contentResolver
        val animator = Settings.Global.getFloat(cr, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        val transition = Settings.Global.getFloat(cr, Settings.Global.TRANSITION_ANIMATION_SCALE, 1f)
        return animator == 0f || transition == 0f
    }

    /** How long a toast / deferred write waits: 5 s, or 15 s with TalkBack (iOS `AppStore.undoWindow`). */
    fun undoWindowMs(context: Context): Long {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
        return if (am?.isTouchExplorationEnabled == true) undoWindowAccessibleMs else undoWindowMs
    }
}

// MARK: Haptics ─────────────────────────────────────────────────────────────────────────────

/**
 * What a haptic MEANS (iOS `KHaptic.Event`) — pick by meaning, never by strength; same event =
 * same haptic everywhere. See `.claude/knowledge/state/frontend.md` § "iOS · haptics".
 */
sealed interface KHapticEvent {
    /** The chosen thing changed (chips, pickers, carousel crossing, multi-select row). */
    data object Selection : KHapticEvent
    /** A light, instant commit (follow, save, pin, Completo / Me gusta). Ligera. */
    data object Tap : KHapticEvent
    /** A weighty commit (Me obsesiona, a long press firing). Media. */
    data object Firm : KHapticEvent
    /** An async action confirmed by the server (report, block, merge…). */
    data object Success : KHapticEvent
    /** Refused on purpose (the 4th onboarding pick). */
    data object Warning : KHapticEvent
    /** A write failed (central, in the store's retry toast). */
    data object Error : KHapticEvent
    /** A physical collision (the feed card hitting the top). */
    data class Hit(val intensity: Float) : KHapticEvent
    /** The opposite gesture settling (pulling the stack back). Never a second [Hit]. */
    data class Pull(val intensity: Float) : KHapticEvent
}

/**
 * The app's ONE haptic entry point (iOS `KHaptic`). Nothing else calls
 * `performHapticFeedback` or a `Vibrator`. Honors Ajustes › Vibraciones ([enabled], a DEVICE
 * preference, default ON, kept across sign-out) and the system's touch-feedback switch (applied
 * by the system to USAGE_TOUCH from API 33; read by hand before).
 * The same event within 40 ms is one haptic.
 *
 * API 29+ plays the system's predefined effects through the [Vibrator] (usage TOUCH), NOT
 * `View.performHapticFeedback`: on a Pixel 4 / Android 13 the view path returned `false` for the
 * carousel's tick (measured 2026-09-30, `dumpsys vibrator_manager` empty), and when it did vibrate
 * `CLOCK_TICK` became `EFFECT_TEXTURE_TICK` (10 ms), which a hand can't feel. Before 29 (no
 * predefined effects) it falls back to `performHapticFeedback`.
 */
object KHaptic {
    /** Same key as iOS' `UserDefaults` (`kura.haptics`); plain device prefs, nothing sensitive. */
    const val enabledKey = "kura.haptics"
    private const val prefsName = "kura_device"
    private const val burstMs = 40L

    @Volatile
    var enabled: Boolean = true
        private set

    private var lastKind: Int = -1
    private var lastAt: Long = 0

    @Volatile
    private var vibrator: Vibrator? = null

    /** Reads the Vibraciones preference once (call from `KuraApp.onCreate` or `KuraTheme`). */
    fun init(context: Context) {
        enabled = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).getBoolean(enabledKey, true)
        if (vibrator == null) vibrator = systemVibrator(context.applicationContext)
    }

    /** Ajustes › Vibraciones. Turning it on confirms with a [KHapticEvent.Tap] (iOS does the same). */
    fun setEnabled(context: Context, on: Boolean, view: View? = null) {
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).edit().putBoolean(enabledKey, on).apply()
        enabled = on
        if (on && view != null) play(view, KHapticEvent.Tap)
    }

    /** Plays one event (the only way the app vibrates). No-op when Vibraciones is off. */
    fun play(view: View, event: KHapticEvent?) {
        if (event == null || !enabled) return
        val kind = when (event) {
            KHapticEvent.Selection -> 0
            KHapticEvent.Tap -> 1
            KHapticEvent.Firm -> 2
            KHapticEvent.Success -> 3
            KHapticEvent.Warning -> 4
            KHapticEvent.Error -> 5
            is KHapticEvent.Hit -> 6
            is KHapticEvent.Pull -> 7
        }
        val now = android.os.SystemClock.uptimeMillis()
        if (kind == lastKind && now - lastAt < burstMs) return
        lastKind = kind
        lastAt = now
        val v = vibrator ?: systemVibrator(view.context.applicationContext).also { vibrator = it }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && v != null && v.hasVibrator()) {
            if (!systemTouchFeedbackOn(view.context)) return
            vibrate(v, VibrationEffect.createPredefined(predefined(event)))
        } else {
            view.performHapticFeedback(constant(event))
        }
    }

    /** What each meaning feels like (API 29+). Hit / Pull scale with how hard the card landed. */
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.Q)
    internal fun predefined(e: KHapticEvent): Int = when (e) {
        KHapticEvent.Selection -> VibrationEffect.EFFECT_TICK
        KHapticEvent.Tap -> VibrationEffect.EFFECT_CLICK
        KHapticEvent.Firm -> VibrationEffect.EFFECT_HEAVY_CLICK
        KHapticEvent.Success -> VibrationEffect.EFFECT_DOUBLE_CLICK
        KHapticEvent.Warning, KHapticEvent.Error -> VibrationEffect.EFFECT_HEAVY_CLICK
        is KHapticEvent.Hit -> if (e.intensity >= 0.7f) VibrationEffect.EFFECT_HEAVY_CLICK else VibrationEffect.EFFECT_CLICK
        // Lighter than a Hit of the same force: the opposite gesture settling, never a second Hit.
        is KHapticEvent.Pull -> if (e.intensity >= 0.7f) VibrationEffect.EFFECT_CLICK else VibrationEffect.EFFECT_TICK
    }

    private fun vibrate(v: Vibrator, effect: VibrationEffect) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
        } else {
            // Before 33 the TOUCH usage is spelled as sonification audio attributes.
            @Suppress("DEPRECATION")
            v.vibrate(
                effect,
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
        }
    }

    /**
     * Settings › Sonido y vibración › Respuesta táctil (default on). From 33 the system applies it to
     * every USAGE_TOUCH vibration itself (that's why the setting is deprecated there); before, we read it.
     */
    private fun systemTouchFeedbackOn(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return true
        @Suppress("DEPRECATION")
        return Settings.System.getInt(context.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) != 0
    }

    private fun systemVibrator(context: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    /** API 26–28 (no predefined effects): the view's own haptic, which checks the system switch. */
    private fun constant(e: KHapticEvent): Int = when (e) {
        KHapticEvent.Selection, KHapticEvent.Tap, is KHapticEvent.Pull -> HapticFeedbackConstants.CLOCK_TICK
        KHapticEvent.Firm, KHapticEvent.Success -> HapticFeedbackConstants.CONTEXT_CLICK
        KHapticEvent.Warning, KHapticEvent.Error -> HapticFeedbackConstants.LONG_PRESS
        is KHapticEvent.Hit -> if (e.intensity > 0.5f) HapticFeedbackConstants.CONTEXT_CLICK else HapticFeedbackConstants.CLOCK_TICK
    }
}
