package com.tromwey.kura.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.tromwey.kura.R
import java.util.Locale

// Twin of ios/Kura/DesignSystem/Typography.swift. Sizes are the DS px at 390 wide; on Android
// they're `sp`, so they follow the system font size (iOS Dynamic Type) — except the fixed voices
// (mono, wordmark, seal initials, dock labels), which ignore fontScale like iOS' `fixedSize`.

/** Newsreader — brand voice; roman lowercase for titles, italic for works. */
val Newsreader = FontFamily(
    Font(R.font.newsreader_regular, FontWeight.Normal),
    Font(R.font.newsreader_italic, FontWeight.Normal, FontStyle.Italic),
    Font(R.font.newsreader_medium, FontWeight.Medium),
    Font(R.font.newsreader_medium_italic, FontWeight.Medium, FontStyle.Italic),
)

/** Hanken Grotesk — interface: body 400, rows 500, buttons and handles 600. */
val HankenGrotesk = FontFamily(
    Font(R.font.hanken_grotesk_regular, FontWeight.Normal),
    Font(R.font.hanken_grotesk_medium, FontWeight.Medium),
    Font(R.font.hanken_grotesk_semibold, FontWeight.SemiBold),
)

/** Red Hat Mono — data: dates, counts, labels, spines. */
val RedHatMono = FontFamily(
    Font(R.font.red_hat_mono_regular, FontWeight.Normal),
    Font(R.font.red_hat_mono_medium, FontWeight.Medium),
)

/** iOS `UIWeight`. */
enum class UiWeight(val weight: FontWeight) { Regular(FontWeight.Normal), Medium(FontWeight.Medium), SemiBold(FontWeight.SemiBold) }

/** Trims the font's own leading so a fixed box (pills, chips) centers the glyphs like CSS `line-height: 1`. */
private val tight = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both)

/**
 * `KuraType` = iOS `Font.kura`. Named styles are the DS type scale; the factories build any
 * other size. Scaling faces use `sp` (fontScale applies); [mono] and [fixed] ignore fontScale.
 * Colors are not part of the style: every call site says `.copy(color = …)` or uses [KText].
 */
object KuraType {
    fun news(size: Float, italic: Boolean = false, medium: Boolean = false, tracking: TextUnit = TextUnit.Unspecified) = TextStyle(
        fontFamily = Newsreader,
        fontWeight = if (medium) FontWeight.Medium else FontWeight.Normal,
        fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
        fontSize = size.sp,
        letterSpacing = tracking,
        color = KColor.text,
    )

    fun newsItalic(size: Float) = news(size, italic = true)

    fun ui(size: Float, weight: UiWeight = UiWeight.Regular) = TextStyle(
        fontFamily = HankenGrotesk,
        fontWeight = weight.weight,
        fontSize = size.sp,
        color = KColor.text,
    )

    /**
     * Red Hat Mono (the data voice lives in fixed geometry: badges, spines, ribbons): it follows the
     * system font scale up to the chrome cap (1.35, [capped]) and stops there, with the leading trimmed. [tracking] in em (0.08 = +8 %).
     */
    @Composable
    @ReadOnlyComposable
    fun mono(size: Float, medium: Boolean = false, tracking: Float = 0f): TextStyle = TextStyle(
        fontFamily = RedHatMono,
        fontWeight = if (medium) FontWeight.Medium else FontWeight.Normal,
        fontSize = capped(size),
        letterSpacing = tracking.em,
        lineHeight = 1.em,
        lineHeightStyle = tight,
        color = KColor.text,
    )

    /** A size that follows the system font scale only up to [MAX_CHROME_FONT_SCALE] (the cap of
     *  `KFixedChrome`): the data voice grows for who needs it, without breaking its fixed geometry. */
    @Composable
    @ReadOnlyComposable
    fun capped(size: Float): TextUnit {
        val scale = LocalDensity.current.fontScale
        return if (scale <= MAX_CHROME_FONT_SCALE) size.sp else (size * MAX_CHROME_FONT_SCALE / scale).sp
    }

    /** A size that ignores the system font scale (iOS `fixedSize:`). */
    @Composable
    @ReadOnlyComposable
    fun fixed(size: Float): TextUnit = (size / LocalDensity.current.fontScale).sp

    // Semantic scale (sistema-de-diseno · typeScale)
    /** Perfil — Newsreader 40. */
    val profile get() = news(40f)
    /** Título de pantalla — Newsreader 36. */
    val screenTitle get() = news(36f)
    /** Frase de vacío — Newsreader 34 (32 on tight screens: `news(32f)`). */
    val emptyPhrase get() = news(34f)
    /** Título de obra — Newsreader itálica 30. */
    val workTitle get() = newsItalic(30f)
    /** Sección — Newsreader 24. */
    val section get() = news(24f)
    /** Título de hoja — Newsreader 22. */
    val sheetTitle get() = news(22f)
    /** Título de obra en fila — itálica 19. */
    val rowWork get() = newsItalic(19f)
    /** Título de obra bajo una portada de cuadrícula — itálica 14. */
    val tileWork get() = newsItalic(14f)
    /** Cuerpo — Hanken 15. */
    val body get() = ui(15f)
    /** Cuerpo grande / filas — Hanken 16. */
    val body16 get() = ui(16f)
    /** Fila de hoja — Hanken 16 / 500. */
    val row get() = ui(16f, UiWeight.Medium)
    /** Botón — Hanken 15 / 600. */
    val button get() = ui(15f, UiWeight.SemiBold)
    /** Nota — Hanken 13 (text-2 at the call site). */
    val note get() = ui(13f).copy(color = KColor.text2)
}

/** Red Hat Mono UPPERCASE with tracking (+8 % default): dates, counts, labels. */
@Composable
fun MonoLabel(
    text: String,
    modifier: Modifier = Modifier,
    size: Float = 11f,
    tracking: Float = 0.08f,
    color: Color = KColor.text2,
    medium: Boolean = false,
    maxLines: Int = 1,
) {
    BasicText(
        text = text.uppercase(EsMx),
        modifier = modifier,
        style = KuraType.mono(size, medium, tracking).copy(color = color),
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
        softWrap = maxLines > 1,
    )
}

/** Plain text in a Kura style (BasicText; nothing from Material). */
@Composable
fun KText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    color: Color = style.color.takeOrElse(KColor.text),
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Ellipsis,
) {
    BasicText(text = text, modifier = modifier, style = style.copy(color = color), maxLines = maxLines, overflow = overflow)
}

private fun Color.takeOrElse(fallback: Color) = if (this == Color.Unspecified) fallback else this

/** Spanish (México) — uppercase/lowercase of UI strings (the app is es-MX only). */
val EsMx: Locale = Locale.forLanguageTag("es-MX")

/** Where fixed-geometry chrome and the mono data voice stop growing (= iOS xxxLarge). */
const val MAX_CHROME_FONT_SCALE = 1.35f

/**
 * Fixed-geometry chrome (dock, top chips, covers, cards, toast) stops growing at the equivalent
 * of iOS xxxLarge (fontScale 1.35): its frames are exact and it's secondary to the reading text,
 * which keeps scaling. Never wrap a whole screen or sheet in it.
 */
@Composable
fun KFixedChrome(maxFontScale: Float = MAX_CHROME_FONT_SCALE, content: @Composable () -> Unit) {
    val d = LocalDensity.current
    if (d.fontScale <= maxFontScale) {
        content()
    } else {
        CompositionLocalProvider(LocalDensity provides Density(d.density, maxFontScale), content = content)
    }
}

// MARK: Wordmark ────────────────────────────────────────────────────────────────────────────

/**
 * The mark (sistema-de-diseno §marca · logo; iOS `Wordmark`). Pick by WHERE it appears:
 * - [WordmarkVariant.A] (default): *kura* Newsreader MediumItalic, −3.5 %. Any mark inside the
 *   app, at least 34 (the k is 0.714 em ≥ 24 px) — smaller, use B.
 * - [WordmarkVariant.B] sello: KURA Red Hat Mono Medium, +24 %. Spines, card feet, signatures.
 * - [WordmarkVariant.C] 蔵 kura: brand material only (the entrance before the account), never
 *   the interface. 蔵 at 1.5×, gap 15/48, dropped 0.25 em so its ink centers on kura's.
 * Size is the latin part's size; fixed (no font scale). TalkBack reads "kura".
 */
enum class WordmarkVariant { A, B, C }

object WordmarkSpec {
    const val minimum = 34f
    const val lockupKanji = 1.5f
    const val lockupGap = 15f / 48f
    const val lockupDrop = 0.25f
}

@Composable
fun Wordmark(
    modifier: Modifier = Modifier,
    variant: WordmarkVariant = WordmarkVariant.A,
    size: Float? = null,
    color: Color = KColor.text,
) {
    val m = modifier.clearAndSetSemantics { contentDescription = "kura" }
    when (variant) {
        WordmarkVariant.B -> {
            val s = size ?: 11f
            BasicText(
                "KURA",
                modifier = m.padding(start = (s * 0.24f).dp),
                style = KuraType.mono(s, medium = true, tracking = 0.24f).copy(color = color),
            )
        }
        WordmarkVariant.A -> {
            val s = maxOf(WordmarkSpec.minimum, size ?: WordmarkSpec.minimum)
            BasicText(
                "kura",
                modifier = m,
                style = TextStyle(
                    fontFamily = Newsreader, fontWeight = FontWeight.Medium, fontStyle = FontStyle.Italic,
                    fontSize = KuraType.fixed(s), letterSpacing = (-0.035).em, color = color,
                ),
            )
        }
        WordmarkVariant.C -> {
            val s = maxOf(WordmarkSpec.minimum, size ?: WordmarkSpec.minimum)
            Row(m, horizontalArrangement = Arrangement.spacedBy((s * WordmarkSpec.lockupGap).dp), verticalAlignment = Alignment.Bottom) {
                // Serif JP from the system (Noto Serif CJK on Android; Hiragino Mincho W6 on iOS).
                BasicText(
                    "蔵",
                    modifier = Modifier.alignByBaseline().offset(y = (s * WordmarkSpec.lockupDrop).dp),
                    style = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.SemiBold, fontSize = KuraType.fixed(s * WordmarkSpec.lockupKanji), color = color),
                )
                BasicText(
                    "kura",
                    modifier = Modifier.alignByBaseline(),
                    style = TextStyle(
                        fontFamily = Newsreader, fontWeight = FontWeight.Medium, fontStyle = FontStyle.Italic,
                        fontSize = KuraType.fixed(s), letterSpacing = (-0.03).em, color = color,
                    ),
                )
            }
        }
    }
}
