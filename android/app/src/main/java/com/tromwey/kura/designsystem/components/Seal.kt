package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.tromwey.kura.designsystem.EsMx
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KRgb
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.Newsreader

/** The DS seal sizes: 128 profile · 48 row · 32–36 list. */
object SealSize {
    val profile = 128.dp
    val row = 48.dp
    val list = 36.dp
    val small = 32.dp
}

/**
 * The seal: the avatar (twin of iOS `Seal`). Two lowercase initials in Newsreader MediumItalic
 * at 42 % of the diameter, on the featured obsession's DARK tone inverted (`0xffffff ^ hex`) and
 * mixed 72 % toward bg; the initials are the LIGHT tone inverted, mixed 55 % toward text. Without
 * a palette: s2 + text. [photo] (a URL, or a Coil `ImageRequest` carrying the bearer for the API's
 * own `/api/avatar/…`) covers the initials once it loads; if it can't, the seal stays. No border,
 * no glow. Decorative for TalkBack: the name next to it is what's read.
 */
@Composable
fun Seal(initials: String, hexes: List<String>, modifier: Modifier = Modifier, size: Dp = SealSize.row, photo: Any? = null) {
    val (bg, ink) = remember(hexes) { sealColors(hexes) }
    val font = size.value * 0.42f
    Box(modifier.size(size).clip(CircleShape).background(bg).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        BasicText(
            initials.lowercase(EsMx),
            // The italic's slant leans right: iOS nudges it back by 4 % of the font (padding trailing).
            modifier = Modifier.padding(end = (font * 0.04f).dp),
            style = TextStyle(
                fontFamily = Newsreader,
                fontWeight = FontWeight.Medium,
                fontStyle = FontStyle.Italic,
                fontSize = KuraType.fixed(font),
                letterSpacing = (-0.035).em,
                lineHeight = 1.em,
                lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both),
                color = ink,
            ),
            maxLines = 1,
        )
        if (photo != null) {
            val context = LocalContext.current
            val model = remember(photo) { if (photo is String) ImageRequest.Builder(context).data(photo).crossfade(200).build() else photo }
            AsyncImage(model = model, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

/** (background, initials) of a seal — the DS inversion formula. */
fun sealColors(hexes: List<String>): Pair<Color, Color> {
    if (hexes.size < 2) return KColor.s2 to KColor.text
    val bg = KRgb.hex(hexes[0]).inverted.mix(KRgb.hex(KColor.bgHex), 0.72)
    val fg = KRgb.hex(hexes[1]).inverted.mix(KRgb.hex(KColor.textHex), 0.55)
    return bg.color to fg.color
}
