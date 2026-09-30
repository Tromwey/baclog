package com.tromwey.kura.designsystem

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// One glyph, one meaning; the color reinforces it (sistema-de-diseno · glifos). The nine state
// glyphs are the DS's own paths (the `G` table in sistema-de-diseno.dc.html), not Material icons.
// Interface icons (Volver, Opciones, +, lupa…) are the SF Symbols iOS uses, redrawn as clean
// 24×24 strokes. Every vector is drawn in black and tinted at the call site: the color by state
// comes from the token, never from the vector.

/**
 * SVG lets an arc's two flags run together with the next number ("a10 10 0 100 20" = flags 1, 0
 * then x = 0), and the DS paths are written that way. Compose's `addPathNodes` reads "100" as ONE
 * number and draws half circles (the clock, the search lens, the feed dot…). This rewrites every
 * arc so each flag is its own token. Pure string work (covered by GlyphPathTest).
 */
internal fun expandArcFlags(d: String): String {
    val out = StringBuilder()
    var i = 0
    var cmd = ' '
    var arg = 0
    while (i < d.length) {
        val c = d[i]
        when {
            c.isLetter() && c != 'e' && c != 'E' -> {
                cmd = c
                arg = 0
                out.append(c).append(' ')
                i++
            }
            c == ' ' || c == ',' || c == '\n' -> i++
            (cmd == 'a' || cmd == 'A') && (arg % 7 == 3 || arg % 7 == 4) -> {
                out.append(c).append(' ')
                i++
                arg++
            }
            else -> {
                val start = i
                if (d[i] == '-' || d[i] == '+') i++
                var dot = false
                while (i < d.length) {
                    val ch = d[i]
                    when {
                        ch.isDigit() -> i++
                        ch == '.' && !dot -> { dot = true; i++ }
                        ch == 'e' || ch == 'E' -> { i++; if (i < d.length && (d[i] == '-' || d[i] == '+')) i++ }
                        else -> break
                    }
                }
                out.append(d, start, i).append(' ')
                arg++
            }
        }
    }
    return out.toString().trim()
}

/** Builds a 24×24 vector from SVG path data: filled ([stroke] = null) or stroked. */
private fun glyphVector(name: String, vararg paths: String, stroke: Float? = null): ImageVector {
    val b = ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
    for (d in paths) {
        if (stroke == null) {
            b.addPath(pathData = addPathNodes(expandArcFlags(d)), fill = SolidColor(Color.Black))
        } else {
            b.addPath(
                pathData = addPathNodes(expandArcFlags(d)), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = stroke,
                strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
            )
        }
    }
    return b.build()
}

/** The DS state/indicator glyphs — same cases as iOS `Glyph`. */
enum class Glyph(private val d: String, val color: Color, val meaning: String) {
    /** llama — me obsesiona (coral). */
    Flame(
        "M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177A7.547 7.547 0 015.648 6.61a.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133.998a5.99 5.99 0 011.925-3.546 3.75 3.75 0 013.255 3.72z",
        KColor.obsessed, "me obsesiona",
    ),
    /** pulgar — me gusta (pizarra). */
    Thumb(
        "M7.5 10.5v9.5H4.2a1.2 1.2 0 01-1.2-1.2v-7.1a1.2 1.2 0 011.2-1.2h3.3zm2 9.5h7.6a2.2 2.2 0 002.16-1.78l1.24-6.2A2.2 2.2 0 0018.34 9.4H14.2l.7-3.3a2 2 0 00-3.6-1.5L9.5 8.6v11.4z",
        KColor.liked, "me gusta",
    ),
    /** check — completo (salvia). */
    Check("M20.5 6.3a1.1 1.1 0 010 1.6l-9.6 9.6a1.1 1.1 0 01-1.6 0L4.6 12.8a1.1 1.1 0 011.6-1.6l3.9 3.9 8.8-8.8a1.1 1.1 0 011.6 0z", KColor.completed, "completo"),
    /** reloj — aviso de estreno, only that (lavanda). */
    Clock("M12 2a10 10 0 100 20 10 10 0 000-20zm1.1 4.6v5.8l4.3 2.6-1.1 1.8-5.4-3.2V6.6h2.2z", KColor.waiting, "aviso de estreno"),
    /** marcador — guardado (indicator; the save button uses [KIcon.BookmarkOutline] until saved). */
    Bookmark("M7 2.6h10a2.2 2.2 0 012.2 2.2v16.6L12 17.6l-7.2 3.8V4.8A2.2 2.2 0 017 2.6z", KColor.text, "guardado"),
    /** globo — reseñó (indicator). */
    Review("M4.2 3.4h15.6a1.6 1.6 0 011.6 1.6v10.2a1.6 1.6 0 01-1.6 1.6H9.4l-6.8 4.4V5a1.6 1.6 0 011.6-1.6z", KColor.text, "reseñó"),
    /** personas — collection for followers. */
    Users(
        "M8.4 11.4a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2zm7.8-.4a3.1 3.1 0 100-6.2 3.1 3.1 0 000 6.2zM1.8 19.6c0-3.1 2.9-5.2 6.6-5.2s6.6 2.1 6.6 5.2H1.8zm14.9 0c0-2.1-.8-3.8-2.1-5 3.2.2 5.4 2.2 5.4 5h-3.3z",
        KColor.text, "seguidores",
    ),
    /** candado — collection only for me. */
    Lock("M7 10V7a5 5 0 0110 0v3h1a1 1 0 011 1v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h6V7a3 3 0 00-6 0v3z", KColor.text, "solo yo"),
    /** triángulo — network failure, with Reintentar. */
    Warn("M12 3l10 18H2L12 3zm-1 6v6h2V9h-2zm0 8v2h2v-2h-2z", KColor.text, "falló");

    val vector: ImageVector by lazy { glyphVector(name, d) }
}

/** Interface icons (the SF Symbols iOS draws), as 24×24 vectors. Tinted by the caller (text by default). */
enum class KIcon(private val build: () -> ImageVector) {
    /** Volver — `chevron.left`. */
    Back({ glyphVector("back", "M14.5 5.5L8 12l6.5 6.5", stroke = 2.4f) }),
    /** Row chevron — `chevron.right` (the row pushes a page). */
    ChevronRight({ glyphVector("chevronRight", "M9.5 5.5L16 12l-6.5 6.5", stroke = 2.4f) }),
    /** `chevron.up.chevron.down` — a row that opens a menu of choices in place. */
    ChevronUpDown({ glyphVector("chevronUpDown", "M8 9.5l4-4 4 4", "M8 14.5l4 4 4-4", stroke = 2.2f) }),
    /** Opciones — `ellipsis`. */
    More({ glyphVector("more", "M5 10.2a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z", "M12 10.2a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z", "M19 10.2a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z") }),
    /** más — Nueva colección / Agregar títulos (never "guardar"). */
    Plus({ glyphVector("plus", "M12 5v14", "M5 12h14", stroke = 2.2f) }),
    /** lupa — `magnifyingglass`. */
    Search({ glyphVector("search", "M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13z", "M15.4 15.4L20 20", stroke = 2.2f) }),
    /** compartir — `square.and.arrow.up`. */
    Share({ glyphVector("share", "M12 3.5v11", "M8 7.2l4-3.7 4 3.7", "M8.5 10H7a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1.5", stroke = 2f) }),
    /** campana — avisos. */
    Bell({ glyphVector("bell", "M12 2.8a6 6 0 00-6 6v3.6l-1.7 3.1a1 1 0 00.9 1.5h13.6a1 1 0 00.9-1.5L18 12.4V8.8a6 6 0 00-6-6zM9.4 18.6a2.7 2.7 0 005.2 0H9.4z") }),
    /** cerrar — `xmark`. */
    Close({ glyphVector("close", "M6.5 6.5l11 11", "M17.5 6.5l-11 11", stroke = 2.2f) }),
    /** Guardar, not saved yet — the bookmark outline (saved = [Glyph.Bookmark] filled). */
    BookmarkOutline({ glyphVector("bookmarkOutline", "M7.4 3.6h9.2a1.6 1.6 0 011.6 1.6v14.6L12 16.6l-6.2 3.2V5.2a1.6 1.6 0 011.6-1.6z", stroke = 2f) }),
    /** Reintentar — `arrow.clockwise`. */
    Retry({ glyphVector("retry", "M19.5 12a7.5 7.5 0 11-2.2-5.3", "M19.6 4.2v4.4h-4.4", stroke = 2.2f) }),
    /** Sin conexión — `wifi.slash`. */
    WifiSlash({ glyphVector("wifiSlash", "M4 4l16 16", "M2.5 9a14 14 0 015.7-3.2", "M13.6 5.3A14 14 0 0121.5 9", "M5.8 12.4a9.4 9.4 0 016-2.3", "M15.6 11a9.4 9.4 0 012.6 1.4", "M9.2 15.8a4.8 4.8 0 015.6 0", "M12 19.4h.01", stroke = 2f) }),
    /** Chosen check over a cover (heavier than [Glyph.Check] at small sizes). */
    CheckBold({ glyphVector("checkBold", "M5.5 12.5l4.2 4.2 8.8-9.4", stroke = 2.8f) });

    val vector: ImageVector by lazy { build() }
}

/**
 * A glyph at [size] in its state color ([color] overrides it). Decorative: TalkBack reads the
 * text next to it (iOS `GlyphView`, accessibilityHidden).
 */
@Composable
fun GlyphIcon(glyph: Glyph, modifier: Modifier = Modifier, size: Dp = 14.dp, color: Color? = null) {
    Image(glyph.vector, contentDescription = null, modifier = modifier.size(size), colorFilter = ColorFilter.tint(color ?: glyph.color))
}

/** An interface icon at [size], [color] = text by default. Decorative; the control carries the label. */
@Composable
fun KIconView(icon: KIcon, modifier: Modifier = Modifier, size: Dp = 20.dp, color: Color = KColor.text) {
    Image(icon.vector, contentDescription = null, modifier = modifier.size(size), colorFilter = ColorFilter.tint(color))
}

// MARK: Dock icons (bespoke filled shapes from the mocks — iOS `DockIcon.path`) ───────────────

/** The four tabs, in dock order. */
enum class KuraTab(val label: String, private val paths: List<String>) {
    Collections(
        "Colecciones",
        listOf(
            "M5.7 4h12.6A1.7 1.7 0 0120 5.7v3.2a1.7 1.7 0 01-1.7 1.7H5.7A1.7 1.7 0 014 8.9V5.7A1.7 1.7 0 015.7 4z",
            "M5.7 13.4h12.6a1.7 1.7 0 011.7 1.7v3.2a1.7 1.7 0 01-1.7 1.7H5.7A1.7 1.7 0 014 18.3v-3.2a1.7 1.7 0 011.7-1.7z",
        ),
    ),
    Discover("Descubrir", listOf("M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z")),
    Feed(
        "Feed",
        listOf(
            "M8 7.8a4.2 4.2 0 110 8.4 4.2 4.2 0 010-8.4z",
            "M17.6 7.6h.8a1.6 1.6 0 010 3.2h-.8a1.6 1.6 0 010-3.2z",
            "M17.1 13.2a1.1 1.6 0 010 3.2 1.1 1.6 0 010-3.2z",
        ),
    ),
    Profile("Perfil", listOf("M12 4.7a3.8 3.8 0 110 7.6 3.8 3.8 0 010-7.6z", "M5 20.5a7 7 0 0114 0z"));

    val icon: ImageVector by lazy { glyphVector("dock$name", *paths.toTypedArray()) }
}
