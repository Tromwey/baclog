package com.tromwey.kura.features.discover

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.art
import com.tromwey.kura.data.models.DiscoverFormatPayload
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.EsMx
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KRgb
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.ChipRow
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.SaveChip
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.kArtGlass
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.loadDiscoverFormat
import com.tromwey.kura.state.label
import com.tromwey.kura.state.push

// Descubrir por formato (Claude Design "Descubrir Final – Formatos" 2a–2c; frontend.md § "Descubrir
// · por formato"). Twin of `DiscoverFormatPage` in ios/Kura/Features/Discover/DiscoverView.swift:
//  - 2a Cine · tiempo y humor: three runtime windows + an OPTIONAL humor (tap it again to clear it);
//    both filter the 2:3 grid, and a picked humor tints the page.
//  - 2b Series · maratón: finished miniseries under two lenses; the pill is the whole series' hours,
//    the meta its network and episodes; Guardar sits on the poster.
//  - 2c Música · por momento: moments read from the chart's genres; the picked one tints the page.
//    Albums 1:1, then "próximos álbumes".
// Every page closes with Colecciones Kuradas. The store drops what's already in your library.

/** What the format page picked: the time window (cine), the lens (series), the humor/moment. */
internal data class FormatPicks(val time: Int = 1, val lens: Int = 1, val mood: Int? = null)

internal fun timeParam(format: MediaFormat, picks: FormatPicks): Int? = if (format == MediaFormat.Film) picks.time else null

internal fun AppStore.formatPayload(format: MediaFormat, picks: FormatPicks): DiscoverFormatPayload? =
    discoverFormats[AppStore.formatKey(format, timeParam(format, picks))]

/** Música opens on the first moment the chart can fill. */
internal fun musicMood(p: DiscoverFormatPayload?, picks: FormatPicks): Int {
    picks.mood?.let { return it }
    p ?: return 0
    return p.moods.indices.firstOrNull { i -> p.titles.any { i in it.moods } } ?: 0
}

/** Cine: the humor's items (all without one). Series: what fits the lens. Música: the moment's. */
internal fun shownItems(format: MediaFormat, p: DiscoverFormatPayload?, picks: FormatPicks): List<DiscoverFormatPayload.Item> {
    p ?: return emptyList()
    return when (format) {
        MediaFormat.Film -> p.titles.filter { picks.mood == null || picks.mood in it.moods }.take(12)
        MediaFormat.Series -> {
            val limit = p.lenses.getOrNull(picks.lens)?.maxMinutes ?: Int.MAX_VALUE
            p.titles.filter { (it.minutes ?: Int.MAX_VALUE) <= limit }.take(12)
        }
        MediaFormat.Album -> {
            val m = musicMood(p, picks)
            p.titles.filter { m in it.moods }.take(8)
        }
    }
}

/** The tones the format page wears: the humor/moment's, else the first cover's. */
internal fun AppStore.formatHexes(format: MediaFormat, picks: FormatPicks): List<String> {
    val p = formatPayload(format, picks)
    val moods = p?.moods ?: emptyList()
    val shown = shownItems(format, p, picks)
    return when (format) {
        MediaFormat.Film -> picks.mood?.let { moods.getOrNull(it)?.palette } ?: shown.firstOrNull()?.let { fresh(it.title).palette } ?: emptyList()
        MediaFormat.Series -> shown.firstOrNull()?.let { fresh(it.title).palette } ?: emptyList()
        MediaFormat.Album -> moods.getOrNull(musicMood(p, picks))?.palette ?: emptyList()
    }
}

private val fallbackTimes = listOf(
    DiscoverFormatPayload.Choice("una hora y algo", "menos de 100 min"),
    DiscoverFormatPayload.Choice("hasta dos horas", "100 a 130 min"),
    DiscoverFormatPayload.Choice("sin prisa", "más de 130 min"),
)

@Composable
internal fun DiscoverFormatPage(store: AppStore, format: MediaFormat, picks: FormatPicks, onPicks: (FormatPicks) -> Unit) {
    val p = store.formatPayload(format, picks)
    val shown = shownItems(format, p, picks)
    val time = timeParam(format, picks)
    // The first read failed (a 503 while the catalog is down, no network): say so and offer it again,
    // never the empty sentence of a shelf that did load.
    val error = if (p == null) store.loadError(LoadKey.DiscoverFormat(format, time)) else null
    // Reintentar of a shelf that came `titlesUnavailable`: the strip gives way to the loading tiles
    // while it's asked again (the payload stays, so nothing else would say the tap did something).
    var retrying by remember(format, time) { mutableStateOf(false) }
    val retry: () -> Unit = {
        if (!retrying) store.launch {
            retrying = true
            try { store.loadDiscoverFormat(format, time) } finally { retrying = false }
        }
    }
    Column(Modifier.fillMaxWidth()) {
        when (format) {
            MediaFormat.Film -> {
                PageQuestion("¿cuánto tiempo tienes?")
                Choices(p?.times?.ifEmpty { null } ?: fallbackTimes, picks.time) { onPicks(picks.copy(time = it)) }
                BasicText(
                    "¿y de qué humor?",
                    Modifier.padding(start = KSize.margin, end = KSize.margin, top = 30.dp, bottom = 14.dp).semantics { heading() },
                    style = KuraType.news(22f),
                )
                MoodRow(p?.moods ?: emptyList(), picks.mood) { i -> onPicks(picks.copy(mood = if (picks.mood == i) null else i)) }
                Grid(
                    format, p, shown, error, retry, retrying = retrying,
                    empty = if (p?.titles?.isEmpty() == true) "No pudimos traer películas. Vuelve a intentarlo más tarde."
                    else "Nada con ese humor en ese tiempo. Prueba otra duración o quita el humor.",
                ) { item ->
                    val t = store.fresh(item.title)
                    Tile(store, t, pill = item.runtimeMinutes?.let { "$it min" }) {
                        MonoLabel(
                            if (item.inCinemas) "En cines" else listOfNotNull(t.year?.toString(), item.genre).joinToString(" · "),
                            size = 10f,
                        )
                    }
                }
            }
            MediaFormat.Series -> {
                PageQuestion("para maratonear", bottom = 18.dp)
                val lenses = p?.lenses ?: emptyList()
                if (lenses.isNotEmpty()) Choices(lenses, picks.lens) { onPicks(picks.copy(lens = it)) }
                Grid(
                    format, p, shown, error, retry, retrying = retrying,
                    empty = if (p?.titles?.isEmpty() == true) "No pudimos traer series. Vuelve a intentarlo más tarde."
                    else "Nada tan corto por ahora. Prueba con un fin de semana.",
                ) { item ->
                    val t = store.fresh(item.title)
                    Tile(store, t, pill = item.minutes?.let(::hoursLabel), save = true) {
                        KIconView(KIcon.Play, size = 9.dp, color = KColor.text2)
                        MonoLabel(listOfNotNull(item.network, item.episodes?.let { "$it ep" }).joinToString(" · "), size = 10f)
                    }
                }
            }
            MediaFormat.Album -> {
                PageQuestion("¿para qué momento?", bottom = 18.dp)
                MoodRow(p?.moods ?: emptyList(), if (p == null) null else musicMood(p, picks)) { i -> onPicks(picks.copy(mood = i)) }
                Grid(
                    format, p, shown, error, retry, retrying = retrying,
                    empty = if (p?.titles?.isEmpty() == true) "No pudimos traer álbumes. Vuelve a intentarlo más tarde."
                    else "Nada para ese momento en lo que más suena hoy. Prueba otro.",
                ) { item ->
                    val t = store.fresh(item.title)
                    Tile(store, t, pill = null) {
                        MonoLabel(listOfNotNull(t.creator, t.year?.toString()).joinToString(" · "), size = 10f)
                    }
                }
            }
        }
        Kuradas(store, format, p?.kuradas ?: emptyList())
        if (format == MediaFormat.Album) SoonDiscs(store, heroesExcept = shown.map { it.title.id }.toSet())
    }
}

@Composable
private fun PageQuestion(text: String, bottom: androidx.compose.ui.unit.Dp = 16.dp) {
    BasicText(
        text,
        Modifier.padding(start = KSize.margin, end = KSize.margin, top = 32.dp, bottom = bottom).semantics { heading() },
        style = KuraType.news(34f),
    )
}

/**
 * "¿cuánto tiempo tienes?" · "una tarde" — the DS `ChipRow` (Material `FilterChip`, the chrome that
 * operates the app), with the chosen window's range under it in mono ("100 A 130 MIN"). iOS draws
 * the same since 2026-09-30 (one row of one-line pills + the range as a caption).
 */
@Composable
private fun Choices(choices: List<DiscoverFormatPayload.Choice>, selection: Int, onSelect: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ChipRow(choices.mapIndexed { i, c -> i to c.label }, selection, onSelect)
        choices.getOrNull(selection)?.let { MonoLabel(it.sub, Modifier.padding(horizontal = KSize.margin), size = 10f, tracking = 0.06f) }
    }
}

/**
 * The humor / moment swatches: a 64 disc in the mood's two tones. The picked one carries a check
 * and its label in text (fill/glyph change, no ring — Kura has no outlines); the rest read in text-2.
 */
@Composable
private fun MoodRow(moods: List<DiscoverFormatPayload.Mood>, selection: Int?, onPick: (Int) -> Unit) {
    if (moods.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 15.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        moods.forEachIndexed { i, m ->
            val on = selection == i
            Column(
                Modifier
                    .width(76.dp)
                    .kPressable(KPressFeel.Dim, onClickLabel = m.label) { onPick(i) }
                    .semantics(mergeDescendants = true) { selected = on },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                val colors = m.palette.map { KRgb.hex(it).color }.ifEmpty { listOf(KColor.s2, KColor.s2) }
                Box(
                    Modifier.padding(5.dp).size(64.dp).clip(CircleShape)
                        .background(Brush.linearGradient(if (colors.size == 1) colors + colors else colors)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (on) KIconView(KIcon.CheckBold, size = 20.dp, color = KColor.text)
                }
                BasicText(
                    m.label,
                    style = KuraType.ui(13f).copy(color = if (on) KColor.text else KColor.text2, textAlign = TextAlign.Center),
                    maxLines = 3,
                )
            }
        }
    }
}

/** The 2-column grid, with its loading shape (still tiles) and its empty sentence. */
@Composable
private fun Grid(
    format: MediaFormat,
    p: DiscoverFormatPayload?,
    shown: List<DiscoverFormatPayload.Item>,
    error: KuraApiError?,
    onRetry: () -> Unit,
    empty: String,
    retrying: Boolean = false,
    cell: @Composable (DiscoverFormatPayload.Item) -> Unit,
) {
    val m = Modifier.padding(start = KSize.margin, end = KSize.margin, top = 26.dp)
    val aspect = if (format == MediaFormat.Album) 1f else 2f / 3f
    when {
        p == null && error != null -> RetryStrip(
            when {
                error == KuraApiError.Offline -> "Sin conexión. No se cargó el resto."
                format == MediaFormat.Film -> "No pudimos traer películas."
                format == MediaFormat.Series -> "No pudimos traer series."
                else -> "No pudimos traer álbumes."
            },
            onRetry = onRetry,
            modifier = m,
            offline = error == KuraApiError.Offline,
        )
        // The shelf's source failed and the Kuradas came: not an empty shelf — say so, offer it again.
        p?.titlesUnavailable == true && !retrying -> RetryStrip(
            when (format) {
                MediaFormat.Film -> "No pudimos traer películas."
                MediaFormat.Series -> "No pudimos traer series."
                else -> "No pudimos traer álbumes."
            },
            onRetry = onRetry,
            modifier = m,
        )
        p == null || p.titlesUnavailable -> Column(m.clearAndSetSemantics { }, verticalArrangement = Arrangement.spacedBy(24.dp)) {
            repeat(2) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    repeat(2) {
                        Box(Modifier.weight(1f).aspectRatio(aspect).background(KColor.glassBg, RoundedCornerShape(KRadius.coverL)))
                    }
                }
            }
        }
        shown.isEmpty() -> NoteText(empty, m)
        else -> Column(m, verticalArrangement = Arrangement.spacedBy(24.dp)) {
            shown.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    pair.forEach { item -> Box(Modifier.weight(1f)) { cell(item) } }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

/** A grid tile: the cover (fluid, radius 14) with its mono pill and, for series, Guardar on it. */
@Composable
private fun Tile(store: AppStore, t: Title, pill: String?, save: Boolean = false, meta: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().kPressable(onClickLabel = "Abrir ${t.name}") { store.push(Route.TitleRoute(t.id)) },
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Box {
            TitleCover(store, t, radius = 14.dp, fluid = true)
            if (pill != null) {
                Box(
                    Modifier.align(Alignment.BottomStart).padding(8.dp).height(26.dp).kArtGlass().padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    BasicText(pill, style = KuraType.mono(11f, tracking = 0.04f))
                }
            }
            if (save) {
                SaveChip(store.savedCount(t.id), onClick = { store.openSaveTo(t.id) }, modifier = Modifier.align(Alignment.TopEnd).padding(6.dp))
            }
        }
        BasicText(t.name, style = KuraType.newsItalic(18f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) { meta() }
    }
}

/** "3,9 h" / "12 h" — one decimal, Spanish comma (twin of the web's `hoursLabel`). */
internal fun hoursLabel(minutes: Int): String {
    val h = Math.round(minutes / 60.0 * 10) / 10.0
    val s = if (h == Math.floor(h)) h.toInt().toString() else String.format(java.util.Locale.ROOT, "%.1f", h).replace('.', ',')
    return "$s h"
}

/** Colecciones Kuradas: team collections, 300 tinted cards that snap, each opens as a public collection. */
@Composable
private fun Kuradas(store: AppStore, format: MediaFormat, cards: List<DiscoverFormatPayload.Kurada>) {
    if (cards.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(top = 44.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.padding(horizontal = KSize.margin), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            BasicText("Colecciones Kuradas", Modifier.semantics { heading() }, style = KuraType.news(22f))
            NoteText("Hechas a mano por nuestros expertos")
        }
        val state = rememberLazyListState()
        LazyRow(
            state = state,
            contentPadding = PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            flingBehavior = rememberSnapFlingBehavior(state, SnapPosition.Start),
        ) {
            items(cards, key = { it.id }) { k -> KuradaCard(store, format, k) }
        }
    }
}

@Composable
private fun KuradaCard(store: AppStore, format: MediaFormat, k: DiscoverFormatPayload.Kurada) {
    val shape = RoundedCornerShape(KRadius.screen)
    Column(
        Modifier
            .width(300.dp)
            .kPressable(onClickLabel = "Abrir ${k.name}") { store.push(Route.PublicCollection(k.handle, k.id)) }
            .kTint(k.palette, TintStyle.Card, shape)
            .padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.fillMaxWidth().heightIn(min = 150.dp), contentAlignment = Alignment.BottomCenter) {
            FanView(k.covers.map { store.fresh(it).art }, lead = if (format == MediaFormat.Album) 118.dp else 140.dp, label = "Portadas de ${k.name}")
        }
        BasicText(k.name, style = KuraType.news(24f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            // The Kurada seal: the house's "k" in honey (the mark, not an action).
            Box(Modifier.size(26.dp).background(KColor.accent, CircleShape).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
                BasicText("k", style = KuraType.news(15f, italic = true, medium = true).copy(color = KColor.onAccent))
            }
            BasicText(
                "${k.curator} · ${format.label.lowercase(EsMx)}",
                Modifier.weight(1f),
                style = KuraType.ui(13f).copy(color = KColor.text2),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            MonoLabel(if (k.count == 1) "1 título" else "${k.count} títulos", size = 10f)
        }
    }
}

/**
 * "próximos álbumes" — `GET /discover`'s `upcomingAlbums` (≤ 12); an older server without it falls
 * back to the albums of "los más esperados".
 */
@Composable
private fun SoonDiscs(store: AppStore, heroesExcept: Set<String>) {
    val d = store.discover ?: return
    val source = d.upcomingAlbums.ifEmpty { d.upcoming }
    val items = source.map { store.fresh(it.title) to it.releaseDate }
        .filter { it.first.format == MediaFormat.Album }
        .map { (t, date) -> CoverRowItem(t, "", date?.let { store.label(Release.Day(KuraJson.dayAtNoon(it))) }) }
    CoverRow(
        store, "próximos álbumes", items,
        heroes = items.map { it.title.id }.filterNot { it in heroesExcept }.toSet(),
        modifier = Modifier.padding(top = 40.dp),
    )
}
