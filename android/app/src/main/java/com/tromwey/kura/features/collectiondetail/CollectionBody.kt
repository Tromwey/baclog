package com.tromwey.kura.features.collectiondetail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.reaction
import com.tromwey.kura.data.models.CollectionLayout
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.ChipRow
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.Masonry
import com.tromwey.kura.designsystem.components.MasonryBadge
import com.tromwey.kura.designsystem.components.MonoPill
import com.tromwey.kura.designsystem.components.VibeLine
import com.tromwey.kura.designsystem.components.WindowEnd
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.rememberWindow
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.isUnreleased
import com.tromwey.kura.state.releaseLabel
import com.tromwey.kura.state.present
import com.tromwey.kura.state.push

// Everything UNDER a collection's fan and name (iOS `CollectionBody.swift`), shared by Tus
// colecciones (the collection in the centre of the carousel) and Colección — "una sola página".

/**
 * The line (italic 16), the format filter — always when there are titles: one format = a label
 * with its count, several = chips that FILTER (Material `FilterChip`s via [ChipRow], "Todo" first)
 * — then EVERY title: three columns ([Masonry]) or the list (16c), per the collection's own layout
 * and sort. Holding a title opens 18c. Empty = 6b. [metaTop] = the gap above the line (10 under
 * Colección's name, 4 under the carousel's names); [between] slots a strip before the titles.
 */
@Composable
fun CollectionBody(store: AppStore, collection: KCollection, metaTop: Dp = 10.dp, between: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxWidth()) { CollectionBodyContent(store, collection, metaTop, between) }
}

@Composable
private fun CollectionBodyContent(store: AppStore, c: KCollection, metaTop: Dp, between: @Composable () -> Unit) {
    if (c.titleIds.isEmpty()) {
        between()
        EmptyCollectionBody { store.present(SheetRoute.AddTitles(c.id)) }
        return
    }
    // The filter is per collection (a new one in the carousel starts on "Todo").
    var filterRaw by rememberSaveable(c.id) { mutableStateOf<String?>(null) }
    val all = store.titlesIn(c)
    val formats = formatsOf(all)
    val active = MediaFormat.from(filterRaw)?.takeIf { it in formats }
    val visible = if (active == null) all else all.filter { it.format == active }

    Column(
        Modifier.fillMaxWidth().padding(top = metaTop, bottom = 26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        c.shownVibe?.let { VibeLine(it, Modifier.padding(horizontal = 24.dp)) }
        when {
            formats.size == 1 -> {
                val f = formats.first()
                MonoPill(spokenCount(f, all.size), Modifier.padding(top = 6.dp))
            }
            formats.size > 1 -> {
                val options: List<Pair<String?, String>> = listOf<Pair<String?, String>>(null to "Todo · ${all.size}") +
                    formats.map { f -> f.rawValue to "${f.label} · ${all.count { it.format == f }}" }
                ChipRow(options, active?.rawValue, { filterRaw = it }, Modifier.padding(top = 6.dp))
            }
        }
    }
    between()
    if (c.layout == CollectionLayout.List) {
        TitleList(store, visible, c.id)
    } else {
        Masonry(
            titles = visible.map { it.art },
            onOpen = { store.push(Route.TitleRoute(it.id)) },
            badge = { a -> store.title(a.id)?.let { ownBadge(store, it) } ?: MasonryBadge.None },
            onHold = { store.present(SheetRoute.TitleActions(it.id, c.id)) },
            coverModifier = { Modifier.kHeroCover("cover-${it.id}") },
        )
    }
}

/** The formats in the order each first appears. */
fun formatsOf(titles: List<Title>): List<MediaFormat> = titles.map { it.format }.distinct()

/** "3 películas", "1 serie", "2 álbumes" (the label pill and TalkBack). */
fun spokenCount(f: MediaFormat, n: Int): String {
    val one = n == 1
    return when (f) {
        MediaFormat.Film -> "$n ${if (one) "película" else "películas"}"
        MediaFormat.Series -> "$n ${if (one) "serie" else "series"}"
        MediaFormat.Album -> "$n ${if (one) "álbum" else "álbumes"}"
    }
}

/** What a tile of yours wears: the wait wins; then your reaction's glyph (iOS `Masonry.ownBadge`). */
fun ownBadge(store: AppStore, t: Title): MasonryBadge {
    if (store.isUnreleased(t)) store.releaseLabel(t)?.let { return MasonryBadge.Wait(it) }
    return store.mark(t.id)?.let { MasonryBadge.State(it.reaction.glyph) } ?: MasonryBadge.None
}

/**
 * 6b — "colección nueva, repisa vacía" (Newsreader 22, text-2: under the collection's own name
 * it's the second voice) + one line + Agregar títulos (tonal, 48).
 */
@Composable
fun EmptyCollectionBody(onAdd: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 28.dp).padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        BasicText("colección nueva, repisa vacía", style = KuraType.news(22f).copy(color = KColor.text2, textAlign = TextAlign.Center))
        BasicText(
            "Empieza por lo que no puedes dejar de recomendar.",
            style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center, lineHeight = 21.sp),
        )
        GlassButton("Agregar títulos", onAdd, Modifier.padding(top = 14.dp), icon = KIcon.Plus, height = 48.dp, fontSize = 16f)
    }
}

/**
 * 16c · Lista: rows 72, the cover in a 56 slot (poster 40×60, record 56×56), the name in italic 19,
 * the meta in mono 11 led by your reaction's glyph (or the clock while it's not out). No year.
 */
@Composable
fun TitleList(store: AppStore, titles: List<Title>, collectionId: String?) {
    // Windowed (`Windowed.kt`): the first page of rows, growing as the page scrolls.
    val window = rememberWindow(titles)
    Column(Modifier.fillMaxWidth().padding(horizontal = KSize.margin).padding(top = 0.dp)) {
        window.visible.forEach { t ->
            key(t.id) { TitleListRow(store, t, collectionId) }
        }
        WindowEnd(window)
    }
}

@Composable
private fun TitleListRow(store: AppStore, t: Title, collectionId: String?) {
    val m = store.mark(t.id)
    val unreleased = store.isUnreleased(t)
    val meta = buildList {
        add(t.format.metaLabel)
        t.creator?.takeIf { it.isNotEmpty() }?.let(::add)
        if (unreleased) store.releaseLabel(t)?.let(::add)
    }.joinToString(" · ")
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .kPressable(
                feel = KPressFeel.Row((-10).dp),
                onClickLabel = "Abrir",
                onLongPress = { store.present(SheetRoute.TitleActions(t.id, collectionId)) },
            ) { store.push(Route.TitleRoute(t.id)) }
            .clearAndSetSemantics { contentDescription = "${t.name}, $meta" + (m?.let { ", ${it.myLabel}" } ?: "") },
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(56.dp), contentAlignment = Alignment.Center) {
            val album = t.format == MediaFormat.Album
            Cover(
                t.art,
                Modifier.kHeroCover("cover-${t.id}"),
                width = if (album) 56.dp else 40.dp,
                height = if (album) 56.dp else 60.dp,
                radius = KRadius.coverS,
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            BasicText(t.name, style = KuraType.rowWork, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                when {
                    m != null -> GlyphIcon(m.reaction.glyph, size = 12.dp)
                    unreleased -> GlyphIcon(Glyph.Clock, size = 12.dp)
                }
                MonoLabel(meta)
            }
        }
    }
}

/** Compartir + Opciones (44 tonal) over one collection — Colección's top right and the carousel's header. */
@Composable
fun CollectionChips(store: AppStore, collection: KCollection, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconChip44(KIcon.Share, "Compartir ${collection.name}", { store.present(SheetRoute.Share(collection.id)) })
        IconChip44(KIcon.More, "Opciones de ${collection.name}", { store.present(SheetRoute.More(collection.id)) })
    }
}

/**
 * The mono line under "no puedo esperar": "5 títulos · 1 ya salió · el próximo en 14 h". "El
 * próximo" is the first title still NOT out; a label that isn't a date never follows it.
 */
object WaitingMeta {
    fun line(titles: List<Title>, store: AppStore): String {
        val parts = mutableListOf("${titles.size} ${if (titles.size == 1) "título" else "títulos"}")
        val out = titles.count { !store.isUnreleased(it) && it.upcomingSeason == null }
        if (out > 0) parts += if (out == 1) "1 ya salió" else "$out ya salieron"
        titles.firstOrNull { store.isUnreleased(it) || it.upcomingSeason != null }
            ?.let { store.releaseLabel(it) }
            ?.let(::nextLabel)
            ?.let { parts += "el próximo $it" }
        return parts.joinToString(" · ")
    }

    /** "14 h" → "en 14 h" · "16 oct" → "el 16 oct" · "oct 2026" / "2027" → "en …" · "hoy" stays ·
     *  "ya salió" / "sin fecha" → null. */
    fun nextLabel(label: String): String? = when {
        label == "ya salió" || label == "sin fecha" -> null
        label == "hoy" -> "hoy"
        Regex("^\\d+ [hd]$").matches(label) -> "en $label"
        Regex("^\\d+ \\p{L}{3}( \\d{4})?$").matches(label) -> "el $label"
        else -> "en $label"
    }
}
