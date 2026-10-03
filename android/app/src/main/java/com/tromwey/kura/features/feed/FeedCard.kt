package com.tromwey.kura.features.feed

import android.os.Build
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.tromwey.kura.app.art
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FeedKind
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KFixedChrome
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowSize
import com.tromwey.kura.features.people.ReviewMenu
import com.tromwey.kura.features.people.reviewMenuApplies
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.KPill
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.StatusPill
import com.tromwey.kura.designsystem.components.kArtGlass
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.fillPaletteIfNeeded
import com.tromwey.kura.state.isFollowing
import com.tromwey.kura.state.toggleFollow
import com.tromwey.kura.state.push

/** The card's inner rhythm, one source for every variant (iOS `FeedCardInset`): chip at 18, last
 *  line 22 above the edge, 14 between chip · art · text. Cards abut, so card → card is always 40. */
internal object FeedCardInset {
    val top = 18.dp
    val bottom = 22.dp
    val gap = 14.dp
}

/** Under each cover of a burst strip: title (italic 16) + creator/format (mono 10). Fixed 46. */
private val BurstCaptionHeight = 46.dp
private val BurstSpacing = 14.dp
private val BurstMargin = 20.dp

/**
 * One card's content (iOS `FeedCard`): header (author chip, or "Sugerencia para ti"), the art
 * (single cover · burst strip · suggestion fan) taking what's left, and the text block hugging its
 * text up to its tier's cap. [height] = the tier height; [topInset] = the header the first card
 * runs up behind. Tapping the card opens its title (bursts and suggestions have none).
 */
@Composable
internal fun FeedCard(store: AppStore, event: FeedEvent, height: Dp, topInset: Dp) {
    val title = event.titleId?.let { store.title(it) }
    val author = store.person(event.authorId)
    val isSuggestion = event.kind is FeedKind.Suggestion
    // L 180 · M/S 105; the suggestion never clips.
    val textMax = if (isSuggestion) Dp.Unspecified else if (event.tier == FeedEvent.Tier.L) 180.dp else 105.dp
    KFixedChrome {
        Column(
            Modifier
                .fillMaxWidth()
                .height(height + topInset)
                .then(
                    event.titleId?.let { tid ->
                        Modifier.clickable(interactionSource = null, indication = null, onClickLabel = "Abrir ${title?.name ?: "el título"}") {
                            store.push(Route.TitleRoute(tid))
                        }
                    // A card with no title of its own (burst, suggestion) still TAKES the tap: a card
                    // with no pointer input isn't hit at all, and the tap went through to the card
                    // pinned underneath, which opened ITS title.
                    } ?: Modifier.pointerInput(Unit) { detectTapGestures { } },
                )
                .padding(start = 20.dp, end = 20.dp, top = FeedCardInset.top + topInset, bottom = FeedCardInset.bottom),
            verticalArrangement = Arrangement.spacedBy(FeedCardInset.gap),
        ) {
            if (isSuggestion) {
                StatusPill(Glyph.Users, "Sugerencia para ti")
            } else if (author != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AuthorChip(author, feedAge(event.ageHours)) {
                        if (author.id != store.me.id) store.push(Route.PersonRoute(author.handle))
                    }
                    Spacer(Modifier.weight(1f))
                    // Someone else's review: report it (or block its author) right here.
                    val r = store.review(event.reviewId)
                    if (r != null && reviewMenuApplies(r, store.me.id)) FeedReviewMenu(store, r)
                }
            }
            Box(Modifier.fillMaxWidth().weight(1f)) { FeedArt(store, event, title) }
            Box(Modifier.fillMaxWidth().then(if (textMax != Dp.Unspecified) Modifier.heightIn(max = textMax) else Modifier).clipToBounds()) {
                TextBlock(store, event, title, author)
            }
        }
    }
}

// MARK: Header

@Composable
private fun AuthorChip(person: Person, age: String, onClick: () -> Unit) {
    Row(
        Modifier
            .kPressable(onClickLabel = "Ver el perfil de @${person.handle}", onClick = onClick)
            .semantics(mergeDescendants = true) {}
            .background(KColor.glassBg, CircleShape)
            .padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Seal(person.initials, person.hexes, size = 28.dp, photo = person.photo)
        BasicText("@${person.handle}", style = KuraType.ui(13f, UiWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false))
        MonoLabel(age)
    }
}

/** ⋯ on someone else's review: the shared [com.tromwey.kura.features.people.ReviewMenu] (a `KuraMenu`). */
@Composable
private fun FeedReviewMenu(store: AppStore, review: Review) {
    var open by remember { mutableStateOf(false) }
    ReviewMenu(store, review, expanded = open, onExpandedChange = { open = it })
}

// MARK: Art

@Composable
private fun FeedArt(store: AppStore, event: FeedEvent, title: Title?) {
    when (val k = event.kind) {
        is FeedKind.Burst -> BurstStrip(store, k.titleIds.mapNotNull { store.title(it) })
        is FeedKind.Suggestion -> SuggestionFan(store, k.titleIds.mapNotNull { store.title(it) }, store.person(k.personId)?.handle)
        else -> if (title != null) {
            BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                val a = title.format.aspect
                val w = minOf(maxWidth, maxHeight * a)
                Cover(title.art, Modifier.kHeroCover("cover-${title.id}"), width = w, height = w / a,
                    onMissingPalette = { store.fillPaletteIfNeeded(title) })
            }
        }
    }
}

/**
 * The burst's covers, each at its format's ratio and captioned; it drops in height until the widest
 * fits whole. Snap: the first rests at the start, the last at the end, the rest center (iOS `BurstSnap`).
 */
@Composable
private fun BurstStrip(store: AppStore, titles: List<Title>) {
    if (titles.isEmpty()) return
    val widest = titles.maxOf { it.format.aspect }
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        val h = maxOf(minOf(maxHeight - BurstCaptionHeight, (maxWidth + BurstMargin * 2) / widest), 0.dp)
        val state = rememberLazyListState()
        val snap = remember {
            object : SnapPosition {
                override fun position(layoutSize: Int, itemSize: Int, beforeContentPadding: Int, afterContentPadding: Int, itemIndex: Int, itemCount: Int): Int =
                    when (itemIndex) {
                        0 -> 0
                        itemCount - 1 -> layoutSize - beforeContentPadding - afterContentPadding - itemSize
                        else -> (layoutSize - beforeContentPadding - afterContentPadding) / 2 - itemSize / 2
                    }
            }
        }
        LazyRow(
            state = state,
            // Runs past the card's 20 margins, edge to edge.
            modifier = Modifier.requiredWidth(maxWidth + BurstMargin * 2).height(h + BurstCaptionHeight),
            contentPadding = PaddingValues(horizontal = BurstMargin),
            horizontalArrangement = Arrangement.spacedBy(BurstSpacing),
            flingBehavior = rememberSnapFlingBehavior(state, snap),
        ) {
            itemsIndexed(titles, key = { _, t -> t.id }) { _, t ->
                val sub = t.creator ?: t.format.metaLabel
                Column(
                    Modifier
                        .width(h * t.format.aspect)
                        .kPressable(onClickLabel = "Abrir") { store.push(Route.TitleRoute(t.id)) }
                        .clearAndSetSemantics { contentDescription = "${t.name}, $sub"; role = Role.Button },
                ) {
                    Cover(t.art, Modifier.kHeroCover("cover-${t.id}"), height = h, onMissingPalette = { store.fillPaletteIfNeeded(t) })
                    Column(Modifier.height(BurstCaptionHeight).padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        BasicText(t.name, style = KuraType.newsItalic(16f).copy(fontSize = KuraType.fixed(16f)), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        MonoLabel(sub, size = 10f)
                    }
                }
            }
        }
    }
}

/** The suggestion's three covers: the one the reason names in front, the others tilted ±8° behind. */
@Composable
private fun SuggestionFan(store: AppStore, titles: List<Title>, handle: String?) {
    val order = if (titles.size >= 3) listOf(titles[1], titles[0], titles[2]) else titles
    val front = if (titles.size >= 3) 1 else order.size / 2
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val h = maxHeight * 0.64f
        order.forEachIndexed { i, t ->
            val pos = (i - front).toFloat()
            // The fan is the person's library: any cover opens their profile (web and iOS do the same).
            Cover(
                t.art,
                Modifier
                    .zIndex(if (i == front) 3f else 1f)
                    .offset(x = 58.dp * pos)
                    .rotate(pos * 8f)
                    .then(
                        if (handle != null) {
                            Modifier
                                .kPressable(onClickLabel = "Ver el perfil") { store.push(Route.PersonRoute(handle)) }
                                .clearAndSetSemantics { contentDescription = "Ver el perfil de @$handle"; role = Role.Button }
                        } else {
                            Modifier.clearAndSetSemantics { }
                        },
                    ),
                height = h,
                onMissingPalette = { store.fillPaletteIfNeeded(t) },
            )
        }
    }
}

// MARK: Text

@Composable
private fun TextBlock(store: AppStore, event: FeedEvent, title: Title?, author: Person?) {
    val isMe = event.authorId == store.me.id
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        val pills = pills(store, event, isMe)
        val added = when (val k = event.kind) {
            is FeedKind.Added -> k.collection.ifEmpty { null }
            is FeedKind.Burst -> k.collection.ifEmpty { null }
            else -> null
        }
        if (pills.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                pills.forEach { (g, label) -> StatusPill(g, label) }
                if (added != null) CollectionName(store, event, added, isMe, author)
            }
        }
        when (val k = event.kind) {
            is FeedKind.Suggestion -> {
                BasicText(reasonText(k.reason, k.titleIds.mapNotNull { store.title(it)?.name }), style = KuraType.news(26f))
                store.person(k.personId)?.let { p ->
                    Row(
                        Modifier.kPressable(onClickLabel = "Ver el perfil") { store.push(Route.PersonRoute(p.handle)) },
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Seal(p.initials, p.hexes, size = 44.dp, photo = p.photo)
                        BasicText("@${p.handle}", style = KuraType.ui(17f, UiWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (k.social.isNotEmpty()) BasicText(k.social, style = KuraType.ui(14f).copy(color = KColor.text2))
                    // The screen's one honey: Seguir on the suggestion.
                    FollowButton(
                        if (store.isFollowing(p.id)) FollowState.Following else FollowState.Follow,
                        onClick = { store.toggleFollow(p.id) },
                        modifier = Modifier.padding(top = 4.dp),
                        size = FollowSize.Card,
                        honey = true,
                        handle = p.handle,
                    )
                }
            }
            is FeedKind.Burst -> Unit
            else -> {
                if (title != null) {
                    BasicText(
                        buildAnnotatedString {
                            append(title.name)
                            withStyle(SpanStyle(color = KColor.text2)) { append(" · " + (title.creator ?: title.format.metaLabel)) }
                        },
                        style = KuraType.newsItalic(26f),
                    )
                }
                store.review(event.reviewId)?.let { r -> ReviewText(store, r) }
            }
        }
    }
}

/** The review body, clamped to 3 lines; a spoiler is blurred under "Contiene spoiler · Mostrar". */
@Composable
private fun ReviewText(store: AppStore, r: Review) {
    val revealed = !r.spoiler || r.id in store.revealedSpoilers
    val shown by animateFloatAsState(if (revealed) 1f else 0f, KMotion.fade(), label = "spoiler")
    // Before Android 12 there's no blur: a hidden spoiler isn't drawn at all (never readable).
    val canBlur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    Box(Modifier.fillMaxWidth().padding(top = 2.dp), contentAlignment = Alignment.Center) {
        BasicText(
            r.text,
            modifier = Modifier
                .fillMaxWidth()
                .then(if (!revealed) Modifier.semantics { hideFromAccessibility() } else Modifier)
                .alpha(if (canBlur) 0.4f + 0.6f * shown else shown)
                .then(if (canBlur && shown < 1f) Modifier.blur((6f * (1f - shown)).dp) else Modifier),
            style = KuraType.ui(15f).copy(lineHeight = 19.sp),
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        if (!revealed) {
            Row(
                Modifier
                    .height(36.dp)
                    .kPressable(onClickLabel = "Mostrar") { store.revealedSpoilers = store.revealedSpoilers + r.id }
                    .clearAndSetSemantics { contentDescription = "Contiene spoiler. Mostrar"; role = Role.Button }
                    .kArtGlass(CircleShape)
                    .padding(horizontal = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MonoLabel("Contiene spoiler")
                MonoLabel("·", color = KColor.text3)
                MonoLabel("Mostrar", color = KColor.text)
            }
        }
    }
}

/** "guardó … en" + the collection's own name (Newsreader 17 roman), tappable when there's a page. */
@Composable
private fun CollectionName(store: AppStore, event: FeedEvent, name: String, isMe: Boolean, author: Person?) {
    val open: (() -> Unit)? = if (isMe) {
        val mine = event.collectionId?.let { store.collection(it) } ?: store.collections.firstOrNull { it.name == name }
        mine?.let { c -> { store.push(Route.Collection(c.id)) } }
    } else {
        val id = event.collectionId
        if (id != null && author != null) ({ store.push(Route.PublicCollection(author.handle, id)) }) else null
    }
    Box(
        Modifier
            .height(KPill.card.height)
            .then(if (open != null) Modifier.kPressable(KPressFeel.Dim, onClickLabel = "Abrir la colección", onClick = open) else Modifier)
            .semantics { contentDescription = "Colección $name" },
        contentAlignment = Alignment.CenterStart,
    ) {
        BasicText(name, style = KuraType.news(17f).copy(fontSize = KuraType.fixed(17f)), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

private val Mark.glyph: Glyph get() = when (this) { Mark.Obsessed -> Glyph.Flame; Mark.Liked -> Glyph.Thumb; Mark.Completed -> Glyph.Check }

/** One vocabulary of states: a completion with a reaction shows only the reaction; a waiting add only the wait. */
private fun pills(store: AppStore, event: FeedEvent, isMe: Boolean): List<Pair<Glyph, String>> {
    fun react(m: Mark?): Pair<Glyph, String>? =
        if (m == null || m == Mark.Completed) null else m.glyph to (if (isMe) m.myLabel else m.theirLabel)
    return when (val k = event.kind) {
        FeedKind.Obsessed -> listOf(Glyph.Flame to if (isMe) "Me obsesiona" else "Le obsesiona")
        is FeedKind.Completed -> listOf(react(k.mark) ?: (Glyph.Check to "Completo"))
        FeedKind.Reviewed -> listOfNotNull(Glyph.Review to if (isMe) "Reseñaste" else "Reseñó", react(store.review(event.reviewId)?.mark))
        is FeedKind.Added -> listOf(Glyph.Bookmark to (if (isMe) "Guardaste" else "Guardó") + if (k.collection.isEmpty()) "" else " en")
        is FeedKind.WaitingAdd -> listOf(Glyph.Clock to (if (isMe) "No puedo esperar · " else "No puede esperar · ") + k.label)
        is FeedKind.Burst -> listOf(Glyph.Bookmark to if (isMe) "Guardaste ${k.titleIds.size} títulos en" else "Guardó ${k.titleIds.size} títulos en")
        is FeedKind.Suggestion -> emptyList()
    }
}

/** The suggestion's reason with every named work in italic; the rest roman (crítica #37). */
internal fun reasonText(reason: String, works: List<String>): AnnotatedString {
    val ranges = mutableListOf<IntRange>()
    for (w in works) {
        if (w.isEmpty()) continue
        var from = 0
        while (true) {
            val i = reason.indexOf(w, from)
            if (i < 0) break
            val r = i until i + w.length
            if (ranges.none { it.first <= r.last && r.first <= it.last }) ranges.add(r)
            from = i + w.length
        }
    }
    ranges.sortBy { it.first }
    return buildAnnotatedString {
        var i = 0
        for (r in ranges) {
            if (i < r.first) append(reason.substring(i, r.first))
            withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(reason.substring(r.first, r.last + 1)) }
            i = r.last + 1
        }
        if (i < reason.length) append(reason.substring(i))
    }
}

/** "hace 3 h" · "hace 2 d" · "hace 1 mes" · "hace 2 años" (iOS `FeedCard.when`). */
internal fun feedAge(h: Double): String {
    if (h < 1) return "hace ${maxOf(1, (h * 60).toInt())} min"
    if (h < 24) return "hace ${h.toInt()} h"
    if (h < 7 * 24) return "hace ${(h / 24).toInt()} d"
    if (h < 35 * 24) return "hace ${(h / (7 * 24)).toInt()} sem"
    val months = (h / (30 * 24)).toInt()
    if (months < 12) return if (months == 1) "hace 1 mes" else "hace $months meses"
    val years = months / 12
    return if (years == 1) "hace 1 año" else "hace $years años"
}
