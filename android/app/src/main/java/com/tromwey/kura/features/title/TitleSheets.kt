package com.tromwey.kura.features.title

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import com.tromwey.kura.app.shareText
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.mark
import com.tromwey.kura.app.reaction
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.ExternalRef
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FanPickRow
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraReaction
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraSwitch
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.NewCollectionRow
import com.tromwey.kura.designsystem.components.ReactionGroup
import com.tromwey.kura.designsystem.components.SheetDivider
import com.tromwey.kura.designsystem.components.SheetHeader
import com.tromwey.kura.designsystem.components.SheetRow
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.SplitActionButton
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.state.reviewDraft
import com.tromwey.kura.state.setReviewDraft
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.deleteReview
import com.tromwey.kura.state.dismissSheet
import com.tromwey.kura.state.removeFromLibrary
import com.tromwey.kura.state.isReleaseDay
import com.tromwey.kura.state.markDropsReview
import com.tromwey.kura.state.isUnreleased
import com.tromwey.kura.state.publishReview
import com.tromwey.kura.state.setMark
import com.tromwey.kura.state.setMarkConfirmed
import com.tromwey.kura.state.setMembership
import com.tromwey.kura.state.suggestSaving
import kotlinx.coroutines.delay
import com.tromwey.kura.state.showToast
import com.tromwey.kura.state.present

// The ficha's sheets — twin of ios/Kura/Features/Title/TitleSheets.swift. Completar is the DS
// `ReactionGroup` (Material's connected toggle group) where iOS has its three-stop slider.

private const val REVIEW_LIMIT = 280

/** The server unlocks a review only with a reaction (`obsessed || verdict != null`). */
private const val REACTION_NEEDED = "Para reseñar, elige Me gusta o Me obsesiona."

// MARK: 26a · Completar (+ reseña) ────────────────────────────────────────────────────────

/**
 * "¿qué te pareció?": Solo completo / Me gusta / Me obsesiona, the optional review (280, mono
 * counter), "Contiene spoilers" (not on albums: the report reasons don't know spoilers there
 * either), then Publicar (with text) / Guardar. Solo completo can't carry a NEW or edited review
 * (`409 reaction_required`): nothing is sent and the sheet says why. With a review the mark is
 * CONFIRMED first and the review goes out after; if the mark fails the text stays here.
 */
@Composable
fun KuraSheetScope.CompleteSheet(store: AppStore, sheet: SheetRoute.Complete) {
    val dismiss: () -> Unit = this::close
    val t = store.title(sheet.titleId) ?: return
    val mine = store.myReview(t.id)
    var reaction by rememberSaveable { mutableStateOf((store.mark(t.id) ?: Mark.Completed).reaction) }
    // A draft typed earlier and not published (it survives closing the sheet and a process death).
    var text by rememberSaveable { mutableStateOf(store.reviewDraft(t.id) ?: mine?.text.orEmpty()) }
    var spoiler by rememberSaveable { mutableStateOf(mine?.spoiler ?: false) }
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    val focus = remember { FocusRequester() }
    val haptic = rememberKHaptic()
    val album = t.format == MediaFormat.Album

    LaunchedEffect(Unit) {
        if (sheet.focusReview) {
            delay(350) // after the sheet has risen
            runCatching { focus.requestFocus() }
        }
    }

    val trimmed = text.trim()
    val changed = mine?.let { trimmed != it.text || spoiler != it.spoiler } ?: trimmed.isNotEmpty()
    val blocked = reaction == KuraReaction.Completed && trimmed.isNotEmpty() && changed

    // No imePadding here: KuraSheet already lifts its content over the keyboard.
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SheetHeader("¿qué te pareció?", onClose = { if (!saving) dismiss() })
        BasicText(
            t.name,
            Modifier.padding(horizontal = 10.dp).padding(bottom = 14.dp),
            style = KuraType.newsItalic(18f).copy(color = KColor.text2),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        ReactionGroup(
            reaction,
            onSelect = {
                reaction = it
                saveError = null
                haptic(if (it == KuraReaction.Obsessed) KHapticEvent.Firm else KHapticEvent.Tap)
            },
            modifier = Modifier.padding(horizontal = 4.dp),
            // The compact sheet is s2: an s2 group would vanish into it.
            containerColor = KColor.glassBg,
        )

        KuraTextField(
            value = text,
            onValueChange = {
                text = it
                store.setReviewDraft(t.id, it)
                saveError = null
            },
            placeholder = "Escribe tu reseña (opcional)",
            modifier = Modifier.padding(horizontal = 4.dp).padding(top = 14.dp).heightIn(max = 180.dp)
                .semantics { contentDescription = "Tu reseña, opcional, hasta $REVIEW_LIMIT caracteres" },
            imeAction = ImeAction.Default,
            focusRequester = focus,
            fill = KColor.glassBg,
            singleLine = false,
            minLines = 3,
            maxLength = REVIEW_LIMIT,
            prose = true,
        )

        if (!album) {
            Row(
                Modifier.fillMaxWidth().padding(top = 6.dp)
                    .kPressable(KPressFeel.Row(0.dp), role = null, onClickLabel = if (spoiler) "Quitar" else "Marcar") { spoiler = !spoiler }
                    .heightIn(min = 52.dp).padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicText("Contiene spoilers", Modifier.weight(1f).clearAndSetSemantics { }, style = KuraType.row)
                KuraSwitch(spoiler, { spoiler = it }, label = "Contiene spoilers")
            }
        }

        val note = if (blocked) REACTION_NEEDED else saveError
        AnimatedVisibility(note != null) {
            BasicText(
                note.orEmpty(),
                Modifier.padding(horizontal = 8.dp).padding(top = 8.dp),
                style = KuraType.ui(13f).copy(color = if (blocked) KColor.text2 else KColor.text),
            )
        }

        SolidButton(
            title = when {
                saving -> "Guardando…"
                trimmed.isEmpty() -> "Guardar"
                else -> "Publicar"
            },
            onClick = {
                if (blocked) {
                    haptic(KHapticEvent.Warning)
                    return@SolidButton
                }
                saveComplete(store, t, reaction.mark, trimmed, spoiler, sheet,
                    onSaving = { saving = it },
                    onError = { saveError = it },
                    onDone = { dismiss() })
            },
            modifier = Modifier.padding(horizontal = 4.dp).padding(top = 14.dp),
            enabled = !saving,
        )

        if (store.mark(t.id) != null) {
            Box(Modifier.fillMaxWidth().padding(top = 4.dp), contentAlignment = Alignment.Center) {
                KuraTextButton(
                    if (album) "Quitar tu reacción" else "Quitar completado",
                    {
                        // False = it deletes your review: the confirmation took this sheet's place.
                        if (!saving && store.setMark(t.id, null)) dismiss()
                    },
                    color = KColor.text2,
                )
            }
        }
    }
}

/**
 * iOS `CompleteSheet.save`. "La vi en preestreno" (and release day) needs `preview: true`: the server
 * decides by the stored instant, the app by the Mexico City day. No review (or an unchanged one) →
 * fire-and-forget `setMark` (emptying an existing review deletes it, with its own Deshacer). With a
 * review → the mark is awaited first (`setMarkConfirmed`), the sheet locked meanwhile.
 */
private fun saveComplete(
    store: AppStore,
    t: Title,
    choice: Mark,
    review: String,
    spoiler: Boolean,
    sheet: SheetRoute.Complete,
    onSaving: (Boolean) -> Unit,
    onError: (String?) -> Unit,
    onDone: () -> Unit,
) {
    val preview = store.isUnreleased(t) || store.isReleaseDay(t)
    if (review.isEmpty() || choice == Mark.Completed) {
        // False = "Completo" would delete your review: the confirmation took this sheet's place.
        if (!store.setMark(t.id, choice, haptic = true, preview = preview)) return
        if (review.isEmpty() && store.myReview(t.id) != null) store.deleteReview(t.id)
        onDone()
        return
    }
    onSaving(true)
    onError(null)
    store.sheetLocked = true
    // The store's scope, not the sheet's: the write must finish even if the sheet goes away.
    store.launch {
        val failure = store.setMarkConfirmed(t.id, choice, preview)
        onSaving(false)
        store.sheetLocked = false
        if (failure == null) {
            store.publishReview(t.id, review, spoiler)
            if (store.sheet == sheet) onDone()
            store.suggestSaving(t.id)
            return@launch
        }
        val stillOpen = store.sheet == sheet
        when {
            failure == KuraApiError.Unauthorized -> Unit
            failure is KuraApiError.Server && failure.detail == "cancelado" -> Unit
            // An `ext:` result: the store opened "guardar en" instead.
            failure == KuraApiError.NotFound && ExternalRef.parse(t.id) != null -> Unit
            failure == KuraApiError.NotFound ->
                if (stillOpen) onError(AppStore.UNKNOWN_TITLE_NOTE) else store.showToast(ToastModel(AppStore.UNKNOWN_TITLE_NOTE, ToastModel.Kind.Info))
            stillOpen -> onError(failure.toast.let { if (it.endsWith(".") || it.endsWith("!") || it.endsWith("?")) it else "$it." }) // inline error keeps its period; the toast text has none
            else -> store.showToast(ToastModel(
                if (failure == KuraApiError.Offline) "Sin conexión. No se guardó tu reseña." else "No se pudo guardar tu reseña",
                ToastModel.Kind.Info,
            ))
        }
    }
}

// MARK: Tu reseña se borra con la reacción ───────────────────────────────────────────────

/**
 * Before a mark that leaves the title without a reaction (Completo, or none) when you have a review:
 * the server deletes the review with it and nothing brings the text back (`AppStore.setMark`). Same
 * copy as web and iOS. No red: the cream button is "what takes something away".
 */
@Composable
fun KuraSheetScope.DropReviewSheet(store: AppStore, sheet: SheetRoute.DropReview) {
    val dismiss: () -> Unit = this::close
    Column(Modifier.padding(horizontal = 4.dp).padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText("tu reseña se borra con la reacción", Modifier.padding(horizontal = 8.dp).semantics { heading() }, style = KuraType.news(26f))
        BasicText(
            "Si quitas la reacción, tu reseña se borra y no se puede recuperar.",
            Modifier.padding(horizontal = 8.dp).padding(top = 4.dp, bottom = 14.dp),
            style = KuraType.ui(15f).copy(color = KColor.text2, lineHeight = 21.sp),
        )
        SolidButton("Quitar y borrar reseña", honey = false, onClick = {
            store.dismissSheet()
            store.setMark(sheet.titleId, sheet.mark, preview = sheet.preview, confirmed = true)
        })
        KuraTextButton("Conservar", { dismiss() }, Modifier.fillMaxWidth())
    }
}

// MARK: Guardar en ────────────────────────────────────────────────────────────────────────

/**
 * THE one "guardar un título" sheet (frontend.md § "Guardar un título"): the title, Nueva colección,
 * then every collection as a fan row (mini fan 51, name, "N títulos · ya está", multiple choice).
 * The button names the CHANGE ("Listo" · "Guardar en X" · "Quitar de X" · "Guardar cambios").
 */
@Composable
fun KuraSheetScope.SaveToSheet(store: AppStore, sheet: SheetRoute.SaveTo) {
    val dismiss: () -> Unit = this::close
    val t = store.title(sheet.titleId) ?: return
    val before = store.collectionsContaining(t.id).map { it.id }.toSet()
    var selected by rememberSaveable {
        val last = store.lastUsedCollectionId
        mutableStateOf(if (before.isEmpty() && last != null && store.collection(last) != null) setOf(last) else before)
    }
    val haptic = rememberKHaptic()
    LaunchedEffect(Unit) {
        // No collection yet: straight to naming the first one (it takes the title with it).
        if (store.collections.isEmpty()) store.present(SheetRoute.NewCollection(addingTitleId = t.id))
    }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp).padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Cover(t.art, width = 44.dp, radius = KRadius.coverS, shadow = false)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                BasicText(
                    "guardar en",
                    Modifier.semantics { heading() },
                    style = KuraType.sheetTitle,
                )
                BasicText(t.name, style = KuraType.newsItalic(17f).copy(color = KColor.text2), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (store.isUnreleased(t) || t.upcomingSeason != null) {
            Row(
                Modifier.padding(horizontal = 8.dp).padding(bottom = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GlyphIcon(Glyph.Clock, size = 13.dp)
                BasicText("También entra a no puedo esperar, arriba de todo.", style = KuraType.note)
            }
        }
        Column(Modifier.heightIn(max = 340.dp).verticalScroll(rememberScrollState())) {
            NewCollectionRow({ store.present(SheetRoute.NewCollection(addingTitleId = t.id)) })
            store.orderedCollections.forEach { c ->
                val on = c.id in selected
                FanPickRow(
                    name = c.name,
                    covers = store.fan(c).map { it.art },
                    count = c.titleIds.size,
                    on = on,
                    onClick = {
                        selected = if (on) selected - c.id else selected + c.id
                        haptic(KHapticEvent.Selection)
                    },
                    note = if (c.id in before) "ya está" else null,
                )
            }
        }
        SolidButton(
            title = saveLabel(store, selected - before, before - selected, before),
            onClick = {
                store.setMembership(t.id, selected)
                dismiss()
            },
            modifier = Modifier.padding(top = 10.dp),
            enabled = !(selected.isEmpty() && before.isEmpty()),
        )
    }
}

private fun saveLabel(store: AppStore, added: Set<String>, removed: Set<String>, before: Set<String>): String {
    fun name(id: String?) = id?.let { store.collection(it)?.name }
    return when {
        added.isEmpty() && removed.isEmpty() -> if (before.isEmpty()) "Elige una colección" else "Listo"
        removed.isEmpty() && added.size == 1 -> name(added.first())?.let { "Guardar en $it" } ?: "Guardar en 1 colección"
        removed.isEmpty() -> "Guardar en ${added.size} colecciones"
        added.isEmpty() && removed.size == 1 -> name(removed.first())?.let { "Quitar de $it" } ?: "Quitar de 1 colección"
        added.isEmpty() -> "Quitar de ${removed.size} colecciones"
        else -> "Guardar cambios"
    }
}

// MARK: Opciones de la ficha ──────────────────────────────────────────────────────────────

/**
 * "…" of the ficha: Compartir (copy the link ▾ the system sheet; only while your profile is public),
 * Guardar en…, Completar / La vi en preestreno, Reseñar / Editar reseña / Borrar tu reseña, and
 * Quitar de tus colecciones (asks first: it takes your reaction and review with it).
 */
@Composable
fun KuraSheetScope.TitleMoreSheet(store: AppStore, sheet: SheetRoute.TitleMore) {
    val dismiss: () -> Unit = this::close
    val t = store.title(sheet.titleId) ?: return
    val context = LocalContext.current
    val unreleased = store.isUnreleased(t)
    val mark = store.mark(t.id)
    val review = store.myReview(t.id)
    val cols = store.collectionsContaining(t.id)
    var confirmRemove by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Column(Modifier.padding(horizontal = 10.dp).padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            BasicText(t.name, Modifier.semantics { heading() }, style = KuraType.newsItalic(22f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            MonoLabel(listOfNotNull(t.format.metaLabel, t.year?.toString()).joinToString(" · "))
        }

        val link = store.myItemLink(t.id)
        if (link != null) {
            Box(Modifier.padding(horizontal = 8.dp).padding(bottom = 8.dp)) {
                SplitActionButton(
                    label = "Copiar link",
                    onClick = {
                        copyLink(context, link)
                        store.showToast(ToastModel("Link copiado", ToastModel.Kind.Info))
                        dismiss()
                    },
                    menu = listOf("Compartir…" to { shareText(context, link, t.name) }),
                    icon = KIcon.Link,
                )
            }
        } else if (store.profilePrivate) {
            // Same note as a collection's share sheet: the link would 404.
            BasicText(
                AppStore.PRIVATE_PROFILE_SHARE_NOTE,
                Modifier.padding(horizontal = 10.dp).padding(bottom = 8.dp),
                style = KuraType.ui(14f).copy(color = KColor.text2),
            )
        }

        SheetRow(
            if (cols.isEmpty()) "Guardar en…" else "Cambiar colecciones",
            { store.present(SheetRoute.SaveTo(t.id)) },
            icon = KIcon.BookmarkOutline,
        )
        if (unreleased) {
            SheetRow("La vi en preestreno", { store.present(SheetRoute.Complete(t.id, focusReview = false)) }, glyph = Glyph.Clock)
        } else {
            SheetRow(
                if (mark == null) "Completar" else "Cambiar tu reacción",
                { store.present(SheetRoute.Complete(t.id, focusReview = false)) },
                glyph = mark?.reaction?.glyph ?: Glyph.Check,
            )
            SheetRow(
                if (review == null) "Reseñar" else "Editar reseña",
                { store.present(SheetRoute.Complete(t.id, focusReview = true)) },
                glyph = Glyph.Review,
            )
            if (review != null) {
                SheetRow("Borrar tu reseña", {
                    store.deleteReview(t.id)
                    dismiss()
                }, icon = KIcon.Trash)
            }
        }

        if (cols.isNotEmpty()) {
            SheetDivider()
            if (!confirmRemove) {
                SheetRow("Quitar de tus colecciones", { confirmRemove = true }, icon = KIcon.Minus)
            } else {
                Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    BasicText(
                        removeNote(cols.size, mark != null, store.markDropsReview(t.id, null)),
                        style = KuraType.ui(15f).copy(color = KColor.text),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        GlassButton("Quitar", {
                            store.removeFromLibrary(t.id)
                            dismiss()
                        }, icon = KIcon.Minus, fill = KColor.glassBg)
                        KuraTextButton("Cancelar", { confirmRemove = false }, color = KColor.text2)
                    }
                }
            }
        }
    }
}

/**
 * What "Quitar de tus colecciones" (`removeFromLibrary`, `DELETE /me/titles/{id}`) takes with it: every
 * membership, your reaction and your review — the server deletes the review too, so the body says it
 * ("También se borra tu reseña."). The toast's Deshacer is deferred: tapped in time, nothing is deleted.
 */
internal fun removeNote(collections: Int, marked: Boolean, reviewed: Boolean): String {
    val where = if (collections == 1) "Sale de tu colección" else "Sale de tus $collections colecciones"
    val body = if (marked) "$where y se quita tu reacción." else "$where."
    return body + (if (reviewed) " También se borra tu reseña." else "") + " Deshacer lo devuelve todo."
}
