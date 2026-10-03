package com.tromwey.kura.features.discover

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Creator
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.EsMx
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.ChipRow
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.SaveChip
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.SectionTitle
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.creator
import com.tromwey.kura.state.followFromProfile
import com.tromwey.kura.state.isFollowing
import java.text.Normalizer

// Flujo 07 · la búsqueda (19d recientes → 19e escribiendo → E5 buscando → 19f resultados / 19g sin
// resultados), drawn inside `KuraSearchBar`'s expanded page. Twin of `SearchMode` in
// ios/Kura/Features/Discover/DiscoverView.swift. The real search is `store.runSearch`; 19e and the
// "¿quisiste decir?" correction read the local index over what the app already knows.

/** What the search page needs from Descubrir: the text, the last submitted query and the moves. */
internal class SearchActions(
    val submit: (String) -> Unit,
    /** Leaves the search for a pushed page (the search comes back when you return). */
    val open: (Route) -> Unit,
)

@Composable
internal fun DiscoverSearchContent(store: AppStore, query: String, submitted: String?, actions: SearchActions) {
    val q = query.trim()
    val typing = submitted == null || submitted != q
    Box(Modifier.fillMaxSize().imePadding()) {
        when {
            q.isEmpty() -> Recents(store, actions)
            typing -> Suggestions(store, q, actions)
            store.searchLoading -> SearchSkeleton()
            else -> Results(store, q, actions)
        }
    }
}

// MARK: 19d

@Composable
private fun Recents(store: AppStore, actions: SearchActions) {
    val viewed = store.recentlyViewed.mapNotNull { store.title(it) }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(top = 24.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(26.dp),
    ) {
        if (store.recentSearches.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    Modifier.fillMaxWidth().padding(start = KSize.margin, end = KSize.margin - 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BasicText(
                        "búsquedas recientes",
                        Modifier.weight(1f).semantics { heading() },
                        style = KuraType.news(24f),
                    )
                    KuraTextButton(
                        "Borrar",
                        { store.clearRecentSearches() },
                        Modifier.semantics { contentDescription = "Borrar búsquedas recientes" },
                        mono = true,
                        color = KColor.text2,
                    )
                }
                Column {
                    store.recentSearches.forEach { r ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 52.dp)
                                .kPressable(KPressFeel.Row(), onClickLabel = "Buscar $r") { actions.submit(r) }
                                .padding(start = KSize.margin, end = KSize.margin - 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            KIconView(KIcon.Search, size = 16.dp, color = KColor.text2)
                            BasicText(r, Modifier.weight(1f), style = KuraType.body16, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            IconChip44(
                                KIcon.Close,
                                "Quitar “$r” de tus búsquedas recientes",
                                { store.forgetSearch(r) },
                                size = 40.dp,
                                iconSize = 12.dp,
                                fill = Color.Transparent,
                                iconColor = KColor.text3,
                            )
                        }
                    }
                }
            }
        }
        if (viewed.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                BasicText(
                    "vistos hace poco",
                    Modifier.padding(horizontal = KSize.margin).semantics { heading() },
                    style = KuraType.news(24f),
                )
                LazyRow(
                    contentPadding = PaddingValues(horizontal = KSize.margin),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    items(viewed, key = { it.id }) { t ->
                        Box(Modifier.kPressable(onClickLabel = "Abrir ${t.name}") { actions.open(Route.TitleRoute(t.id)) }) {
                            TitleCover(store, t, height = 96.dp, radius = KRadius.coverS, hero = false)
                        }
                    }
                }
            }
        }
        if (store.recentSearches.isEmpty() && viewed.isEmpty()) {
            NoteText("Busca una película, una serie, un disco, a quien los hizo o a alguien de kura.", Modifier.padding(horizontal = KSize.margin))
        }
    }
}

// MARK: 19e

@Composable
private fun Suggestions(store: AppStore, q: String, actions: SearchActions) {
    val titles = SearchIndex.titles(q, store).take(3)
    val creator = SearchIndex.creators(q, store).firstOrNull()
    val user = SearchIndex.users(q, store).firstOrNull()
    val queries = store.recentSearches.filter { SearchIndex.fold(it).contains(SearchIndex.fold(q)) && SearchIndex.fold(it) != SearchIndex.fold(q) }.take(2)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(top = 14.dp, bottom = 48.dp)) {
        titles.forEachIndexed { i, t ->
            SuggestionRow({ actions.open(Route.TitleRoute(t.id)) }, "Abrir ${t.name}", leading = {
                val album = t.format == MediaFormat.Album
                Box(Modifier.width(44.dp), contentAlignment = Alignment.Center) {
                    TitleCover(store, t, width = if (album) 44.dp else 40.dp, radius = KRadius.coverS, hero = false, shadow = false)
                }
            }) {
                Highlight(t.name, q, serif = true)
                MonoLabel(listOfNotNull(t.format.metaLabel, t.year?.toString(), if (t.format == MediaFormat.Album) t.creator else null).joinToString(" · "))
            }
            if (i == 0 && creator != null) CreatorSuggestion(creator, q, actions)
        }
        if (titles.isEmpty() && creator != null) CreatorSuggestion(creator, q, actions)
        if (user != null) {
            SuggestionRow({ actions.open(Route.PersonRoute(user.handle)) }, "Abrir el perfil de @${user.handle}", leading = {
                Seal(user.initials, user.hexes, size = 44.dp, photo = user.photo)
            }) {
                Highlight("@${user.handle}", q, serif = false)
                MonoLabel("Usuario · ${user.common.size} en común")
            }
        }
        queries.forEach { s -> QueryRow(s, q) { actions.submit(s) } }
        if (titles.isEmpty() && creator == null && user == null) {
            QueryRow("Buscar «$q»", null) { actions.submit(q) }
        }
    }
}

@Composable
private fun CreatorSuggestion(c: Creator, q: String, actions: SearchActions) {
    SuggestionRow({ actions.open(Route.CreatorRoute(c.name)) }, "Abrir ${c.name}", leading = { InitialsSeal(c.initials, 44.dp) }) {
        Highlight(c.name, q, serif = false)
        MonoLabel("Persona · ${c.role} · ${worksLabel(c.works)}")
    }
}

@Composable
private fun SuggestionRow(onTap: () -> Unit, label: String, leading: @Composable () -> Unit, text: @Composable () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .kPressable(KPressFeel.Row(), onClickLabel = label, onClick = onTap)
            .padding(horizontal = KSize.margin),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading()
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) { text() }
        KIconView(KIcon.ChevronRight, size = 13.dp, color = KColor.text3)
    }
}

@Composable
private fun QueryRow(text: String, q: String?, onTap: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .kPressable(KPressFeel.Row(), onClickLabel = "Buscar", onClick = onTap)
            .padding(horizontal = KSize.margin),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(44.dp), contentAlignment = Alignment.Center) { KIconView(KIcon.Search, size = 16.dp, color = KColor.text2) }
        if (q != null) Highlight(text, q, serif = false) else BasicText(text, style = KuraType.body16, maxLines = 1)
    }
}

/** Text with the query highlighted: the rest in text-2, the match in text and heavier. */
@Composable
private fun Highlight(text: String, query: String, serif: Boolean) {
    val base: TextStyle = if (serif) KuraType.newsItalic(18f) else KuraType.ui(16f)
    val strong = if (serif) SpanStyle(color = KColor.text, fontWeight = FontWeight.Medium) else SpanStyle(color = KColor.text, fontWeight = FontWeight.SemiBold)
    val at = SearchIndex.fold(text).indexOf(SearchIndex.fold(query))
    val annotated: AnnotatedString = if (at < 0 || query.isEmpty()) {
        AnnotatedString(text)
    } else {
        buildAnnotatedString {
            withStyle(SpanStyle(color = KColor.text2)) { append(text.substring(0, at)) }
            withStyle(strong) { append(text.substring(at, at + query.length)) }
            withStyle(SpanStyle(color = KColor.text2)) { append(text.substring(at + query.length)) }
        }
    }
    BasicText(annotated, style = base, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/** "1 obra" · "12 obras". */
internal fun worksLabel(n: Int) = if (n == 1) "1 obra" else "$n obras"

// MARK: 19f / 19g

private val FILTERS = listOf("Todo", "Cine", "Series", "Música", "Personas", "Usuarios")

@Composable
private fun Results(store: AppStore, q: String, actions: SearchActions) {
    val titles = store.searchResults.map { store.title(it.id) ?: it.title }
    val creator = SearchIndex.creators(q, store).firstOrNull()
    val users = store.searchPeople
    val error = store.searchError
    if (error == KuraApiError.Offline || error == KuraApiError.Unavailable) {
        Column(
            Modifier.fillMaxWidth().padding(start = 28.dp, end = 28.dp, top = 96.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val offline = error == KuraApiError.Offline
            BasicText(if (offline) "sin conexión." else "el catálogo no responde.", Modifier.semantics { heading() }, style = KuraType.news(32f))
            NoteText(if (offline) "Revisa tu red y vuelve a buscar." else "Vuelve a intentarlo en unos minutos.")
            GlassButton("Reintentar", { actions.submit(q) }, icon = KIcon.Retry)
        }
        return
    }
    if (titles.isEmpty() && creator == null && users.isEmpty()) {
        NoResults(store, q, actions)
        return
    }
    var filter by rememberSaveable(q) { mutableStateOf("Todo") }
    val shown = titles.filter { t ->
        when (filter) {
            "Cine" -> t.format == MediaFormat.Film
            "Series" -> t.format == MediaFormat.Series
            "Música" -> t.format == MediaFormat.Album
            "Todo" -> true
            else -> false
        }
    }
    Column(Modifier.fillMaxSize()) {
        ChipRow(FILTERS.map { it to it }, filter, { filter = it }, Modifier.padding(top = 14.dp))
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(top = 22.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            if (filter in listOf("Todo", "Personas") && creator != null) {
                Row(
                    Modifier
                        .padding(horizontal = 12.dp)
                        .fillMaxWidth()
                        .kPressable(onClickLabel = "Abrir ${creator.name}") { actions.open(Route.CreatorRoute(creator.name)) }
                        .background(KColor.s1, RoundedCornerShape(KRadius.screen))
                        .padding(18.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    InitialsSeal(creator.initials, 64.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        BasicText(creator.name.lowercase(EsMx), style = KuraType.news(24f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        MonoLabel("${creator.role} · ${worksLabel(creator.works)}")
                    }
                }
            }
            if (shown.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    SectionTitle("obras", Modifier.padding(horizontal = KSize.margin), trailing = "${shown.size}")
                    Column { shown.forEach { t -> ResultRow(store, t, actions) } }
                }
            }
            if (filter in listOf("Todo", "Usuarios") && users.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    SectionTitle("usuarios", Modifier.padding(horizontal = KSize.margin))
                    // Honey once per screen: the first user's Seguir only.
                    users.forEachIndexed { i, p -> UserRow(store, store.person(p.id) ?: p, honey = i == 0, actions) }
                }
            }
            // A filter with nothing to show says so (Todo always has something: 19g covers "nada").
            val empty = when (filter) {
                "Personas" -> creator == null
                "Usuarios" -> users.isEmpty()
                "Todo" -> false
                else -> shown.isEmpty()
            }
            if (empty) {
                val note = when (filter) {
                    "Personas" -> "Nadie que haga cine, series o música con “$q”. Prueba en Todo."
                    "Usuarios" -> "Nadie en kura con “$q”. Prueba en Todo."
                    else -> "Nada de ${filter.lowercase(EsMx)} con “$q”. Prueba en Todo."
                }
                NoteText(note, Modifier.padding(horizontal = KSize.margin))
            }
        }
    }
}

@Composable
private fun ResultRow(store: AppStore, t: Title, actions: SearchActions) {
    val album = t.format == MediaFormat.Album
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 84.dp)
            .kPressable(KPressFeel.Row(), onClickLabel = "Abrir ${t.name}") { actions.open(Route.TitleRoute(t.id)) }
            .padding(horizontal = KSize.margin),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(48.dp), contentAlignment = Alignment.Center) {
            TitleCover(store, t, width = if (album) 48.dp else 44.dp, radius = KRadius.coverS, hero = false)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            BasicText(t.name, style = KuraType.newsItalic(18f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            MonoLabel(listOfNotNull(t.format.metaLabel, t.year?.toString(), t.creatorShort).filter { it.isNotEmpty() }.joinToString(" · "))
        }
        SaveChip(store.savedCount(t.id), onClick = { store.openSaveTo(t.id) })
    }
}

@Composable
private fun UserRow(store: AppStore, p: Person, honey: Boolean, actions: SearchActions) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = KSize.rowPeople)
            .kPressable(KPressFeel.Row(), onClickLabel = "Abrir el perfil de @${p.handle}") { actions.open(Route.PersonRoute(p.handle)) }
            .padding(horizontal = KSize.margin),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Seal(p.initials, p.hexes, size = 44.dp, photo = p.photo)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            BasicText("@${p.handle}", style = KuraType.ui(16f, UiWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
            MonoLabel("${p.common.size} en común")
        }
        FollowButton(
            if (store.isFollowing(p.id)) FollowState.Following else FollowState.Follow,
            onClick = { store.followFromProfile(p.id) },
            honey = honey,
            handle = p.handle,
        )
    }
}

/** 19g · sin resultados, with the correction as a button (guiño solo en vacíos; aquí, literal). */
@Composable
private fun NoResults(store: AppStore, q: String, actions: SearchActions) {
    Column(
        Modifier.fillMaxWidth().padding(start = 28.dp, end = 28.dp, top = 96.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        BasicText("nada con “$q”.", Modifier.semantics { heading() }, style = KuraType.news(32f))
        NoteText("Revisa cómo se escribe o busca por persona o año.")
        SearchIndex.correction(q, store)?.let { fix ->
            GlassButton("Buscar “$fix”", { actions.submit(fix) }, icon = KIcon.Search)
        }
    }
}

/** E5 · Buscando — still skeletons with the shape of the results. */
@Composable
private fun SearchSkeleton() {
    Column(Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "Buscando" }) {
        Row(Modifier.padding(start = KSize.margin, end = KSize.margin, top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(78, 70, 82, 84).forEach { w -> Skeleton(Modifier.size(w.dp, 40.dp), radius = 999.dp) }
        }
        Row(
            Modifier
                .padding(start = 12.dp, end = 12.dp, top = 20.dp)
                .fillMaxWidth()
                .background(KColor.s1, RoundedCornerShape(KRadius.screen))
                .padding(18.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Skeleton(Modifier.size(64.dp), radius = 999.dp)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Skeleton(Modifier.size(150.dp, 18.dp), radius = 6.dp)
                Skeleton(Modifier.size(100.dp, 10.dp), radius = 5.dp)
            }
        }
        Column(Modifier.padding(start = KSize.margin, end = KSize.margin, top = 26.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            repeat(5) {
                Row(Modifier.heightIn(min = 84.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Skeleton(Modifier.size(44.dp, 66.dp), radius = 8.dp)
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Skeleton(Modifier.size(200.dp, 16.dp), radius = 6.dp)
                        Skeleton(Modifier.size(130.dp, 10.dp), radius = 5.dp)
                    }
                }
            }
        }
        Spacer(Modifier.height(48.dp))
    }
}

/**
 * Local index over what the app already knows (typing suggestions, creators, the "did you mean"
 * correction) — twin of iOS `SearchIndex`. Folding is per character (accents and case), so an
 * index in the folded text is the same index in the original (the highlight relies on it).
 */
internal object SearchIndex {
    private val marks = Regex("\\p{Mn}+")

    fun fold(s: String): String = buildString(s.length) {
        for (c in s) {
            val f = Normalizer.normalize(c.toString(), Normalizer.Form.NFD).replace(marks, "").lowercase(EsMx)
            append(if (f.length == 1) f[0] else c.lowercaseChar())
        }
    }

    fun titles(q: String, store: AppStore): List<Title> {
        val f = fold(q.trim())
        if (f.isEmpty()) return emptyList()
        return store.catalogOrder.mapNotNull { store.title(it) }
            .filter { fold(it.name).contains(f) || fold(it.creator ?: "").contains(f) }
    }

    fun creators(q: String, store: AppStore): List<Creator> {
        val f = fold(q.trim())
        if (f.isEmpty()) return emptyList()
        val names = store.catalogOrder.mapNotNull { store.title(it)?.creator }.toSortedSet()
        return names.filter { fold(it).contains(f) }.map { store.creator(it) }
    }

    fun users(q: String, store: AppStore): List<Person> {
        val f = fold(q.trim()).replace("@", "")
        if (f.isEmpty()) return emptyList()
        return store.people.values
            .filter { it.id != store.me.id && (fold(it.handle).contains(f) || fold(it.name).contains(f)) }
            .sortedByDescending { it.common.size }
    }

    /** Closest catalog word within two edits ("mononokee" → "mononoke"). */
    fun correction(q: String, store: AppStore): String? {
        val f = fold(q)
        val words = HashSet<String>()
        for (t in store.catalogOrder.mapNotNull { store.title(it) }) {
            for (w in "${t.name} ${t.creator ?: ""}".split(" ")) {
                val clean = fold(w).trim { !it.isLetterOrDigit() }
                if (clean.length > 2) words.add(clean)
            }
        }
        val best = words.map { it to distance(it, f) }.minByOrNull { it.second } ?: return null
        return if (best.second in 1..2) best.first else null
    }

    fun distance(a: String, b: String): Int {
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        var prev = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            val cur = IntArray(b.length + 1)
            cur[0] = i
            for (j in 1..b.length) {
                cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
            }
            prev = cur
        }
        return prev[b.length]
    }
}
