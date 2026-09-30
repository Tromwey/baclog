package com.tromwey.kura.features.recap

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Picture
import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.draw
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.core.content.FileProvider
import com.tromwey.kura.app.art
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.data.models.KCalendar
import com.tromwey.kura.data.models.RecapMonth
import com.tromwey.kura.data.models.RecapPayload
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KFixedChrome
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KShadow
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.Wordmark
import com.tromwey.kura.designsystem.WordmarkVariant
import com.tromwey.kura.designsystem.components.BackChip
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.CoverImage
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KuraLoadingIndicator
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.LoadErrorScreen
import com.tromwey.kura.designsystem.components.LoadingScreen
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.designsystem.kShadow
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.LoadState
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.currentRecap
import com.tromwey.kura.state.loadRecap
import com.tromwey.kura.state.loadRecapMonths
import com.tromwey.kura.state.openRecapMonth
import com.tromwey.kura.state.recap
import com.tromwey.kura.state.recapButtonLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// Recap — twins of iOS `RecapViews.swift`: 08 el recap del mes · 09 vacío · O8 meses anteriores ·
// C2 la tarjeta compartible. Titles per `state/frontend.md` §"Recap · título con año corto": the
// month in Newsreader ROMAN with its two-digit year ("agosto ’26"), never "RECAP · AGOSTO 2026".

/** The month's four numbers, in frame order (value, label, glyph). */
private val RecapPayload.tiles: List<Triple<Int, String, Glyph>>
    get() = listOf(
        Triple(stats.completed, "Completos", Glyph.Check),
        Triple(stats.obsessed, "Obsesiones", Glyph.Flame),
        Triple(stats.reviews, "Reseñas", Glyph.Review),
        Triple(stats.saved, "Guardados", Glyph.Bookmark),
    )

/** The card's fan, front first: "lo más tuyo", then up to two more of the month. */
private val RecapPayload.fan: List<Title>
    get() = listOfNotNull(top) + also.filter { it.id != top?.id }.take(2)

/** "’26" — the two-digit year with the typographic apostrophe. */
private fun shortYear(year: Int) = "’" + "%02d".format(year % 100)

// MARK: Profile › recap (the entry)

/**
 * "recap de septiembre ›" under your profile's ribbon (iOS `ProfileView`): "tu recap" until the
 * months arrive; nothing once they say no month has activity. It asks for the months itself once
 * the library is up.
 */
@Composable
fun RecapEntryButton(store: AppStore, modifier: Modifier = Modifier) {
    LaunchedEffect(store.loadState) { if (store.loadState == LoadState.Loaded) store.loadRecapMonths() }
    val label = store.recapButtonLabel ?: return
    Row(
        modifier
            .kPressable(onClickLabel = label) { store.push(Route.Recap()) }
            .height(40.dp)
            .background(KColor.glassBg, CircleShape)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(label, style = KuraType.news(17f))
        KIconView(KIcon.ChevronRight, size = 12.dp)
    }
}

// MARK: 08 Recap · 09 Recap vacío

/** A month's recap (`route.era` null = the newest). */
@Composable
fun RecapScreen(store: AppStore, route: Route.Recap) {
    val scope = rememberCoroutineScope()
    val era = route.era
    LaunchedEffect(era) { store.loadRecap(era) }
    val r = store.recap(era)
    val top = r?.top
    val error = store.loadError(LoadKey.Recap)
    when {
        r != null && top != null -> RecapContent(store, r, top)
        !store.recapLoading && error != null -> {
            val (t, note) = error.loadCopy
            LoadErrorScreen(t, note, onRetry = { scope.launch { store.loadRecap(era) } }, onBack = { store.pop() })
        }
        // Months known and none to show (no activity yet, or a month without "lo más tuyo").
        store.recapMonths != null && !store.recapLoading -> EmptyRecap(store)
        else -> LoadingScreen(onBack = { store.pop() }, square = true)
    }
}

@Composable
private fun RecapContent(store: AppStore, r: RecapPayload, top: Title) {
    Column(
        Modifier.fillMaxSize().kTint(top.palette).verticalScroll(rememberScrollState()).navigationBarsPadding()
            .padding(top = KSize.chromeTop, start = 24.dp, end = 24.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        BackChip({ store.pop() })
        RecapMonthTitle(r.month, r.year, 52f)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Bottom) {
            Cover(top.art, Modifier.kPressable(onClickLabel = top.name) { store.push(Route.TitleRoute(top.id)) }, height = 170.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                MonoLabel("Lo más tuyo", tracking = 0.1f)
                BasicText(top.name, style = KuraType.newsItalic(26f))
                top.creator?.let { BasicText(it, style = KuraType.ui(14f).copy(color = KColor.text2)) }
            }
        }
        RecapStatsGrid(r)
        if (r.also.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                MonoLabel("También en tu mes", tracking = 0.1f)
                // A strip that SCROLLS, bled to the screen's edges (iOS: five albums would otherwise
                // ask for more than the screen and widen the whole page).
                Row(
                    Modifier.fillMaxWidth()
                        .layoutBleed(24.dp)
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 24.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    r.also.forEach { t ->
                        Cover(
                            t.art,
                            Modifier.kPressable(onClickLabel = t.name) { store.push(Route.TitleRoute(t.id)) },
                            height = 96.dp, radius = KRadius.coverS,
                        )
                    }
                }
            }
        }
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            GlassButton("Compartir tarjeta", { store.push(Route.RecapShare(r.era)) }, height = 46.dp, fill = KColor.glassBg)
            KuraTextButton("Meses anteriores", { store.push(Route.RecapHistory) }, color = KColor.text2)
        }
    }
}

/** Lets a row inside a padded column reach the screen's edges (the "También en tu mes" strip). */
private fun Modifier.layoutBleed(side: Dp): Modifier = this.then(
    Modifier.layout { measurable, constraints ->
        val extra = side.roundToPx() * 2
        val p = measurable.measure(constraints.copy(maxWidth = constraints.maxWidth + extra, minWidth = constraints.minWidth + extra))
        layout(constraints.maxWidth, p.height) { p.place(-side.roundToPx(), 0) }
    },
)

/**
 * The month's four numbers (completos · obsesiones · reseñas · guardados) in a 2×2 — ONE set of
 * metrics for the recap and for "este mes" in Meses anteriores (iOS `RecapStatsGrid`, web
 * `recap-stats.tsx`).
 */
@Composable
private fun RecapStatsGrid(r: RecapPayload, size: Float = 34f) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        r.tiles.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { (v, label, g) ->
                    Column(
                        Modifier.weight(1f).semantics(mergeDescendants = true) {},
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        BasicText("$v", style = KuraType.mono(size))
                        Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                            GlyphIcon(g, size = 13.dp, color = if (g == Glyph.Bookmark) KColor.text2 else null)
                            MonoLabel(label)
                        }
                    }
                }
            }
        }
    }
}

/**
 * "agosto ’26": the month in Newsreader ROMAN (italic is for works) with its two-digit year a size
 * down (0.56) in text-2, on one line; TalkBack reads "agosto 2026".
 */
@Composable
private fun RecapMonthTitle(month: String, year: Int, size: Float, modifier: Modifier = Modifier, center: Boolean = false) {
    BasicText(
        buildAnnotatedString {
            append(month)
            withStyle(SpanStyle(fontSize = 0.56f.em, color = KColor.text2)) { append(" " + shortYear(year)) }
        },
        modifier.clearAndSetSemantics {
            contentDescription = "$month $year"
            heading()
        },
        style = KuraType.news(size).copy(textAlign = if (center) TextAlign.Center else TextAlign.Start),
        maxLines = 1,
        autoSize = androidx.compose.foundation.text.TextAutoSize.StepBased(
            minFontSize = KuraType.news(size * 0.8f).fontSize,
            maxFontSize = KuraType.news(size).fontSize,
        ),
    )
}

/** 09 · the month is still being written: the ghost fan, when it arrives and how many days are left. */
@Composable
private fun EmptyRecap(store: AppStore) {
    val today = KCalendar.date(store.now)
    val next = today.withDayOfMonth(1).plusMonths(1)
    val daysLeft = ChronoUnit.DAYS.between(today, next).toInt()
    Column(
        Modifier.fillMaxSize().background(KColor.bg).navigationBarsPadding()
            .padding(top = KSize.chromeTop, start = 24.dp, end = 24.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        BackChip({ store.pop() })
        Spacer(Modifier.weight(1f))
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // The ghost fan (dashed front, no "+"): a month still being filled.
            FanView(emptyList(), lead = 150.dp, ghost = true, plus = false, modifier = Modifier.padding(bottom = 6.dp))
            // Roman: italic is for works, and this is a sentence.
            BasicText(
                "tu recap de ${monthName(today)} todavía se está escribiendo.",
                Modifier.semantics { heading() },
                style = KuraType.news(44f),
            )
            BasicText(
                "El recap llega el 1 de ${monthName(next)} con lo que guardes, completes o reseñes este mes.",
                style = KuraType.ui(15f).copy(color = KColor.text2),
            )
            BasicText(
                if (daysLeft == 1) "Falta 1 día" else "Faltan $daysLeft días",
                style = KuraType.mono(12f).copy(color = KColor.text2),
            )
        }
        Spacer(Modifier.weight(1f))
        GlassButton("Ir a tus colecciones", {
            store.pop()
            store.select(Tab.Collections)
        }, height = 46.dp)
    }
}

private fun monthName(d: LocalDate) = RecapPayload.MONTH_NAMES[d.monthValue - 1]

// MARK: O8 Meses anteriores

/**
 * The screen says what it is (iOS `RecapHistoryView`, web `recap/meses/page.tsx`): "meses
 * anteriores"; the newest month as a block — "este mes" when it's the month in progress, else "tu
 * último mes" — with the SAME four numbers as the recap, opening its recap; then every OLDER month as
 * a miniature (108×192, tinted by its "lo más tuyo", cover + month + short year).
 */
@Composable
fun RecapHistoryScreen(store: AppStore) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { store.loadRecap() }
    val current = store.currentRecap
    val months = store.recapMonths
    val older = months.orEmpty().drop(1)
    val error = store.loadError(LoadKey.Recap)
    Column(
        Modifier.fillMaxSize().background(KColor.bg).verticalScroll(rememberScrollState()).navigationBarsPadding()
            .padding(top = KSize.chromeTop, bottom = 60.dp),
    ) {
        BackChip({ store.pop() }, Modifier.padding(start = KSize.chromeSide, bottom = 14.dp))
        BasicText("meses anteriores", Modifier.padding(horizontal = 20.dp).semantics { heading() }, style = KuraType.news(40f))
        when {
            current != null -> {
                val thisMonth = current.era == KCalendar.date(store.now).let { "%04d-%02d".format(it.year, it.monthValue) }
                Column(
                    Modifier.padding(start = 20.dp, end = 20.dp, top = 22.dp).fillMaxWidth()
                        .clip(RoundedCornerShape(KRadius.surface))
                        .kPressable(onClickLabel = "Recap de ${current.month} ${current.year}") { store.openRecapMonth(current.era) }
                        .background(KColor.s1)
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    MonoLabel("${if (thisMonth) "este mes" else "tu último mes"} · ${current.month} ${shortYear(current.year)}", tracking = 0.1f)
                    RecapStatsGrid(current, 30f)
                }
            }
            error != null && !store.recapLoading -> {
                val (t, note) = error.loadCopy
                LoadErrorBlock(t, note, onRetry = { scope.launch { store.loadRecap() } }, Modifier.padding(start = 20.dp, end = 20.dp, top = 22.dp), titleSize = 24f)
            }
            months == null || store.recapLoading ->
                Skeleton(Modifier.padding(start = 20.dp, end = 20.dp, top = 22.dp).fillMaxWidth().height(150.dp), radius = KRadius.surface)
        }
        Box(Modifier.padding(top = 32.dp)) {
            if (older.isEmpty()) {
                if (months != null) {
                    BasicText(
                        "Este es tu primer mes. Los anteriores se guardan aquí.",
                        Modifier.padding(horizontal = 20.dp),
                        style = KuraType.ui(15f).copy(color = KColor.text2),
                    )
                }
            } else {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    older.forEach { m -> Miniature(store, m) }
                }
            }
        }
    }
}

@Composable
private fun Miniature(store: AppStore, m: RecapMonth) {
    val month = m.label.split(" ").firstOrNull()?.takeIf { it.isNotEmpty() } ?: m.era
    val yy = m.era.split("-").firstOrNull()?.let { "’" + it.takeLast(2) } ?: ""
    val t = store.recaps[m.era]?.top
    val shape = RoundedCornerShape(14.dp)
    if (t == null) {
        Skeleton(Modifier.size(108.dp, 192.dp), radius = 14.dp)
        LaunchedEffect(m.era) { store.loadRecap(m.era) }
        return
    }
    val (a, b) = remember(t.palette) { Tint.ends(t.palette) }
    Column(
        Modifier.size(108.dp, 192.dp)
            .kShadow(KShadow.Cover, shape)
            .clip(shape)
            // Opens THAT month (not the newest).
            .kPressable(onClickLabel = "Recap de ${m.label}") { store.openRecapMonth(m.era) }
            .background(Brush.verticalGradient(0f to a.color, 0.7f to b.color, 1f to KColor.bg))
            .padding(vertical = 14.dp, horizontal = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.Bottom),
    ) {
        CoverImage(t.coverUrl, t.palette, Modifier.size(64.dp).clip(RoundedCornerShape(KRadius.coverS)))
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            BasicText(month, style = KuraType.news(18f))
            BasicText(yy, style = KuraType.mono(10f, tracking = 0.08f).copy(color = KColor.text2))
        }
    }
}

// MARK: C2 Tarjeta recap

private val CARD_WIDTH = 306.dp
private val CARD_HEIGHT = 544.dp // 306 × 16 / 9
private const val EXPORT_WIDTH = 1080
private const val EXPORT_HEIGHT = 1920

/**
 * The shareable card: the 9:16 preview, and Compartir renders THAT drawing (recorded into a
 * `Picture`) at 1080×1920 as a PNG handed to the share sheet through the FileProvider
 * (`${applicationId}.files`, `res/xml/file_paths.xml`). iOS hands off to the web's exporter
 * (`/recap/tarjeta`) instead — Android draws it on-device (android-recap lane brief, 2026-09-30).
 */
@Composable
fun RecapShareScreen(store: AppStore, route: Route.RecapShare) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val picture = remember { Picture() }
    var sharing by remember { mutableStateOf(false) }
    // Opened straight (a link) the recap isn't loaded yet.
    LaunchedEffect(route.era) { if (store.recap(route.era) == null) store.loadRecap(route.era) }
    val r = store.recap(route.era)
    val ready = r?.top != null
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding()
                .padding(top = 118.dp, start = 24.dp, end = 24.dp, bottom = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            RecapCard(store, r, picture)
            SolidButton(
                if (sharing) "Preparando…" else "Compartir",
                onClick = {
                    if (sharing || r == null) return@SolidButton
                    sharing = true
                    scope.launch {
                        val ok = shareCard(context, picture, r.era)
                        sharing = false
                        if (!ok) store.showToast(ToastModel("No pudimos preparar la tarjeta. Inténtalo de nuevo.", ToastModel.Kind.Info))
                    }
                },
                modifier = Modifier.widthIn(max = CARD_WIDTH),
                enabled = ready && !sharing,
            )
        }
        KuraTopBar(onBack = { store.pop() })
    }
}

/**
 * 9:16 card, a faithful miniature of the web's `/recap/tarjeta` (`src/modules/cards/render/recap.ts`,
 * iOS `RecapCard`): "RECAP" up top (no date — the title says it) · the month title centred · the
 * month's fan · the non-zero numbers (1–3 in a row, 4 in a 2×2, singular at 1) · a dashed foot with
 * "N TÍTULOS" · @handle, and the 蔵 kura lockup. Fixed type (it's an image): no font scale.
 */
@Composable
private fun RecapCard(store: AppStore, r: RecapPayload?, picture: Picture) {
    val top = r?.top
    val shape = RoundedCornerShape(KRadius.screen)
    KFixedChrome(maxFontScale = 1f) {
        Box(
            Modifier.size(CARD_WIDTH, CARD_HEIGHT)
                .clip(shape)
                .recordInto(picture)
                .then(if (top != null && top.palette.isNotEmpty()) Modifier.kTint(top.palette) else Modifier.background(KColor.bg))
                .semantics(mergeDescendants = true) {},
        ) {
            if (r == null || top == null) {
                KuraLoadingIndicator(Modifier.align(Alignment.Center), size = 36.dp)
            } else {
                CardContent(store, r)
            }
        }
    }
}

private data class CardStat(val v: Int, val one: String, val many: String, val glyph: Glyph, val color: Color)

@Composable
private fun CardContent(store: AppStore, r: RecapPayload) {
    val stats = listOf(
        CardStat(r.stats.completed, "COMPLETO", "COMPLETOS", Glyph.Check, KColor.completed),
        CardStat(r.stats.obsessed, "OBSESIÓN", "OBSESIONES", Glyph.Flame, KColor.obsessed),
        CardStat(r.stats.reviews, "RESEÑA", "RESEÑAS", Glyph.Review, KColor.text),
        CardStat(r.stats.saved, "GUARDADO", "GUARDADOS", Glyph.Bookmark, KColor.text2),
    ).filter { it.v > 0 }
    val cols = if (stats.isEmpty()) 1 else if (stats.size <= 3) stats.size else 2
    val n = 1 + r.also.size
    Column(Modifier.fillMaxSize().padding(horizontal = 22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        MonoLabel("RECAP", Modifier.padding(top = 22.dp), size = 9f, tracking = 0.08f)
        Spacer(Modifier.weight(1f).heightIn(min = 10.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            RecapMonthTitle(r.month, r.year, 38f, Modifier.fillMaxWidth(), center = true)
            FanView(r.fan.map { it.art }, lead = 124.dp)
            if (stats.isNotEmpty()) {
                Column(Modifier.widthIn(max = 220.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    stats.chunked(cols).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            row.forEach { s ->
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                    BasicText("${s.v}", style = KuraType.mono(22f))
                                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                                        GlyphIcon(s.glyph, size = 11.dp, color = s.color)
                                        MonoLabel(if (s.v == 1) s.one else s.many, size = 8f, tracking = 0.07f)
                                    }
                                }
                            }
                            repeat(cols - row.size) { Box(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.weight(1f).heightIn(min = 10.dp))
        Column(Modifier.padding(bottom = 22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DashedRule()
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                MonoLabel("$n ${if (n == 1) "TÍTULO" else "TÍTULOS"}", size = 9f, tracking = 0.08f)
                Spacer(Modifier.weight(1f))
                MonoLabel("@${store.me.handle}", size = 9f, tracking = 0.08f)
            }
            Wordmark(variant = WordmarkVariant.C, color = KColor.text)
        }
    }
}

/** The card's foot rule: a hairline dash — a content divider, exempt from the no-borders rule. */
@Composable
private fun DashedRule() {
    Canvas(Modifier.fillMaxWidth().height(1.dp)) {
        drawLine(
            Color.White.copy(alpha = 0.18f), Offset(0f, 0f), Offset(size.width, 0f),
            strokeWidth = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())),
        )
    }
}

/** Records what this node (and everything drawn after it in the chain) draws into [picture], and
 *  still draws it on screen — the Compose recipe for "this composable as a bitmap". */
private fun Modifier.recordInto(picture: Picture): Modifier = drawWithCache {
    val w = size.width.toInt()
    val h = size.height.toInt()
    onDrawWithContent {
        val canvas = androidx.compose.ui.graphics.Canvas(picture.beginRecording(w, h))
        draw(this, layoutDirection, canvas, size) { this@onDrawWithContent.drawContent() }
        picture.endRecording()
        drawIntoCanvas { it.nativeCanvas.drawPicture(picture) }
    }
}

/**
 * The recorded card → a 1080×1920 PNG in `cache/recap/` → `ACTION_SEND` through the FileProvider.
 * API 28+ renders the `Picture` on the GPU (covers are hardware bitmaps); before that a software
 * canvas, which fails on a hardware bitmap — then it says so instead of crashing. false = not shared.
 */
private suspend fun shareCard(context: Context, picture: Picture, era: String): Boolean {
    if (picture.width <= 0 || picture.height <= 0) return false
    val uri = withContext(Dispatchers.IO) {
        try {
            val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                Bitmap.createBitmap(picture, EXPORT_WIDTH, EXPORT_HEIGHT, Bitmap.Config.ARGB_8888)
            } else {
                Bitmap.createBitmap(EXPORT_WIDTH, EXPORT_HEIGHT, Bitmap.Config.ARGB_8888).also { b ->
                    val c = android.graphics.Canvas(b)
                    c.scale(EXPORT_WIDTH.toFloat() / picture.width, EXPORT_HEIGHT.toFloat() / picture.height)
                    c.drawPicture(picture)
                }
            }
            val dir = File(context.cacheDir, "recap").apply { mkdirs() }
            val file = File(dir, "kura-recap-$era.png")
            FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
            FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        } catch (_: Exception) {
            null
        }
    } ?: return false
    val send = Intent(Intent.ACTION_SEND)
        .setType("image/png")
        .putExtra(Intent.EXTRA_STREAM, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    send.clipData = ClipData.newRawUri(null, uri)
    return try {
        context.startActivity(Intent.createChooser(send, null))
        true
    } catch (_: android.content.ActivityNotFoundException) {
        false
    }
}
