package com.tromwey.kura.features.party

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyContributor
import com.tromwey.kura.data.models.PartyCopy
import com.tromwey.kura.data.models.PartyPerson
import com.tromwey.kura.data.models.PartySong
import com.tromwey.kura.data.models.atOrSomeone
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.CoverArt
import com.tromwey.kura.designsystem.components.CoverImage
import com.tromwey.kura.designsystem.components.CoverShape
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.components.kSkeletonPulse
import com.tromwey.kura.designsystem.kShadow
import com.tromwey.kura.designsystem.KShadow
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.present

// The pieces the party screens share (twin of ios/Kura/Features/Party/PartyComponents.swift, design
// `fiesta-app-v2`). Covers are records (1:1) drawn with the DS `CoverImage` / `FanView`; the page
// tint is the DS feed surface. Content is Kura; the buttons that operate it are the DS's Material.

/** A song as the DS draws it: a record (1:1), its palette while it loads. */
val PartySong.cover: CoverArt get() = CoverArt(PartySong.ART_PREFIX + titleId, title, artworkUrl, palette, CoverShape.Album)

/** A song's cover at [size]: the art over its palette (s2 without one), the cover shadow. */
@Composable
fun SongCover(url: String?, palette: List<String>, modifier: Modifier = Modifier, size: Dp = 56.dp, radius: Dp = 10.dp, shadow: Boolean = true) {
    val shape = RoundedCornerShape(radius)
    Box(
        modifier.size(size)
            .then(if (shadow) Modifier.kShadow(KShadow.Cover, shape) else Modifier)
            .clip(shape)
            .clearAndSetSemantics { },
    ) {
        CoverImage(url, palette.ifEmpty { listOf("#1c1c21") }, Modifier.size(size))
    }
}

/** An empty slot the size of a cover (the slots card). */
@Composable
fun EmptySongSlot(size: Dp = 44.dp, radius: Dp = 6.dp) {
    Box(Modifier.size(size).background(KColor.glassBg, RoundedCornerShape(radius)).clearAndSetSemantics { })
}

/**
 * A person's seal in a party (design `avatar(by, size)`): the initial of the handle, Hanken 600
 * uppercase at 52 %, `sealInk` on a flat disk of one of `KColor.sealHexes` — the same tone for the
 * same person everywhere (a stable hash of the handle). "alguien" is a "·" on `sealSomeone`. The
 * photo covers it when there is one. No border, no glow.
 */
@Composable
fun PartySeal(person: PartyPerson?, size: Dp = 18.dp, modifier: Modifier = Modifier) {
    val key = person?.let { it.handle.ifEmpty { it.name } }.orEmpty()
    val bg = remember(key) { if (key.isEmpty()) KColor.sealSomeone else sealTone(key) }
    Box(modifier.size(size).clip(CircleShape).background(bg).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        BasicText(
            sealInitial(key),
            style = KuraType.ui(size.value * 0.52f, UiWeight.SemiBold).copy(
                color = if (key.isEmpty()) KColor.text2 else KColor.sealInk,
            ),
            maxLines = 1,
        )
        person?.avatarUrl?.let { url ->
            val context = LocalContext.current
            val req = remember(url) { ImageRequest.Builder(context).data(url).crossfade(200).build() }
            AsyncImage(req, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size))
        }
    }
}

internal fun sealInitial(key: String): String = key.firstOrNull { it.isLetterOrDigit() }?.uppercase() ?: "·"

/** FNV-1a over the lowercased handle's UTF-8, then murmur3's finalizer → one of the six tones (iOS `PartySeal.tone`). */
internal fun sealToneIndex(key: String): Int {
    var h = 2_166_136_261u
    for (b in key.lowercase().encodeToByteArray()) h = (h xor b.toUByte().toUInt()) * 16_777_619u
    h = h xor (h shr 16); h *= 0x85eb_ca6bu; h = h xor (h shr 13); h *= 0xc2b2_ae35u; h = h xor (h shr 16)
    return (h % KColor.sealHexes.size.toUInt()).toInt()
}

private fun sealTone(key: String): Color = Color(android.graphics.Color.parseColor(KColor.sealHexes[sealToneIndex(key)]))

/** The contributors' seals (up to 6, overlapping 7) + "tuya · 8 canciones" / "de @eric · 8 canciones". */
@Composable
fun PartyCredits(contributors: List<PartyContributor>, host: PartyPerson?, isHost: Boolean, songCount: Int, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (contributors.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy((-7).dp)) {
                contributors.take(6).forEach { c ->
                    Box(Modifier.size(30.dp).background(Color.Black.copy(alpha = 0.35f), CircleShape), contentAlignment = Alignment.Center) {
                        PartySeal(c.person, 26.dp)
                    }
                }
            }
        }
        val n = PartyCopy.songs(songCount)
        BasicText(if (isHost) "tuya · $n" else "de ${host.atOrSomeone} · $n", style = KuraType.ui(13f).copy(color = KColor.text2))
    }
}

/**
 * One row of "las canciones": cover 56, italic title, artist, the seal + "Agregó @x"; "…" for the host.
 * Tapping it opens the song's sheet when there's something to do with it ([onTap]).
 */
@Composable
fun PartySongRow(song: PartySong, modifier: Modifier = Modifier, showMore: Boolean = false, onTap: (() -> Unit)? = null, onMore: (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth()
            .then(if (onTap != null) Modifier.kPressable(feel = KPressFeel.Dim, onClickLabel = "Opciones de ${song.title}", onClick = onTap) else Modifier)
            .padding(vertical = 8.dp, horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SongCover(song.artworkUrl, song.palette)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(song.title, style = KuraType.newsItalic(17f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            song.artist?.let { BasicText(it, style = KuraType.ui(14f).copy(color = KColor.text2), maxLines = 1, overflow = TextOverflow.Ellipsis) }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (!song.mine) PartySeal(song.addedBy, 18.dp)
                BasicText(song.byShort, style = KuraType.ui(12f).copy(color = KColor.text2), maxLines = 1)
            }
        }
        if (showMore && onMore != null) {
            IconChip44(KIcon.More, "Opciones de ${song.title}", onMore, fill = Color.Transparent, iconColor = KColor.text2)
        }
    }
}

/** The skeleton of "las canciones" (design `loading`): five rows. */
@Composable
fun PartyRowsSkeleton(modifier: Modifier = Modifier, trailing: Dp = 44.dp) {
    Column(modifier.kSkeletonPulse().clearAndSetSemantics { contentDescription = "Cargando las canciones" }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        val w1 = listOf(140, 180, 120, 160, 110)
        val w2 = listOf(90, 70, 110, 80, 100)
        repeat(5) { i ->
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp, horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(56.dp).background(KColor.glassBg, RoundedCornerShape(10.dp)))
                Column(Modifier.weight(1f).padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(w1[i].dp, 12.dp).background(KColor.glassBg, CircleShape))
                    Box(Modifier.size(w2[i].dp, 10.dp).background(Color.White.copy(alpha = 0.05f), CircleShape))
                }
                if (trailing > 0.dp) Box(Modifier.size(trailing, 44.dp).background(Color.White.copy(alpha = 0.05f), CircleShape))
            }
        }
    }
}

/** A sheet's big lowercase title (Newsreader 34, fiesta-app-v2's sheets). */
@Composable
fun PartySheetTitle(text: String, modifier: Modifier = Modifier) {
    BasicText(text, modifier.semantics { heading() }, style = KuraType.news(34f).copy(lineHeight = 38.sp))
}

/** Body copy under a sheet title (Hanken 15, text-2). */
@Composable
fun PartySheetBody(text: String, modifier: Modifier = Modifier) {
    BasicText(text, modifier, style = KuraType.ui(15f).copy(color = KColor.text2, lineHeight = 21.sp))
}

/**
 * The sheets' secondary actions ("Quitar de la colección", "Crear link nuevo") — the DS tonal
 * button full width, 52; [quiet] = the text-2 dismiss ("Cancelar") on no fill.
 */
@Composable
fun PartyFlatButton(title: String, onClick: () -> Unit, modifier: Modifier = Modifier, quiet: Boolean = false, enabled: Boolean = true) {
    GlassButton(
        title, onClick, modifier,
        height = if (quiet) 48.dp else 52.dp,
        fullWidth = true,
        fill = if (quiet) Color.Transparent else KColor.glassBg,
        enabled = enabled,
    )
}

/** "Canciones por invitado": − value + (0 solo ver · 1…5 · ilimitadas). */
@Composable
fun PartyLimitStepper(limit: Int?, onChange: (Int?) -> Unit, modifier: Modifier = Modifier) {
    val haptic = rememberKHaptic()
    val index = PartyCopy.limits.indexOf(limit).takeIf { it >= 0 } ?: 3
    val label = PartyCopy.limitLabel(limit)
    Row(
        modifier.fillMaxWidth().height(60.dp)
            .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(KRadius.surface))
            .padding(horizontal = 8.dp)
            .semantics(mergeDescendants = true) { stateDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconChip44(KIcon.Minus, "Menos", {
            if (index > 0) { haptic(KHapticEvent.Selection); onChange(PartyCopy.limits[index - 1]) }
        }, fill = KColor.glassBg, iconColor = if (index > 0) KColor.text else KColor.text3)
        BasicText(
            label,
            Modifier.weight(1f),
            style = KuraType.mono(15f, medium = true).copy(textAlign = androidx.compose.ui.text.style.TextAlign.Center),
        )
        IconChip44(KIcon.Plus, "Más", {
            if (index < PartyCopy.limits.size - 1) { haptic(KHapticEvent.Selection); onChange(PartyCopy.limits[index + 1]) }
        }, fill = KColor.glassBg, iconColor = if (index < PartyCopy.limits.size - 1) KColor.text else KColor.text3)
    }
}

/** A party's pair of 44 chips: the host's Compartir + Opciones, a guest's Opciones (Salir). */
@Composable
fun PartyChips(store: AppStore, party: Party) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (party.isHost) IconChip44(KIcon.Share, "Compartir ${party.name}", { store.present(SheetRoute.PartyShare(party.id)) })
        IconChip44(KIcon.More, "Opciones de ${party.name}", { store.present(SheetRoute.PartyOptions(party.id)) })
    }
}

/** The slots card and friends: s1-ish flat card, radius 26, inset 12. */
@Composable
internal fun PartyCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(bottom = 22.dp)
            .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(KRadius.screen))
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) { content() }
}

/** Mono label shortcut used by the party screens. */
@Composable
internal fun PartyMono(text: String, modifier: Modifier = Modifier, size: Float = 10f, color: Color = KColor.text2) =
    MonoLabel(text, modifier, size = size, color = color)
