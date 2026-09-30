package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KShadow
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.kShadow

/**
 * The fan (Colecciones formalizado · "El abanico es la colección"; twin of iOS `FanView` and the
 * web's fan.tsx — same numbers): three covers with no box — the front one upright and centered,
 * the second tilted −10° behind on the left, the third +9° behind on the right. One geometry at
 * lead = 225 on a 300 × 225 box, scaled by `s = lead / 225`: 225 a collection's header · 186 the
 * pinned one on a profile · 99 the profile grid · 51 a picker row · 22 a pill.
 *
 * Each slot keeps its title's native form (poster 2:3, record 1:1). One or two titles show only
 * the covers there are. [covers] come in FAN order, front first (`data.models.FanOrder.fan`: the chosen
 * cover when it's still a member, then the manual order). [ghost] draws all three empty with the dashed "+" in front ([plus]) — the
 * empty / loading states. [label] names it for TalkBack ("Portadas de verano 2026"); null = decorative.
 */
@Composable
fun FanView(covers: List<CoverArt>, lead: Dp, modifier: Modifier = Modifier, ghost: Boolean = false, plus: Boolean = true, label: String? = null) {
    val s = lead.value / 225f
    val box = fanBox(lead)
    val radius = when {
        s >= 0.5f -> 14.dp
        s >= 0.35f -> 10.dp
        s >= 0.18f -> 7.dp
        else -> 4.dp
    }
    Box(modifier.size(box).clearAndSetSemantics { if (label != null) contentDescription = label }) {
        // Painted back to front: left, right, then the front one.
        if (ghost || covers.size >= 2) FanSlot(covers.getOrNull(1), 0, s, radius, ghost, plus, lead)
        if (ghost || covers.size >= 3) FanSlot(covers.getOrNull(2), 1, s, radius, ghost, plus, lead)
        if (ghost || covers.isNotEmpty()) FanSlot(covers.getOrNull(0), 2, s, radius, ghost, plus, lead)
    }
}

/** The box a fan of [lead] takes: 300·s × lead (no floor to clear any more). */
fun fanBox(lead: Dp): DpSize = DpSize((300f * lead.value / 225f).let { kotlin.math.round(it) }.dp, kotlin.math.round(lead.value).dp)

private data class FanAt(val cx: Float, val cy: Float, val rot: Float)

private val fanFront = FanAt(150f, 112.5f, 0f)
private val fanLeft = FanAt(69.5f, 126f, -10f)
private val fanRight = FanAt(231.5f, 126.5f, 9f)

@Composable
private fun FanSlot(title: CoverArt?, index: Int, s: Float, radius: Dp, ghost: Boolean, plus: Boolean, lead: Dp) {
    val isFront = index == 2
    val at = when (index) {
        0 -> fanLeft
        1 -> fanRight
        else -> fanFront
    }
    // An empty back slot on the right keeps the record's square (the frames' mix).
    val album = title?.let { it.shape == CoverShape.Album } ?: (!isFront && index == 1)
    val (w0, h0) = if (isFront) (if (album) 180f to 180f else 150f to 225f) else (if (album) 135f to 135f else 117f to 176f)
    val w = w0 * s
    val h = h0 * s
    val shape = RoundedCornerShape(radius)
    Box(
        Modifier
            .offset(x = (at.cx * s - w / 2).dp, y = (at.cy * s - h / 2).dp)
            .size(w.dp, h.dp)
            .graphicsLayer { rotationZ = at.rot }
            .fanShadow(s, shape)
            .clip(shape)
            .background(KColor.s1),
        contentAlignment = Alignment.Center,
    ) {
        if (!ghost && title != null) CoverImage(title.url, title.palette, Modifier.fillMaxSize())
        if (ghost && isFront) {
            Box(Modifier.fillMaxSize().dashedOutline(radius))
            if (plus && lead >= 60.dp) KIconView(KIcon.Plus, size = kotlin.math.round(maxOf(18f, 26f * s)).dp, color = KColor.text2)
        }
    }
}

/** The cover shadow by scale: the system's cover shadow at header sizes, tighter below. */
private fun Modifier.fanShadow(s: Float, shape: androidx.compose.ui.graphics.Shape): Modifier = when {
    s >= 0.35f -> kShadow(KShadow.Cover, shape)
    // `0 10px 18px -8px rgba(0,0,0,.9)`
    s >= 0.18f -> dropShadow(shape, Shadow(radius = 18.dp, color = Color.Black.copy(alpha = 0.9f), spread = (-8).dp, offset = DpOffset(0.dp, 10.dp)))
    // `0 3px 6px -3px rgba(0,0,0,.9)`
    else -> dropShadow(shape, Shadow(radius = 6.dp, color = Color.Black.copy(alpha = 0.9f), spread = (-3).dp, offset = DpOffset(0.dp, 3.dp)))
}

/**
 * A collection in a picker ("guardar en", "mover a"): its mini fan at 51, the name in Newsreader
 * 18, "N títulos · ya está" in mono, and the check disc ([single] = a radio dot, one of many). 72.
 */
@Composable
fun FanPickRow(
    name: String,
    covers: List<CoverArt>,
    count: Int,
    on: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    note: String? = null,
    disabled: Boolean = false,
    single: Boolean = false,
) {
    val titles = if (count == 1) "título" else "títulos"
    Row(
        modifier
            .fillMaxWidth()
            .alpha(if (disabled) 0.45f else 1f)
            .kPressable(feel = KPressFeel.Row(0.dp), enabled = !disabled, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = "$name, $count $titles" + (note?.let { ", $it" } ?: "")
                selected = on
            }
            .heightIn(min = 72.dp)
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FanView(covers, 51.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(name, style = KuraType.news(18f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            MonoLabel("$count $titles" + (note?.let { " · $it" } ?: ""), size = 10f)
        }
        if (single) RadioDot(on) else RadioMark(on)
    }
}

/** "Nueva colección" as the first row of a picker: the "+" in the fan's column. */
@Composable
fun NewCollectionRow(onClick: () -> Unit, modifier: Modifier = Modifier, label: String = "Nueva colección") {
    Row(
        modifier.fillMaxWidth().kPressable(feel = KPressFeel.Row(0.dp), onClick = onClick).heightIn(min = 64.dp).padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(fanBox(51.dp).width), contentAlignment = Alignment.Center) { KIconView(KIcon.Plus, size = 20.dp, color = KColor.text2) }
        BasicText(label, style = KuraType.row)
    }
}

// MARK: The fan as a collection (founder 2026-09-27: the horizontal card with a spine is gone)

/**
 * A collection's header (iOS `FanHeader`, CollectionDetailView): the fan at 225 (the ghost when
 * empty; with [onGhost] the ghost is the way in and wears the "+"), the [label] slot (mono
 * "fijada" only when it is, or the automatic collection's [AutoPill]), the name in Newsreader 36
 * (30 on the ghost), then [below] (a [VibeLine], a mono meta line). Who sees it is NOT shown here
 * (founder: it lives in Opciones › Quién la ve). Top 126 under the chrome, sides 24.
 */
@Composable
fun FanHeader(
    fan: List<CoverArt>,
    name: String,
    modifier: Modifier = Modifier,
    ghost: Boolean = false,
    onGhost: (() -> Unit)? = null,
    bottom: Dp = 26.dp,
    fanModifier: Modifier = Modifier,
    label: @Composable () -> Unit = {},
    below: @Composable () -> Unit = {},
) {
    Column(
        modifier.fillMaxWidth().padding(top = 126.dp, start = 24.dp, end = 24.dp, bottom = bottom),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (ghost && onGhost != null) {
            FanView(emptyList(), 225.dp, fanModifier.kPressable(onClickLabel = "Agregar a $name", onClick = onGhost), ghost = true, label = "Agregar a $name")
        } else {
            FanView(fan, 225.dp, fanModifier, ghost = ghost, label = "Portadas de $name")
        }
        label()
        BasicText(
            name,
            modifier = Modifier.padding(top = if (ghost) 6.dp else 0.dp).semantics { heading() },
            style = KuraType.news(if (ghost) 30f else 36f).copy(textAlign = TextAlign.Center),
        )
        below()
    }
}

/** A collection's line: Newsreader italic 16, text-2, centered, ~300 wide (iOS `VibeLine`). */
@Composable
fun VibeLine(text: String, modifier: Modifier = Modifier, size: Float = 16f) {
    BasicText(
        text,
        modifier = modifier.widthIn(max = 300.dp),
        style = KuraType.newsItalic(size).copy(color = KColor.text2, textAlign = TextAlign.Center),
    )
}

/**
 * A collection as a tile of the profile's vitrina (iOS `CollectionsShowcase`): the fan, then the
 * name and "N títulos" in mono. [featured] = the pinned/front one: fan 186, "fijada · N títulos"
 * ABOVE the name in Newsreader 28; otherwise the grid tile (two columns): fan 99, name 20, count
 * under it. An empty collection draws the ghost without "+". Tap opens; [onHold] = 9a (yours).
 * [fanModifier] carries `kHeroCover` when the collection opens as a hero.
 */
@Composable
fun FanCollectionTile(
    name: String,
    count: Int,
    covers: List<CoverArt>,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    featured: Boolean = false,
    pinned: Boolean = false,
    onHold: (() -> Unit)? = null,
    fanModifier: Modifier = Modifier,
) {
    val titles = "$count ${if (count == 1) "título" else "títulos"}"
    Column(
        modifier
            .kPressable(onLongPress = onHold, onClick = onOpen)
            .clearAndSetSemantics { contentDescription = "$name, $titles" + if (pinned) ", fijada" else "" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FanView(covers, if (featured) 186.dp else 99.dp, fanModifier, ghost = covers.isEmpty(), plus = false)
        if (featured) {
            MonoLabel((if (pinned) "fijada · " else "") + titles, size = 10f)
            BasicText(name, style = KuraType.news(28f).copy(textAlign = TextAlign.Center))
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                BasicText(name, style = KuraType.news(20f).copy(textAlign = TextAlign.Center))
                MonoLabel(titles, size = 10f)
            }
        }
    }
}
