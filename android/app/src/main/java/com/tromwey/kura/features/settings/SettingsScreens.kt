package com.tromwey.kura.features.settings

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.tromwey.kura.BuildConfig
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.DeviceSession
import com.tromwey.kura.data.models.FollowListsVisibility
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KHaptic
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.Wordmark
import com.tromwey.kura.designsystem.WordmarkVariant
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.GroupedList
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraSwitch
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.RadioDot
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.RowValue
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.SettingsRow
import com.tromwey.kura.designsystem.components.SheetHeader
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.deleteAccount
import com.tromwey.kura.state.deviceSessions
import com.tromwey.kura.state.loadIdentities
import com.tromwey.kura.state.loadSessions
import com.tromwey.kura.state.revokeSession
import com.tromwey.kura.state.saveLocal
import com.tromwey.kura.state.signOutThisDevice
import com.tromwey.kura.features.sheetWrite
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

// Ajustes (30a), privacidad (K1c), app de música (30b), sesiones activas, borrar cuenta (C3) and
// "¿te avisamos?" — twins of iOS SettingsViews.swift. Inicio de sesión / fusionar cuentas
// (AccountLinkViews.swift) live in AccountLinkScreens.kt.
// The dock hides on all of these (`Route.keepsDock`).

/** The integral privacy notice (public, no session) — the web's `/privacidad`. */
private val privacyNoticeUrl: String get() = BuildConfig.SITE_URL.trimEnd('/') + "/privacidad"

/** A management page: bg, the screen's lowercase title at 124, fixed Volver with the veil under it. */
@Composable
private fun SettingsPage(store: AppStore, title: String, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding()
                .padding(top = KSize.pushedTitleTop, start = 16.dp, end = 16.dp, bottom = 56.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            BasicText(title, Modifier.padding(horizontal = 8.dp).semantics { heading() }, style = KuraType.screenTitle)
            content()
        }
        TopVeil()
        KuraTopBar(onBack = { store.pop() })
    }
}

/** A mono header over its grouped rows ("privacidad", "notificaciones"…). */
@Composable
private fun Section(title: String, footer: String? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MonoLabel(title, Modifier.padding(horizontal = 8.dp).semantics { heading() })
        GroupedList(content = content)
        if (footer != null) BasicText(footer, Modifier.padding(horizontal = 8.dp), style = KuraType.note)
    }
}

// MARK: 30a Ajustes

@Composable
fun SettingsScreen(store: AppStore) {
    val context = LocalContext.current
    val view = LocalView.current
    var haptics by remember { mutableStateOf(KHaptic.enabled) }
    var notificationsAllowed by remember { mutableStateOf(notificationsGranted(context)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { notificationsAllowed = notificationsGranted(context) }
    // The sheet may have just granted it: re-read when it closes.
    LaunchedEffect(store.sheet) { notificationsAllowed = notificationsGranted(context) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { store.loadIdentities() }

    SettingsPage(store, "ajustes") {
        GroupedList {
            ProfileRow(store)
            SettingsRow("Sesiones activas", onClick = { store.push(Route.Sessions) }) {
                RowValue(store.deviceSessions?.size?.toString() ?: "")
            }
        }

        // Correo (always a way in), Google when this deploy offers it, Fusionar otra cuenta.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Section("inicio de sesión") { IdentityRows(store) }
            store.loadError(LoadKey.Identities)?.let { e ->
                RetryStrip("No se pudo cargar cómo entras.", onRetry = { scope.launch { store.loadIdentities() } }, offline = e == KuraApiError.Offline)
            }
        }

        Section("privacidad") {
            SettingsRow("Perfil privado", note = "Nadie más ve tu perfil ni tus colecciones.") {
                KuraSwitch(store.profilePrivate, { store.profilePrivate = it }, label = "Perfil privado")
            }
            SettingsRow("Quién ve lo que te obsesiona", onClick = { store.push(Route.SettingsPrivacy) }) {
                RowValue(if (store.profilePrivate) "Solo yo" else "Todos")
            }
            SettingsRow("Cuentas bloqueadas", onClick = { store.push(Route.BlockedAccounts) }) {
                RowValue(store.blockedAccounts?.let { if (it.isEmpty()) "" else "${it.size}" } ?: "")
            }
            SettingsRow("Aviso de privacidad", onClick = { openUrl(context, privacyNoticeUrl) }) {
                KIconView(KIcon.ExternalLink, size = 15.dp, color = KColor.text2)
            }
        }

        Section("apps") {
            SettingsRow("Abrir música en", onClick = { store.push(Route.MusicApp) }) { RowValue(store.musicApp) }
            SettingsRow("País para dónde ver") {
                BasicText("México", style = KuraType.ui(15f).copy(color = KColor.text2))
            }
        }

        // A device preference, not the account's: it stays on this phone across sign-out.
        Section("este dispositivo") {
            SettingsRow("Vibraciones", note = "Una vibración suave al tocar y al deslizar.") {
                KuraSwitch(haptics, { on ->
                    haptics = on
                    KHaptic.setEnabled(context, on, view)
                }, label = "Vibraciones")
            }
        }

        Section("notificaciones") {
            if (!notificationsAllowed) {
                SettingsRow(
                    "Activar avisos",
                    note = "kura todavía no tiene permiso para avisarte en este teléfono.",
                    onClick = { store.present(SheetRoute.NotificationsAsk) },
                ) { RowValue("") }
            }
            SettingsRow("Nuevos seguidores", note = "Cuando alguien empieza a seguirte.") {
                KuraSwitch(store.notifyFollowers, { store.notifyFollowers = it }, label = "Nuevos seguidores")
            }
            SettingsRow("Estrenos de no puedo esperar", note = "Cuando llega a cines o a streaming.") {
                KuraSwitch(store.notifyReleases, { on ->
                    store.notifyReleases = on
                    if (on && !notificationsGranted(context)) store.present(SheetRoute.NotificationsAsk)
                }, label = "Estrenos de no puedo esperar")
            }
            SettingsRow("Correo del recap mensual", note = "Un correo el día 1 con lo que guardaste, completaste y reseñaste el mes anterior.") {
                KuraSwitch(store.notifyRecap, { store.notifyRecap = it }, label = "Correo del recap mensual")
            }
        }

        Column(
            Modifier.fillMaxWidth().padding(top = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            // This phone only: the token is forgotten here, the other devices stay signed in
            // (Sesiones activas closes the others one by one).
            Column(
                Modifier.fillMaxWidth().heightIn(min = 52.dp)
                    // Revokes this session on the server (`DELETE /me/sessions/{sid}`), on the store's
                    // scope: this page goes away with the session. If the server didn't confirm, the
                    // store's toast says it will retry (the revocation is queued).
                    .kPressable(feel = KPressFeel.Row(), enabled = !store.signingOut, onClickLabel = "Cerrar sesión en este teléfono") {
                        store.launch { store.signOutThisDevice() }
                    }
                    .semantics(mergeDescendants = true) {},
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                BasicText(if (store.signingOut) "Cerrando sesión…" else "Cerrar sesión", style = KuraType.ui(16f, UiWeight.Medium))
                BasicText("En este teléfono.", style = KuraType.ui(13f).copy(color = KColor.text2))
            }
            KuraTextButton("Borrar cuenta", { store.present(SheetRoute.DeleteAccount) }, color = KColor.text2)
            // A small signature → §marca · B.
            Row(
                Modifier.padding(top = 8.dp).clearAndSetSemantics { contentDescription = "kura ${BuildConfig.VERSION_NAME}" },
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Wordmark(variant = WordmarkVariant.B, size = 11f, color = KColor.text3)
                BasicText(BuildConfig.VERSION_NAME, style = KuraType.mono(11f, tracking = 0.08f).copy(color = KColor.text3))
            }
        }
    }
}

/** The account row: seal 52, name, @handle, "Editar perfil ›". */
@Composable
private fun ProfileRow(store: AppStore) {
    val me = store.me
    Row(
        Modifier.fillMaxWidth().background(KColor.s1).heightIn(min = 76.dp)
            .kPressable(feel = KPressFeel.Row(inset = 0.dp), onClickLabel = "Editar perfil") { store.push(Route.EditProfile) }
            .padding(start = 16.dp, end = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Seal(me.initials, me.hexes, size = 52.dp, photo = me.photo)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(me.name, style = KuraType.ui(17f, UiWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
            BasicText("@${me.handle}", style = KuraType.mono(12f).copy(color = KColor.text2), maxLines = 1)
        }
        RowValue("Editar perfil")
    }
}

private fun notificationsGranted(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

private fun openUrl(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (_: android.content.ActivityNotFoundException) {
        // No browser: nothing to open it with.
    }
}

private fun openNotificationSettings(context: Context) {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    try {
        context.startActivity(intent)
    } catch (_: android.content.ActivityNotFoundException) {
        openUrl(context, "package:${context.packageName}")
    }
}

// MARK: K1c Ajustes · privacidad

/**
 * K1c: Perfil privado and "En común contigo", who sees your new collections (Solo yo · Quien tenga
 * el link · Todos) and your seguidores/siguiendo lists (Solo yo · Seguidores mutuos · Todos — the
 * counts are always public), then how a stranger sees you. Choices are radio rows in place.
 */
@Composable
fun SettingsPrivacyScreen(store: AppStore) {
    val haptic = rememberKHaptic()
    SettingsPage(store, "privacidad") {
        GroupedList {
            SettingsRow("Perfil privado", note = "Nadie más ve tu perfil ni tus colecciones.") {
                KuraSwitch(store.profilePrivate, { store.profilePrivate = it }, label = "Perfil privado")
            }
            SettingsRow("Mostrar En común contigo", note = "En tu perfil, a quien te visita.") {
                // The store persists it on change (device-local prefs).
                KuraSwitch(store.showCommon, { store.showCommon = it }, label = "Mostrar En común contigo")
            }
        }
        Section("colecciones nuevas", footer = "Cada colección se puede cambiar en sus opciones.") {
            Privacy.options.forEach { p ->
                ChoiceRow(p.label, p.note, store.defaultPrivacy == p) {
                    if (store.defaultPrivacy != p) {
                        store.defaultPrivacy = p
                        haptic(KHapticEvent.Selection)
                    }
                }
            }
        }
        Section("tus seguidores y seguidos", footer = "Los números se ven siempre; esto decide quién abre las listas.") {
            listOf(FollowListsVisibility.Private, FollowListsVisibility.Mutuals, FollowListsVisibility.Public).forEach { v ->
                ChoiceRow(v.label, v.settingsNote, store.followListsVisibility == v) {
                    if (store.followListsVisibility != v) {
                        store.followListsVisibility = v
                        haptic(KHapticEvent.Selection)
                    }
                }
            }
        }
        GroupedList {
            SettingsRow("Ver tu perfil como alguien que no te sigue", onClick = { store.push(Route.ProfileAsStranger) }) { RowValue("") }
        }
    }
}

private val FollowListsVisibility.settingsNote: String
    get() = when (this) {
        FollowListsVisibility.Private -> "Solo tú las abres."
        FollowListsVisibility.Mutuals -> "Quien sigues y te sigue."
        FollowListsVisibility.Public -> "Cualquiera con cuenta en kura."
    }

@Composable
private fun ChoiceRow(title: String, note: String?, on: Boolean, onClick: () -> Unit) {
    SettingsRow(title, Modifier.semantics { selected = on }, note = note, onClick = onClick) { RadioDot(on) }
}

// MARK: 30b Abrir música en

@Composable
fun MusicAppScreen(store: AppStore) {
    val haptic = rememberKHaptic()
    SettingsPage(store, "abrir música en") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            GroupedList {
                AppStore.services.forEach { (app, _) ->
                    val on = store.musicApp == app
                    SettingsRow(app, Modifier.semantics { selected = on }, onClick = {
                        if (!on) {
                            store.musicApp = app
                            haptic(KHapticEvent.Selection)
                        }
                    }) {
                        Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) {
                            if (on) KIconView(KIcon.CheckBold, size = 15.dp)
                        }
                    }
                }
            }
            BasicText(
                "El botón Abrir de cada álbum usa esta app. Si no la tienes, se abre la web.",
                Modifier.padding(horizontal = 8.dp),
                style = KuraType.note,
            )
        }
    }
}

// MARK: Sesiones activas

/**
 * Every device signed in to the account (`GET /me/sessions`). This one is marked ("este teléfono")
 * and can't be closed here (that's Cerrar sesión in Ajustes); the others each have their own Cerrar
 * sesión, confirmed in a sheet.
 */
@Composable
fun SessionsScreen(store: AppStore) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { store.loadSessions() }
    SettingsPage(store, "sesiones activas") {
        Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
            BasicText(
                "Los dispositivos donde entraste a kura. Si no reconoces uno, cierra su sesión.",
                Modifier.padding(horizontal = 8.dp).padding(top = 0.dp),
                style = KuraType.ui(14f).copy(color = KColor.text2),
            )
            val list = store.deviceSessions
            val error = store.loadError(LoadKey.Sessions)
            when {
                list != null -> {
                    if (error != null) {
                        RetryStrip("No se pudo actualizar la lista.", onRetry = { scope.launch { store.loadSessions() } }, offline = error == KuraApiError.Offline)
                    }
                    GroupedList { list.forEach { SessionRow(store, it) } }
                    if (list.size <= 1) {
                        BasicText("Solo este teléfono tiene tu sesión abierta.", Modifier.padding(horizontal = 8.dp), style = KuraType.note)
                    }
                    BasicText(
                        "Para salir en este teléfono, usa Cerrar sesión en Ajustes.",
                        Modifier.padding(horizontal = 8.dp),
                        style = KuraType.note,
                    )
                }
                error != null -> {
                    val (t, note) = error.loadCopy
                    LoadErrorBlock(t, note, onRetry = { scope.launch { store.loadSessions() } }, modifier = Modifier.padding(horizontal = 8.dp), titleSize = 24f)
                }
                else -> GroupedList {
                    repeat(2) {
                        Column(
                            Modifier.fillMaxWidth().background(KColor.s1).heightIn(min = 72.dp).padding(horizontal = 16.dp)
                                .clearAndSetSemantics { contentDescription = "Cargando" },
                            verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                        ) {
                            Skeleton(Modifier.width(110.dp).heightIn(min = 14.dp, max = 14.dp), radius = 6.dp)
                            Skeleton(Modifier.width(150.dp).heightIn(min = 10.dp, max = 10.dp), radius = 5.dp)
                        }
                    }
                }
            }
        }
    }
}

/** A device of the account: phone or computer (web), its name, "este teléfono" / when it was last seen. */
@Composable
private fun SessionRow(store: AppStore, s: DeviceSession) {
    val web = s.platform.equals("web", ignoreCase = true)
    SettingsRow(
        s.title,
        Modifier.heightIn(min = 72.dp),
        note = sessionDetail(s, store.now),
        leading = { KIconView(if (web) KIcon.Laptop else KIcon.Phone, size = 20.dp, color = KColor.text2) },
    ) {
        if (!s.current) {
            GlassButton(
                "Cerrar sesión",
                onClick = { store.present(SheetRoute.RevokeSession(s)) },
                modifier = Modifier.semantics { contentDescription = "Cerrar sesión en ${s.title}" },
                height = 36.dp,
                fontSize = 14f,
                fill = KColor.glassBg,
            )
        }
    }
}

/** "este teléfono · kura 1.0.0" / "activa hace 2 d · kura 1.0.0". */
private fun sessionDetail(s: DeviceSession, now: Instant): String {
    val parts = ArrayList<String>()
    if (s.current) {
        parts += "este teléfono"
    } else {
        s.lastSeenAt?.let { parts += "activa " + ago(it, now) }
    }
    s.appVersion?.takeIf { it.isNotEmpty() }?.let { parts += "kura $it" }
    return parts.joinToString(" · ")
}

private fun ago(d: Instant, now: Instant): String {
    val h = maxOf(0.0, Duration.between(d, now).toMinutes() / 60.0)
    return when {
        h < 1 -> "hace ${maxOf(1, (h * 60).toInt())} min"
        h < 24 -> "hace ${h.toInt()} h"
        h < 7 * 24 -> "hace ${(h / 24).toInt()} d"
        h < 35 * 24 -> "hace ${(h / (7 * 24)).toInt()} sem"
        else -> {
            val months = maxOf(1, (h / (30 * 24)).toInt())
            if (months == 1) "hace 1 mes" else "hace $months meses"
        }
    }
}

/** "¿cerrar sesión en …?" — the one confirmation before `DELETE /me/sessions/{id}`. */
@Composable
fun KuraSheetScope.RevokeSessionSheet(store: AppStore, sheet: SheetRoute.RevokeSession) {
    // The lock IS "busy": it outlives a remount of this sheet, a local flag wouldn't.
    val busy = store.sheetLocked
    val device = sheet.device
    BasicText("¿cerrar sesión en ${device.title}?", Modifier.padding(horizontal = 10.dp).semantics { heading() }, style = KuraType.news(26f))
    BasicText(
        "Ese dispositivo vuelve a la entrada la próxima vez que abra kura. Tus colecciones no cambian.",
        Modifier.padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 18.dp),
        style = KuraType.ui(15f).copy(color = KColor.text2),
    )
    SolidButton(
        if (busy) "Cerrando…" else "Cerrar sesión",
        honey = false,
        onClick = {
            if (busy) return@SolidButton
            store.sheetWrite { store.revokeSession(device); true }
        },
        enabled = !busy,
    )
    KuraTextButton("Cancelar", { if (!busy) close() }, Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(top = 4.dp))
}

// MARK: C3 Borrar cuenta

/** C3 · the second irreversible action: typing your @ confirms it. */
@Composable
fun KuraSheetScope.DeleteAccountSheet(store: AppStore) {
    var typed by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    val handle = store.me.handle
    val ok = typed.trim().removePrefix("@").lowercase() == handle && handle.isNotEmpty()
    val closeSheet = { close() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    Column(Modifier.padding(horizontal = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText("¿borrar tu cuenta?", Modifier.semantics { heading() }, style = KuraType.news(26f))
        BasicText(
            "Se borran tus colecciones, reseñas y seguidores. No se puede deshacer.",
            Modifier.padding(top = 4.dp, bottom = 12.dp),
            style = KuraType.ui(15f).copy(color = KColor.text2),
        )
        MonoLabel("escribe $handle", Modifier.padding(horizontal = 4.dp).padding(bottom = 4.dp))
        KuraTextField(typed, { typed = it }, placeholder = handle, focusRequester = focus, fill = KColor.glassBg)
    }
    Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SolidButton("Borrar cuenta", honey = false, onClick = {
            if (!ok) return@SolidButton
            store.dismissSheet()
            store.deleteAccount()
        }, enabled = ok)
        GlassButton("Cancelar", { closeSheet() }, height = 52.dp, fontSize = 16f, fullWidth = true, fill = KColor.glassBg)
    }
}

// MARK: ¿te avisamos?

/**
 * kura's own ask before the system prompt (Android 13+ `POST_NOTIFICATIONS`): what it's for, then
 * the system's question. If the answer is no, the way to turn it on is the phone's settings.
 */
@Composable
fun KuraSheetScope.NotificationsAskSheet(store: AppStore) {
    val context = LocalContext.current
    var denied by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) close() else denied = true
    }
    SheetHeader(if (denied) "avisos apagados." else "¿te avisamos?", onClose = { close() })
    BasicText(
        if (denied) {
            "kura no puede avisarte en este teléfono. Si cambias de idea, actívalos en los ajustes del teléfono."
        } else {
            "Cuando alguien empiece a seguirte y cuando salga algo de tu no puedo esperar. Puedes cambiarlo en Ajustes."
        },
        Modifier.padding(start = 10.dp, end = 10.dp, top = 4.dp, bottom = 18.dp),
        style = KuraType.ui(15f).copy(color = KColor.text2),
    )
    if (denied) {
        SolidButton("Abrir ajustes del teléfono", onClick = {
            openNotificationSettings(context)
            close()
        })
    } else {
        SolidButton("Sí, avísame", onClick = {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsGranted(context)) {
                launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                close()
            }
        })
    }
    KuraTextButton("Ahora no", { close() }, Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(top = 4.dp), color = KColor.text2)
}

