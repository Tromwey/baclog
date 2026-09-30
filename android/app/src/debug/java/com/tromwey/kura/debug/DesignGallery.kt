package com.tromwey.kura.debug

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.dp
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraTab
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.Wordmark
import com.tromwey.kura.designsystem.WordmarkVariant
import com.tromwey.kura.designsystem.components.AutoPill
import com.tromwey.kura.designsystem.components.ChipRow
import com.tromwey.kura.designsystem.components.FanCollectionTile
import com.tromwey.kura.designsystem.components.FanHeader
import com.tromwey.kura.designsystem.components.VibeLine
import com.tromwey.kura.designsystem.components.CountRibbon
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.CoverArt
import com.tromwey.kura.designsystem.components.CoverBadge
import com.tromwey.kura.designsystem.components.CoverShape
import com.tromwey.kura.designsystem.components.EmptyCoverSlot
import com.tromwey.kura.designsystem.components.FanPickRow
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowSize
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.GroupedList
import com.tromwey.kura.designsystem.components.HoneyButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KuraDock
import com.tromwey.kura.designsystem.components.KuraSheet
import com.tromwey.kura.designsystem.components.KuraSwitch
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraToast
import com.tromwey.kura.designsystem.components.KuraToastHost
import com.tromwey.kura.designsystem.components.KuraToastModel
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.ListDivider
import com.tromwey.kura.designsystem.components.Masonry
import com.tromwey.kura.designsystem.components.MasonryBadge
import com.tromwey.kura.designsystem.components.MonoPill
import com.tromwey.kura.designsystem.components.MonoSegmented
import com.tromwey.kura.designsystem.components.NewCollectionRow
import com.tromwey.kura.designsystem.components.OfflineStrip
import com.tromwey.kura.designsystem.components.PickGrid
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.RibbonPill
import com.tromwey.kura.designsystem.components.RowValue
import com.tromwey.kura.designsystem.components.SaveChip
import com.tromwey.kura.designsystem.components.SaveChipStyle
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.SealSize
import com.tromwey.kura.designsystem.components.SectionTitle
import com.tromwey.kura.designsystem.components.SettingsRow
import com.tromwey.kura.designsystem.components.SheetDivider
import com.tromwey.kura.designsystem.components.SheetHeader
import com.tromwey.kura.designsystem.components.SheetRow
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.StatusPill
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.TintedSurface
import com.tromwey.kura.designsystem.components.ToastKind
import com.tromwey.kura.designsystem.components.kDockPosition
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.WaitingPill

// DEBUG-only gallery of the Kura design system (android/app/src/debug). Opens with
// `adb shell am start -n <appId>/com.tromwey.kura.MainActivity --es kuraScreen gallery`.
// Data = ios/BRIEF.md § "Datos de ejemplo" (real TMDB / Apple covers).

private object Sample {
    val chihiro = CoverArt("chihiro", "El viaje de Chihiro", "https://image.tmdb.org/t/p/w500/2RcxjDykOssx4SfqshewyI9vfSl.jpg", listOf("#c53e42", "#794244"))
    val odyssey = CoverArt("odyssey", "The Odyssey", "https://image.tmdb.org/t/p/w500/mKPGRRyXIwN8JOLhAbWnxV1gNrS.jpg", listOf("#5ca6cb", "#33566e"))
    val pearl = CoverArt("pearl", "Pearl", "https://image.tmdb.org/t/p/w500/orYlKu8i5NRdbdhSXWg1cbRn3eB.jpg", listOf("#c45a4a", "#785d53"))
    val spiderman = CoverArt("spiderman3", "Spider-Man 3", "https://image.tmdb.org/t/p/w500/etRvHz9ElAP0TMwltAZV1ufyfnW.jpg", listOf("#74524d", "#3b3235"))
    val severance = CoverArt("severance", "Severance", "https://image.tmdb.org/t/p/w500/1sylo2yeVyJ8KMZgcZLSopR66DA.jpg", listOf("#7f95a5", "#2b3a44"))
    val mononoke = CoverArt("mononoke", "La princesa Mononoke", "https://image.tmdb.org/t/p/w500/7fUjg7jky5FnnNSiSbWyOlxVYGU.jpg", listOf("#3f5a45", "#23302a"))
    val totoro = CoverArt("totoro", "Mi vecino Totoro", "https://image.tmdb.org/t/p/w500/uu6RaEAfkIQaolf20axWaRU4h3w.jpg", listOf("#6f8f7a", "#3a4d44"))
    val garza = CoverArt("garza", "El niño y la garza", "https://image.tmdb.org/t/p/w500/8KqWfVuKP7aBt3XVrDUN6irqwZm.jpg", listOf("#5d6f86", "#2e3746"))
    val avengers = CoverArt("avengers", "Avengers: Doomsday", "https://image.tmdb.org/t/p/w500/7WU8xhLhiCYuRB2VcBnUMvo6kST.jpg", listOf("#5b4a3a", "#2a2320"))
    val everything = CoverArt("everything", "You Can See Everything", "https://image.tmdb.org/t/p/w500/qhFWz1BsEMg5rcs6TAstmGQggMT.jpg", listOf("#6d6a60", "#34322d"))
    val mindOfMine = CoverArt("mindofmine", "Mind of Mine", "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/8b/73/a1/8b73a1fe-27eb-ef0d-535b-950b29769f9d/886445750782.jpg/600x600bb.jpg", listOf("#b57a56", "#685746"), CoverShape.Album)
    val ma = CoverArt("ma", "Ma", "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/b3/84/c8/b384c84d-b4a8-8f05-a37e-8aab02ba698d/075597924053.jpg/600x600bb.jpg", listOf("#c33d3b", "#ae4c69"), CoverShape.Album)
    val eduardo = CoverArt("eduardo", "eduardo", "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1e/45/20/1e452034-12e8-a346-3b4a-f1661c115808/21UMGIM35580.rgb.jpg/600x600bb.jpg", listOf("#997541", "#5d4629"), CoverShape.Album)
    val nube = CoverArt("nube", "LA NUBE EN EL JARDÍN", "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/43/d9/34/43d9342e-119d-31ef-17ac-e5cb5a8dc230/24UMGIM84395.rgb.jpg/600x600bb.jpg", listOf("#78774a", "#535841"), CoverShape.Album)
    val mala = CoverArt("mala", "Mala", "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/f4/71/c1/f471c1db-528f-bd53-3eee-2a2d078780d5/075597958836.jpg/600x600bb.jpg", listOf("#b4562f", "#9b5832"), CoverShape.Album)
    val showgirl = CoverArt("showgirl", "The Life of a Showgirl: The Encore", "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f1/a3/c7/f1a3c711-ff60-caee-2314-37c0dd3f7616/26UM1IM21436.rgb.jpg/600x600bb.jpg", listOf("#e1844d", "#774934"), CoverShape.Album)
    /** No image at all: the palette fallback is what shows. */
    val noArt = CoverArt("noart", "Sin portada", null, listOf("#c53e42", "#794244"))
    /** A URL that fails: the palette stays. */
    val broken = CoverArt("broken", "Portada rota", "https://image.tmdb.org/t/p/w500/does-not-exist.jpg", listOf("#5ca6cb", "#33566e"))

    val all = listOf(chihiro, ma, pearl, mindOfMine, odyssey, eduardo, severance, nube, spiderman, mala, totoro, showgirl, mononoke, garza)
}

@Composable
fun DesignGallery(openSheet: Boolean = false, unknown: String? = null, onlyCollections: Boolean = false) {
    var sheet by remember { mutableStateOf(openSheet) }
    var toast by remember { mutableStateOf<KuraToastModel?>(null) }
    var toastSeq by remember { mutableLongStateOf(0L) }
    var tab by remember { mutableStateOf(KuraTab.Collections) }

    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(top = 124.dp, bottom = 180.dp),
            verticalArrangement = Arrangement.spacedBy(36.dp),
        ) {
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                BasicText("sistema de diseño.", style = KuraType.screenTitle)
                BasicText("Galería de verificación (solo debug).", style = KuraType.note)
                if (unknown != null) MonoLabel("kuraScreen desconocido: $unknown", color = KColor.text3)
            }
            if (onlyCollections) {
                CardsSection()
            } else {
                TypeSection()
                ColorsSection()
                GlyphsSection()
                ButtonsSection(onToast = { kind ->
                    toastSeq += 1
                    toast = KuraToastModel(toastSeq, if (kind == ToastKind.Retry) "No se pudo guardar" else "Quitado de con mi hermana", kind) { toast = null }
                }, onSheet = { sheet = true })
                PillsSection()
                CoversSection()
                CardsSection()
                TintSection()
                SealSection()
                FanSection()
                MasonrySection()
                ControlsSection()
                ChromeSection()
                SkeletonSection()
            }
        }

        TopVeil()
        KuraTopBar(onBack = {}) {
            IconChip44(KIcon.Share, "Compartir", {})
            IconChip44(KIcon.More, "Opciones", {})
        }

        KuraToastHost(toast, onTimeout = { t -> if (toast?.id == t.id) toast = null }, Modifier.align(Alignment.BottomCenter))

        KuraDock(tab, { tab = it }, Modifier.align(Alignment.BottomCenter).kDockPosition(), feedDot = true)
    }

    if (sheet) {
        KuraSheet(onDismiss = { sheet = false }) {
            SheetHeader("guardar en", onClose = { sheet = false })
            NewCollectionRow({})
            FanPickRow("música 2026", listOf(Sample.ma, Sample.mindOfMine, Sample.eduardo), 4, on = true, onClick = {})
            FanPickRow("con mi hermana", listOf(Sample.chihiro, Sample.odyssey, Sample.pearl), 12, on = false, onClick = {}, note = "ya está")
            SheetDivider()
            SheetRow("Compartir", {}, icon = KIcon.Share)
            SheetRow("Me obsesiona", {}, glyph = Glyph.Flame)
            Box(Modifier.padding(horizontal = 8.dp, vertical = 10.dp)) { SolidButton("Guardar", { this@KuraSheet.close() }) }
        }
    }
}

@Composable
private fun Section(title: String, trailing: String? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionTitle(title, Modifier.padding(horizontal = 20.dp), trailing = trailing)
        content()
    }
}

@Composable
private fun Padded(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

@Composable
private fun HRow(spacing: Int = 10, content: @Composable () -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(spacing.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { content() }
}

@Composable
private fun TypeSection() = Section("tipografía", "newsreader · hanken · mono") {
    Padded {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Wordmark(size = 48f)
            Wordmark(variant = WordmarkVariant.B, size = 13f)
            Wordmark(variant = WordmarkVariant.C, size = 34f)
        }
        BasicText("mariel ortega", style = KuraType.profile)
        BasicText("tus colecciones", style = KuraType.screenTitle)
        BasicText("aquí va lo que más vale.", style = KuraType.emptyPhrase)
        BasicText("El viaje de Chihiro", style = KuraType.workTitle)
        BasicText("dónde ver", style = KuraType.section)
        BasicText("guardar en", style = KuraType.sheetTitle)
        BasicText("Pearl", style = KuraType.rowWork)
        BasicText("Chihiro, de diez años, queda atrapada en un mundo de espíritus después de que sus padres se transforman en cerdos.", style = KuraType.body)
        BasicText("Apruebas a quien te sigue.", style = KuraType.note)
        MonoLabel("2001 · 125 min · méxico")
        BasicText("@danpix", style = KuraType.ui(15f, UiWeight.SemiBold))
    }
}

@Composable
private fun ColorsSection() = Section("color", "grises · estados · miel") {
    val swatches = listOf(
        "bg" to KColor.bg, "s1" to KColor.s1, "s2" to KColor.s2, "text" to KColor.text, "text2" to KColor.text2, "text3" to KColor.text3,
        "glass" to KColor.glassBg, "miel" to KColor.accent, "coral" to KColor.obsessed, "pizarra" to KColor.liked, "salvia" to KColor.completed, "lavanda" to KColor.waiting,
    )
    HRow(8) {
        swatches.forEach { (n, c) ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.size(44.dp).background(c, RoundedCornerShape(12.dp)))
                MonoLabel(n, size = 9f)
            }
        }
    }
}

@Composable
private fun GlyphsSection() = Section("glifos", "un glifo, un significado") {
    HRow(14) { Glyph.entries.forEach { GlyphIcon(it, size = 22.dp) } }
    HRow(14) { KIcon.entries.forEach { KIconView(it, size = 22.dp) } }
    HRow(14) { KuraTab.entries.forEach { androidx.compose.foundation.Image(it.icon, null, Modifier.size(22.dp), colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(KColor.text2)) } }
}

@Composable
private fun ButtonsSection(onToast: (ToastKind) -> Unit, onSheet: () -> Unit) = Section("botones", "vidrio · sólido · miel") {
    HRow {
        GlassButton("Abrir hoja", onSheet, icon = KIcon.Plus)
        GlassButton("Aviso: deshacer", { onToast(ToastKind.Undo) })
        GlassButton("Aviso: reintentar", { onToast(ToastKind.Retry) }, glyph = Glyph.Warn)
        GlassButton("Reintentar", {}, icon = KIcon.Retry)
    }
    Padded {
        SolidButton("Crear cuenta", {})
        HoneyButton("Seguir", {})
        SolidButton("Continuar", {}, enabled = false)
    }
    HRow {
        IconChip44(KIcon.Back, "Volver", {})
        IconChip44(KIcon.More, "Opciones", {})
        IconChip44(KIcon.Plus, "Nueva colección", {})
        IconChip44(KIcon.Bell, "Avisos", {})
        IconChip44(KIcon.Search, "Buscar", {})
        IconChip44(KIcon.Close, "Cerrar", {}, size = 36.dp, iconSize = 14.dp)
        KuraTextButton("Editar", {})
        KuraTextButton("Deshacer", {}, mono = true)
    }
    HRow {
        FollowButton(FollowState.Follow, {}, honey = true)
        FollowButton(FollowState.Follow, {})
        FollowButton(FollowState.Following, {}, handle = "danpix")
        FollowButton(FollowState.Requested, {}, size = FollowSize.List)
        FollowButton(FollowState.Follow, {}, size = FollowSize.Hero)
    }
    HRow {
        SaveChip(0, {}, style = SaveChipStyle.Pill)
        SaveChip(1, {}, style = SaveChipStyle.Pill)
        SaveChip(0, {})
        SaveChip(2, {})
    }
}

@Composable
private fun PillsSection() = Section("píldoras", "card 30 · ribbon 26") {
    HRow(8) {
        StatusPill(Glyph.Flame, "Me obsesiona")
        StatusPill(Glyph.Check, "Completo")
        StatusPill(Glyph.Clock, "Avísame · 17 jul")
    }
    HRow(7) {
        RibbonPill(Glyph.Flame, "12")
        RibbonPill(Glyph.Check, "48")
        RibbonPill(Glyph.Thumb, "30")
        RibbonPill(Glyph.Review, "7")
        MonoPill("Solo yo")
        MonoPill("Cine", selected = true)
    }
    Padded {
        CountRibbon(listOf(Glyph.Flame to "12,4 k", Glyph.Thumb to "30,1 k", Glyph.Check to "48,7 k", Glyph.Review to "21,3 k", Glyph.Clock to "17,8 k"))
    }
    HRow(8) {
        Box(Modifier.background(KColor.s2, RoundedCornerShape(12.dp)).padding(10.dp)) { WaitingPill("14 h") }
        Box(Modifier.background(KColor.s2, RoundedCornerShape(12.dp)).padding(10.dp)) { WaitingPill("16 oct") }
        Box(Modifier.background(KColor.s2, RoundedCornerShape(12.dp)).padding(10.dp)) { AutoPill() }
    }
}

@Composable
private fun CoversSection() = Section("portadas", "2:3 · 1:1 · paleta") {
    HRow(16) {
        Cover(Sample.chihiro, width = 120.dp, badge = CoverBadge.State(Glyph.Flame))
        Cover(Sample.mindOfMine, width = 150.dp, badge = CoverBadge.Waiting("14 h"))
        Cover(Sample.noArt, width = 120.dp)
        Cover(Sample.broken, width = 120.dp, badge = CoverBadge.State(Glyph.Check))
        Cover(Sample.pearl, width = 90.dp, radius = KRadius.coverS, badge = CoverBadge.Number(2))
        Cover(Sample.ma, width = 90.dp, radius = KRadius.coverS, badge = CoverBadge.Chosen)
        EmptyCoverSlot(width = 120.dp, height = 180.dp)
    }
}

@Composable
private fun CardsSection() = Section("colecciones", "el abanico es la colección") {
    // A collection's page / the carousel's centre: fan 225, "fijada" only when it is, the name.
    FanHeader(
        listOf(Sample.ma, Sample.mindOfMine, Sample.eduardo),
        "música 2026",
        Modifier.offsetTop(),
        bottom = 0.dp,
        label = { MonoLabel("fijada", size = 10f, modifier = Modifier.padding(top = 4.dp)) },
    )
    // The profile's vitrina: the featured one at 186, then the grid at 99 (an empty one = ghost, no "+").
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        FanCollectionTile("con mi hermana", 12, listOf(Sample.chihiro, Sample.odyssey, Sample.pearl), {}, featured = true, pinned = true, onHold = {})
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        FanCollectionTile("ghibli completo", 3, listOf(Sample.chihiro, Sample.mononoke, Sample.totoro), {}, Modifier.weight(1f))
        FanCollectionTile("pendientes", 4, listOf(Sample.pearl, Sample.spiderman, Sample.odyssey), {}, Modifier.weight(1f))
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        FanCollectionTile("para correr", 0, emptyList(), {}, Modifier.weight(1f))
        FanCollectionTile("dos títulos", 2, listOf(Sample.severance, Sample.garza), {}, Modifier.weight(1f))
    }
    // The automatic one: "auto" pill under the fan, its line and the countdown meta.
    FanHeader(
        listOf(Sample.showgirl, Sample.everything, Sample.avengers),
        "no puedo esperar",
        Modifier.offsetTop(),
        label = { AutoPill(Modifier.padding(top = 4.dp)) },
        below = {
            VibeLine("se llena sola con lo que aún no sale")
            MonoLabel("5 títulos · el próximo en 14 h")
        },
    )
    // The ghost "nueva colección" (first in the carousel): dashed front with "+".
    FanHeader(emptyList(), "nueva colección", Modifier.offsetTop(), ghost = true, onGhost = {})
}

/** FanHeader sits 126 under the chrome on a page; in the gallery it follows the section title. */
private fun Modifier.offsetTop(): Modifier = layoutOffset(-110)

private fun Modifier.layoutOffset(dy: Int): Modifier = this.then(
    Modifier.layout { m, c ->
        val p = m.measure(c)
        val h = (p.height + dy.dp.roundToPx()).coerceAtLeast(0)
        layout(p.width, h) { p.place(0, dy.dp.roundToPx()) }
    },
)

@Composable
private fun TintSection() = Section("superficie teñida", "#c53e42 · #794244") {
    val (a, b) = Tint.ends(listOf("#c53e42", "#794244"))
    Padded {
        TintedSurface(listOf("#c53e42", "#794244"), Modifier.fillMaxWidth().height(120.dp), shape = RoundedCornerShape(KRadius.screen)) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                BasicText("card · 168°", style = KuraType.news(22f))
                MonoLabel("${a.hex} → ${b.hex}", color = KColor.text)
            }
        }
        TintedSurface(listOf("#c53e42", "#794244"), Modifier.fillMaxWidth().height(200.dp), style = TintStyle.Header(), shape = RoundedCornerShape(KRadius.screen)) {
            BasicText("cabecera · se funde a bg", Modifier.padding(18.dp), style = KuraType.news(22f))
        }
        TintedSurface(listOf("#5ca6cb", "#33566e"), Modifier.fillMaxWidth().height(200.dp), style = TintStyle.Header(vertical = true), shape = RoundedCornerShape(KRadius.screen)) {
            BasicText("cabecera · 180°", Modifier.padding(18.dp), style = KuraType.news(22f))
        }
        TintedSurface(listOf("#b4562f", "#9b5832"), Modifier.fillMaxWidth().height(260.dp), style = TintStyle.Feed(span = 200.dp), shape = RoundedCornerShape(KRadius.screen)) {
            BasicText("página · sigue en el tono 2", Modifier.padding(18.dp), style = KuraType.news(22f))
        }
        TintedSurface(null, Modifier.fillMaxWidth().height(120.dp), style = TintStyle.Header(), shape = RoundedCornerShape(KRadius.screen)) {
            BasicText("sin portada no hay color", Modifier.padding(18.dp), style = KuraType.news(22f))
        }
    }
}

@Composable
private fun SealSection() = Section("sello", "128 · 48 · 36 · 32") {
    HRow(14) {
        Seal("mo", listOf("#c53e42", "#794244"), size = SealSize.profile)
        Seal("tv", listOf("#b57a56", "#685746"), size = SealSize.row)
        Seal("lr", listOf("#b4562f", "#9b5832"), size = SealSize.row)
        Seal("dp", listOf("#c33d3b", "#ae4c69"), size = SealSize.list)
        Seal("nv", listOf("#5ca6cb", "#33566e"), size = SealSize.small)
        Seal("xx", emptyList(), size = SealSize.row)
        Seal("mo", listOf("#c53e42", "#794244"), size = SealSize.row, photo = "https://image.tmdb.org/t/p/w185/2RcxjDykOssx4SfqshewyI9vfSl.jpg")
    }
}

@Composable
private fun FanSection() = Section("abanico", "225 · 99 · 51 · vacío") {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        FanView(listOf(Sample.chihiro, Sample.ma, Sample.pearl), 225.dp, label = "Portadas de con mi hermana")
    }
    HRow(20) {
        FanView(listOf(Sample.ma, Sample.mindOfMine, Sample.eduardo), 99.dp)
        FanView(listOf(Sample.odyssey, Sample.severance), 99.dp)
        FanView(emptyList(), 99.dp, ghost = true)
        FanView(listOf(Sample.chihiro, Sample.pearl, Sample.ma), 51.dp)
        FanView(listOf(Sample.chihiro, Sample.pearl, Sample.ma), 22.dp)
    }
}

@Composable
private fun MasonrySection() = Section("columnas", "títulos · elige 3") {
    Masonry(
        listOf(Sample.chihiro, Sample.ma, Sample.odyssey, Sample.mindOfMine, Sample.pearl, Sample.showgirl),
        onOpen = {},
        badge = {
            when (it.id) {
                "chihiro" -> MasonryBadge.State(Glyph.Flame)
                "pearl" -> MasonryBadge.State(Glyph.Thumb)
                "ma" -> MasonryBadge.State(Glyph.Check)
                "showgirl" -> MasonryBadge.Wait("14 h")
                else -> MasonryBadge.None
            }
        },
        onHold = {},
    )
    var picks by remember { mutableStateOf(listOf("pearl", "ma")) }
    Padded {
        PickGrid(Sample.all.take(9), picks, onToggle = { t -> picks = if (t.id in picks) picks - t.id else picks + t.id })
    }
}

@Composable
private fun ControlsSection() = Section("controles", "segmentado · chips · switch · campo") {
    var fmt by remember { mutableStateOf("all") }
    var chip by remember { mutableStateOf("all") }
    var on by remember { mutableStateOf(true) }
    var off by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("chihiro") }
    var serif by remember { mutableStateOf("verano 2026") }
    Padded {
        MonoSegmented(listOf("all" to "Todas", "film" to "Cine", "series" to "Series", "music" to "Música"), fmt, { fmt = it })
    }
    ChipRow(listOf("all" to "Todo", "film" to "Cine", "series" to "Series", "music" to "Música", "people" to "Personas"), chip, { chip = it })
    Padded {
        KuraTextField(name, { name = it }, "Nombre de usuario")
        KuraTextField(search, { search = it }, "Buscar", clearable = true, trailing = { KIconView(KIcon.Search, size = 18.dp, color = KColor.text2) })
        KuraTextField(serif, { serif = it }, "Nombre de la colección", serif = true)
        GroupedList {
            SettingsRow("Perfil privado", note = "Apruebas a quien te sigue.") { KuraSwitch(on, { on = it }, "Perfil privado") }
            ListDivider()
            SettingsRow("Vibraciones") { KuraSwitch(off, { off = it }, "Vibraciones") }
            ListDivider()
            SettingsRow("Abrir música en", onClick = {}) { RowValue("Apple Music") }
        }
        OfflineStrip()
        RetryStrip("No se pudo actualizar.", {})
    }
}

@Composable
private fun ChromeSection() = Section("avisos y dock", "s2 · 5 s · 92 %") {
    Padded {
        KuraToast("Quitado de con mi hermana", onAction = {})
        KuraToast("No se pudo guardar", kind = ToastKind.Retry, onAction = {})
        KuraToast("Nombre cambiado", kind = ToastKind.Info)
    }
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        KuraDock(KuraTab.Feed, {})
    }
}

@Composable
private fun SkeletonSection() = Section("cargando", "pulso 1.6 s") {
    HRow(12) {
        Skeleton(Modifier.size(100.dp, 150.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Skeleton(Modifier.size(190.dp, 26.dp), radius = 6.dp)
            Skeleton(Modifier.size(120.dp, 12.dp), radius = 5.dp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Skeleton(Modifier.size(110.dp, 44.dp), radius = 999.dp)
                Skeleton(Modifier.size(96.dp, 44.dp), radius = 999.dp)
            }
        }
        Skeleton(Modifier.width(100.dp).height(100.dp))
    }
}
