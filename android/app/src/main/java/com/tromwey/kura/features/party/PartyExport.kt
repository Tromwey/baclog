package com.tromwey.kura.features.party

import com.tromwey.kura.designsystem.LocalEntryActive
import com.tromwey.kura.app.openLink
import com.tromwey.kura.app.openUrl
import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.browser.auth.AuthTabIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.data.models.MusicExportCopy
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.PartyExportFlow
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.HoneyButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraLoadingIndicator
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraWavyProgress
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.closePartyExport
import com.tromwey.kura.state.connectPartyExport
import com.tromwey.kura.state.disconnectTidal
import com.tromwey.kura.state.loadMusicServices
import com.tromwey.kura.state.musicServices
import com.tromwey.kura.state.musicServicesError
import com.tromwey.kura.state.party
import com.tromwey.kura.state.partyExport
import com.tromwey.kura.state.retryPartyExport
import com.tromwey.kura.state.startPartyExport
import com.tromwey.kura.state.supportedHere
import com.tromwey.kura.state.tidalAuthResult
import kotlinx.coroutines.launch
import com.tromwey.kura.state.showToast

// "Llévala a otra app" — twin of ios/Kura/Features/Party/PartyExportView.swift + the sheets
// `PartyExportSheet` / `PartyExportLeaveSheet` (design `fiesta-app-v2` · `shExport` · `isExport`).
//
// Android exports to TIDAL only: Apple Music runs with MusicKit on iOS, which Android doesn't have,
// so its row is dimmed with "Solo en iPhone" (never a button that can't finish). TIDAL's consent
// opens in an Auth Tab (androidx.browser `AuthTabIntent` — Android's ASWebAuthenticationSession: it
// catches the server's `kura://music/tidal/…` bounce itself). A browser without Auth Tab falls back
// to a Custom Tab; its bounce reaches MainActivity (`kura://music/tidal/` intent-filter) and
// `store.tidalCallback`, which only honors it while this connect is out.

/** Where Android puts each service in the sheet: the one that works first. */
private val exportOrder = listOf(MusicProvider.Tidal, MusicProvider.AppleMusic)

private enum class RowState { Loading, Ready, Soon, Empty, NotHere }

/**
 * "llévala a otra app" — for the host AND the guests, each into their own account.
 * `GET /music/services` decides each button: `available: false` (or the 503 of
 * `MIGRATION_0034_LIVE`) → dimmed with "Próximamente". A linked TIDAL can be unlinked here.
 */
@Composable
fun KuraSheetScope.PartyExportSheet(store: AppStore, sheet: SheetRoute.PartyExport) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    LaunchedEffect(sheet.id) { store.loadMusicServices() }
    val n = store.party(sheet.id)?.songs?.size ?: 0
    val sv = store.musicServices
    val error = store.musicServicesError
    Column(Modifier.padding(horizontal = 8.dp).padding(top = 8.dp)) {
        PartySheetTitle("llévala a otra app")
        PartySheetBody(
            if (n == 0) "La fiesta todavía no tiene canciones. Cuando tenga, la pasas a tu cuenta."
            else "Creamos una playlist con ${if (n == 1) "la canción" else "las $n canciones"} en tu cuenta. La colección sigue viva en kura.",
            Modifier.padding(top = 10.dp),
        )
        Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            exportOrder.forEach { p ->
                val state = when {
                    !p.supportedHere -> RowState.NotHere
                    sv == null -> if (error == null) RowState.Loading else RowState.Soon
                    !sv[p].available -> RowState.Soon
                    n > 0 -> RowState.Ready
                    else -> RowState.Empty
                }
                ServiceRow(p, state) { store.startPartyExport(sheet.id, p) }
            }
        }
        if (error != null) {
            RetryStrip("No pudimos revisar los servicios.", { scope.launch { store.loadMusicServices() } }, Modifier.padding(top = 12.dp))
        } else if (sv?.tidal?.connected == true) {
            // The store's scope: closing the sheet mid-way must not cancel the write.
            PartyFlatButton("Desconectar TIDAL", { store.launch { store.disconnectTidal() } }, Modifier.padding(top = 8.dp), quiet = true)
        }
    }
}

@Composable
private fun ServiceRow(p: MusicProvider, state: RowState, onClick: () -> Unit) {
    val label = "Llévala a ${p.label}"
    val ready = state == RowState.Ready
    Row(
        Modifier.fillMaxWidth().height(60.dp)
            .background(KColor.glassBg, RoundedCornerShape(KRadius.surface))
            .kPressable(feel = KPressFeel.Dim, enabled = ready, onClickLabel = label, onClick = onClick)
            .padding(horizontal = 18.dp)
            .clearAndSetSemantics {
                contentDescription = when (state) {
                    RowState.Soon -> "$label, próximamente"
                    RowState.NotHere -> "$label, solo en iPhone"
                    else -> label
                }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(label, Modifier.weight(1f), style = KuraType.ui(16f, UiWeight.SemiBold).copy(color = if (ready) KColor.text else KColor.text3))
        when (state) {
            RowState.Soon -> MonoLabel("Próximamente", size = 10f, color = KColor.text3)
            RowState.NotHere -> MonoLabel("Solo en iPhone", size = 10f, color = KColor.text3)
            RowState.Loading -> KuraLoadingIndicator(size = 24.dp)
            RowState.Ready, RowState.Empty -> KIconView(KIcon.ChevronRight, size = 14.dp, color = if (ready) KColor.text else KColor.text3)
        }
    }
}

/** "¿salir ahora?" — ✕ while the songs are passing. What passed stays; exporting again picks up. */
@Composable
fun KuraSheetScope.PartyExportLeaveSheet(store: AppStore, sheet: SheetRoute.PartyExportLeave) {
    val dismiss: () -> Unit = this::close
    val svc = store.partyExport?.provider?.label ?: "la otra app"
    Column(Modifier.padding(horizontal = 8.dp).padding(top = 8.dp)) {
        PartySheetTitle("¿salir ahora?")
        PartySheetBody(
            "Las canciones que ya pasaron se quedan en tu playlist de $svc. Si vuelves a exportar, seguimos donde quedamos.",
            Modifier.padding(top = 10.dp),
        )
        Column(Modifier.padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PartyFlatButton("Seguir pasándola", dismiss)
            PartyFlatButton("Salir", { store.closePartyExport(force = true) }, quiet = true)
        }
    }
}

/**
 * The export screen over the party (design `isExport`), one step at a time: connect ("conecta
 * tidal." + Conectar TIDAL in honey, a line under it when something stopped it) · progress ("pasando
 * la colección.", "Buscando {title} en TIDAL…", the wavy bar, "N de M" · "No cierres esta pantalla",
 * the screen stays on) · done ("lista.", "No están en TIDAL", Abrir en TIDAL) · failed (the server's
 * copy, Reintentar). "Volver a la colección" on every step but progress; ✕ there asks first.
 */
@Composable
fun PartyExportScreen(store: AppStore, f: PartyExportFlow) {
    val context = LocalContext.current
    val view = LocalView.current
    val launcher = rememberLauncherForActivityResult(AuthTabIntent.AuthenticateUserResultContract()) { r ->
        store.tidalAuthResult(if (r.resultCode == AuthTabIntent.RESULT_OK) r.resultUri?.toString() else null)
    }
    // Only while this page is the one on screen: a covered export doesn't hold the screen awake.
    val active = LocalEntryActive.current
    DisposableEffect(f.step, active) {
        view.keepScreenOn = active && f.step == PartyExportFlow.Step.Progress
        onDispose { view.keepScreenOn = false }
    }
    val party = store.party(f.partyId)
    Column(
        Modifier.fillMaxSize().background(KColor.bg).statusBarsPadding().navigationBarsPadding()
            .padding(horizontal = 20.dp).padding(bottom = 18.dp),
    ) {
        Box(Modifier.fillMaxWidth().height(56.dp), contentAlignment = Alignment.CenterStart) {
            IconChip44(
                KIcon.Close,
                if (f.step == PartyExportFlow.Step.Progress) "Salir" else "Cerrar",
                { store.closePartyExport() },
                Modifier.padding(start = 0.dp),
                iconSize = 14.dp,
                fill = Color.Transparent,
            )
        }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            val songs = party?.songs.orEmpty()
            FanView(songs.take(3).map { it.cover }, 72.dp, ghost = songs.isEmpty(), plus = false)
            MonoLabel("${f.playlistName} → ${f.provider.label}", Modifier.padding(top = 26.dp), tracking = 0.1f, color = KColor.text3)
            BasicText(
                MusicExportCopy.title(f.step, f.provider),
                Modifier.padding(top = 8.dp).semantics { heading() },
                style = KuraType.news(36f).copy(lineHeight = 40.sp),
            )
            BasicText(exportBody(f), Modifier.padding(top = 10.dp), style = KuraType.ui(15f).copy(color = KColor.text2, lineHeight = 21.sp))
            val note = f.note
            if (f.step == PartyExportFlow.Step.Connect && note != null) {
                BasicText(note, Modifier.padding(top = 14.dp), style = KuraType.ui(14f, UiWeight.Medium).copy(lineHeight = 20.sp))
            }
            if (f.step == PartyExportFlow.Step.Progress) {
                val frac = if (f.total > 0) f.processed.toFloat() / f.total else 0f
                Column(
                    Modifier.padding(top = 28.dp).clearAndSetSemantics { contentDescription = "Progreso: ${f.processed} de ${f.total} canciones" },
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    KuraWavyProgress(frac)
                    Row(Modifier.fillMaxWidth()) {
                        MonoLabel("${f.processed} de ${f.total}", Modifier.weight(1f), color = KColor.text3)
                        MonoLabel("No cierres esta pantalla", color = KColor.text3)
                    }
                }
            }
            if (f.step == PartyExportFlow.Step.Done) MissingList(f, party?.songs.orEmpty().associate { it.titleId to it.palette })
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (f.step) {
                PartyExportFlow.Step.Connect -> HoneyButton(
                    if (f.busy) "Conectando…" else "Conectar ${f.provider.label}",
                    {
                        store.connectPartyExport { url ->
                            try {
                                AuthTabIntent.Builder().build().launch(launcher, Uri.parse(url), "kura")
                            } catch (_: ActivityNotFoundException) {
                                store.tidalAuthResult(null)
                                store.showToast(ToastModel("No encontramos un navegador para abrir TIDAL", ToastModel.Kind.Info))
                            }
                        }
                    },
                    height = 56.dp,
                    enabled = !f.busy,
                )
                PartyExportFlow.Step.Done -> f.state?.playlist?.url?.let { url ->
                    HoneyButton("Abrir en ${f.provider.label}", { store.openLink(context, url) }, height = 56.dp)
                }
                PartyExportFlow.Step.Failed -> HoneyButton("Reintentar", { store.retryPartyExport() }, height = 56.dp)
                PartyExportFlow.Step.Progress -> Unit
            }
            if (f.step != PartyExportFlow.Step.Progress) PartyFlatButton("Volver a la colección", { store.closePartyExport() })
        }
    }
}

private fun exportBody(f: PartyExportFlow): String = when (f.step) {
    PartyExportFlow.Step.Connect -> MusicExportCopy.connectBody(f.playlistName)
    PartyExportFlow.Step.Progress -> f.pause ?: f.current?.let { MusicExportCopy.searching(it, f.provider) } ?: "Preparando la playlist…"
    PartyExportFlow.Step.Done -> MusicExportCopy.done(f.provider, f.state?.exported ?: f.total, f.state?.total ?: f.total)
    PartyExportFlow.Step.Failed -> f.failure ?: MusicExportCopy.serviceFailed(f.provider)
}

/** "No están en TIDAL": cover, title, "artista · Agregó @x". */
@Composable
private fun MissingList(f: PartyExportFlow, palettes: Map<String, List<String>>) {
    val list = f.state?.missing.orEmpty()
    if (list.isEmpty()) return
    Column(Modifier.padding(top = 24.dp)) {
        MonoLabel("No están en ${f.provider.label}", Modifier.padding(bottom = 4.dp), tracking = 0.1f, color = KColor.text3)
        list.forEach { s ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 10.dp).semantics(mergeDescendants = true) { },
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SongCover(s.artworkUrl, palettes[s.titleId].orEmpty(), size = 48.dp, radius = 6.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    BasicText(s.title, style = KuraType.newsItalic(17f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    BasicText(
                        listOfNotNull(s.artist, s.byLine).joinToString(" · "),
                        style = KuraType.ui(13f).copy(color = KColor.text2),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}
