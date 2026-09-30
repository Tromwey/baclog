package com.tromwey.kura.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.SheetHeader
import com.tromwey.kura.designsystem.components.TabTitleBar
import com.tromwey.kura.designsystem.components.kuraTitleScroll
import com.tromwey.kura.designsystem.components.rememberKuraTitleScroll
import com.tromwey.kura.state.AppStore

// The body every placeholder screen/sheet draws until its lane replaces the file. Temporary by
// design: a lane that implements a screen drops the call, and when none is left this file goes.

/**
 * A pushed screen not built yet: Volver (pops), the route's name in Newsreader and "pendiente" in
 * mono. [content] lets the shell's own verification add a way forward (never business logic).
 */
@Composable
fun PendingScreen(title: String, store: AppStore, content: @Composable ColumnScope.() -> Unit = {}) {
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, top = KSize.pushedTitleTop, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            BasicText(title, modifier = Modifier.semantics { heading() }, style = KuraType.news(32f))
            MonoLabel("pendiente")
            content()
        }
        KuraTopBar(onBack = { store.pop() })
    }
}

/**
 * A tab root not built yet: the tab's big title ("tus colecciones", collapses as it scrolls) and
 * "pendiente". The navigation bar's room comes from the frame's padding (KuraRoot).
 */
@Composable
fun PendingTabRoot(title: String, content: @Composable ColumnScope.() -> Unit = {}) {
    val scroll = rememberKuraTitleScroll()
    Column(Modifier.fillMaxSize().background(KColor.bg)) {
        TabTitleBar(title, scroll = scroll)
        Column(
            Modifier.fillMaxWidth().weight(1f).kuraTitleScroll(scroll).verticalScroll(rememberScrollState())
                .padding(horizontal = KSize.margin).padding(top = 18.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            MonoLabel("pendiente")
            content()
        }
    }
}

/** A sheet not built yet: its name as the header (with the close chip) and "pendiente". */
@Composable
fun KuraSheetScope.PendingSheet(title: String) {
    SheetHeader(title, onClose = { close() })
    MonoLabel("pendiente", Modifier.padding(horizontal = 10.dp, vertical = 12.dp))
}
