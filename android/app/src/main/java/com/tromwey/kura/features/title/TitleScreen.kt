package com.tromwey.kura.features.title

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.tromwey.kura.app.art
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.app.reaction
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.TitleCounts
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KFixedChrome
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.components.ActionPair
import com.tromwey.kura.designsystem.components.CountRibbon
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.CoverBadge
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.GoneView
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KuraToggle
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.LoadErrorScreen
import com.tromwey.kura.designsystem.components.LoadingScreen
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.SaveChip
import com.tromwey.kura.designsystem.components.SaveChipStyle
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.animatedTintTail
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.fillPaletteIfNeeded
import com.tromwey.kura.state.isReleaseDay
import com.tromwey.kura.state.isUnreleased
import com.tromwey.kura.state.loadTitle
import com.tromwey.kura.state.releaseLabel
import com.tromwey.kura.state.releaseSentence
import com.tromwey.kura.state.setMark
import com.tromwey.kura.state.toggleAlert
import kotlinx.coroutines.launch

// 06 · Obra (flujos-v2 33–35 + 37a/24d/C4/E4/37c) — twin of ios/Kura/Features/Title/TitleDetailView.swift.
// The PAGE is the title's feed gradient (TintStyle.Feed, span 900: founder's "degradado único",
// 2026-09-27, the same recipe the iOS ficha wears); the dock stays (Route.keepsDock). Header here,
// sections in TitleSections.kt, the three sheets in TitleSheets.kt.

/** 06 · Ficha (película, serie, álbum). The cover carries `kHeroCover("cover-<id>")`. */
@Composable
fun TitleScreen(store: AppStore, route: Route.TitleRoute) {
    val id = route.id
    LaunchedEffect(id) { store.loadTitle(id) }
    val t = store.title(id)
    val error = store.loadError(LoadKey.TitleKey(id))
    val scope = rememberCoroutineScope()
    when {
        t != null -> TitlePage(store, t)
        id in store.missingTitles -> GoneView(
            onBack = { store.pop() },
            title = "este título ya no está.",
            note = "Se quitó del catálogo o dejó de estar disponible.",
        )
        error != null -> {
            val (head, note) = error.loadCopy
            LoadErrorScreen(head, note, onRetry = { scope.launch { store.loadTitle(id, force = true) } }, onBack = { store.pop() })
        }
        else -> LoadingScreen(onBack = { store.pop() })
    }
}

@Composable
private fun TitlePage(store: AppStore, t: Title) {
    LaunchedEffect(t.id) { store.noteViewed(t.id) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tail = animatedTintTail(t.palette)
    Box(Modifier.fillMaxSize().background(tail)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        ) {
            Column(Modifier.fillMaxWidth().kTint(t.palette, TintStyle.Feed(900.dp))) {
                TitleHeader(store, t)
                val e = store.loadError(LoadKey.TitleKey(t.id))
                if (e != null) {
                    RetryStrip(
                        text = if (e == KuraApiError.Offline) "Sin conexión. Ves lo guardado en tu teléfono." else "No se pudo cargar toda la ficha.",
                        onRetry = { scope.launch { store.loadTitle(t.id, force = true) } },
                        modifier = Modifier.padding(horizontal = 12.dp).padding(top = 4.dp),
                        offline = e == KuraApiError.Offline,
                    )
                }
                TitleSections(
                    store,
                    t,
                    Modifier.padding(top = 10.dp).padding(horizontal = 24.dp).padding(bottom = 56.dp),
                )
            }
        }
        // Scrolled content fades out under the clock and the chips: the page's own top tone.
        TopVeil(color = Tint.feedTop(t.palette))
        KuraTopBar(onBack = { store.pop() }) {
            // `/{you}/item/{id}` — only while your profile is public (otherwise it 404s).
            val link = store.myItemLink(t.id)
            if (link != null) {
                IconChip44(KIcon.Share, "Compartir", { shareLink(context, link, t.name) }, iconSize = 17.dp)
            }
            IconChip44(KIcon.More, "Opciones", { store.present(SheetRoute.TitleMore(t.id)) }, iconSize = 17.dp)
        }
    }
}

// MARK: Header ────────────────────────────────────────────────────────────────────────────

@Composable
private fun TitleHeader(store: AppStore, t: Title) {
    val unreleased = store.isUnreleased(t)
    val today = store.releaseLabel(t) == "hoy"
    val album = t.format == MediaFormat.Album
    val badge = when {
        today -> CoverBadge.Waiting("hoy")
        // 37a · the clock is an INDICATOR on the cover (the countdown), never a button.
        unreleased -> store.releaseLabel(t)?.let { CoverBadge.Waiting(it) } ?: CoverBadge.None
        else -> CoverBadge.None
    }
    Column(
        Modifier.fillMaxWidth().padding(top = KSize.pushedTitleTop, start = 24.dp, end = 24.dp, bottom = 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Radius 18: where a grid cover (14) lands when it grows into the ficha.
        Cover(
            t.art,
            Modifier.kHeroCover("cover-${t.id}"),
            width = if (album) 240.dp else 200.dp,
            height = if (album) 240.dp else 300.dp,
            radius = KRadius.surface,
            badge = badge,
            badgeHeight = 28.dp,
            onMissingPalette = { store.fillPaletteIfNeeded(t) },
        )
        BasicText(
            t.name,
            modifier = Modifier.padding(top = 10.dp).semantics { heading() },
            style = KuraType.workTitle.copy(textAlign = TextAlign.Center),
        )
        t.lowerCreator?.let {
            BasicText(it, style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center))
        }
        MonoLabel(metaLine(t, unreleased))
        Ribbon(t.counts)
        Actions(store, t, unreleased, today)
        if (unreleased) {
            store.releaseSentence(t)?.let { MonoLabel(it.replaceFirstChar { c -> c.uppercase() }, Modifier.padding(top = 2.dp)) }
        } else if (t.upcomingSeason != null) {
            store.releaseLabel(t, withSeason = true)?.let { MonoLabel(it, Modifier.padding(top = 2.dp)) }
        }
    }
}

private fun metaLine(t: Title, unreleased: Boolean): String {
    if (t.format == MediaFormat.Album && unreleased) {
        return listOfNotNull(t.year?.toString(), "álbum", t.trackCount?.let { "$it tracks" }).joinToString(" · ")
    }
    val parts = listOfNotNull(t.year?.toString(), t.detail)
    return parts.ifEmpty { listOf(t.format.metaLabel) }.joinToString(" · ")
}

/**
 * The counts come only with the full ficha (`loadTitle`); a title opened from a card is the list's
 * summary until then. The row is HELD from the first frame (an invisible one-count ribbon sets its
 * height) and the counts fade in over it, so the actions never jump while the cover lands
 * (learning 2026-09-27-ficha-conteos-pop-al-cargar). A tap opens the legend: 🔥 vs 👍 isn't obvious.
 */
@Composable
private fun Ribbon(counts: TitleCounts?) {
    var legend by remember { mutableStateOf(false) }
    Box(Modifier.padding(top = 2.dp), contentAlignment = Alignment.Center) {
        CountRibbon(listOf(Glyph.Check to "0"), Modifier.alpha(0f).clearAndSetSemantics { })
        AnimatedVisibility(counts != null, enter = fadeIn(), exit = fadeOut()) {
            val c = counts ?: return@AnimatedVisibility
            val rows = legendRows(c)
            CountRibbon(
                rows.map { it.first to it.second },
                Modifier.kPressable(onClickLabel = "Ver qué significa cada número") { legend = true },
                contentDescription = rows.joinToString(", ") { (_, n, label) -> ribbonA11y(n, label) },
            )
            if (legend) {
                Popup(
                    alignment = Alignment.TopCenter,
                    offset = IntOffset(0, 70),
                    onDismissRequest = { legend = false },
                    properties = PopupProperties(focusable = true),
                ) {
                    Column(
                        Modifier.background(KColor.s2, RoundedCornerShape(KRadius.surface)).padding(horizontal = 18.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        rows.forEach { (g, n, label) ->
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.width(18.dp), contentAlignment = Alignment.Center) { GlyphIcon(g, size = 14.dp) }
                                BasicText(n, style = KuraType.mono(12f))
                                BasicText(label, style = KuraType.ui(14f).copy(color = KColor.text2))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Only what the API has: a missing count ("—") is neither drawn nor read aloud. */
private fun legendRows(c: TitleCounts): List<Triple<Glyph, String, String>> = buildList {
    fun one(n: String, singular: String, plural: String) = if (n == "1") singular else plural
    if (c.obsessed != "—") add(Triple(Glyph.Flame, c.obsessed, one(c.obsessed, "le obsesiona", "les obsesiona")))
    if (c.liked != "—") add(Triple(Glyph.Thumb, c.liked, one(c.liked, "le gusta", "les gusta")))
    if (c.completed != "—") add(Triple(Glyph.Check, c.completed, one(c.completed, "completo", "completos")))
    c.waiting?.let { add(Triple(Glyph.Clock, it, one(it, "no puede esperar", "no pueden esperar"))) }
    if (c.saved != "—") add(Triple(Glyph.Bookmark, c.saved, one(c.saved, "guardado", "guardados")))
}

private fun ribbonA11y(n: String, label: String): String = when (label) {
    "les obsesiona", "les gusta", "le obsesiona", "le gusta" -> "a $n $label"
    else -> "$n $label"
}

/**
 * The actions (frontend.md § "Ficha iOS · acciones"). Out: [Me obsesiona | Completar] — Completar
 * turns into your reaction once you have one — then Guardar (the one `SaveChip`) and Reseñar. Not
 * out yet: nothing to complete, the release alert takes the first slot ("Avísame" / "Te avisamos",
 * founder's voice decision 1) next to Guardar.
 */
@Composable
private fun Actions(store: AppStore, t: Title, unreleased: Boolean, today: Boolean) {
    val saved = store.collectionsContaining(t.id).size
    val save: @Composable () -> Unit = {
        SaveChip(saved, onClick = { store.present(SheetRoute.SaveTo(t.id)) }, style = SaveChipStyle.Pill)
    }
    if (unreleased) {
        Row(
            Modifier.padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Not out yet: asking for the notice IS this page's action — miel until it's on.
            AlertButton(store, t.id, on = "Te avisamos", off = "Avísame", accent = true)
            save()
        }
        return
    }
    val mark = store.mark(t.id)
    // Release day: the server still says "upcoming" for a few hours (album instants at 07/08/12Z).
    val preview = today || store.isReleaseDay(t)
    ActionPair(
        // Founder's order, everywhere: Completar before Me obsesiona.
        primary = KuraToggle(
            // Completar → your reaction. Obsessed implies completed: that side reads "Completo".
            label = when (mark) {
                null -> "Completar"
                Mark.Obsessed -> Mark.Completed.myLabel
                else -> mark.myLabel
            },
            // Obsessed: the coral side already says it; this one stays quiet (s2, salvia check).
            checked = mark != null && mark != Mark.Obsessed,
            onCheckedChange = { store.present(SheetRoute.Complete(t.id, focusReview = false)) },
            glyph = if (mark == null || mark == Mark.Obsessed) Glyph.Check else mark.reaction.glyph,
            checkedColor = if (mark == Mark.Liked) KColor.liked else KColor.completed,
        ),
        secondary = KuraToggle(
            label = "Me obsesiona",
            checked = mark == Mark.Obsessed,
            onCheckedChange = { on -> toggleObsessed(store, t, on, mark, preview) },
            glyph = Glyph.Flame,
            checkedColor = KColor.obsessed,
        ),
        modifier = Modifier.padding(top = 8.dp),
    )
    // Guardar + Reseñar share one line: past 1.3× ("Tu reseña" at 1.6×) they'd be cut, so the row tops
    // out there, like the pair above.
    KFixedChrome(maxFontScale = 1.3f) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            save()
            GlassButton(
                title = if (store.myReview(t.id) == null) "Reseñar" else "Tu reseña",
                onClick = { store.present(SheetRoute.Complete(t.id, focusReview = true)) },
                glyph = Glyph.Review,
            )
        }
    }
}

/** Me obsesiona straight from the ficha, with Deshacer. Off = back to "Completo" (obsessed implies it). */
private fun toggleObsessed(store: AppStore, t: Title, on: Boolean, previous: Mark?, preview: Boolean) {
    val next = if (on) Mark.Obsessed else Mark.Completed
    store.setMark(t.id, next, preview = preview)
    store.undoToast(if (on) "Ahora te obsesiona" else "Ya no te obsesiona") {
        store.setMark(t.id, previous, haptic = false, preview = preview)
    }
}

/** "Avísame" / "Te avisamos" — the local release alert (`toggleAlert`), same toggle as dónde ver's. */
@Composable
internal fun AlertButton(store: AppStore, titleId: String, on: String, off: String, accent: Boolean = false) {
    val active = titleId in store.alerts
    val honey = accent && !active
    GlassButton(
        fill = if (honey) KColor.accent else KColor.glassBg,
        contentColor = if (honey) KColor.onAccent else KColor.text,
        title = if (active) on else off,
        onClick = { store.toggleAlert(titleId) },
        icon = if (active) null else KIcon.Bell,
        glyph = if (active) Glyph.Check else null,
    )
}

// MARK: Outside the app ───────────────────────────────────────────────────────────────────

/** The system share sheet with a link (the title's public page). */
internal fun shareLink(context: Context, url: String, subject: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, url)
        putExtra(Intent.EXTRA_SUBJECT, subject)
    }
    try {
        context.startActivity(Intent.createChooser(send, null))
    } catch (_: android.content.ActivityNotFoundException) {
        // No app can share text: nothing to open.
    }
}

/** Copies a link to the clipboard (Android 13+ shows its own confirmation). */
internal fun copyLink(context: Context, url: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    cm.setPrimaryClip(ClipData.newPlainText("kura", url))
}

/** Opens a web/app link (a streaming service, the music app). */
internal fun openExternal(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
    } catch (_: android.content.ActivityNotFoundException) {
        // Nothing installed handles it (no browser): the row stays as it is.
    }
}
