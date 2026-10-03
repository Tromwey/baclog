package com.tromwey.kura.features.discover

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.data.models.DiscoverPayload
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.SaveChip
import com.tromwey.kura.designsystem.components.SaveChipStyle
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.isUnreleased
import com.tromwey.kura.state.push

// 19a · Descubrir › Todo (Claude Design "Descubrir Final – Todo" 3a; frontend.md § "Descubrir ·
// Todo"). Twin of `DiscoverView.editorial` in ios/Kura/Features/Discover/DiscoverView.swift, same
// order: para empezar · recomendado para ti · colecciones para ti · tendencias · los más esperados ·
// lo nuevo de tus favoritos. Nothing already in your library shows (the store drops it on load).

/** The recommendations the carousel shows (≤ 6, like iOS). */
internal fun AppStore.recs(): List<DiscoverPayload.Recommended> = (discover?.recommended ?: emptyList()).take(6)

/** The tones the Todo page wears: the recommendation in view; without one, no color. */
internal fun AppStore.homeHexes(recIndex: Int): List<String> {
    val list = recs()
    val r = list.getOrNull(recIndex) ?: list.firstOrNull() ?: return emptyList()
    return fresh(r.title).palette
}

/** Which recommendation is in view: the first visible card, or the next once it's past half. */
internal fun LazyListState.recInView(cardPx: Float): Int {
    val i = firstVisibleItemIndex
    return if (firstVisibleItemScrollOffset > cardPx / 2) i + 1 else i
}

@Composable
internal fun DiscoverHome(store: AppStore, recState: LazyListState, recIndex: Int, onRetry: () -> Unit) {
    val d = store.discover
    val error = store.loadError(LoadKey.Discover)
    if (d == null && !store.discoverLoading && error != null) {
        val (title, note) = error.loadCopy
        LoadErrorBlock(title, note, onRetry, Modifier.padding(horizontal = 28.dp).padding(top = 52.dp))
        return
    }

    // Covers on this page fly to the ficha; a title in two sections flies from the first one only.
    val recs = store.recs()
    val trends = (d?.trending ?: emptyList()).map { store.fresh(it.title) }.take(5)
    val upcoming = (d?.upcoming ?: emptyList()).map { u ->
        val t = store.fresh(u.title)
        val meta = when {
            u.waiting <= 0 -> null
            u.waiting == 1 -> "1 lo espera"
            else -> "${u.waiting} lo esperan"
        }
        CoverRowItem(t, store.upcomingLabel(t, u.releaseDate), meta)
    }
    val favorites = (store.discoverCreators?.items ?: emptyList()).map { i ->
        val t = store.fresh(i.title)
        // The date rides on the cover only while it's still ahead.
        val ahead = (i.releaseDate?.let { it > store.now } ?: false) || store.isUnreleased(t)
        CoverRowItem(t, if (ahead) store.upcomingLabel(t, i.releaseDate) else "", "de ${i.creator.name}")
    }
    val claimed = HashSet<String>()
    val heroRecs = recs.map { it.title.id }.filterTo(HashSet()) { claimed.add(it) }
    val heroTrends = trends.map { it.id }.filterTo(HashSet()) { claimed.add(it) }
    val heroUpcoming = upcoming.map { it.title.id }.filterTo(HashSet()) { claimed.add(it) }
    val heroFavorites = favorites.map { it.title.id }.filterTo(HashSet()) { claimed.add(it) }

    Column(Modifier.fillMaxWidth().padding(top = 32.dp), verticalArrangement = Arrangement.spacedBy(40.dp)) {
        if (d != null && recs.isEmpty()) FirstSteps()
        if (d == null && store.discoverLoading) {
            HomeSkeleton()
        } else if (recs.isNotEmpty()) {
            Recommended(store, recs, recState, recIndex, heroRecs)
        }
        FollowedCollections(store, d?.collections ?: emptyList())
        Trends(store, trends, heroTrends)
        CoverRow(store, "los más esperados", upcoming, heroUpcoming)
        CoverRow(store, "lo nuevo de tus favoritos", favorites, heroFavorites)
    }
}

/** 3a · cuenta nueva: nothing to recommend yet — explain what lights it up. */
@Composable
private fun FirstSteps() {
    Column(
        Modifier
            .padding(horizontal = 12.dp)
            .fillMaxWidth()
            .background(KColor.glassBg, RoundedCornerShape(KRadius.screen))
            .padding(horizontal = 20.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            Modifier.height(30.dp).background(KColor.glassBg, CircleShape).padding(horizontal = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GlyphIcon(Glyph.Flame, size = 12.dp)
            MonoLabel("Para empezar", size = 12f, tracking = 0.06f, color = KColor.text)
        }
        BasicText("descubrir aprende de tus obsesiones.", Modifier.semantics { heading() }, style = KuraType.news(24f))
        NoteText("Marca algo con la llama en cualquier ficha y aquí aparecen títulos que se le parecen.")
    }
}

/** "recomendado para ti" — 340 cards that snap; the page follows the one in view (dots on the right). */
@Composable
private fun Recommended(
    store: AppStore,
    recs: List<DiscoverPayload.Recommended>,
    state: LazyListState,
    index: Int,
    heroes: Set<String>,
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = KSize.margin), verticalAlignment = Alignment.CenterVertically) {
            BasicText("recomendado para ti", Modifier.weight(1f).semantics { heading() }, style = KuraType.news(22f))
            if (recs.size > 1) {
                Row(Modifier.clearAndSetSemantics { }, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    recs.forEachIndexed { i, _ ->
                        val on = i == index.coerceIn(0, recs.lastIndex)
                        val w by animateDpAsState(if (on) 18.dp else 6.dp, KMotion.snappy(), label = "recDot")
                        val a by animateFloatAsState(if (on) 1f else 0.35f, KMotion.snappy(), label = "recDotAlpha")
                        Box(Modifier.size(w, 6.dp).alpha(a).background(KColor.text, CircleShape))
                    }
                }
            }
        }
        LazyRow(
            state = state,
            contentPadding = PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            flingBehavior = rememberSnapFlingBehavior(state, SnapPosition.Start),
        ) {
            items(recs, key = { it.title.id }) { r -> RecCard(store, r, r.title.id in heroes) }
        }
    }
}

/** The card width (3a). */
internal val REC_CARD = 340.dp

@Composable
private fun RecCard(store: AppStore, r: DiscoverPayload.Recommended, hero: Boolean) {
    val t = store.fresh(r.title)
    val seed = r.seed?.let { store.fresh(it) }
    val album = t.format == MediaFormat.Album
    val meta = listOfNotNull(t.format.metaLabel, t.year?.toString(), t.creator).filter { it.isNotEmpty() }.joinToString(" · ")
    val because = seed?.name ?: r.reason.removePrefix("Porque te obsesiona ")
    // Android: a normal tinted card (NOT glass — iOS 26 and the web use glass here).
    Row(
        Modifier
            .width(REC_CARD)
            .kTint(t.palette, TintStyle.Card, RoundedCornerShape(KRadius.screen))
            .padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(18.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        // 3a geometry: the reco's cover in front (88×132 · disc 116), the obsession's behind, −9°.
        Box(
            Modifier
                .size(if (album) 140.dp else 118.dp, 146.dp)
                .kPressable(onClickLabel = "Abrir ${t.name}") { store.push(Route.TitleRoute(t.id)) },
        ) {
            if (seed != null) {
                TitleCover(
                    store, seed,
                    Modifier.align(Alignment.TopStart).padding(top = 6.dp).rotate(-9f),
                    width = if (seed.format == MediaFormat.Album) 70.dp else 60.dp,
                    radius = 10.dp,
                    hero = false,
                )
            }
            TitleCover(store, t, Modifier.align(Alignment.BottomEnd), width = if (album) 116.dp else 88.dp, radius = 12.dp, hero = hero)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    GlyphIcon(Glyph.Flame, size = 10.dp)
                    MonoLabel("Porque te obsesiona", size = 10f, maxLines = 2)
                }
                if (because.isNotEmpty()) {
                    BasicText(because, style = KuraType.newsItalic(14f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            BasicText(t.name, style = KuraType.newsItalic(24f), maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (meta.isNotEmpty()) MonoLabel(meta, size = 10f)
            SaveChip(
                store.savedCount(t.id),
                onClick = { store.openSaveTo(t.id) },
                modifier = Modifier.padding(top = 4.dp),
                style = SaveChipStyle.Pill,
            )
        }
    }
}

/** 19a while `GET /discover` runs: the shape of the recommendation card (a still skeleton). */
@Composable
private fun HomeSkeleton() {
    Column(
        Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "Cargando" },
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Skeleton(Modifier.padding(horizontal = KSize.margin).size(180.dp, 22.dp), radius = 6.dp)
        Row(
            Modifier
                .padding(horizontal = 12.dp)
                .fillMaxWidth()
                .background(KColor.s1, RoundedCornerShape(KRadius.screen))
                .padding(20.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Skeleton(Modifier.size(88.dp, 132.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Skeleton(Modifier.size(140.dp, 10.dp), radius = 5.dp)
                Skeleton(Modifier.size(170.dp, 22.dp), radius = 6.dp)
                Skeleton(Modifier.size(110.dp, 12.dp), radius = 5.dp)
            }
        }
    }
}

/** "colecciones para ti" — followed people's showcased collections, two columns of fans (3a). */
@Composable
private fun FollowedCollections(store: AppStore, cols: List<DiscoverPayload.FollowedCollection>) {
    if (cols.isEmpty()) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        SectionHead("colecciones para ti")
        Column(Modifier.padding(horizontal = KSize.margin), verticalArrangement = Arrangement.spacedBy(28.dp)) {
            cols.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    pair.forEach { c -> FollowedCollectionTile(store, c, Modifier.weight(1f)) }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun FollowedCollectionTile(store: AppStore, c: DiscoverPayload.FollowedCollection, modifier: Modifier) {
    val count = if (c.count == 1) "1 título" else "${c.count} títulos"
    Column(
        modifier.kPressable(onClickLabel = "Abrir ${c.name}") { store.push(Route.PublicCollection(c.handle, c.id)) }
            .semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.fillMaxWidth().height(150.dp), contentAlignment = Alignment.BottomCenter) {
            FanView(c.covers.map { store.fresh(it).art }, lead = 118.dp, label = "Portadas de ${c.name}")
        }
        BasicText(
            c.name,
            style = KuraType.news(18f).copy(textAlign = TextAlign.Center),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            InitialsSeal(c.handle.take(2).lowercase(), 22.dp, photo = KuraRuntime.resolve(c.avatarUrl))
            BasicText(
                "@${c.handle} · $count",
                style = KuraType.ui(13f).copy(color = KColor.text2),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** "tendencias" — five ranked rows with the save chip. */
@Composable
private fun Trends(store: AppStore, list: List<Title>, heroes: Set<String>) {
    if (list.isEmpty()) return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionHead("tendencias")
        Column {
            list.forEachIndexed { i, t ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 76.dp)
                        .kPressable(KPressFeel.Row(), onClickLabel = "Abrir ${t.name}") { store.push(Route.TitleRoute(t.id)) }
                        .padding(horizontal = KSize.margin),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BasicText("${i + 1}", Modifier.width(22.dp), style = KuraType.mono(18f).copy(color = KColor.text2))
                    Box(Modifier.width(48.dp), contentAlignment = Alignment.Center) {
                        TitleCover(
                            store, t,
                            height = if (t.format == MediaFormat.Album) 51.dp else 64.dp,
                            radius = KRadius.coverS,
                            hero = t.id in heroes,
                        )
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        BasicText(t.name, style = KuraType.newsItalic(17f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        MonoLabel(metaShort(t))
                    }
                    SaveChip(store.savedCount(t.id), onClick = { store.openSaveTo(t.id) })
                }
            }
        }
    }
}
