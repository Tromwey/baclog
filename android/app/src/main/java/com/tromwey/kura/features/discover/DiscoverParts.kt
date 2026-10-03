package com.tromwey.kura.features.discover

import com.tromwey.kura.designsystem.components.DockBandEffect
import com.tromwey.kura.designsystem.components.animatedTintTail
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.runtime.remember
import com.tromwey.kura.app.art
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.CoverBadge
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.SectionTitle
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.fillPaletteIfNeeded
import com.tromwey.kura.state.isUnreleased
import com.tromwey.kura.state.label
import com.tromwey.kura.state.releaseLabel
import com.tromwey.kura.state.push
import com.tromwey.kura.state.present

// Pieces every Descubrir page shares (Todo, the three formats, the search): the title's cover with
// its shared-element key, the section head, the horizontal cover row, the page tint and the labels.

/** The key the ficha's cover uses too (`TitleScreen`): the cover flies between them. */
internal fun heroKey(titleId: String) = "cover-$titleId"

/** The freshest copy of a title the store knows (a payload's copy may be older). */
internal fun AppStore.fresh(t: Title): Title = title(t.id) ?: t

/**
 * A title's cover in Descubrir: the DS `Cover` + the on-device palette fill (a cover with no palette
 * extracts it once, learning 2026-09-25) + the shared cover to the ficha when [hero] (only ONE tile
 * per title on a page carries it; inside the search dialog none does — another window).
 */
@Composable
internal fun TitleCover(
    store: AppStore,
    t: Title,
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp? = null,
    radius: Dp = KRadius.coverL,
    badge: CoverBadge = CoverBadge.None,
    fluid: Boolean = false,
    hero: Boolean = true,
    shadow: Boolean = true,
) {
    val m = if (hero) modifier.kHeroCover(heroKey(t.id)) else modifier
    Cover(
        t.art,
        m,
        width = width,
        height = height,
        radius = radius,
        badge = badge,
        fluid = fluid,
        shadow = shadow,
        onMissingPalette = { store.fillPaletteIfNeeded(t) },
    )
}

/** A section title at 22 with the page's side margin — no trailing aside (founder, 2026-09-29). */
@Composable
internal fun SectionHead(text: String, modifier: Modifier = Modifier) {
    SectionTitle(text, modifier.padding(horizontal = KSize.margin), size = 22f)
}

/** Someone without a photo or obsession tone: two initials on s2 (iOS `InitialsSeal`). */
@Composable
internal fun InitialsSeal(initials: String, size: Dp, modifier: Modifier = Modifier, photo: String? = null) {
    Seal(initials, emptyList(), modifier, size = size, photo = photo)
}

/** "Película · 2001 · Miyazaki" — the short meta under a title in a row. */
internal fun metaShort(t: Title): String =
    listOfNotNull(t.format.metaLabel, t.year?.toString(), if (t.format == MediaFormat.Album) t.creator else t.creatorShort)
        .filter { it.isNotEmpty() }
        .joinToString(" · ")

/** "En cines" · "14 h" · "T3 · sin fecha" · "2025" — what a rail says about a title's date. */
internal fun AppStore.upcomingLabel(t: Title, releaseDate: java.time.Instant?): String {
    if (t.release != null && (isUnreleased(t) || t.upcomingSeason != null)) return releaseLabel(t, withSeason = true) ?: ""
    if (releaseDate != null && releaseDate > now) return label(Release.Day(KuraJson.dayAtNoon(releaseDate)))
    if (t.watch.any { it.isCinema }) return "En cines"
    return t.year?.toString() ?: ""
}

/** Opens the one "guardar en" sheet (frontend.md § "Guardar un título · un solo componente"). */
internal fun AppStore.openSaveTo(titleId: String) = present(SheetRoute.SaveTo(titleId))

/** How many of your collections hold a title (the save chip's count). */
internal fun AppStore.savedCount(titleId: String): Int = collectionsContaining(titleId).size

/** One tile of a horizontal cover row: the date rides on the cover, a mono meta under the title. */
internal data class CoverRowItem(val title: Title, val `when`: String, val meta: String?)

/**
 * The horizontal cover row (3a · "los más esperados", "lo nuevo de tus favoritos", "próximos
 * discos"): posters at 100, records at 150, the date in the waiting pill on the cover, the name in
 * italic 14 and a mono meta. Nothing when [items] is empty.
 */
@Composable
internal fun CoverRow(
    store: AppStore,
    head: String,
    items: List<CoverRowItem>,
    heroes: Set<String>,
    modifier: Modifier = Modifier,
    albumWidth: Dp = 150.dp,
) {
    if (items.isEmpty()) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionHead(head)
        LazyRow(
            contentPadding = PaddingValues(horizontal = KSize.margin),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(items, key = { it.title.id }) { item ->
                val t = item.title
                val w = if (t.format == MediaFormat.Album) albumWidth else 100.dp
                Column(
                    Modifier.width(w).kPressable(onClickLabel = "Abrir ${t.name}") { store.push(Route.TitleRoute(t.id)) },
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    TitleCover(
                        store, t, width = w,
                        badge = if (item.`when`.isNotEmpty()) CoverBadge.Waiting(item.`when`) else CoverBadge.None,
                        hero = t.id in heroes,
                    )
                    BasicText(t.name, style = KuraType.newsItalic(14f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    item.meta?.let { MonoLabel(it, size = 10f) }
                }
            }
        }
    }
}

/**
 * The page tint (Todo 3a · "la página sigue a la recomendación"; formats 2a–2c): the DS feed
 * gradient at 760, drawn behind the scroll and moved WITH it (read in the draw phase, no
 * recomposition per frame), cross-faded when the tones change. No palette = no color (`bg`).
 */
@Composable
internal fun PageTint(hexes: List<String>, scroll: ScrollState, spec: FiniteAnimationSpec<Float>, modifier: Modifier = Modifier) {
    val density = LocalDensity.current.density
    val tail = animatedTintTail(hexes)
    DockBandEffect { tail }
    Crossfade(hexes, modifier.fillMaxSize(), animationSpec = spec, label = "discoverTint") { h ->
        if (h.isEmpty()) return@Crossfade
        val brush = remember(h, density) { Tint.feed(h, TINT_SPAN, density) }
        Box(
            Modifier.fillMaxSize().drawBehind {
                // A fixed-size rect (the shader is built once): past the span the gradient is tone 2,
                // which is also the page's own background (`animatedTintTail`).
                val tall = TINT_SPAN.toPx() + size.width + size.height
                translate(top = -scroll.value.toFloat()) { drawRect(brush, size = Size(size.width, tall)) }
            },
        )
    }
}

internal val TINT_SPAN = 760.dp

/** A plain text line in Hanken 15 text-2 (notes and empty shelves). */
@Composable
internal fun NoteText(text: String, modifier: Modifier = Modifier) {
    BasicText(text, modifier, style = KuraType.ui(15f).copy(color = KColor.text2))
}
