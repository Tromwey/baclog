package com.tromwey.kura.features.title

import android.os.Build
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.photo
import com.tromwey.kura.app.reaction
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Season
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.WatchOption
import com.tromwey.kura.designsystem.EsMx
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.MonoSegmented
import com.tromwey.kura.designsystem.components.RadioMark
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.SectionTitle
import com.tromwey.kura.designsystem.components.kArtGlass
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.features.people.ReviewMenu
import com.tromwey.kura.features.people.reviewMenuApplies
import com.tromwey.kura.state.deleteReview
import com.tromwey.kura.state.fillPaletteIfNeeded
import com.tromwey.kura.state.followedMarks
import com.tromwey.kura.state.isUnreleased
import com.tromwey.kura.state.loadMoreReviews
import com.tromwey.kura.state.releaseLabel
import com.tromwey.kura.state.toggleEpisode
import com.tromwey.kura.state.visibleReviews
import kotlinx.coroutines.launch
import java.time.ZoneOffset

// The ficha's sections (Newsreader 24 headers, 30 apart) — twin of `TitleSections`, `SeriesSections`,
// `AlbumSections` and `ReviewCard` in ios/Kura/Features/Title/TitleDetailView.swift.

@Composable
internal fun TitleSections(store: AppStore, t: Title, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(30.dp)) {
        if (t.format == MediaFormat.Album) {
            AlbumSections(store, t)
        } else {
            if (t.watch.isNotEmpty()) WhereToWatch(store, t) else if (t.watchElsewhere != null) NotAvailable(store, t)
            if (t.format == MediaFormat.Series) SeriesSections(store, t)
        }
        t.synopsis?.let { Synopsis(it) }
        People(store, t)
        Reviews(store, t)
        InYourCollections(store, t)
        AlsoBy(store, t)
    }
}

// MARK: Dónde ver · E4 no disponible ──────────────────────────────────────────────────────

@Composable
private fun WhereToWatch(store: AppStore, t: Title) {
    val context = LocalContext.current
    val unreleased = store.isUnreleased(t)
    val label = store.releaseLabel(t)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SectionTitle("dónde ver", trailing = "México")
        t.watch.forEach { w ->
            val kind = if (w.isCinema) {
                when {
                    label == "hoy" -> "desde hoy"
                    unreleased -> label.orEmpty()
                    else -> cinemaSince(t)
                }
            } else {
                w.kind
            }
            ServiceRow(
                name = w.name,
                logo = {
                    when {
                        w.isCinema -> GlyphIcon(Glyph.Clock, size = 16.dp, color = KColor.text)
                        // A glyph, not the word "ver": the section title already says it.
                        w.kind == "justwatch" -> KIconView(KIcon.Play, size = 15.dp, color = KColor.text)
                        else -> BasicText(w.short, style = KuraType.mono(12f, medium = true))
                    }
                },
                trailing = kind,
                trailingColor = if (w.isCinema && label == "hoy") KColor.waiting else KColor.text2,
                external = label != "hoy" || !w.isCinema,
                onClick = { openExternal(context, KuraRuntime.resolve(w.url) ?: providerUrl(w)) },
            )
        }
        val note = when {
            unreleased && label != null ->
                if (t.release is Release.Day) "Te avisamos el $label y cuando llegue a streaming." else "Te avisamos cuando salga y cuando llegue a streaming."
            label != "hoy" -> t.watchNote
            else -> null
        }
        note?.let { BasicText(it, style = KuraType.note) }
    }
}

/** A row of "dónde ver" / "dónde escuchar": 40 logo on s2, name, the kind in mono, ↗. 56 high. */
@Composable
private fun ServiceRow(
    name: String,
    logo: @Composable () -> Unit,
    trailing: String,
    onClick: () -> Unit,
    trailingColor: Color = KColor.text2,
    external: Boolean = true,
) {
    Row(
        Modifier.fillMaxWidth()
            .kPressable(feel = KPressFeel.Row((-12).dp), onClickLabel = "Abrir en $name", onClick = onClick)
            .clearAndSetSemantics { contentDescription = listOf(name, trailing).filter { it.isNotEmpty() }.joinToString(", ") }
            .heightIn(min = 56.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).background(KColor.s2, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) { logo() }
        BasicText(name, Modifier.weight(1f), style = KuraType.row, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (trailing.isNotEmpty()) MonoLabel(trailing, color = trailingColor)
        if (external) KIconView(KIcon.ExternalLink, size = 15.dp, color = KColor.text2)
    }
}

/** "desde 17 jul" — a release day prints in UTC (learning 2026-09-24-dia-de-estreno-impreso-en-zona-equivocada). */
private fun cinemaSince(t: Title): String {
    val r = t.release as? Release.Day ?: return ""
    val d = r.date.atZone(ZoneOffset.UTC)
    val months = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
    return "desde ${d.dayOfMonth} ${months[d.monthValue - 1]}"
}

/** When the API has no deep link: the service's site (iOS `providerURL`). */
private fun providerUrl(w: WatchOption): String = when (w.name) {
    "Max" -> "https://www.max.com"
    "Prime Video" -> "https://www.primevideo.com"
    "Netflix" -> "https://www.netflix.com"
    "Disney Plus", "Disney+" -> "https://www.disneyplus.com"
    "En cines" -> "https://cinepolis.com"
    else -> "https://tv.apple.com"
}

/** E4 · not on streaming here: where it is instead, and "Avísame cuando llegue". */
@Composable
private fun NotAvailable(store: AppStore, t: Title) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("dónde ver", trailing = "México")
        BasicText("No está en streaming en México.", style = KuraType.body16)
        t.watchElsewhere?.let { BasicText(it, style = KuraType.ui(14f).copy(color = KColor.text2)) }
        AlertButton(store, t.id, on = "Te avisamos cuando llegue", off = "Avísame cuando llegue")
    }
}

// MARK: Sinopsis ──────────────────────────────────────────────────────────────────────────

@Composable
private fun Synopsis(text: String) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    var clipped by remember { mutableStateOf(false) }
    Column(Modifier.animateContentSize()) {
        BasicText(
            text,
            style = KuraType.body.copy(lineHeight = 24.sp),
            maxLines = if (expanded) Int.MAX_VALUE else 5,
            overflow = TextOverflow.Ellipsis,
            onTextLayout = { if (!expanded) clipped = it.hasVisualOverflow },
        )
        if (clipped && !expanded) {
            KuraTextButton("más", { expanded = true }, Modifier.offset(x = (-12).dp), color = KColor.text2)
        }
    }
}

// MARK: Gente que sigues ──────────────────────────────────────────────────────────────────

@Composable
private fun People(store: AppStore, t: Title) {
    val people = store.followedMarks(t.id)
    if (people.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("gente que sigues")
        Column {
            people.forEach { (p, pm) ->
                val state = (pm.mark?.theirLabel ?: "No puede esperar") + (pm.suffix?.let { " · $it" } ?: "")
                Row(
                    Modifier.fillMaxWidth()
                        .kPressable(feel = KPressFeel.Row((-12).dp), onClickLabel = "Ver perfil") { store.push(Route.PersonRoute(p.handle)) }
                        .clearAndSetSemantics { contentDescription = "@${p.handle}, $state" }
                        .heightIn(min = 52.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Seal(p.initials, p.hexes, size = 36.dp, photo = p.photo)
                    BasicText("@${p.handle}", Modifier.weight(1f), style = KuraType.ui(15f, UiWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                        GlyphIcon(pm.mark?.reaction?.glyph ?: Glyph.Clock, size = 14.dp)
                        MonoLabel(state, tracking = 0.06f)
                    }
                }
            }
        }
    }
}

// MARK: Reseñas ───────────────────────────────────────────────────────────────────────────

@Composable
private fun Reviews(store: AppStore, t: Title) {
    val reviews = store.visibleReviews(t.id)
    if (reviews.isEmpty()) return
    val scope = rememberCoroutineScope()
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("reseñas")
        reviews.forEach { r -> ReviewCard(store, r) }
        // "Más reseñas" while the server says there's a next page; a failure keeps it and says so.
        if (store.reviewCursors[t.id] != null) {
            val busy = t.id in store.reviewsPaging
            Column(Modifier.padding(top = 2.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                GlassButton(
                    if (busy) "Cargando…" else "Más reseñas",
                    onClick = { scope.launch { store.loadMoreReviews(t.id) } },
                    trailingIcon = if (busy) null else KIcon.ChevronDown,
                    enabled = !busy,
                    fill = KColor.glassBg,
                )
                val e = store.loadError(LoadKey.MoreReviews(t.id))
                if (e != null && !busy) {
                    BasicText(
                        if (e == KuraApiError.Offline) "Sin conexión. Inténtalo de nuevo." else "No se pudieron cargar. Inténtalo de nuevo.",
                        style = KuraType.note,
                    )
                }
            }
        }
    }
}

/**
 * A review (s1, radius 18). Spoiler = the text blurred under "Contiene spoiler · Mostrar". Someone
 * else's: "…" (or a long press) → the review menu (Reportar reseña · Bloquear). Yours: Editar (the complete sheet on the text) and
 * Borrar (with its own Deshacer). A reported one folds in place ("Gracias. La revisamos.").
 */
@Composable
private fun ReviewCard(store: AppStore, review: Review) {
    val shape = RoundedCornerShape(KRadius.surface)
    if (review.id in store.reportedReviews) {
        BasicText(
            "Gracias. La revisamos.",
            Modifier.fillMaxWidth().background(KColor.s1, shape).padding(horizontal = 18.dp, vertical = 16.dp),
            style = KuraType.ui(15f).copy(color = KColor.text2),
        )
        return
    }
    val mine = !reviewMenuApplies(review, store.me.id)
    val revealed = !review.spoiler || review.id in store.revealedSpoilers
    var menu by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth()
            .background(KColor.s1, shape)
            .then(if (!mine) Modifier.kPressable(KPressFeel.Dim, role = null, onLongClickLabel = "Opciones de la reseña", onLongPress = { menu = true }) {} else Modifier)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            val p = store.person(review.authorId)
            if (p != null) Seal(p.initials, p.hexes, size = 32.dp, photo = p.photo)
            // `authorHandle` is null for an account without a handle: the name, or "tú".
            val who = when {
                mine -> "tú"
                p == null -> "@${review.authorId}"
                p.handle.isEmpty() -> p.name.ifEmpty { "alguien" }
                else -> "@${p.handle}"
            }
            BasicText(who, Modifier.weight(1f), style = KuraType.ui(15f, UiWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
            review.mark?.let { GlyphIcon(it.reaction.glyph, size = 14.dp) }
            if (!mine) ReviewMenu(store, review, expanded = menu, onExpandedChange = { menu = it }, chip = 32.dp)
        }
        Box(contentAlignment = Alignment.Center) {
            BasicText(
                review.text,
                Modifier.fillMaxWidth()
                    .then(if (revealed) Modifier else spoilerVeil())
                    .semantics { if (!revealed) hideFromAccessibility() },
                style = KuraType.body.copy(lineHeight = 24.sp),
            )
            if (!revealed) SpoilerPill { store.revealedSpoilers = store.revealedSpoilers + review.id }
        }
        if (mine) {
            if (review.hidden) {
                // Editing never un-hides (founder, 2026-09-02): only moderation's Restaurar does.
                BasicText("Moderación ocultó tu reseña: solo tú la ves. Editarla no la vuelve a publicar.", style = KuraType.note)
            }
            Row(Modifier.offset(x = (-12).dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                KuraTextButton("Editar", { store.present(SheetRoute.Complete(review.titleId, focusReview = true)) }, color = KColor.text2)
                KuraTextButton("Borrar", { store.deleteReview(review.titleId) }, color = KColor.text2)
            }
        }
    }
}

/** Blurred text (API 31+); before 31 Compose can't blur, so the text simply isn't drawn. */
private fun spoilerVeil(): Modifier =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Modifier.blur(7.dp, BlurredEdgeTreatment.Unbounded) else Modifier.alpha(0f)

/** "Contiene spoiler · Mostrar": mono 11 on the art glass, over the blurred text. */
@Composable
private fun SpoilerPill(onReveal: () -> Unit) {
    Row(
        Modifier.kPressable(KPressFeel.Dim, onClickLabel = "Mostrar", onClick = onReveal)
            .clearAndSetSemantics { contentDescription = "Contiene spoiler. Mostrar" }
            .height(36.dp)
            .kArtGlass(CircleShape)
            .padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MonoLabel("Contiene spoiler", tracking = 0.08f)
        MonoLabel("·", color = KColor.text3)
        MonoLabel("Mostrar", color = KColor.text)
    }
}

// MARK: En tus colecciones · también de ──────────────────────────────────────────────────

@Composable
private fun InYourCollections(store: AppStore, t: Title) {
    val cols = store.collectionsContaining(t.id)
    if (cols.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("en tus colecciones")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            cols.forEach { c ->
                // Each pill led by its mini fan at 22 (Colecciones formalizado · 8).
                Row(
                    Modifier.kPressable(onClickLabel = "Abrir colección") { store.push(Route.Collection(c.id)) }
                        .clearAndSetSemantics { contentDescription = c.name }
                        .height(40.dp)
                        .background(KColor.glassBg, CircleShape)
                        .padding(start = 8.dp, end = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FanView(store.fan(c).map { it.art }, 22.dp)
                    BasicText(c.name, style = KuraType.news(17f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun AlsoBy(store: AppStore, t: Title) {
    val creator = t.creator ?: return
    val others = store.catalogOrder.mapNotNull { store.title(it) }.filter { it.creator == creator && it.id != t.id }
    if (others.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle(
            "también de ${t.lowerCreator.orEmpty()}",
            Modifier.kPressable(KPressFeel.Dim, onClickLabel = "Ver todo de $creator") { store.push(Route.CreatorRoute(creator)) },
        )
        Row(
            Modifier.offset(x = (-24).dp).fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            others.forEach { o ->
                val w = if (o.format == MediaFormat.Album) 130.dp else 100.dp
                Column(
                    Modifier.width(w).kPressable(onClickLabel = "Abrir") { store.push(Route.TitleRoute(o.id)) },
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Cover(o.art, Modifier.kHeroCover("cover-${o.id}"), width = w, radius = KRadius.coverS, onMissingPalette = { store.fillPaletteIfNeeded(o) })
                    BasicText(o.name, style = KuraType.tileWork, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

// MARK: 24b · Serie ───────────────────────────────────────────────────────────────────────

/** Progress card ("Viendo · T2 · 3 de 10") and the episode list. Episodes are local (§4 → 501). */
@Composable
private fun SeriesSections(store: AppStore, t: Title) {
    if (t.seasons.isEmpty()) return
    val watched = store.userTitles[t.id]?.watchedEpisodes ?: emptySet()
    val current = currentSeason(t, watched)
    var chosen by rememberSaveable { mutableIntStateOf(0) }
    var expanded by rememberSaveable { mutableStateOf(false) }
    val shown = if (chosen == 0) current else chosen
    Column(verticalArrangement = Arrangement.spacedBy(30.dp)) {
        t.seasons.firstOrNull { it.number == current }?.let { ProgressCard(store, t, it, watched) }
        val s = t.seasons.firstOrNull { it.number == shown } ?: return@Column
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                BasicText("episodios", Modifier.weight(1f).semantics { heading() }, style = KuraType.section)
                if (t.seasons.size > 1) {
                    MonoSegmented(
                        t.seasons.map { it.number to "T${it.number}" },
                        shown,
                        onSelect = {
                            chosen = it
                            expanded = false
                        },
                        modifier = Modifier.width((56 * t.seasons.size).coerceAtMost(220).dp),
                    )
                }
            }
            val next = nextEpisode(s, watched)
            s.episodes.take(if (expanded) s.episodes.size else 6).forEachIndexed { i, name ->
                val n = i + 1
                val key = "T${s.number}E$n"
                val seen = key in watched
                Row(
                    Modifier.fillMaxWidth()
                        .background(if (next == n) KColor.s1 else Color.Transparent, RoundedCornerShape(KRadius.surface))
                        .kPressable(feel = KPressFeel.Row(0.dp), onClickLabel = if (seen) "Marcar sin ver" else "Marcar visto") { store.toggleEpisode(t.id, key) }
                        .semantics(mergeDescendants = true) { selected = seen }
                        .heightIn(min = 52.dp)
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BasicText("E$n", Modifier.width(26.dp), style = KuraType.mono(12f).copy(color = KColor.text2))
                    BasicText(name, Modifier.weight(1f), style = KuraType.body.copy(color = if (seen) KColor.text2 else KColor.text), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    RadioMark(seen)
                }
            }
            if (s.episodes.size > 6) {
                KuraTextButton(
                    if (expanded) "Ver menos" else "Ver los ${s.episodes.size} episodios",
                    { expanded = !expanded },
                    Modifier.offset(x = (-12).dp),
                    color = KColor.text2,
                )
            }
        }
    }
}

private fun currentSeason(t: Title, watched: Set<String>): Int =
    t.seasons.firstOrNull { nextEpisode(it, watched) != null }?.number ?: t.seasons.lastOrNull()?.number ?: 1

private fun nextEpisode(s: Season, watched: Set<String>): Int? =
    (1..maxOf(s.episodes.size, 1)).firstOrNull { "T${s.number}E$it" !in watched }

@Composable
private fun ProgressCard(store: AppStore, t: Title, s: Season, watched: Set<String>) {
    val n = s.episodes.size.coerceAtLeast(1)
    val done = (1..n).count { "T${s.number}E$it" in watched }
    val next = nextEpisode(s, watched)
    Column(
        Modifier.fillMaxWidth().background(KColor.s1, RoundedCornerShape(KRadius.surface)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(Modifier.fillMaxWidth()) {
            MonoLabel(if (done == n) "Visto · T${s.number}" else "Viendo · T${s.number}", Modifier.weight(1f), size = 12f)
            MonoLabel("$done de $n", size = 12f, color = KColor.text)
        }
        Row(Modifier.fillMaxWidth().clearAndSetSemantics { }, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            (1..n).forEach { i ->
                val on = "T${s.number}E$i" in watched
                Box(Modifier.weight(1f).height(6.dp).background(if (on) KColor.completed else Color.White.copy(alpha = 0.12f), CircleShape))
            }
        }
        if (next != null) {
            GlassButton("Marcar E$next visto", { store.toggleEpisode(t.id, "T${s.number}E$next") }, glyph = Glyph.Check, fullWidth = true, fill = KColor.glassBg)
        } else if (store.mark(t.id) == null) {
            GlassButton("Completar", { store.present(SheetRoute.Complete(t.id, focusReview = false)) }, fullWidth = true, fill = KColor.glassBg)
        }
    }
}

// MARK: 24c · Álbum · 37c anunciado ───────────────────────────────────────────────────────

@Composable
private fun AlbumSections(store: AppStore, t: Title) {
    val context = LocalContext.current
    val unreleased = store.isUnreleased(t)
    val app = store.musicApp
    val open = { openExternal(context, musicUrl(store, t)) }
    Column(verticalArrangement = Arrangement.spacedBy(30.dp)) {
        if (unreleased) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionTitle("dónde escuchar")
                ServiceRow(name = "Abrir en $app", logo = { KIconView(KIcon.Music, size = 17.dp) }, trailing = "", onClick = open)
                val fresh = t.tracks.count { it.isNew }
                val label = store.releaseLabel(t)
                val note = if (fresh > 0 && label != null) "Abre el álbum completo. Los $fresh tracks nuevos llegan en $label." else "Abre el álbum en $app."
                BasicText(note, style = KuraType.note)
            }
        } else {
            GlassButton("Abrir en $app", open, icon = KIcon.Play, trailingIcon = KIcon.ExternalLink, height = 48.dp, fontSize = 16f, fill = KColor.glassBg)
        }
        if (t.tracks.isNotEmpty()) {
            // Before release `available: false` = not out yet ("pronto"); after, it only means
            // album-only / not in this country, and the track draws like the rest.
            val available = t.tracks.count { it.available }
            Column {
                Row(Modifier.fillMaxWidth().padding(bottom = if (unreleased) 4.dp else 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    BasicText(if (unreleased) "tracks" else "canciones", Modifier.weight(1f).semantics { heading() }, style = KuraType.section)
                    if (unreleased) MonoLabel("$available de ${t.trackCount ?: t.tracks.size} disponibles")
                }
                t.tracks.forEach { tr ->
                    val soon = unreleased && !tr.available
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics(mergeDescendants = true) { },
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        MonoLabel(if (unreleased) "${tr.number}" else "%02d".format(EsMx, tr.number), Modifier.width(22.dp), size = if (unreleased) 11f else 12f)
                        BasicText(
                            tr.name,
                            Modifier.weight(1f),
                            style = KuraType.ui(if (unreleased) 16f else 15f).copy(color = if (soon) KColor.text2 else KColor.text),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        // text-2, not text-3: the page continues in the title's tone 2, not black.
                        if (soon) MonoLabel("pronto", size = 10f)
                    }
                }
                val total = t.trackCount
                if (total != null && total > t.tracks.size) {
                    KuraTextButton("Ver las $total en $app", open, Modifier.offset(x = (-12).dp).padding(top = 6.dp), color = KColor.text2)
                }
            }
        } else {
            t.trackCount?.let { total ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    BasicText("canciones", Modifier.semantics { heading() }, style = KuraType.section)
                    BasicText("$total canciones · la lista completa está en $app.", style = KuraType.ui(14f).copy(color = KColor.text2))
                }
            }
        }
    }
}

/**
 * The album in the preferred music app. The API hands `/api/links/resolve?…&service=<wire>` pinned to
 * the preference AT FETCH TIME and the title stays cached: re-pin `service` to the CURRENT choice
 * (learning 2026-09-29-liga-musica-servicio-viejo). Without a link, the service's search.
 */
private fun musicUrl(store: AppStore, t: Title): String {
    val link = KuraRuntime.resolve(t.watch.firstOrNull()?.url ?: t.musicLink)
    if (link != null) return repinService(link, AppStore.serviceWire(store.musicApp))
    val q = android.net.Uri.encode(listOfNotNull(t.name, t.creator).joinToString(" "))
    return when (store.musicApp) {
        "Spotify" -> "https://open.spotify.com/search/$q"
        "YouTube Music" -> "https://music.youtube.com/search?q=$q"
        "Tidal" -> "https://listen.tidal.com/search?q=$q"
        else -> "https://music.apple.com/mx/search?term=$q"
    }
}

private fun repinService(url: String, wire: String): String {
    val uri = android.net.Uri.parse(url)
    val names = try { uri.queryParameterNames } catch (_: UnsupportedOperationException) { return url }
    if ("service" !in names) return url
    val b = uri.buildUpon().clearQuery()
    for (name in names) {
        if (name == "service") b.appendQueryParameter(name, wire) else uri.getQueryParameters(name).forEach { b.appendQueryParameter(name, it) }
    }
    return b.build().toString()
}
