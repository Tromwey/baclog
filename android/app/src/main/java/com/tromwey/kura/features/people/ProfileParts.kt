package com.tromwey.kura.features.people

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.ScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.FanOrder
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FanCollectionTile
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.GoneView
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.LoadErrorScreen
import com.tromwey.kura.designsystem.components.LoadingScreen
import com.tromwey.kura.designsystem.components.RibbonPill
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.VibeLine
import com.tromwey.kura.designsystem.components.animatedTintTail
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.state.AppStore
import java.text.Normalizer

// The pieces a profile is made of, shared by someone else's profile (20a), yours (20c), "así te
// ven" (K1d) and the seguidores page (20e) — twins of iOS `FollowCounts` / `StatRibbon`
// (Controls.swift), `CollectionsShowcase`, `LockedCollections`, `AppStore.profileHexes(of:)` and
// `myProfileHexes`. Internal to the module: `features/profile` uses them too.

// MARK: Tint (the page's degradado único)

/** What tints someone's page — their profile and their seguidores: the featured obsession's
 *  palette, else their `hexes` (the server's newest obsession → dominant hexes). Empty = `bg`. */
internal fun AppStore.profileHexes(p: Person): List<String> {
    p.featuredTitleId?.let { id -> title(id)?.let { t -> FanOrder.kuraHexes(t.palette).ifEmpty { null }?.let { return it } } }
    return FanOrder.kuraHexes(p.hexes)
}

/** What tints YOUR profile (and your seguidores): the obsession you featured, else the newest
 *  obsession with a palette, else your library's hexes (`me.hexes`), else none. */
internal val AppStore.myProfileHexes: List<String>
    get() {
        me.featuredTitleId?.let { id -> title(id)?.let { t -> FanOrder.kuraHexes(t.palette).ifEmpty { null }?.let { return it } } }
        val newest = userTitles.entries.filter { it.value.mark == Mark.Obsessed }
            .sortedByDescending { it.value.savedAt }
            .mapNotNull { title(it.key) }
        newest.firstOrNull { FanOrder.kuraHexes(it.palette).isNotEmpty() }?.let { return FanOrder.kuraHexes(it.palette) }
        return FanOrder.kuraHexes(me.hexes)
    }

/** Your obsessions, oldest first (the profile's "me obsesiona" strip). */
internal val AppStore.myObsessions: List<Title>
    get() = userTitles.entries.filter { it.value.mark == Mark.Obsessed }
        .sortedBy { it.value.savedAt }
        .mapNotNull { title(it.key) }

/**
 * A page on the feed gradient of [tint] (iOS `kFeedSurface(tint, span: 900)` + `TopVeil(reach:
 * .statusBar)`): the gradient scrolls with the content, the page continues in its tone 2 below,
 * and the band under the clock fades what scrolls under it. [overlay] floats above (fixed chrome).
 */
@Composable
internal fun TintedPage(
    tint: List<String>,
    modifier: Modifier = Modifier,
    scroll: ScrollState = rememberScrollState(),
    minHeight: Dp = 0.dp,
    veilSolid: Dp = 46.dp,
    veilEnd: Dp = 64.dp,
    overlay: @Composable BoxScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    val tail = animatedTintTail(tint)
    val top = Tint.feedEnds(tint)?.first ?: KColor.bg
    Box(modifier.fillMaxSize().background(tail)) {
        Column(Modifier.fillMaxSize().verticalScroll(scroll)) {
            Column(Modifier.fillMaxWidth().heightIn(min = minHeight).kTint(tint, TintStyle.Feed(900.dp)), content = content)
        }
        TopVeil(color = top, solid = veilSolid, end = veilEnd)
        overlay()
    }
}

// MARK: Header pieces

/** "318 seguidores  142 siguiendo" — the number in 600, the word in text-2. [interactive] false =
 *  plain text (a preview, a profile you blocked): nothing that looks tappable and isn't. */
@Composable
internal fun FollowCounts(
    followers: Int,
    following: Int,
    modifier: Modifier = Modifier,
    interactive: Boolean = true,
    onFollowers: () -> Unit = {},
    onFollowing: () -> Unit = {},
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Count(followers, if (followers == 1) "seguidor" else "seguidores", interactive, onFollowers)
        Count(following, "siguiendo", interactive, onFollowing)
    }
}

@Composable
private fun Count(n: Int, word: String, interactive: Boolean, onClick: () -> Unit) {
    val text = buildAnnotatedString {
        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = KColor.text)) { append("$n") }
        withStyle(SpanStyle(color = KColor.text2)) { append(" $word") }
    }
    val m = if (interactive) {
        Modifier.heightIn(min = 44.dp).kPressable(onClickLabel = "Ver $word", onClick = onClick)
    } else {
        Modifier
    }
    Box(m.semantics(mergeDescendants = true) { contentDescription = "$n $word" }, contentAlignment = Alignment.CenterStart) {
        BasicText(text, style = KuraType.ui(14f))
    }
}

/** A profile's ribbon: obsesiones · completos · me gusta · reseñas, one glass pill each. A zero says
 *  nothing, so it isn't drawn; TalkBack reads the nouns the glyphs stand for. */
@Composable
internal fun StatRibbon(obsessed: Int, completed: Int, liked: Int, reviews: Int, modifier: Modifier = Modifier) {
    val items = listOf(
        Triple(Glyph.Flame, obsessed, if (obsessed == 1) "obsesión" else "obsesiones"),
        Triple(Glyph.Check, completed, if (completed == 1) "completo" else "completos"),
        Triple(Glyph.Thumb, liked, "me gusta"),
        Triple(Glyph.Review, reviews, if (reviews == 1) "reseña" else "reseñas"),
    ).filter { it.second > 0 }
    if (items.isEmpty()) return
    FlowRow(
        modifier.clearAndSetSemantics { contentDescription = items.joinToString(", ") { "${it.second} ${it.third}" } },
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        items.forEach { (g, n, _) -> RibbonPill(g, "$n") }
    }
}

/** A horizontal strip of covers at [height] that open their ficha (the cover travels: `kHeroCover`). */
@Composable
internal fun CoverStrip(titles: List<Title>, height: Dp, onOpen: (Title) -> Unit, modifier: Modifier = Modifier, radius: Dp? = null) {
    Row(
        modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        titles.forEach { t -> StripCover(t, height, radius) { onOpen(t) } }
    }
}

@Composable
internal fun StripCover(t: Title, height: Dp, radius: Dp? = null, onOpen: () -> Unit) {
    val m = Modifier.kHeroCover("cover-${t.id}").kPressable(onClickLabel = "Abrir ${t.name}", onClick = onOpen)
    if (radius != null) Cover(t.art, m, height = height, radius = radius) else Cover(t.art, m, height = height)
}

// MARK: Vitrina de colecciones

/** One collection in a profile's vitrina (iOS `ShowcaseItem`). [open] null = a preview (opens nothing). */
internal data class ShowcaseItem(
    val id: String,
    val name: String,
    val vibe: String?,
    val count: Int,
    val pinned: Boolean,
    val fan: List<Title>,
    val open: (() -> Unit)?,
    /** Your own profile only: holding the fan opens 9a (the collection's options). */
    val hold: (() -> Unit)? = null,
    /** Someone else's featured collection: its public page, to share. */
    val shareLink: String? = null,
)

/**
 * The collections on a profile (iOS `CollectionsShowcase`): the PINNED one (or the first) big —
 * fan 186, "fijada · N títulos", the name at 28, its line — then four more in two columns of fans
 * at 99. "Ver las N": on your profile it goes to Tus colecciones ([onSeeAll]); on someone else's it
 * unfolds the rest here. No boxes: the page's gradient is the only surface. [empty] draws when
 * there's none.
 */
@Composable
internal fun CollectionsShowcase(
    title: String,
    items: List<ShowcaseItem>,
    modifier: Modifier = Modifier,
    onSeeAll: (() -> Unit)? = null,
    onShare: (ShowcaseItem) -> Unit = {},
    empty: @Composable () -> Unit = {},
) {
    var unfolded by remember { mutableStateOf(false) }
    val featured = items.firstOrNull { it.pinned } ?: items.firstOrNull()
    val rest = items.filter { it.id != featured?.id }
    val shown = if (unfolded) rest else rest.take(GRID)
    val n = items.size
    val seeAll = if (n == 1) "Ver la colección" else "Ver las $n"
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            BasicText(title, Modifier.weight(1f).semantics { heading() }, style = KuraType.section)
            if (n > 0) {
                when {
                    onSeeAll != null -> KuraTextButton(seeAll, onSeeAll, color = KColor.text2)
                    rest.size > GRID -> KuraTextButton(if (unfolded) "Ver menos" else seeAll, { unfolded = !unfolded }, color = KColor.text2)
                }
            }
        }
        if (featured == null) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { empty() }
            return@Column
        }
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 6.dp, bottom = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FanCollectionTile(
                name = featured.name,
                count = featured.count,
                covers = featured.fan.map { it.art },
                onOpen = featured.open ?: {},
                featured = true,
                pinned = featured.pinned,
                onHold = featured.hold,
            )
            featured.vibe?.let { VibeLine(it, size = 15f) }
            if (featured.shareLink != null) {
                GlassButton(
                    "Compartir",
                    onClick = { onShare(featured) },
                    modifier = Modifier.padding(top = 8.dp).semantics { contentDescription = "Compartir ${featured.name}" },
                    icon = KIcon.Share,
                    height = 40.dp,
                    fontSize = 14f,
                    fill = KColor.glassBg,
                )
            }
        }
        if (shown.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(30.dp)) {
                shown.chunked(2).forEach { pair ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        pair.forEach { c ->
                            Box(Modifier.weight(1f), contentAlignment = Alignment.TopCenter) {
                                FanCollectionTile(
                                    name = c.name,
                                    count = c.count,
                                    covers = c.fan.map { it.art },
                                    onOpen = c.open ?: {},
                                    onHold = c.hold,
                                )
                            }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

private const val GRID = 4

// MARK: Locked / blocked

/** 20d · a private profile you don't follow: the vitrina's fan as a ghost with a lock on its front
 *  card, then the two lines (the collections' language, not the old spine card). */
@Composable
internal fun LockedCollections(firstName: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(22.dp)) {
        Box(contentAlignment = Alignment.Center) {
            FanView(emptyList(), 186.dp, ghost = true, plus = false)
            GlyphIcon(Glyph.Lock, size = 20.dp, color = KColor.text3)
        }
        Column(
            Modifier.padding(horizontal = 24.dp).widthIn(max = 300.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BasicText(
                "$firstName tiene su perfil en privado.",
                Modifier.semantics { heading() },
                style = KuraType.news(24f).copy(textAlign = TextAlign.Center),
            )
            BasicText(
                "Mientras sea privado, nadie más ve sus obsesiones ni sus colecciones.",
                style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center),
            )
        }
    }
}

/** A profile you blocked: the shape stays (so you know whose it is), nothing of theirs shows. */
@Composable
internal fun BlockedNote(handle: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BasicText("Bloqueaste a @$handle.", Modifier.semantics { heading() }, style = KuraType.news(24f))
        BasicText(
            "No ves su actividad ni sus reseñas, y @$handle no ve las tuyas. Si desbloqueas a @$handle, no vuelven a seguirse solos.",
            style = KuraType.ui(15f).copy(color = KColor.text2),
        )
    }
}

/** The lock in its 52 glass square (a list its owner keeps closed; a private notice). */
@Composable
internal fun LockTile(modifier: Modifier = Modifier) {
    Box(modifier.size(52.dp).background(KColor.glassBg, RoundedCornerShape(14.dp)).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        GlyphIcon(Glyph.Lock, size = 17.dp, color = KColor.text2)
    }
}

// MARK: A resource read by a pushed screen

/**
 * A pushed screen whose [value] comes from the API (iOS `ResourceScreen`): the value when there is
 * one; the 404 shape when it's [missing] (private and nonexistent read the same — never say which);
 * the error with Reintentar; otherwise loading.
 */
@Composable
internal fun <T : Any> ResourceScreen(
    value: T?,
    missing: Boolean,
    error: KuraApiError?,
    onRetry: () -> Unit,
    onBack: () -> Unit,
    gone: Pair<String, String>,
    square: Boolean = false,
    content: @Composable (T) -> Unit,
) {
    when {
        value != null -> content(value)
        missing -> GoneView(onBack, title = gone.first, note = gone.second)
        error != null -> {
            val (title, note) = error.loadCopy
            LoadErrorScreen(title, note, onRetry, onBack)
        }
        else -> LoadingScreen(onBack, square = square)
    }
}

// MARK: Share / copy (the system's share sheet and clipboard)

/** The system share sheet with [text] (a public link). */
internal fun shareLink(context: Context, text: String, title: String? = null) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        if (title != null) putExtra(Intent.EXTRA_TITLE, title)
    }
    val chooser = Intent.createChooser(send, title)
    if (context !is Activity) chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(chooser)
}

/** Copies [text]; true when the app should confirm it (Android 13+ shows its own confirmation). */
internal fun copyLink(context: Context, text: String): Boolean {
    val cm = context.getSystemService(ClipboardManager::class.java) ?: return false
    cm.setPrimaryClip(ClipData.newPlainText("link", text))
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
}

/** Accent- and case-insensitive text for a local search ("Lucía" ~ "lucia"). */
internal fun fold(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().trim()

/** "lucía" from "lucía rivas" (the first word, or the handle). */
internal fun firstName(p: Person): String = p.name.split(" ").firstOrNull { it.isNotEmpty() } ?: p.handle
