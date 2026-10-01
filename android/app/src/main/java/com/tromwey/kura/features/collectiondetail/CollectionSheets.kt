package com.tromwey.kura.features.collectiondetail

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.tromwey.kura.app.art
import com.tromwey.kura.app.mark
import com.tromwey.kura.app.reaction
import com.tromwey.kura.data.models.CollectionLayout
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.PublicLinks
import com.tromwey.kura.data.models.SortMode
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.EsMx
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KShadow
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FanPickRow
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.NewCollectionRow
import com.tromwey.kura.designsystem.components.RadioDot
import com.tromwey.kura.designsystem.components.ReactionGroup
import com.tromwey.kura.designsystem.components.RowValue
import com.tromwey.kura.designsystem.components.SettingsRow
import com.tromwey.kura.designsystem.components.SheetDivider
import com.tromwey.kura.designsystem.components.SheetHeader
import com.tromwey.kura.designsystem.components.SheetRow
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.SplitActionButton
import com.tromwey.kura.designsystem.components.TintedSurface
import com.tromwey.kura.designsystem.kShadow
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.deleteCollection
import com.tromwey.kura.state.editCollection
import com.tromwey.kura.state.isUnreleased
import com.tromwey.kura.state.move
import com.tromwey.kura.state.releaseLabel
import com.tromwey.kura.state.remove
import com.tromwey.kura.state.reorder
import com.tromwey.kura.state.setCover
import com.tromwey.kura.state.setMark
import com.tromwey.kura.state.setPrivacy
import com.tromwey.kura.state.setSort
import com.tromwey.kura.state.toggleAlert
import com.tromwey.kura.state.toggleLayout
import com.tromwey.kura.state.togglePin
import kotlin.math.roundToInt

// Twin of ios/Kura/Features/CollectionDetail/CollectionSheets.swift: ONE options sheet per
// collection (18a, and 9a without the view rows), Ordenar, Editar el orden, Editar, Quién la ve,
// Compartir, Borrar, 18c on a title and Mover a.

// MARK: 18a Opciones · 9a

/** 18a · Opciones (the ⋯ chip, holding a fan in Tus colecciones): the full list, view rows included. */
@Composable
fun KuraSheetScope.CollectionMoreSheet(store: AppStore, sheet: SheetRoute.More) {
    CollectionOptions(store, sheet.id, full = true)
}

/** 9a · holding a fan on your own profile: the same sheet without the view rows (they change a screen you're not on). */
@Composable
fun KuraSheetScope.CollectionQuickSheet(store: AppStore, sheet: SheetRoute.CollectionQuick) {
    CollectionOptions(store, sheet.id, full = false)
}

@Composable
private fun KuraSheetScope.CollectionOptions(store: AppStore, id: String, full: Boolean) {
    val dismiss: () -> Unit = this::close
    val c = store.collection(id) ?: return
    val n = c.titleIds.size
    Row(
        Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, bottom = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText(
            c.name,
            Modifier.weight(1f).semantics { heading() },
            style = KuraType.news(24f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        MonoLabel("$n ${if (n == 1) "título" else "títulos"}")
    }
    SheetRow("Agregar títulos", { store.present(SheetRoute.AddTitles(c.id)) }, icon = KIcon.Plus)
    SheetRow("Compartir", { store.present(SheetRoute.Share(c.id)) }, icon = KIcon.Share)
    SheetRow(
        if (c.pinned) "Desfijar" else "Fijar",
        {
            dismiss()
            store.togglePin(c.id)
        },
        icon = if (c.pinned) KIcon.PinSlash else KIcon.Pin,
    ) { if (c.pinned) SheetValue("fijada") }
    SheetDivider()
    if (full) {
        val list = c.layout == CollectionLayout.List
        SheetRow(
            if (list) "Ver en columnas" else "Ver como lista",
            {
                dismiss()
                // The store flips what the collection has NOW, never this row's captured copy.
                store.toggleLayout(c.id)
            },
            icon = if (list) KIcon.Grid else KIcon.ListBullet,
        )
        SheetRow("Ordenar", { store.present(SheetRoute.Sort(c.id)) }, icon = KIcon.Sort) { SheetValue(c.sort.label) }
        // Ordenar = how YOU look at it (Manual is one mode); this edits the manual order everyone sees.
        if (n > 1) {
            SheetRow("Editar el orden", { store.present(SheetRoute.Reorder(c.id)) }, icon = KIcon.Grip) { SheetValue("el que ven todos") }
        }
    }
    SheetRow("Editar", { store.present(SheetRoute.Rename(c.id)) }, icon = KIcon.Pencil)
    PrivacySheetRow(c.privacy, "Quién la ve", { store.present(SheetRoute.Privacy(c.id)) }) { SheetValue(c.privacy.label) }
    SheetDivider()
    SheetRow("Borrar colección", { store.present(SheetRoute.DeleteCollection(c.id)) }, icon = KIcon.Trash)
}

/** A [SheetRow] led by the privacy's own symbol (candado · link · globo). */
@Composable
private fun PrivacySheetRow(p: Privacy, label: String, onClick: () -> Unit, trailing: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {}) {
    when (p) {
        Privacy.OnlyMe -> SheetRow(label, onClick, glyph = Glyph.Lock, trailing = trailing)
        Privacy.Followers -> SheetRow(label, onClick, glyph = Glyph.Users, trailing = trailing)
        Privacy.Link -> SheetRow(label, onClick, icon = KIcon.Link, trailing = trailing)
        Privacy.PublicAccess -> SheetRow(label, onClick, icon = KIcon.Globe, trailing = trailing)
    }
}

/** A sheet row's current value ("Manual", "Todos", "Fijada"): Hanken 15, sentence case, text-3. */
@Composable
fun SheetValue(text: String) {
    BasicText(
        text.replaceFirstChar { it.titlecase(EsMx) },
        style = KuraType.ui(15f).copy(color = KColor.text3),
        maxLines = 1,
    )
}

// MARK: O3a Ordenar

/** Manual (the owner's order) first and default · Recientes · Título · Estado · Año. Per device. */
@Composable
fun KuraSheetScope.SortSheet(store: AppStore, sheet: SheetRoute.Sort) {
    val dismiss: () -> Unit = this::close
    val c = store.collection(sheet.id) ?: return
    SheetHeader("ordenar")
    SortMode.entries.forEach { mode ->
        SettingsRow(mode.label, onClick = {
            store.setSort(c.id, mode)
            dismiss()
        }) { RadioDot(c.sort == mode) }
    }
}

// MARK: K1a Quién la ve

@Composable
fun KuraSheetScope.PrivacySheet(store: AppStore, sheet: SheetRoute.Privacy) {
    val dismiss: () -> Unit = this::close
    val c = store.collection(sheet.id) ?: return
    SheetHeader("quién ve ${c.name}")
    PrivacyOptions(c.privacy) { p ->
        store.setPrivacy(c.id, p)
        dismiss()
    }
}

/** The one visibility vocabulary (Solo yo · Quien tenga el link · Todos) with its notes, single choice. */
@Composable
fun PrivacyOptions(selected: Privacy, onPick: (Privacy) -> Unit) {
    Privacy.options.forEach { p ->
        SettingsRow(p.label, note = p.note, onClick = { onPick(p) }) { RadioDot(p == selected) }
    }
}

// MARK: O2b Editar (nombre + frase)

/**
 * The name (required, ≤ 40, lowercased like at creation) and the frase (optional, ≤ 80; saving it
 * empty clears it) — both limits are the server's. The links already shared keep working.
 */
@Composable
fun KuraSheetScope.EditCollectionSheet(store: AppStore, sheet: SheetRoute.Rename) {
    val dismiss: () -> Unit = this::close
    val c = store.collection(sheet.id)
    var name by rememberSaveable { mutableStateOf(c?.name ?: "") }
    var vibe by rememberSaveable { mutableStateOf(c?.vibe ?: "") }
    val nameFocus = remember { FocusRequester() }
    val vibeFocus = remember { FocusRequester() }
    val valid = name.isNotBlank()
    val save = {
        if (valid) {
            store.editCollection(sheet.id, name, vibe)
            dismiss()
        }
    }
    LaunchedEffect(Unit) { runCatching { nameFocus.requestFocus() } }

    SheetHeader("editar", onClose = { dismiss() })
    Column(Modifier.padding(horizontal = 8.dp).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            MonoLabel("nombre", Modifier.padding(horizontal = 4.dp).clearAndSetSemantics { })
            KuraTextField(
                name,
                { name = it.take(AppStore.COLLECTION_NAME_LIMIT) },
                "ponle nombre",
                Modifier.semantics { contentDescription = "Nombre de la colección" },
                serif = true,
                clearable = true,
                imeAction = ImeAction.Next,
                focusRequester = nameFocus,
                keyboardActions = KeyboardActions(onNext = { runCatching { vibeFocus.requestFocus() } }),
                fill = KColor.glassBg,
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.padding(horizontal = 4.dp).clearAndSetSemantics { }) {
                MonoLabel("frase · opcional")
                Spacer(Modifier.weight(1f))
                MonoLabel("${vibe.length}/${AppStore.COLLECTION_VIBE_LIMIT}", color = KColor.text3)
            }
            KuraTextField(
                vibe,
                { vibe = it.replace("\n", "").take(AppStore.COLLECTION_VIBE_LIMIT) },
                "una frase para esta colección",
                Modifier.semantics { contentDescription = "Frase de la colección, opcional" },
                imeAction = ImeAction.Done,
                focusRequester = vibeFocus,
                keyboardActions = KeyboardActions(onDone = { save() }),
                fill = KColor.glassBg,
            )
        }
        BasicText(
            "Los links que ya compartiste siguen funcionando.",
            Modifier.padding(horizontal = 4.dp),
            style = KuraType.ui(13f).copy(color = KColor.text2),
        )
        SolidButton("Guardar", { save() }, enabled = valid)
    }
}

// MARK: O5 Compartir

/**
 * The preview in the fan's language + Copiar link ▾ (Historia, Más) as a split button. "Solo yo"
 * has no link: the who-sees-it choices open right here, and picking one that has a link brings the
 * button in place. A private profile says so (every public URL would 404).
 */
@Composable
fun KuraSheetScope.ShareCollectionSheet(store: AppStore, sheet: SheetRoute.Share) {
    val dismiss: () -> Unit = this::close
    val c = store.collection(sheet.id) ?: return
    val context = LocalContext.current
    val url = store.myCollectionLink(c)
    var choosing by rememberSaveable { mutableStateOf(false) }

    SheetHeader("compartir")
    Column(Modifier.padding(horizontal = 8.dp).animateContentSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SharePreviewCard(c.name, store.fan(c).map { it.art }, store.me.handle, c.titleIds.size, url, store.palette(c))
        if (url == null) {
            BasicText(
                when {
                    store.profilePrivate -> AppStore.PRIVATE_PROFILE_SHARE_NOTE
                    c.privacy == Privacy.OnlyMe -> "Está en ${Privacy.OnlyMe.label}: nadie más la puede abrir. Cambia quién la ve para compartirla."
                    else -> "Todavía se está guardando. Inténtalo en un momento."
                },
                Modifier.padding(horizontal = 8.dp).padding(top = 12.dp, bottom = 4.dp),
                style = KuraType.ui(14f).copy(color = KColor.text2, lineHeight = 20.sp),
            )
            if (c.privacy == Privacy.OnlyMe && !store.profilePrivate) {
                if (choosing) {
                    PrivacyOptions(c.privacy) { p ->
                        store.setPrivacy(c.id, p)
                        choosing = false
                    }
                } else {
                    GlassButton("Cambiar quién la ve", { choosing = true }, Modifier.padding(4.dp), glyph = Glyph.Lock)
                }
            }
        } else {
            val copy = {
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText(c.name, url))
                dismiss()
                // Android 13+ confirms a copy itself; a second notice would repeat it.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) store.showToast(ToastModel("Link copiado", ToastModel.Kind.Info))
            }
            val send = { shareText(context, c.name, url) }
            SplitActionButton(
                "Copiar link",
                copy,
                listOf("Historia" to send, "Más" to send),
                Modifier.fillMaxWidth().padding(top = 14.dp),
                icon = KIcon.Link,
            )
        }
    }
}

/** The system share sheet with the link (Historia and Más both go through it on Android). */
private fun shareText(context: Context, subject: String, url: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, url)
    }
    context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/**
 * What the link shows: the mini fan at 99, the name in Newsreader 22, "de @handle · N títulos" and
 * the URL in mono (cut at the head), on the collection's tinted card. No border.
 */
@Composable
fun SharePreviewCard(name: String, fan: List<com.tromwey.kura.designsystem.components.CoverArt>, handle: String, count: Int, url: String?, palette: List<String>?) {
    TintedSurface(palette, Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(start = 10.dp, end = 16.dp, top = 16.dp, bottom = 16.dp)
                .semantics(mergeDescendants = true) { },
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FanView(fan, 99.dp, ghost = fan.isEmpty(), plus = false)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                BasicText(name, style = KuraType.news(22f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                BasicText(
                    "de @$handle · $count ${if (count == 1) "título" else "títulos"}",
                    style = KuraType.ui(13f).copy(color = KColor.text2),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (url != null) {
                    // Cut at the HEAD ("…/mariel.ok/hermana"): a middle cut split the handle.
                    BasicText(
                        PublicLinks.display(url),
                        Modifier.padding(top = 2.dp),
                        style = KuraType.mono(12f),
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.StartEllipsis,
                    )
                }
            }
        }
    }
}

// MARK: 35a Borrar colección

/** The one destructive confirmation (no grabber): solid Borrar colección + Cancelar. */
@Composable
fun KuraSheetScope.DeleteCollectionSheet(store: AppStore, sheet: SheetRoute.DeleteCollection) {
    val dismiss: () -> Unit = this::close
    val c = store.collection(sheet.id) ?: return
    val n = c.titleIds.size
    Column(Modifier.padding(horizontal = 4.dp).padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText("¿borrar ${c.name}?", Modifier.padding(horizontal = 8.dp).semantics { heading() }, style = KuraType.news(26f))
        BasicText(
            if (n == 0) {
                "Está vacía. Solo se borra esta colección. No se puede deshacer."
            } else {
                (if (n == 1) "El título conserva su estado y sigue" else "Los $n títulos conservan su estado y siguen") +
                    " en tus otras colecciones. Solo se borra esta. No se puede deshacer."
            },
            Modifier.padding(horizontal = 8.dp).padding(top = 4.dp, bottom = 14.dp),
            style = KuraType.ui(15f).copy(color = KColor.text2, lineHeight = 21.sp),
        )
        SolidButton("Borrar colección", honey = false, onClick = {
            store.dismissSheet()
            store.deleteCollection(c.id)
        })
        KuraTextButton("Cancelar", { dismiss() }, Modifier.fillMaxWidth())
    }
}

// MARK: 18c Mantener presionado un título

/**
 * 18c. [SheetRoute.TitleActions.collectionId] null = 9b, the reduced variant of "no puedo esperar"
 * (automatic: no membership, no cover). Tu reacción is the reaction group itself (Material's
 * connected toggle group: tap the chosen one again to clear it).
 */
@Composable
fun KuraSheetScope.TitleActionsSheet(store: AppStore, sheet: SheetRoute.TitleActions) {
    val dismiss: () -> Unit = this::close
    val c = sheet.collectionId?.let { store.collection(it) }
    val t = store.title(sheet.titleId) ?: return
    if (sheet.collectionId != null && c == null) return
    val unreleased = store.isUnreleased(t)

    Column(Modifier.padding(horizontal = 10.dp).padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        BasicText(t.name, Modifier.semantics { heading() }, style = KuraType.newsItalic(22f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        MonoLabel(listOfNotNull(t.format.metaLabel, t.year?.toString(), t.creatorShort).filter { it.isNotEmpty() }.joinToString(" · "))
    }

    when {
        unreleased && c == null -> {
            // Not out yet: the release alert (the ficha's pill) and the preview mark.
            val on = t.id in store.alerts
            SheetRow(
                if (on) "Te avisamos del estreno" else "Avísame del estreno",
                { store.toggleAlert(t.id) },
                glyph = if (on) Glyph.Check else Glyph.Clock,
            ) { store.releaseLabel(t)?.let { MonoLabel(it, color = KColor.text3) } }
            SheetRow("La vi en preestreno", { store.present(SheetRoute.Complete(t.id, focusReview = false)) }, glyph = Glyph.Clock)
        }
        unreleased -> SheetRow("La vi en preestreno", { store.present(SheetRoute.Complete(t.id, focusReview = false)) }, glyph = Glyph.Clock)
        else -> ReactionRows(store, t)
    }

    if (c != null) {
        // The CHOSEN cover (not just the first of the order) can go back to automatic.
        val isCover = c.chosenCoverTitleId == t.id
        SheetRow(
            if (isCover) "Portada automática" else "Usar como portada",
            {
                dismiss()
                store.setCover(c.id, if (isCover) null else t.id)
            },
            icon = KIcon.Photo,
        ) { if (isCover) MonoLabel("portada") }
        SheetRow("Mover a otra colección", { store.present(SheetRoute.MoveTo(t.id, c.id)) }, icon = KIcon.ArrowRight)
        SheetDivider()
        SheetRow("Quitar de la colección", {
            dismiss()
            store.remove(t.id, c.id)
        }, icon = KIcon.Minus)
    }
}

@Composable
private fun ReactionRows(store: AppStore, t: Title) {
    val m = store.mark(t.id)
    Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        MonoLabel("tu reacción")
        ReactionGroup(
            selected = m?.reaction,
            onSelect = { r -> store.setMark(t.id, r.mark) },
            modifier = Modifier.fillMaxWidth(),
            // 18c is a compact (s2) sheet: an s2 group would vanish into it.
            containerColor = KColor.glassBg,
        )
    }
    SheetRow(
        if (store.myReview(t.id) == null) "Reseñar" else "Editar reseña",
        { store.present(SheetRoute.Complete(t.id, focusReview = true)) },
        glyph = Glyph.Review,
    )
}

// MARK: O4a Mover a

@Composable
fun KuraSheetScope.MoveToSheet(store: AppStore, sheet: SheetRoute.MoveTo) {
    val t = store.title(sheet.titleId) ?: return
    var target by rememberSaveable { mutableStateOf<String?>(null) }
    val haptic = rememberKHaptic()

    Row(
        Modifier.fillMaxWidth().padding(horizontal = 10.dp).padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(t.art, width = 44.dp, height = if (t.format == MediaFormat.Album) 44.dp else 66.dp, radius = KRadius.coverS)
        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
            BasicText(t.name, style = KuraType.newsItalic(20f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            MonoLabel(listOfNotNull(t.format.metaLabel, t.year?.toString()).joinToString(" · "))
        }
    }
    MonoLabel("mover a", Modifier.padding(horizontal = 10.dp).padding(bottom = 4.dp))
    Column(Modifier.fillMaxWidth().heightIn(max = 288.dp).verticalScroll(rememberScrollState())) {
        NewCollectionRow({ store.present(SheetRoute.NewCollection(addingTitleId = t.id, movingFrom = sheet.fromId)) })
        store.orderedCollections.forEach { c ->
            val here = c.id == store.collection(sheet.fromId)?.id
            val already = !here && t.id in c.titleIds
            // The one it leaves from is dimmed; both say "ya está", the words of Guardar en.
            FanPickRow(
                name = c.name,
                covers = store.fan(c).map { it.art },
                count = c.titleIds.size,
                on = target == c.id,
                onClick = {
                    target = c.id
                    haptic(KHapticEvent.Selection)
                },
                note = if (here || already) "ya está" else null,
                disabled = here,
                single = true,
            )
        }
    }
    SolidButton(
        "Mover",
        {
            val to = target ?: return@SolidButton
            store.dismissSheet()
            store.move(t.id, sheet.fromId, to)
        },
        Modifier.padding(top = 10.dp),
        enabled = target != null,
    )
}

// MARK: O3b Editar el orden

/**
 * Every title in its manual order, each row with a grip: drag the grip (the row follows the finger
 * and the others make room), or use TalkBack's Subir / Bajar. "Guardar orden" writes the WHOLE order
 * at once and puts the view back on Manual; closing the sheet discards it. Hugs its rows; scrolls
 * past ~7.
 */
@Composable
fun KuraSheetScope.ReorderSheet(store: AppStore, sheet: SheetRoute.Reorder) {
    val dismiss: () -> Unit = this::close
    val c = store.collection(sheet.id) ?: return
    val order = remember(sheet.id) { mutableStateListOf<String>().apply { addAll(c.titleIds) } }
    var dragFrom by remember { mutableIntStateOf(-1) }
    var dragDy by remember { mutableFloatStateOf(0f) }
    val haptic = rememberKHaptic()
    val density = LocalDensity.current
    val rowH = 64.dp
    val rowPx = with(density) { rowH.toPx() }
    val target = if (dragFrom < 0) -1 else (dragFrom + (dragDy / rowPx).roundToInt()).coerceIn(0, order.size - 1)

    fun move(from: Int, to: Int) {
        if (from == to || from !in order.indices || to !in order.indices) return
        val id = order.removeAt(from)
        order.add(to, id)
        haptic(KHapticEvent.Selection)
    }

    SheetHeader("editar el orden", onClose = { dismiss() })
    BasicText(
        "Arrastra desde las rayas. Así se ve la colección para todos.",
        Modifier.padding(horizontal = 10.dp).padding(bottom = 10.dp),
        style = KuraType.ui(13f).copy(color = KColor.text2),
    )
    val scroll = rememberScrollState()
    Column(
        Modifier.fillMaxWidth().height(minOf(rowH * order.size + 4.dp, rowH * 7.5f))
            .verticalScroll(scroll, enabled = dragFrom < 0),
    ) {
        order.forEachIndexed { i, id ->
            val t = store.title(id) ?: return@forEachIndexed
            val dragging = dragFrom == i
            val shiftTarget = when {
                dragFrom < 0 || dragging -> 0.dp
                dragFrom < i && i <= target -> -rowH
                target <= i && i < dragFrom -> rowH
                else -> 0.dp
            }
            val shift by animateDpAsState(shiftTarget, label = "reorderShift")
            val album = t.format == MediaFormat.Album
            Row(
                Modifier
                    .zIndex(if (dragging) 1f else 0f)
                    .graphicsLayer { translationY = if (dragging) dragDy else shift.toPx() }
                    .fillMaxWidth()
                    .height(rowH)
                    .then(if (dragging) Modifier.kShadow(KShadow.Cover, RoundedCornerShape(KRadius.surface)).background(KColor.s2, RoundedCornerShape(KRadius.surface)) else Modifier)
                    .padding(horizontal = 4.dp)
                    .semantics(mergeDescendants = true) {
                        contentDescription = "${t.name}. Posición ${i + 1} de ${order.size}"
                        customActions = listOf(
                            CustomAccessibilityAction("Subir") { if (i > 0) move(i, i - 1); i > 0 },
                            CustomAccessibilityAction("Bajar") { if (i < order.size - 1) move(i, i + 1); i < order.size - 1 },
                        )
                    },
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.width(44.dp), contentAlignment = Alignment.Center) {
                    Cover(t.art, width = if (album) 44.dp else 34.dp, height = if (album) 44.dp else 51.dp, radius = KRadius.coverS, shadow = false)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    BasicText(t.name, style = KuraType.newsItalic(17f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    MonoLabel(listOfNotNull(t.format.metaLabel, t.creator).filter { it.isNotEmpty() }.joinToString(" · "), size = 10f)
                }
                Box(
                    Modifier.size(44.dp).clearAndSetSemantics { }.pointerDrag(
                        i,
                        onStart = {
                            dragFrom = i
                            dragDy = 0f
                            haptic(KHapticEvent.Tap)
                        },
                        onDrag = { dy -> dragDy += dy },
                        onEnd = {
                            if (dragFrom >= 0) move(dragFrom, (dragFrom + (dragDy / rowPx).roundToInt()).coerceIn(0, order.size - 1))
                            dragFrom = -1
                            dragDy = 0f
                        },
                    ),
                    contentAlignment = Alignment.Center,
                ) { KIconView(KIcon.Grip, size = 20.dp, color = KColor.text2) }
            }
        }
    }
    SolidButton("Guardar orden", {
        store.reorder(c.id, order.toList())
        dismiss()
    }, Modifier.padding(top = 10.dp))
}

/** A drag on the grip: vertical deltas in px. */
private fun Modifier.pointerDrag(key: Any, onStart: () -> Unit, onDrag: (Float) -> Unit, onEnd: () -> Unit): Modifier =
    pointerInput(key) {
        detectDragGestures(
            onDragStart = { onStart() },
            onDragEnd = onEnd,
            onDragCancel = onEnd,
            onDrag = { change, amount ->
                change.consume()
                onDrag(amount.y)
            },
        )
    }
