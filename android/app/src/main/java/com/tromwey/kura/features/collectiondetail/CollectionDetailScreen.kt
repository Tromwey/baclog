package com.tromwey.kura.features.collectiondetail

import com.tromwey.kura.designsystem.ActiveEffect
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.components.AutoPill
import com.tromwey.kura.designsystem.components.FanHeader
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GoneView
import com.tromwey.kura.designsystem.components.KuraFab
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.LoadErrorScreen
import com.tromwey.kura.designsystem.components.Masonry
import com.tromwey.kura.designsystem.components.MasonryBadge
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.SkeletonShape
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.VibeLine
import com.tromwey.kura.designsystem.components.animatedTintTail
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kSkeletonPulse
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.features.collections.toastLift
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.canonicalCollectionId
import com.tromwey.kura.state.loadCollection
import com.tromwey.kura.state.releaseLabel
import com.tromwey.kura.state.waitingTitles
import kotlinx.coroutines.launch
import com.tromwey.kura.state.present
import com.tromwey.kura.state.push
import com.tromwey.kura.state.pop

// Twin of ios/Kura/Features/CollectionDetail/CollectionDetailView.swift (10b · 2a): the collection
// continues from its fan, the whole page in the feed gradient of its front cover (span 900).

/**
 * 03 Colección: Volver · Compartir + Opciones floating; the fan at 225 (the ghost + "+" when empty,
 * which opens Agregar); "fijada" in mono only when it is; the name in Newsreader 36; then
 * [CollectionBody] (line, format chips that filter, the titles in columns or the list). Holding a
 * title = 18c. Agregar is Android's FAB (the empty body brings its own button instead).
 */
@Composable
fun CollectionDetailScreen(store: AppStore, route: Route.Collection) {
    var tried by remember(route.id) { mutableStateOf(false) }
    ActiveEffect(route.id) {
        store.loadCollection(route.id)
        tried = true
    }
    val scope = rememberCoroutineScope()
    val cid = store.canonicalCollectionId(route.id)
    val c = store.collection(route.id)
    val readError = store.loadError(LoadKey.Collection(cid))
    val retry: () -> Unit = { scope.launch { store.loadCollection(route.id, force = true) } }

    when {
        c == null && (readError == KuraApiError.NotFound || (tried && readError == null)) -> GoneView(onBack = { store.pop() })
        c == null && readError != null -> {
            val (title, note) = readError.loadCopy
            LoadErrorScreen(title, note, retry, onBack = { store.pop() })
        }
        c == null -> CollectionSkeleton(store)
        else -> {
            // Ids known, titles not (yet): never draw "repisa vacía" for a full collection.
            val missing = c.titleIds.isNotEmpty() && store.titlesIn(c).isEmpty()
            val error = readError ?: if (c.titleIds.any { store.title(it) == null }) store.loadError(LoadKey.Library) else null
            if (missing && error == null) CollectionSkeleton(store) else CollectionPage(store, c, error, retry)
        }
    }
}

@Composable
private fun CollectionPage(store: AppStore, c: KCollection, error: KuraApiError?, retry: () -> Unit) {
    val empty = c.titleIds.isEmpty()
    val tint = if (empty) emptyList() else store.hexes(c)
    BoxWithConstraints(Modifier.fillMaxSize().background(animatedTintTail(tint))) {
        val viewport = maxHeight
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // At least the viewport: a short page must not end mid-gradient over its tail (a seam).
            Column(Modifier.fillMaxWidth().heightIn(min = viewport).kTint(tint, TintStyle.Feed(900.dp)).padding(bottom = 120.dp)) {
                FanHeader(
                    fan = store.fan(c).map { it.art },
                    name = c.name,
                    ghost = empty,
                    onGhost = { store.present(SheetRoute.AddTitles(c.id)) },
                    bottom = if (empty) 26.dp else 0.dp,
                    label = { if (!empty && c.pinned) MonoLabel("fijada", Modifier.padding(top = 4.dp), size = 10f) },
                )
                CollectionBody(store, c) {
                    if (error != null) {
                        RetryStrip(
                            if (error == KuraApiError.Offline) "Sin conexión." else "No se cargó el resto.",
                            retry,
                            Modifier.padding(horizontal = 12.dp).padding(bottom = 12.dp),
                            offline = error == KuraApiError.Offline,
                        )
                    }
                }
            }
        }
        TopVeil(color = Tint.feedTop(tint))
        KuraTopBar(onBack = { store.pop() }) { CollectionChips(store, c) }
        if (!empty) {
            KuraFab(
                { store.present(SheetRoute.AddTitles(c.id)) },
                Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp + toastLift(store)),
                label = "Agregar títulos a ${c.name}",
            )
        }
    }
}

/**
 * The collection's shape while it arrives: the ghost fan at 225 where the fan lands, the name's
 * and the line's bars, a first row of three columns (póster · disco · póster), pulsing as one.
 */
@Composable
private fun CollectionSkeleton(store: AppStore) {
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier.fillMaxWidth().padding(top = 126.dp).kSkeletonPulse().clearAndSetSemantics { contentDescription = "Cargando colección" },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            FanView(emptyList(), 225.dp, ghost = true, plus = false)
            SkeletonShape(Modifier.padding(top = 16.dp).size(220.dp, 34.dp), radius = 8.dp)
            SkeletonShape(Modifier.padding(top = 14.dp).size(150.dp, 14.dp), radius = 6.dp)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = KSize.margin).padding(top = 34.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                listOf(2f / 3f, 1f, 2f / 3f).forEach { a -> SkeletonShape(Modifier.weight(1f).aspectRatio(a), radius = KRadius.coverL) }
            }
        }
        KuraTopBar(onBack = { store.pop() })
    }
}

/**
 * 19 · 37b "no puedo esperar": the automatic collection — the same page with the "auto" pill, the
 * countdown on every cover and no membership actions. Soonest first; the fan leads with the
 * soonest. Holding a title = 9b (the reduced 18c).
 */
@Composable
fun WaitingCollectionScreen(store: AppStore) {
    val all = store.waitingTitles
    val fan = all.take(3)
    val tint = AppStore.fanHexes(fan, all)
    BoxWithConstraints(Modifier.fillMaxSize().background(animatedTintTail(tint))) {
        val viewport = maxHeight
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // At least the viewport: a short page must not end mid-gradient over its tail (a seam).
            Column(Modifier.fillMaxWidth().heightIn(min = viewport).kTint(tint, TintStyle.Feed(900.dp)).padding(bottom = 120.dp)) {
                FanHeader(
                    fan = fan.map { it.art },
                    name = "no puedo esperar",
                    ghost = all.isEmpty(),
                    label = { AutoPill(Modifier.padding(top = 4.dp)) },
                    below = {
                        VibeLine("se llena sola con lo que aún no sale")
                        if (all.isNotEmpty()) MonoLabel(WaitingMeta.line(all, store))
                    },
                )
                if (all.isEmpty()) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = 32.dp).padding(top = 16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        BasicText("nada por estrenarse", style = KuraType.news(28f))
                        BasicText(
                            "Lo que guardes y todavía no salga aparece aquí solo, con cuánto falta.",
                            style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center, lineHeight = 21.sp),
                        )
                    }
                } else {
                    WaitingMasonry(store, all.map { it.art })
                }
            }
        }
        TopVeil(color = Tint.feedTop(tint))
        KuraTopBar(onBack = { store.pop() })
    }
}

/** The automatic collection's titles: the countdown pill on every cover; holding one = 9b. */
@Composable
fun WaitingMasonry(store: AppStore, titles: List<com.tromwey.kura.designsystem.components.CoverArt>) {
    Masonry(
        titles = titles,
        onOpen = { store.push(Route.TitleRoute(it.id)) },
        badge = { a -> store.title(a.id)?.let { store.releaseLabel(it) }?.let { MasonryBadge.Wait(it) } ?: MasonryBadge.None },
        onHold = { store.present(SheetRoute.TitleActions(it.id, collectionId = null)) },
        coverModifier = { Modifier.kHeroCover("cover-${it.id}") },
    )
}
