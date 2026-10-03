package com.tromwey.kura.features.discover

import com.tromwey.kura.designsystem.OnEntryCovered
import com.tromwey.kura.designsystem.ActiveEffect
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.StoreToastHost
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.components.KuraPullToRefresh
import com.tromwey.kura.designsystem.components.KuraSearchBar
import com.tromwey.kura.designsystem.components.ChipRow
import com.tromwey.kura.designsystem.components.TabTitleBar
import com.tromwey.kura.designsystem.components.animatedTintTail
import com.tromwey.kura.designsystem.components.kuraTitleScroll
import com.tromwey.kura.designsystem.components.rememberKuraTitleScroll
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.clearSearch
import com.tromwey.kura.state.loadDiscover
import com.tromwey.kura.state.loadDiscoverCreators
import com.tromwey.kura.state.loadDiscoverFormat
import com.tromwey.kura.state.runSearch
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.tromwey.kura.state.push

// Flujo 07 · Descubrir — the tab root (twin of ios/Kura/Features/Discover/DiscoverView.swift):
// "descubrir" (the Material large title that collapses) over ONE scroll with the search pill (the
// DS `KuraSearchBar`: it opens into Material's full-screen search, 19d–19g, see DiscoverSearch.kt)
// and the format track (Todo / Cine / Series / Música). Todo = DiscoverHome.kt (19a · 3a); a format
// = DiscoverFormat.kt (2a–2c). The page wears the tint of what's in view (PageTint). Pull to refresh
// reloads what's in view: `GET /discover` on Todo, the format's shelves (`force`) on a format.
//
// The expanded search is a separate window (Material draws it in a dialog). Opening a result
// collapses it and pushes the page; coming back re-opens it with the same query and results
// (iOS keeps the search mode under a pushed ficha).

private val FORMATS: List<Pair<MediaFormat?, String>> =
    listOf(null to "Todo", MediaFormat.Film to "Cine", MediaFormat.Series to "Series", MediaFormat.Album to "Música")

/** Tab root · Descubrir. */
@Composable
fun DiscoverScreen(store: AppStore) {
    val scope = rememberCoroutineScope()
    var formatRaw by rememberSaveable { mutableStateOf<String?>(null) }
    val format = MediaFormat.from(formatRaw)

    // Search (19d–19g). `reopen` = we left the search for a pushed page and come back to it.
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var submitted by rememberSaveable { mutableStateOf<String?>(null) }
    var reopen by rememberSaveable { mutableStateOf(false) }
    val hideKeyboard = remember { mutableStateOf<(() -> Unit)?>(null) }
    // What the bar last reported (not saved: a fresh bar starts collapsed).
    var barExpanded by remember { mutableStateOf(false) }

    fun runQuery(q: String) {
        scope.launch { store.runSearch(q) }
    }

    fun submit(raw: String) {
        val t = raw.trim()
        if (t.isEmpty()) return
        query = t
        hideKeyboard.value?.invoke()
        store.noteSearch(t)
        submitted = t
        runQuery(t)
    }

    fun cancelSearch() {
        query = ""
        submitted = null
        searchOpen = false
        store.clearSearch()
    }

    val actions = remember {
        SearchActions(
            submit = { submit(it) },
            open = { route ->
                reopen = true
                searchOpen = false
                store.push(route)
            },
        )
    }

    ActiveEffect {
        if (reopen) {
            reopen = false
            searchOpen = true
            // A search cut short by the push (its scope went with the page) runs again.
            val q = submitted
            if (q != null && (store.searchQuery != q || (store.searchResults.isEmpty() && store.searchPeople.isEmpty() && store.searchError == null))) {
                runQuery(q)
            }
        }
        store.loadDiscover()
        // After the page has what it needs: this one is slow and optional.
        store.loadDiscoverCreators()
    }
    // The search owns the bottom (the keyboard): no dock while it's open.
    ActiveEffect(searchOpen) { store.dockHidden = searchOpen }
    OnEntryCovered { store.dockHidden = false }

    // Format pages: what they picked (reset when the format changes, like iOS's `.id(format)`).
    var time by rememberSaveable(formatRaw) { mutableIntStateOf(1) }
    var lens by rememberSaveable(formatRaw) { mutableIntStateOf(1) }
    var mood by rememberSaveable(formatRaw) { mutableIntStateOf(-1) }
    val picks = FormatPicks(time, lens, mood.takeIf { it >= 0 })
    val timeParam = format?.let { timeParam(it, picks) }
    ActiveEffect(format, timeParam) {
        if (format != null) store.loadDiscoverFormat(format, timeParam)
    }

    // The page follows the recommendation in view (Todo) or the humor/moment (formats).
    val recState = rememberLazyListState()
    val cardPx = with(LocalDensity.current) { (REC_CARD + 8.dp).toPx() }
    val recIndex by remember { derivedStateOf { recState.recInView(cardPx) } }
    val hexes = if (format == null) store.homeHexes(recIndex) else store.formatHexes(format, picks)

    val titleScroll = rememberKuraTitleScroll()
    val scroll = rememberScrollState()
    var formatRefreshing by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(animatedTintTail(hexes))) {
        PageTint(hexes, scroll, KMotion.tint())
        Column(Modifier.fillMaxSize()) {
            TabTitleBar("descubrir", scroll = titleScroll)
            KuraPullToRefresh(
                refreshing = if (format == null) store.discoverLoading && store.discover != null else formatRefreshing,
                onRefresh = {
                    scope.launch {
                        if (format == null) {
                            store.loadDiscover(force = true)
                        } else {
                            formatRefreshing = true
                            try {
                                store.loadDiscoverFormat(format, timeParam, force = true)
                            } finally {
                                formatRefreshing = false
                            }
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().weight(1f),
            ) {
                Column(Modifier.fillMaxSize().kuraTitleScroll(titleScroll).verticalScroll(scroll).padding(bottom = 48.dp)) {
                    KuraSearchBar(
                        query = query,
                        onQueryChange = { query = it },
                        expanded = searchOpen,
                        onExpandedChange = { open ->
                            if (open) {
                                barExpanded = true
                                searchOpen = true
                            } else {
                                // A collapse only means "leave the search" when the bar had opened: the bar
                                // also reports its initial collapsed state while we're re-opening it.
                                if (searchOpen && barExpanded) cancelSearch()
                                barExpanded = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = KSize.margin),
                        placeholder = "Películas, series, álbumes y personas",
                        onSearch = { submit(it) },
                        // The expanded search is its own window: the frame's toast would sit under it.
                        overlay = { StoreToastHost(store) },
                    ) {
                        // The keyboard lives in the search's own window: hide it from there on submit.
                        val keyboard = LocalSoftwareKeyboardController.current
                        SideEffect { hideKeyboard.value = { keyboard?.hide() } }
                        // Back from a result: the results are the point, not the keyboard the bar raises.
                        LaunchedEffect(Unit) {
                            if (submitted != null && submitted == query.trim()) {
                                delay(350)
                                keyboard?.hide()
                            }
                        }
                        DiscoverSearchContent(store, query, submitted, actions)
                    }
                    ChipRow(
                        options = FORMATS,
                        selection = format,
                        onSelect = { formatRaw = it?.rawValue },
                        modifier = Modifier.padding(top = 12.dp),
                        fillWidth = true,
                        // On a tint, the dark art glass lets it show through; on plain bg, the tonal s2.
                        fill = if (hexes.isEmpty()) KColor.glassBg else KColor.glassArt,
                    )
                    if (format == null) {
                        DiscoverHome(store, recState, recIndex, onRetry = { scope.launch { store.loadDiscover(force = true) } })
                    } else {
                        key(format) {
                            DiscoverFormatPage(store, format, picks) { p ->
                                time = p.time
                                lens = p.lens
                                mood = p.mood ?: -1
                            }
                        }
                    }
                }
            }
        }
    }
}
