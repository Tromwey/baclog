package com.tromwey.kura.features.party

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.data.api.Change
import com.tromwey.kura.data.models.KCalendar
import com.tromwey.kura.data.models.PartyCopy
import com.tromwey.kura.data.models.PartyInvite
import com.tromwey.kura.data.models.PartySong
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.atOrSomeone
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.HoneyButton
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.SheetDivider
import com.tromwey.kura.designsystem.components.SheetRow
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.deleteParty
import com.tromwey.kura.state.leaveParty
import com.tromwey.kura.state.loadParty
import com.tromwey.kura.state.party
import com.tromwey.kura.state.removeAndBlockPartyGuest
import com.tromwey.kura.state.removePartySong
import com.tromwey.kura.state.revokePartyInvite
import com.tromwey.kura.state.rotatePartyInvite
import com.tromwey.kura.state.unblockPartyGuest
import com.tromwey.kura.state.updateParty
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.format.DateTimeFormatter

// The party's sheets (twin of ios/Kura/Features/Party/PartySheets.swift, design `fiesta-app-v2` ·
// welcome · cap · remove · share · opts · link · edit). The export sheets live in PartyExport.kt.
// Inside `KuraSheet` (12 of side padding already): +8 to land on the design's 20.

private val SheetPad = Modifier.padding(horizontal = 8.dp).padding(top = 8.dp)

/** "ya estás dentro." — or "ya estás dentro, @mau." when the account already existed (`returning`). */
@Composable
fun KuraSheetScope.PartyWelcomeSheet(store: AppStore, sheet: SheetRoute.PartyWelcome) {
    val dismiss: () -> Unit = this::close
    val p = store.party(sheet.id)
    val host = p?.host.atOrSomeone
    val limit = p?.perGuestLimit
    Column(SheetPad) {
        if (p != null && p.songs.isNotEmpty()) FanView(p.songs.take(3).map { it.cover }, 56.dp, Modifier.padding(bottom = 18.dp))
        PartySheetTitle(if (sheet.returning && store.me.handle.isNotEmpty()) "ya estás dentro, @${store.me.handle}." else "ya estás dentro.")
        PartySheetBody(welcomeMessage(host, limit, sheet.returning), Modifier.padding(top = 10.dp))
        if (limit != 0) {
            HoneyButton("Buscar mi primera canción", {
                store.dismissSheet()
                store.push(Route.PartySearch(sheet.id))
            }, Modifier.padding(top = 24.dp), height = 56.dp)
            PartyFlatButton("Ver la colección primero", dismiss, Modifier.padding(top = 4.dp), quiet = true)
        } else {
            HoneyButton("Ver la colección", dismiss, Modifier.padding(top = 24.dp), height = 56.dp)
        }
    }
}

private fun welcomeMessage(host: String, limit: Int?, returning: Boolean): String {
    val put = when (limit) {
        null -> "Pon las canciones que quieras"
        1 -> "Pon tu canción"
        else -> "Pon hasta $limit canciones"
    }
    return when {
        limit == 0 -> "Eres parte de la fiesta de $host. Aquí se escucha la playlist que armó; todos ven quién puso cuál."
        returning -> "Entraste con tu cuenta de kura. $put en la fiesta de $host; todos ven quién puso cuál."
        else -> "Eres parte de la fiesta de $host. $put; todos ven quién puso cuál y las escuchan esa noche."
    }
}

/** "ya pusiste tus 3.": your songs with Quitar, then Listo. Quitar closes and leaves you in the search. */
@Composable
fun KuraSheetScope.PartyCapSheet(store: AppStore, sheet: SheetRoute.PartyCap) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(sheet.id) { store.loadParty(sheet.id) }
    val p = store.party(sheet.id)
    val mine = p?.mySongs.orEmpty()
    val limit = maxOf(1, p?.perGuestLimit ?: mine.size)
    val search = Route.PartySearch(sheet.id)
    Column(SheetPad) {
        PartySheetTitle(if (limit == 1) "ya pusiste tu canción." else "ya pusiste tus $limit.")
        PartySheetBody("Si quieres cambiar una, quítala aquí y busca otra. Las demás siguen en la colección.", Modifier.padding(top = 10.dp))
        Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            mine.forEach { s ->
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    SongCover(s.artworkUrl, s.palette, size = 48.dp, radius = 8.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        BasicText(s.title, style = KuraType.newsItalic(17f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        s.artist?.let { BasicText(it, style = KuraType.ui(13f).copy(color = KColor.text2), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    }
                    GlassButton(if (busy == s.titleId) "Quitando…" else "Quitar", {
                        scope.launch {
                            busy = s.titleId
                            val ok = store.removePartySong(sheet.id, s)
                            busy = null
                            if (!ok) return@launch
                            store.dismissSheet()
                            if (store.path(store.tab).lastOrNull() != search) store.push(search)
                        }
                    }, fontSize = 14f, fill = KColor.glassBg, enabled = busy == null)
                }
            }
        }
        HoneyButton("Listo", {
            store.dismissSheet()
            if (store.path(store.tab).lastOrNull() == search) store.pop()
        }, Modifier.padding(top = 18.dp), height = 56.dp)
    }
}

/** A song's sheet: the song, who put it, Quitar de la colección, and for the host "Quitar y bloquear a @x". */
@Composable
fun KuraSheetScope.PartySongSheet(store: AppStore, sheet: SheetRoute.PartySong) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val s: PartySong? = store.party(sheet.partyId)?.songs?.firstOrNull { it.titleId == sheet.titleId }
    if (s == null) {
        // Gone meanwhile (someone else removed it): nothing left to do here.
        LaunchedEffect(Unit) { store.dismissSheet() }
        Box(Modifier.height(40.dp))
        return
    }
    fun run(op: suspend () -> Boolean) {
        busy = true
        scope.launch {
            val ok = op()
            busy = false
            if (ok) store.dismissSheet()
        }
    }
    Column(SheetPad) {
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            SongCover(s.artworkUrl, s.palette, size = 64.dp, radius = 8.dp)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                BasicText(s.title, style = KuraType.newsItalic(20f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                s.artist?.let { BasicText(it, style = KuraType.ui(14f).copy(color = KColor.text2), maxLines = 1) }
                Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (!s.mine) PartySeal(s.addedBy, 18.dp)
                    BasicText(s.byLong, style = KuraType.ui(12f, UiWeight.Medium).copy(color = KColor.text3))
                }
            }
        }
        Column(Modifier.padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (s.canRemove || s.mine) PartyFlatButton("Quitar de la colección", { run { store.removePartySong(sheet.partyId, s) } }, enabled = !busy)
            val by = s.addedBy
            if (s.canBlockAuthor && by != null) {
                PartyFlatButton("Quitar y bloquear a ${by.at}", { run { store.removeAndBlockPartyGuest(sheet.partyId, s) } }, enabled = !busy)
            }
            PartyFlatButton("Cancelar", dismiss, quiet = true)
        }
        BasicText(
            if (s.canBlockAuthor && s.addedBy != null) "${s.addedBy.atOrSomeone} no recibe aviso. Si lo bloqueas, ya no podrá agregar canciones."
            else "La canción sale de la colección para todos.",
            Modifier.fillMaxWidth().padding(top = 8.dp),
            style = KuraType.ui(12f).copy(color = KColor.text3, textAlign = TextAlign.Center),
        )
    }
}

/** "invita a la fiesta.": the link with Copiar, Compartir link (the system share sheet), Gestionar link. */
@Composable
fun KuraSheetScope.PartyShareSheet(store: AppStore, sheet: SheetRoute.PartyShare) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val haptic = rememberKHaptic()
    var copied by rememberSaveable { mutableStateOf(false) }
    val p = store.party(sheet.id)
    val invite = p?.invite
    val url = invite?.url
    Column(SheetPad) {
        PartySheetTitle("invita a la fiesta.")
        PartySheetBody(shareNote(p?.perGuestLimit), Modifier.padding(top = 10.dp))
        if (invite != null && invite.active && url != null) {
            Row(
                Modifier.padding(top = 18.dp).fillMaxWidth().height(56.dp)
                    .background(KColor.glassBg, RoundedCornerShape(KRadius.field))
                    .padding(start = 16.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicText(invite.display, Modifier.weight(1f), style = KuraType.mono(14f, medium = true), maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
                GlassButton(if (copied) "Copiado" else "Copiar", {
                    copyLink(context, p.name, url)
                    haptic(KHapticEvent.Success)
                    copied = true
                    // Android 13+ confirms a copy itself; a second notice would repeat it.
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) store.showToast(ToastModel("Link copiado", ToastModel.Kind.Info))
                }, height = 40.dp, fontSize = 13f, fill = Color.White.copy(alpha = 0.14f))
            }
            HoneyButton("Compartir link", { shareLink(context, p.name, url) }, Modifier.padding(top = 12.dp), icon = KIcon.Share, height = 56.dp)
            PartyFlatButton("Gestionar link", { store.present(SheetRoute.PartyLink(sheet.id)) }, Modifier.padding(top = 4.dp), quiet = true)
        } else {
            BasicText(
                "El link está desactivado: nadie más puede entrar con él.",
                Modifier.padding(top = 16.dp),
                style = KuraType.ui(14f).copy(color = KColor.text2),
            )
            HoneyButton("Crear link nuevo", { scope.launch { store.rotatePartyInvite(sheet.id) } }, Modifier.padding(top = 18.dp), height = 56.dp)
        }
    }
}

private fun shareNote(l: Int?): String {
    val tail = when (l) {
        null -> "Con cuenta en kura, pone las canciones que quiera."
        0 -> "Es solo para escuchar: nadie más agrega canciones."
        1 -> "Con cuenta en kura, pone 1 canción."
        else -> "Con cuenta en kura, pone hasta $l canciones."
    }
    return "Quien abra el link ve la colección en vivo. $tail"
}

private fun copyLink(context: Context, label: String, url: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText(label, url))
}

private fun shareLink(context: Context, name: String, url: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, name)
        putExtra(Intent.EXTRA_TEXT, "Pon tus canciones en $name: $url")
    }
    context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** Opciones. The host's: Gestionar link · Llevar a otra app · Editar, Bloqueados (when there are), Borrar
 *  fiesta. A guest's: Llevar a otra app · Salir de la fiesta. */
@Composable
fun KuraSheetScope.PartyOptionsSheet(store: AppStore, sheet: SheetRoute.PartyOptions) {
    val dismiss: () -> Unit = this::close
    val p = store.party(sheet.id)
    Column(SheetPad) {
        Row(Modifier.padding(start = 2.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            BasicText(p?.name.orEmpty(), Modifier.weight(1f), style = KuraType.news(24f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            MonoLabel(PartyCopy.songs(p?.songs?.size ?: 0))
        }
        if (p?.isHost == false) {
            SheetRow("Llevar a otra app", { store.present(SheetRoute.PartyExport(sheet.id)) }, icon = KIcon.ArrowRight)
            SheetRow("Salir de la fiesta", { store.present(SheetRoute.PartyLeave(sheet.id)) }, icon = KIcon.Close)
        } else {
            SheetRow("Gestionar link", { store.present(SheetRoute.PartyLink(sheet.id)) }, icon = KIcon.Link) {
                MonoLabel(if (p?.invite?.active == true) "activo" else "desactivado", color = KColor.text3)
            }
            SheetRow("Llevar a otra app", { store.present(SheetRoute.PartyExport(sheet.id)) }, icon = KIcon.ArrowRight)
            SheetRow("Editar", { store.present(SheetRoute.PartyEdit(sheet.id)) }, icon = KIcon.Pencil)
            val n = p?.blockedGuests?.size ?: 0
            if (n > 0) {
                SheetRow("Bloqueados", { store.present(SheetRoute.PartyBlocked(sheet.id)) }, icon = KIcon.Block) {
                    MonoLabel("$n", color = KColor.text3)
                }
            }
            SheetDivider()
            SheetRow("Borrar fiesta", { store.present(SheetRoute.PartyDelete(sheet.id)) }, icon = KIcon.Trash)
        }
    }
}

/** "¿salir de la fiesta?" (a guest, C3): it leaves your collections; your songs stay. */
@Composable
fun KuraSheetScope.PartyLeaveSheet(store: AppStore, sheet: SheetRoute.PartyLeave) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val p = store.party(sheet.id)
    val host = p?.host.atOrSomeone
    val mine = p?.mySongs?.size ?: 0
    val songs = when (mine) {
        0 -> ""
        1 -> " La canción que pusiste se queda."
        else -> " Las $mine canciones que pusiste se quedan."
    }
    Column(SheetPad) {
        PartySheetTitle("¿salir de la fiesta?")
        PartySheetBody("Deja de aparecer en tus colecciones.$songs Para volver, pídele el link a $host.", Modifier.padding(top = 10.dp))
        Column(Modifier.padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PartyFlatButton("Salir de la fiesta", {
                busy = true
                scope.launch { store.leaveParty(sheet.id); busy = false }
            }, enabled = !busy)
            PartyFlatButton("Cancelar", dismiss, quiet = true)
        }
    }
}

private val dayFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", KCalendar.locale)

/** "el link." (design `link` · `link-revoked`). */
@Composable
fun KuraSheetScope.PartyLinkSheet(store: AppStore, sheet: SheetRoute.PartyLink) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val invite = store.party(sheet.id)?.invite
    val active = invite?.active == true
    fun run(op: suspend () -> Unit) {
        busy = true
        scope.launch { op(); busy = false }
    }
    Column(SheetPad) {
        PartySheetTitle("el link.")
        Column(
            Modifier.padding(top = 16.dp).fillMaxWidth()
                .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(KRadius.surface))
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(7.dp).background(if (active) KColor.completed else KColor.text3, CircleShape))
                BasicText(linkStatus(invite), style = KuraType.ui(15f, UiWeight.SemiBold))
            }
            if (invite != null && invite.display.isNotEmpty()) {
                BasicText(
                    if (active) invite.display else "${invite.display} · ya no abre",
                    style = KuraType.mono(12f, medium = true).copy(color = KColor.text2),
                    maxLines = 1,
                    overflow = TextOverflow.MiddleEllipsis,
                )
            }
        }
        BasicText(
            if (active) "Si creas uno nuevo, el anterior deja de funcionar. Quien ya entró sigue como colaborador."
            else "Nadie más puede entrar con este link. Quien ya entró sigue como colaborador; crea uno nuevo para seguir invitando.",
            Modifier.padding(top = 12.dp),
            style = KuraType.ui(14f).copy(color = KColor.text2, lineHeight = 20.sp),
        )
        Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (active) {
                PartyFlatButton("Crear link nuevo", { run { store.rotatePartyInvite(sheet.id) } }, enabled = !busy)
                PartyFlatButton("Desactivar link", { run { store.revokePartyInvite(sheet.id) } }, enabled = !busy)
            } else {
                HoneyButton("Crear link nuevo", { run { store.rotatePartyInvite(sheet.id) } }, height = 56.dp, enabled = !busy)
            }
            PartyFlatButton("Cerrar", dismiss, quiet = true)
        }
    }
}

private fun linkStatus(i: PartyInvite?): String {
    if (i == null || !i.active) return "Desactivado"
    val d = i.createdAt ?: return "Activo"
    return "Activo · creado el " + dayFormat.format(d.atZone(ZoneId.systemDefault())).replace(".", "").lowercase(KCalendar.locale)
}

/** Editar: the name and "Canciones por invitado" (`PATCH /parties/{id}`). Lowering the cap never deletes songs. */
@Composable
fun KuraSheetScope.PartyEditSheet(store: AppStore, sheet: SheetRoute.PartyEdit) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    val p = store.party(sheet.id)
    var name by rememberSaveable { mutableStateOf(p?.name.orEmpty()) }
    var limitIndex by rememberSaveable { mutableStateOf(PartyCopy.limits.indexOf(p?.perGuestLimit).coerceAtLeast(0)) }
    var busy by remember { mutableStateOf(false) }
    val limit = PartyCopy.limits[limitIndex]
    Column(SheetPad) {
        PartySheetTitle("editar fiesta.")
        BasicText("Nombre", Modifier.padding(top = 20.dp), style = KuraType.ui(14f, UiWeight.SemiBold))
        KuraTextField(name, { name = it.take(60) }, "la fiesta de…", Modifier.padding(top = 8.dp), serif = true, fill = KColor.glassBg)
        BasicText("Canciones por invitado", Modifier.padding(top = 22.dp), style = KuraType.ui(14f, UiWeight.SemiBold))
        PartyLimitStepper(limit, { l -> limitIndex = PartyCopy.limits.indexOf(l).coerceAtLeast(0) }, Modifier.padding(top = 8.dp))
        SolidButton("Guardar", {
            val cur = store.party(sheet.id) ?: return@SolidButton
            busy = true
            scope.launch {
                val n = name.trim()
                val ok = store.updateParty(
                    sheet.id,
                    name = if (n == cur.name) null else n,
                    perGuestLimit = if (limit == cur.perGuestLimit) null else Change(limit),
                )
                busy = false
                if (ok) store.dismissSheet()
            }
        }, Modifier.padding(top = 20.dp), height = 56.dp, enabled = !busy && name.isNotBlank())
    }
}

/** Bloqueados: the guests the host removed and blocked, with Desbloquear. */
@Composable
fun KuraSheetScope.PartyBlockedSheet(store: AppStore, sheet: SheetRoute.PartyBlocked) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    val list = store.party(sheet.id)?.blockedGuests.orEmpty()
    Column(SheetPad) {
        PartySheetTitle("bloqueados.")
        PartySheetBody("Siguen viendo la colección y pueden quitar las suyas, pero ya no agregan canciones.", Modifier.padding(top = 10.dp))
        Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            list.forEach { g ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    PartySeal(g.person, 36.dp)
                    BasicText(g.person.atOrSomeone, Modifier.weight(1f), style = KuraType.ui(16f, UiWeight.Medium))
                    GlassButton("Desbloquear", { scope.launch { store.unblockPartyGuest(sheet.id, g.guestRef) } }, fontSize = 14f, fill = KColor.glassBg)
                }
            }
            if (list.isEmpty()) BasicText("Nadie bloqueado.", Modifier.padding(vertical = 12.dp), style = KuraType.ui(15f).copy(color = KColor.text2))
        }
    }
}

/** "¿borrar la fiesta?" — for everyone, songs and who put them; the link stops working. */
@Composable
fun KuraSheetScope.PartyDeleteSheet(store: AppStore, sheet: SheetRoute.PartyDelete) {
    val dismiss: () -> Unit = this::close
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    Column(SheetPad) {
        PartySheetTitle("¿borrar la fiesta?")
        PartySheetBody("Se borra para todos: las canciones y quién puso cuál. El link deja de funcionar.", Modifier.padding(top = 10.dp))
        Column(Modifier.padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PartyFlatButton("Borrar fiesta", {
                busy = true
                scope.launch { store.deleteParty(sheet.id); busy = false }
            }, enabled = !busy)
            PartyFlatButton("Cancelar", dismiss, quiet = true)
        }
    }
}
