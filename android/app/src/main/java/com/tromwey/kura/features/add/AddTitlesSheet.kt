package com.tromwey.kura.features.add

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.art
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.LocalReduceMotion
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.ChipRow
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.features.onboarding.SearchPill
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.add
import com.tromwey.kura.state.clearSearch
import com.tromwey.kura.state.removeSilently
import com.tromwey.kura.state.runSearch
import kotlinx.coroutines.delay
import java.text.Normalizer

// Twin of ios/Kura/Features/Add/AddTitlesSheet.swift — 27a / 27b · Agregar, the TALL s1 sheet.

/**
 * 05 · Agregar títulos to one collection: its mini fan + name and Listo; the search; the format
 * chips; suggestions "para esta colección" (by what it already has) until you type, then the
 * results with the match highlighted. The + becomes ✓ (tap it again to take it back out, silently);
 * each add is the store's optimistic write with its own "Agregado a … · Deshacer".
 */
@Composable
fun KuraSheetScope.AddTitlesSheet(store: AppStore, sheet: SheetRoute.AddTitles) {
    val dismiss: () -> Unit = this::close
    val c = store.collection(sheet.id) ?: return
    var query by rememberSaveable { mutableStateOf("") }
    var formatRaw by rememberSaveable { mutableStateOf<String?>(null) }
    val format = MediaFormat.from(formatRaw)
    val q = query.trim()

    LaunchedEffect(q, formatRaw) {
        if (q.isEmpty()) {
            store.clearSearch()
            return@LaunchedEffect
        }
        delay(350)
        store.runSearch(q, format)
    }
    DisposableEffect(Unit) { onDispose { store.clearSearch() } }

    // Header: the destination as the pickers draw it (its mini fan at 51), "Agregar a" + the name, Listo.
    Row(
        Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FanView(store.fan(c).map { it.art }, 51.dp, ghost = c.titleIds.isEmpty(), plus = false)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            MonoLabel("Agregar a")
            BasicText(c.name, Modifier.semantics { heading() }, style = KuraType.news(28f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        GlassButton("Listo", { dismiss() })
    }
    SearchPill(query, { query = it }, "Buscar títulos", Modifier.padding(horizontal = 8.dp))
    val chips: List<Pair<String?, String>> = listOf<Pair<String?, String>>(null to "Todo") + MediaFormat.entries.map { it.rawValue to it.label }
    Box(Modifier.padding(top = 14.dp, bottom = 6.dp)) {
        // Bleeds past the sheet's 12 so the chips line up with the rows' 20.
        ChipRow(
            chips,
            formatRaw,
            { formatRaw = it },
            Modifier.layout { m, cons ->
                val extra = 24.dp.roundToPx()
                val p = m.measure(cons.copy(minWidth = cons.maxWidth + extra, maxWidth = cons.maxWidth + extra))
                layout(cons.maxWidth, p.height) { p.place(-extra / 2, 0) }
            },
        )
    }

    LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(min = 420.dp)) {
        if (q.isEmpty()) {
            item("head") {
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp).padding(top = 10.dp, bottom = 6.dp), verticalAlignment = Alignment.Bottom) {
                    BasicText("para esta colección", Modifier.weight(1f).semantics { heading() }, style = KuraType.news(22f))
                    MonoLabel("por lo que ya tiene")
                }
            }
            items(suggestions(store, c, format), key = { "s-" + it.id }) { t -> AddRow(store, t, c, "") }
        } else {
            val results = store.searchResults.map { store.title(it.id) ?: it.title }.filter { format == null || it.format == format }
            val error = store.searchError
            when {
                store.searchLoading && results.isEmpty() -> items(5, key = { "sk-$it" }) { RowSkeleton() }
                error != null && results.isEmpty() -> item("error") {
                    Message(
                        if (error == KuraApiError.Offline) "sin conexión." else "no se pudo buscar.",
                        if (error == KuraApiError.Offline) "Revisa tu red y vuelve a intentarlo." else error.toast("Inténtalo de nuevo en un momento."),
                    )
                }
                results.isEmpty() -> item("empty") { Message("nada con “$q”.", "Revisa cómo se escribe o busca por persona o año.") }
            }
            items(results, key = { "r-" + it.id }) { t -> AddRow(store, t, c, q) }
        }
        item("tail") { Spacer(Modifier.size(40.dp)) }
    }
    // The keyboard lifts the sheet (insets already taken by an ancestor count as consumed).
    Spacer(Modifier.imePadding())
}

@Composable
private fun Message(title: String, note: String) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BasicText(title, style = KuraType.news(22f))
        BasicText(note, style = KuraType.ui(14f).copy(color = KColor.text2))
    }
}

@Composable
private fun RowSkeleton() {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).padding(horizontal = 8.dp).clearAndSetSemantics { contentDescription = "Buscando" },
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Skeleton(Modifier.size(40.dp, 60.dp), radius = KRadius.coverS)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Skeleton(Modifier.size(180.dp, 16.dp), radius = 6.dp)
            Skeleton(Modifier.size(120.dp, 10.dp), radius = 5.dp)
        }
    }
}

/** One title: the cover in a 44 slot, the name (match highlighted), the meta in mono, + / ✓. */
@Composable
private fun AddRow(store: AppStore, t: Title, c: KCollection, query: String) {
    val added = t.id in c.titleIds
    val reduce = LocalReduceMotion.current
    val scale by animateFloatAsState(if (added || reduce) 1f else 0.94f, KMotion.snappy(), label = "addScale")
    val album = t.format == MediaFormat.Album
    val meta = listOfNotNull(t.format.metaLabel, t.year?.toString(), t.creator).filter { it.isNotEmpty() }.joinToString(" · ")
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp, 60.dp), contentAlignment = Alignment.Center) {
            Cover(t.art, width = if (album) 44.dp else 40.dp, height = if (album) 44.dp else 60.dp, radius = KRadius.coverS)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            BasicText(highlighted(t.name, query), style = KuraType.newsItalic(18f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            MonoLabel(meta)
        }
        IconChip44(
            if (added) KIcon.CheckBold else KIcon.Plus,
            if (added) "Quitar ${t.name}" else "Agregar ${t.name}",
            { if (added) store.removeSilently(t.id, c.id) else store.add(t.id, c.id) },
            Modifier.graphicsLayer {
                scaleX = scale
                scaleY = scale
            },
            iconSize = 16.dp,
            fill = if (added) KColor.text else KColor.glassBg,
            iconColor = if (added) KColor.bg else KColor.text,
        )
    }
}

/** The match in text (Medium Italic), the rest in text-2; no query = all in text. Accent-insensitive. */
private fun highlighted(name: String, query: String): AnnotatedString {
    val q = query.trim()
    val start = if (q.isEmpty()) -1 else fold(name).indexOf(fold(q))
    if (start < 0) return buildAnnotatedString { withStyle(SpanStyle(color = KColor.text)) { append(name) } }
    val end = (start + q.length).coerceAtMost(name.length)
    return buildAnnotatedString {
        withStyle(SpanStyle(color = KColor.text2)) { append(name.substring(0, start)) }
        withStyle(SpanStyle(color = KColor.text, fontWeight = FontWeight.Medium)) { append(name.substring(start, end)) }
        withStyle(SpanStyle(color = KColor.text2)) { append(name.substring(end)) }
    }
}

/** Lowercase without accents, one char per char (so indices line up with the original). */
private fun fold(s: String): String = buildString(s.length) {
    for (ch in s) append(Normalizer.normalize(ch.toString(), Normalizer.Form.NFD).firstOrNull()?.lowercaseChar() ?: ch)
}

/** Same creators / formats as what the collection already has, not in it yet — the catalog you know. */
private fun suggestions(store: AppStore, c: KCollection, format: MediaFormat?): List<Title> {
    val inside = store.titlesIn(c)
    val creators = inside.mapNotNull { it.creator }.toSet()
    val formats = inside.map { it.format }.toSet()
    val pool = store.catalogOrder.mapNotNull { store.title(it) }.filter { format == null || it.format == format }
    return pool.map { t ->
        var s = 0
        if (t.creator != null && t.creator in creators) s += 2
        if (t.format in formats) s += 1
        if (t.id in c.titleIds) s -= 1
        t to s
    }.sortedByDescending { it.second }.take(8).map { it.first }
}
