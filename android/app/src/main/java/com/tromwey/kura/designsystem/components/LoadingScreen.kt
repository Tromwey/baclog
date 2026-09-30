// Material 3 Expressive detrás de nombres Kura: LoadingScreen/KuraLoadingIndicator = LoadingIndicator (fallback CircularProgressIndicator en UN sitio) · KuraPullToRefresh = PullToRefreshBox + PullToRefreshDefaults.LoadingIndicator · KuraWavyProgress = LinearWavyProgressIndicator · RetryStrip usa KuraTextButton (TextButton).
// Revertir: git show android-cromo-kura-v1:android/app/src/main/java/com/tromwey/kura/designsystem/components/LoadingScreen.kt > android/app/src/main/java/com/tromwey/kura/designsystem/components/LoadingScreen.kt
@file:OptIn(ExperimentalMaterial3ExpressiveApi::class, ExperimentalMaterial3Api::class)

package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.ui.unit.Dp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.Tint

// Twin of ios/Kura/DesignSystem/Components/LoadingScreen.swift: loading, gone and error shapes (+ the
// Material loading family: indicator, pull-to-refresh, wavy progress).

/**
 * A pushed screen still arriving from the API (ficha, perfil ajeno) — Material's `LoadingIndicator`
 * (the shape-morphing one) centered in the cover's place, under the neutral header (s1 → bg), and
 * Volver. [square] keeps the album's slot (200×200) instead of the poster's (200×300), so the
 * indicator sits where the cover will land.
 */
@Composable
fun LoadingScreen(onBack: (() -> Unit)?, modifier: Modifier = Modifier, square: Boolean = false) {
    Box(modifier.fillMaxSize().background(KColor.bg).clearAndSetSemantics { contentDescription = "Cargando" }) {
        Box(
            Modifier.fillMaxWidth().background(Tint.neutralHeader).padding(top = 124.dp, bottom = 30.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(200.dp, if (square) 200.dp else 300.dp), contentAlignment = Alignment.Center) {
                KuraLoadingIndicator()
            }
        }
        KuraTopBar(onBack)
    }
}

/**
 * THE loading indicator — Material 3 Expressive's `LoadingIndicator` (experimental) in text on
 * bg. The ONE place that knows it's experimental: if Material withdraws it, flip
 * [expressiveLoading] and every screen falls back to `CircularProgressIndicator` untouched.
 * For whole-screen waits and pull-to-refresh; grids of covers keep the [Skeleton].
 */
@Composable
fun KuraLoadingIndicator(modifier: Modifier = Modifier, size: Dp = 48.dp) {
    if (expressiveLoading) {
        LoadingIndicator(modifier.size(size), color = KColor.text)
    } else {
        CircularProgressIndicator(modifier.size(size * 0.75f), color = KColor.text, trackColor = KColor.s2)
    }
}

/** Switch for [KuraLoadingIndicator]'s fallback (see there). */
private const val expressiveLoading = true

/**
 * Pull-to-refresh (feed, colecciones) — Material's `PullToRefreshBox` with
 * `PullToRefreshDefaults.LoadingIndicator` (s2 container, text indicator). iOS has it from the
 * system; Android needs it put there.
 */
@Composable
fun KuraPullToRefresh(refreshing: Boolean, onRefresh: () -> Unit, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val state = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        modifier = modifier,
        state = state,
        indicator = {
            PullToRefreshDefaults.LoadingIndicator(
                state = state,
                isRefreshing = refreshing,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = KColor.s2,
                color = KColor.text,
            )
        },
        content = content,
    )
}

/**
 * Determinate progress (fase 2: "llévala a otra app") — Material's `LinearWavyProgressIndicator`,
 * text on an s2 track. [progress] 0…1.
 */
@Composable
fun KuraWavyProgress(progress: Float, modifier: Modifier = Modifier) {
    LinearWavyProgressIndicator(
        progress = { progress.coerceIn(0f, 1f) },
        modifier = modifier.fillMaxWidth().height(10.dp),
        color = KColor.text,
        trackColor = KColor.s2,
    )
}

/** The 404 shape: something that was here is gone (collection, title, person). */
@Composable
fun GoneView(
    onBack: (() -> Unit)?,
    modifier: Modifier = Modifier,
    title: String = "esta colección ya no existe.",
    note: String = "Se borró o dejó de estar disponible.",
) {
    Box(modifier.fillMaxSize().background(KColor.bg)) {
        Column(Modifier.padding(start = 24.dp, end = 24.dp, top = 140.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            BasicText(title, modifier = Modifier.semantics { heading() }, style = KuraType.news(28f))
            BasicText(note, style = KuraType.ui(15f).copy(color = KColor.text2))
        }
        KuraTopBar(onBack)
    }
}

/**
 * The error block inside a screen that keeps its own header: headline (Newsreader, lowercase with
 * a period, no wink — it's our failure), what to do, and Reintentar in glass. Copy by cause lives
 * with the API errors (iOS `KuraAPIError.loadCopy`: "sin conexión." / "no se pudo cargar." …).
 */
@Composable
fun LoadErrorBlock(title: String, note: String, onRetry: () -> Unit, modifier: Modifier = Modifier, titleSize: Float = 28f) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BasicText(title, modifier = Modifier.semantics { heading() }, style = KuraType.news(titleSize))
        BasicText(note, style = KuraType.ui(15f).copy(color = KColor.text2))
        GlassButton("Reintentar", onRetry, Modifier.padding(top = 6.dp), icon = KIcon.Retry)
    }
}

/** A pushed screen whose read failed: [GoneView]'s shape plus Reintentar. */
@Composable
fun LoadErrorScreen(title: String, note: String, onRetry: () -> Unit, onBack: (() -> Unit)?, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().background(KColor.bg)) {
        LoadErrorBlock(title, note, onRetry, Modifier.padding(start = 24.dp, end = 24.dp, top = 140.dp))
        KuraTopBar(onBack)
    }
}

/** Content is on screen but its refresh failed: one quiet s1 line with Reintentar. */
@Composable
fun RetryStrip(text: String, onRetry: () -> Unit, modifier: Modifier = Modifier, offline: Boolean = false) {
    Row(
        modifier.fillMaxWidth().background(KColor.s1, RoundedCornerShape(KRadius.surface)).heightIn(min = 44.dp).padding(start = 16.dp, end = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        KIconView(if (offline) KIcon.WifiSlash else KIcon.Retry, size = 16.dp)
        BasicText(text, modifier = Modifier.weight(1f).padding(vertical = 10.dp), style = KuraType.ui(14f).copy(color = KColor.text2))
        KuraTextButton("Reintentar", onRetry, mono = true)
    }
}
