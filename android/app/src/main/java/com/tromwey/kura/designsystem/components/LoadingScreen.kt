package com.tromwey.kura.designsystem.components

import androidx.compose.foundation.background
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
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint

// Twin of ios/Kura/DesignSystem/Components/LoadingScreen.swift: loading, gone and error shapes.

/**
 * A pushed screen still arriving from the API (ficha, perfil ajeno): neutral header (s1 → bg),
 * the cover's shape (200×300, or 200×200 for [square]), two text bars and two button pills, and
 * Volver. The layout never changes when the content lands.
 */
@Composable
fun LoadingScreen(onBack: (() -> Unit)?, modifier: Modifier = Modifier, square: Boolean = false) {
    Box(modifier.fillMaxSize().background(KColor.bg).clearAndSetSemantics { contentDescription = "Cargando" }) {
        Column(
            Modifier.fillMaxWidth().background(Tint.neutralHeader).padding(top = 124.dp, bottom = 30.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Skeleton(Modifier.size(200.dp, if (square) 200.dp else 300.dp))
            Skeleton(Modifier.padding(top = 8.dp).size(190.dp, 26.dp), radius = 6.dp)
            Skeleton(Modifier.size(120.dp, 12.dp), radius = 5.dp)
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Skeleton(Modifier.size(110.dp, 44.dp), radius = 999.dp)
                Skeleton(Modifier.size(96.dp, 44.dp), radius = 999.dp)
            }
        }
        KuraTopBar(onBack)
    }
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
        Box(Modifier.kPressable(feel = KPressFeel.Dim, onClick = onRetry).heightIn(min = 44.dp).padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
            MonoLabel("Reintentar", color = KColor.text)
        }
    }
}
