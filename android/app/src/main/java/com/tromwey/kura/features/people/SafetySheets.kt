package com.tromwey.kura.features.people

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.BlockedAccount
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.PublicLinks
import com.tromwey.kura.data.models.ReportReason
import com.tromwey.kura.data.models.ReportTarget
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.GroupedList
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KuraMenu
import com.tromwey.kura.designsystem.components.KuraMenuItem
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.RadioMark
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.SheetHeader
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.block
import com.tromwey.kura.state.followFromProfile
import com.tromwey.kura.state.isBlocked
import com.tromwey.kura.state.isFollowing
import com.tromwey.kura.state.loadBlocks
import com.tromwey.kura.state.report
import com.tromwey.kura.state.toggleMute
import com.tromwey.kura.state.unblock
import kotlinx.coroutines.launch

// Reportar y bloquear (App Review 1.2) and Ajustes › Cuentas bloqueadas — twins of iOS
// `PersonOptionsSheet` (PersonProfileView.swift) and SafetySheets.swift.

// MARK: O10a Opciones de perfil

/**
 * O10a · the person (seal, name, @) with Siguiendo — tapping it unfollows at once with Deshacer (O10b,
 * no confirmation) — then Compartir perfil, Copiar link, Silenciar en el feed, Bloquear (its own
 * sheet) and Reportar. Someone you blocked: only Desbloquear and Reportar.
 */
@Composable
fun KuraSheetScope.PersonOptionsSheet(store: AppStore, sheet: SheetRoute.PersonOptions) {
    val p = store.person(sheet.handle) ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val blocked = store.isBlocked(p.id)
    val following = store.isFollowing(p.id)
    val closeSheet = { close() }
    Column(Modifier.padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Seal(p.initials, p.hexes, size = 44.dp, photo = p.photo)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                BasicText(p.name, Modifier.semantics { heading() }, style = KuraType.news(20f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                MonoLabel("@${p.handle}")
            }
            if (!blocked && (following || !p.isPrivate)) {
                FollowButton(
                    if (following) FollowState.Following else FollowState.Follow,
                    onClick = {
                        store.followFromProfile(p.id)
                        // Unfollowing leaves the sheet: the Deshacer toast is the confirmation (O10b).
                        if (following) closeSheet()
                    },
                    handle = p.handle,
                    // The options sheet is s2: an s2 button would vanish into it.
                    fill = KColor.glassBg,
                )
            }
        }
        if (blocked) {
            OptionRow(KIcon.Block, "Desbloquear", "Vuelves a ver su actividad y sus reseñas.") {
                closeSheet()
                scope.launch { store.unblock(p.handle, p.handle) }
            }
        } else {
            val link = PublicLinks.profile(p.handle)
            if (link != null) {
                OptionRow(KIcon.Share, "Compartir perfil") { shareLink(context, link, "@${p.handle}") }
                OptionRow(KIcon.Copy, "Copiar link") {
                    if (copyLink(context, link)) store.showToast(ToastModel("Link copiado", ToastModel.Kind.Info))
                    closeSheet()
                }
            }
            val muted = p.id in store.muted
            OptionRow(
                KIcon.Mute,
                if (muted) "Volver a mostrar en el feed" else "Silenciar en el feed",
                "Deja de salir en tu feed sin dejar de seguir. No se le avisa.",
            ) {
                closeSheet()
                store.toggleMute(p.id)
            }
            OptionRow(KIcon.Block, "Bloquear", "Dejan de seguirse y no ven lo que hace el otro.") {
                store.present(SheetRoute.Block(p.id))
            }
        }
        OptionRow(KIcon.Flag, "Reportar") { store.present(SheetRoute.Report(ReportTarget.PersonTarget(p.handle))) }
    }
}

/** A sheet option with its icon in a 40 glass square and an optional note (O10a's rows). */
@Composable
private fun OptionRow(icon: KIcon, title: String, note: String? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp)
            .kPressable(feel = KPressFeel.Row(inset = (-8).dp), onClickLabel = title, onClick = onClick)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).background(KColor.glassBg, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
            KIconView(icon, size = 18.dp)
        }
        Column(Modifier.weight(1f).padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(title, style = KuraType.row)
            if (note != null) BasicText(note, style = KuraType.note)
        }
    }
}

// MARK: Reportar (perfil o reseña)

/**
 * Pick a reason, then Enviar reporte. "Gracias" only arrives after the server's 204
 * (`AppStore.report`); a failure closes the sheet into a Reintentar toast with the same reason.
 * The sheet is locked while it sends.
 */
@Composable
fun KuraSheetScope.ReportSheet(store: AppStore, sheet: SheetRoute.Report) {
    val target = sheet.target
    val scope = rememberCoroutineScope()
    val haptic = rememberKHaptic()
    var reason by remember { mutableStateOf<String?>(null) }
    var details by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val handle = when (target) {
        is ReportTarget.PersonTarget -> target.handle
        is ReportTarget.ReviewTarget -> target.authorHandle
    }
    val reasons = when (target) {
        is ReportTarget.PersonTarget -> ReportReason.profile
        // Albums have no spoiler switch to forget (same rule as the web's review sheet).
        is ReportTarget.ReviewTarget -> {
            val album = store.title(target.titleId)?.format == MediaFormat.Album
            ReportReason.review.filter { !(album && it.id == "unmarked_spoiler") }
        }
    }
    val takesDetails = target is ReportTarget.PersonTarget && reason != null

    SheetHeader(if (target.isReview) "¿qué pasa con esta reseña?" else "¿qué pasa con @$handle?", onClose = { if (!sending) close() })
    Column(Modifier.padding(horizontal = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText(
            if (target.isReview) "La revisa el equipo de kura. @$handle no se entera de que la reportaste."
            else "Lo revisa el equipo de kura. @$handle no se entera de que lo reportaste.",
            Modifier.padding(bottom = 8.dp),
            style = KuraType.ui(14f).copy(color = KColor.text2),
        )
        Column(Modifier.fillMaxWidth().heightIn(max = 380.dp).verticalScroll(rememberScrollState())) {
            reasons.forEach { r ->
                val on = reason == r.id
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 52.dp)
                        .kPressable(feel = KPressFeel.Row(inset = (-8).dp), enabled = !sending, onClickLabel = r.label) {
                            reason = r.id
                            haptic(KHapticEvent.Selection)
                        }
                        .semantics(mergeDescendants = true) { selected = on },
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BasicText(r.label, Modifier.weight(1f), style = KuraType.row)
                    RadioMark(on)
                }
            }
        }
        if (takesDetails) {
            // The server's limit (500, `ReportReason.DETAILS_LIMIT`), not a review's 280.
            KuraTextField(
                details,
                { details = it },
                placeholder = "Opcional",
                modifier = Modifier.padding(top = 6.dp),
                imeAction = ImeAction.Default,
                label = "Algo más que debamos saber",
                fill = KColor.glassBg,
                singleLine = false,
                minLines = 3,
                maxLength = ReportReason.DETAILS_LIMIT,
                prose = true,
            )
        }
    }
    SolidButton(
        if (sending) "Enviando…" else "Enviar reporte",
        onClick = {
            val chosen = reason ?: return@SolidButton
            if (sending) return@SolidButton
            sending = true
            store.sheetLocked = true
            val note = details.trim()
            val out = if (takesDetails && note.isNotEmpty()) note else null
            scope.launch {
                store.report(target, chosen, out)
                sending = false
                store.sheetLocked = false
                // Success says "Gracias"; a failure already left a Reintentar toast with this reason.
                store.dismissSheet()
            }
        },
        modifier = Modifier.padding(top = 12.dp).semantics { if (reason == null) contentDescription = "Enviar reporte. Elige una razón primero" },
        enabled = reason != null && !sending,
    )
}

// MARK: Bloquear

/** "¿bloquear a @…?" — what blocking does, then `PUT /me/blocks/{handle}` (the sheet waits for it). */
@Composable
fun KuraSheetScope.BlockSheet(store: AppStore, sheet: SheetRoute.Block) {
    val handle = sheet.handle
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    BasicText(
        "¿bloquear a @$handle?",
        Modifier.padding(horizontal = 10.dp).semantics { heading() },
        style = KuraType.news(26f),
    )
    Column(
        Modifier.padding(start = 10.dp, end = 10.dp, top = 16.dp, bottom = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Point({ GlyphIcon(Glyph.Users, size = 16.dp, color = KColor.text2) }, "Dejan de seguirse, en los dos sentidos.")
        Point({ KIconView(KIcon.Block, size = 16.dp, color = KColor.text2) }, "No verás su actividad ni sus reseñas, y @$handle no verá las tuyas.")
        Point({ KIconView(KIcon.Bell, size = 16.dp, color = KColor.text2) }, "No se le avisa. Puedes desbloquear en su perfil o en Ajustes › Cuentas bloqueadas.")
    }
    SolidButton(
        if (busy) "Bloqueando…" else "Bloquear",
        onClick = {
            if (busy) return@SolidButton
            busy = true
            store.sheetLocked = true
            scope.launch {
                store.block(handle)
                busy = false
                store.sheetLocked = false
                store.dismissSheet()
            }
        },
        enabled = !busy,
    )
    KuraTextButton("Cancelar", { if (!busy) close() }, Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(top = 4.dp))
}

@Composable
private fun Point(icon: @Composable () -> Unit, text: String) {
    Row(Modifier.semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.width(22.dp).padding(top = 2.dp).clearAndSetSemantics { }, contentAlignment = Alignment.TopCenter) { icon() }
        BasicText(text, style = KuraType.ui(15f).copy(lineHeight = KuraType.ui(15f).fontSize * 1.35f))
    }
}

// MARK: ⋯ de una reseña ajena

/** iOS `ReviewMenu.applies`: only someone else's review with a known author gets the ⋯. */
fun reviewMenuApplies(review: Review, meId: String): Boolean = review.authorId.isNotEmpty() && review.authorId != meId

/**
 * "…" on someone else's review (iOS `ReviewMenu`): Reportar reseña (until reported) · Bloquear a @x,
 * in a [KuraMenu] anchored to the chip — it never covers the text it's about and neither row is red.
 * [expanded] is hoisted so a long press on the card can open the same menu.
 */
@Composable
fun ReviewMenu(
    store: AppStore,
    review: Review,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    chip: Dp = 44.dp,
) {
    val items = buildList {
        if (review.id !in store.reportedReviews) {
            add(KuraMenuItem("Reportar reseña", KIcon.Flag, destructive = true) {
                store.present(SheetRoute.Report(ReportTarget.ReviewTarget(review.id, review.authorId, review.titleId)))
            })
        }
        add(KuraMenuItem("Bloquear a @${review.authorId}", KIcon.Block, destructive = true) {
            store.present(SheetRoute.Block(review.authorId))
        })
    }
    Box(modifier) {
        IconChip44(
            KIcon.More,
            "Opciones de la reseña de @${review.authorId}",
            { onExpandedChange(true) },
            size = chip,
            iconSize = 16.dp,
            fill = Color.Transparent,
            iconColor = KColor.text2,
        )
        KuraMenu(expanded = expanded, onDismiss = { onExpandedChange(false) }, items = items)
    }
}

// MARK: Ajustes › Cuentas bloqueadas

/** `GET /me/blocks` on every visit; Desbloquear goes by id (survives a handle change or a now-private account). */
@Composable
fun BlockedAccountsScreen(store: AppStore) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { store.loadBlocks() }
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding()
                .padding(top = KSize.pushedTitleTop, start = 16.dp, end = 16.dp, bottom = 56.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Column(Modifier.padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                BasicText("cuentas bloqueadas", Modifier.semantics { heading() }, style = KuraType.screenTitle)
                BasicText(
                    "No ves su actividad ni sus reseñas, y esas cuentas no ven las tuyas. No se les avisa.",
                    style = KuraType.ui(14f).copy(color = KColor.text2),
                )
            }
            val list = store.blockedAccounts
            val error = store.loadError(LoadKey.Blocks)
            when {
                list != null -> {
                    if (error != null) {
                        RetryStrip("No se pudo actualizar la lista.", onRetry = { scope.launch { store.loadBlocks() } }, offline = error == KuraApiError.Offline)
                    }
                    if (list.isEmpty()) {
                        Column(Modifier.padding(horizontal = 8.dp).padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            BasicText("No has bloqueado a nadie.", style = KuraType.news(22f))
                            BasicText("Para bloquear a alguien, abre su perfil › Opciones.", style = KuraType.ui(14f).copy(color = KColor.text2))
                        }
                    } else {
                        GroupedList { list.forEach { BlockedRow(store, it) } }
                    }
                }
                error != null -> {
                    val (t, note) = error.loadCopy
                    LoadErrorBlock(t, note, onRetry = { scope.launch { store.loadBlocks() } }, modifier = Modifier.padding(horizontal = 8.dp), titleSize = 24f)
                }
                else -> GroupedList {
                    repeat(2) {
                        Row(
                            Modifier.fillMaxWidth().background(KColor.s1).heightIn(min = 72.dp).padding(horizontal = 16.dp)
                                .clearAndSetSemantics { contentDescription = "Cargando" },
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Skeleton(Modifier.size(44.dp), radius = 999.dp)
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Skeleton(Modifier.width(130.dp).heightIn(min = 14.dp, max = 14.dp), radius = 6.dp)
                                Skeleton(Modifier.width(90.dp).heightIn(min = 10.dp, max = 10.dp), radius = 5.dp)
                            }
                        }
                    }
                }
            }
        }
        TopVeil()
        KuraTopBar(onBack = { store.pop() })
    }
}

@Composable
private fun BlockedRow(store: AppStore, a: BlockedAccount) {
    val scope = rememberCoroutineScope()
    var working by remember(a.id) { mutableStateOf(false) }
    val who = a.handle?.let { "@$it" } ?: a.name
    Row(
        Modifier.fillMaxWidth().background(KColor.s1).heightIn(min = 72.dp).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val person = a.person
        Seal(person.initials, person.hexes, size = 44.dp, photo = person.photo)
        Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(a.name, style = KuraType.ui(16f, UiWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
            BasicText(a.handle?.let { "@$it" } ?: "ya no es público", style = KuraType.mono(11f).copy(color = KColor.text2), maxLines = 1)
        }
        GlassButton(
            if (working) "…" else "Desbloquear",
            onClick = {
                if (working) return@GlassButton
                working = true
                scope.launch {
                    store.unblock(a.id, a.handle)
                    working = false
                }
            },
            modifier = Modifier.semantics { contentDescription = if (working) "Desbloqueando" else "Desbloquear a $who" },
            height = 36.dp,
            fontSize = 14f,
            fill = KColor.glassBg,
            enabled = !working,
        )
    }
}
