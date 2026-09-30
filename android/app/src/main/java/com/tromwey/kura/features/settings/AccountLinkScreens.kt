package com.tromwey.kura.features.settings

import android.content.Context
import android.os.SystemClock
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.tromwey.kura.data.api.GoogleNonce
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.MergeSource
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.GroupedList
import com.tromwey.kura.designsystem.components.KuraLoadingIndicator
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.RowValue
import com.tromwey.kura.designsystem.components.SettingsRow
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.GoogleCredential
import com.tromwey.kura.state.LAST_WAY_IN_TEXT
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.canRun
import com.tromwey.kura.state.cancelMerge
import com.tromwey.kura.state.confirmMerge
import com.tromwey.kura.state.connectGoogle
import com.tromwey.kura.state.disconnect
import com.tromwey.kura.state.GOOGLE_SILENT_CANCEL_MS
import com.tromwey.kura.state.googleFailureText
import com.tromwey.kura.state.googleLinkClientId
import com.tromwey.kura.state.identities
import com.tromwey.kura.state.identityBusy
import com.tromwey.kura.state.loadAuthProviders
import com.tromwey.kura.state.loadIdentities
import com.tromwey.kura.state.mergeBusy
import com.tromwey.kura.state.mergeEmail
import com.tromwey.kura.state.mergeError
import com.tromwey.kura.state.mergeProof
import com.tromwey.kura.state.mergeRetryAt
import com.tromwey.kura.state.mergeWaitLabel
import com.tromwey.kura.state.requestMergeCode
import com.tromwey.kura.state.verifyMergeCode
import com.tromwey.kura.features.sheetWrite
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration

// Inicio de sesión · fusionar cuentas — twins of iOS `AccountLinkViews.swift`. Apple never exists on
// Android: no row, no button, nothing that names it (a Apple linked on iOS stays linked; the server
// still lists it, we just don't paint it). Google is painted only when `auth/providers` announces the
// Android client id (never a button that doesn't work).

// MARK: Ajustes › Inicio de sesión

/**
 * The rows of Ajustes › "inicio de sesión": the account email (always a way in, not tappable), Google
 * (only when `GET /me/identities` lists it AND this deploy gives Android a client id — or it's
 * already linked, to disconnect) and Fusionar otra cuenta.
 */
@Composable
internal fun ColumnScope.IdentityRows(store: AppStore) {
    val email = store.identities?.email ?: store.account?.email ?: ""
    SettingsRow("Correo") {
        BasicText(
            email, Modifier.padding(start = 12.dp),
            style = KuraType.ui(15f).copy(color = KColor.text2), maxLines = 1, overflow = TextOverflow.MiddleEllipsis,
        )
    }
    val ids = store.identities
    if (ids != null) {
        ids.providers
            .filter { it.provider == IdentityProvider.Google && (it.linked || store.canRun(it.provider)) }
            .forEach { GoogleRow(store, it.linked) }
    } else if (store.loadError(LoadKey.Identities) == null) {
        Row(
            Modifier.fillMaxWidth().background(KColor.s1).heightIn(min = 60.dp).padding(horizontal = 16.dp)
                .clearAndSetSemantics { contentDescription = "Cargando" },
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Skeleton(Modifier.size(32.dp), radius = 16.dp)
            Skeleton(Modifier.size(90.dp, 14.dp), radius = 6.dp)
        }
    }
    SettingsRow("Fusionar otra cuenta", onClick = { store.push(Route.MergeAccount) }) { RowValue("") }
}

/** Google: Conectar (Credential Manager, then `POST`), or Conectada + Desconectar. */
@Composable
private fun GoogleRow(store: AppStore, linked: Boolean) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val p = IdentityProvider.Google
    SettingsRow(
        p.label,
        Modifier.heightIn(min = 60.dp),
        note = if (linked) "Conectada" else null,
        leading = { ProviderMark() },
    ) {
        when {
            store.identityBusy == p -> KuraLoadingIndicator(Modifier.padding(horizontal = 6.dp), size = 32.dp)
            linked -> GlassButton(
                "Desconectar",
                onClick = { store.present(SheetRoute.UnlinkIdentity(p)) },
                modifier = Modifier.semantics { contentDescription = "Desconectar ${p.label}" },
                height = 36.dp, fontSize = 14f, fill = KColor.glassBg,
            )
            else -> GlassButton(
                "Conectar",
                onClick = { scope.launch { store.connectGoogle { googleCredential(context, store, store.googleLinkClientId) } } },
                modifier = Modifier.semantics { contentDescription = "Conectar ${p.label}" },
                height = 36.dp, fontSize = 14f, fill = KColor.glassBg,
                enabled = store.identityBusy == null && store.canRun(p),
            )
        }
    }
}

/** Google's "G" (the same text G as the entrance's button), in a 32 s2 circle. */
@Composable
private fun ProviderMark() {
    Box(Modifier.size(32.dp).background(KColor.s2, CircleShape).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
        BasicText("G", style = KuraType.ui(14f, UiWeight.SemiBold))
    }
}

/**
 * Credential Manager + Sign in with Google → an ID token whose `aud` is the web client id
 * (`auth/providers.google.androidClientId`), with the nonce scheme of `POST /auth/google`: Google
 * gets `sha256hex(nonce)`, `GoogleNonce` keeps the raw one for `LiveApi.linkGoogle`. Same recipe as
 * the entrance's `SignupScreen` (copied, not shared: onboarding is its own lane).
 */
private suspend fun googleCredential(context: Context, store: AppStore, clientId: String?): GoogleCredential {
    if (clientId == null) return GoogleCredential.Failed
    val nonce = GoogleNonce.make()
    val option = GetGoogleIdOption.Builder()
        .setServerClientId(clientId)
        .setFilterByAuthorizedAccounts(false)
        .setNonce(GoogleNonce.sha256(nonce))
        .build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val started = SystemClock.elapsedRealtime()
    return try {
        val credential = CredentialManager.create(context).getCredential(context, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
            GoogleNonce.remember(nonce, token)
            GoogleCredential.Token(token)
        } else {
            GoogleCredential.Failed
        }
    } catch (e: GetCredentialCancellationException) {
        // A "cancel" before Google's sheet could even rise = no account on this phone (`googleFailureText`).
        val elapsed = SystemClock.elapsedRealtime() - started
        KuraLog.w("Google", "${e.type} en $elapsed ms: ${e.errorMessage}")
        if (elapsed < GOOGLE_SILENT_CANCEL_MS) GoogleCredential.NoAccount else GoogleCredential.Cancelled
    } catch (_: NoCredentialException) {
        GoogleCredential.NoAccount
    } catch (_: GoogleIdTokenParsingException) {
        GoogleCredential.Failed
    } catch (e: GetCredentialException) {
        // The type says why: to the log for us; the user reads the store's words for it (none for a
        // cancel), so the store is told "Cancelled" and adds no second, vaguer toast.
        val elapsed = SystemClock.elapsedRealtime() - started
        KuraLog.w("Google", "${e.type} en $elapsed ms: ${e.errorMessage}")
        store.googleFailureText(e.type, e.errorMessage?.toString(), elapsed)?.let { store.showToast(ToastModel(it, ToastModel.Kind.Info)) }
        GoogleCredential.Cancelled
    }
}

/** "¿desconectar Google?" — the one confirmation before `DELETE /me/identities/{provider}`. */
@Composable
fun KuraSheetScope.UnlinkIdentitySheet(store: AppStore, sheet: SheetRoute.UnlinkIdentity) {
    // The lock IS "busy": it outlives a remount of this sheet, a local flag wouldn't.
    val busy = store.sheetLocked
    val p = sheet.provider
    // Apple is the only real way in (relay email): never reached from Android's rows, but if it is,
    // it explains instead of offering what the server would refuse.
    val lastWayIn = p == IdentityProvider.Apple && store.identities?.appleIsLastWayIn == true
    val email = store.identities?.email ?: store.account?.email ?: ""
    BasicText(
        if (lastWayIn) "apple es tu única entrada." else "¿desconectar ${p.label}?",
        Modifier.padding(horizontal = 10.dp).semantics { heading() },
        style = KuraType.news(26f),
    )
    BasicText(
        when {
            lastWayIn -> LAST_WAY_IN_TEXT
            email.isEmpty() -> "Ya no podrás entrar con ${p.label}. Sigues entrando con tu correo."
            else -> "Ya no podrás entrar con ${p.label}. Sigues entrando con tu correo, $email."
        },
        Modifier.padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 18.dp),
        style = KuraType.ui(15f).copy(color = KColor.text2),
    )
    if (!lastWayIn) {
        SolidButton(
            if (busy) "Desconectando…" else "Desconectar",
            onClick = {
                if (busy) return@SolidButton
                store.sheetWrite { store.disconnect(p); true }
            },
            enabled = !busy,
        )
    }
    KuraTextButton(
        if (lastWayIn) "Entendido" else "Cancelar",
        { if (!busy) close() },
        Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(top = 4.dp),
    )
}

// MARK: Fusionar otra cuenta (elige cómo probar que es tuya)

/** A pushed page of this flow: bg, content from 124, fixed Volver with the veil under it. */
@Composable
private fun MergePage(store: AppStore, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding()
                .padding(top = KSize.pushedTitleTop, start = 16.dp, end = 16.dp, bottom = 56.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
        TopVeil()
        KuraTopBar(onBack = { store.pop() })
    }
}

/** Inline error under a field: text, not red (there is no red in kura), announced politely. */
@Composable
private fun MergeError(text: String?, modifier: Modifier = Modifier) {
    AnimatedVisibility(text != null, modifier, enter = fadeIn(KMotion.fade()), exit = fadeOut(KMotion.fade())) {
        BasicText(
            text.orEmpty(),
            Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
            style = KuraType.ui(13f),
        )
    }
}

/** Ajustes › Fusionar otra cuenta: Google (when this deploy offers it) or the other account's email. */
@Composable
fun MergeAccountScreen(store: AppStore) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    var email by rememberSaveable { mutableStateOf(store.mergeEmail) }
    val google = store.identities?.providers?.any { it.provider == IdentityProvider.Google } == true && store.canRun(IdentityProvider.Google)
    val busy = store.mergeBusy || store.identityBusy != null
    LaunchedEffect(Unit) {
        store.mergeError = null
        if (store.identities == null) store.loadIdentities() else store.loadAuthProviders()
    }

    fun send() {
        if (busy) return
        focus.clearFocus()
        scope.launch { if (store.requestMergeCode(email)) store.push(Route.MergeCode) }
    }

    MergePage(store) {
        Column(Modifier.padding(horizontal = 8.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicText("fusionar otra cuenta", Modifier.semantics { heading() }, style = KuraType.screenTitle)
            BasicText(
                "Si tienes otra cuenta de kura, trae todo lo suyo a esta. La otra desaparece.",
                style = KuraType.ui(15f).copy(color = KColor.text2),
            )
        }
        MonoLabel("prueba que es tuya", Modifier.padding(horizontal = 8.dp))
        AnimatedVisibility(google, enter = fadeIn(KMotion.fade()), exit = fadeOut(KMotion.fade())) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                GoogleWideButton(enabled = !busy, dim = store.identityBusy == IdentityProvider.Google) {
                    focus.clearFocus()
                    scope.launch { store.connectGoogle(fromMerge = true) { googleCredential(context, store, store.googleLinkClientId) } }
                }
                Box(Modifier.fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) { MonoLabel("o con su correo") }
            }
        }
        KuraTextField(
            value = email,
            onValueChange = { email = it },
            placeholder = "correo de la otra cuenta",
            keyboardType = KeyboardType.Email,
            imeAction = ImeAction.Send,
            keyboardActions = KeyboardActions(onSend = { send() }),
        )
        val title = if (store.mergeBusy) "Enviando…" else "Enviarme un código"
        // Solid while the email is the only way; tonal next to Google's.
        if (google) {
            GlassButton(title, ::send, height = 52.dp, fontSize = 16f, fullWidth = true, enabled = !busy)
        } else {
            SolidButton(title, ::send, enabled = !busy)
        }
        MergeError(store.mergeError, Modifier.padding(horizontal = 8.dp))
        BasicText(
            "Te mandamos un código de seis dígitos a ese correo.",
            Modifier.fillMaxWidth().padding(top = 2.dp),
            style = KuraType.ui(13f).copy(color = KColor.text2, textAlign = TextAlign.Center),
        )
    }
}

/** "Continuar con Google" (the entrance's pill 52 on glass). */
@Composable
private fun GoogleWideButton(enabled: Boolean, dim: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .kPressable(enabled = enabled, onClickLabel = "Continuar con Google", onClick = onClick)
            .alpha(if (dim || !enabled) 0.6f else 1f)
            .height(52.dp)
            .background(KColor.glassBg, CircleShape),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText("G", style = KuraType.ui(15f, UiWeight.SemiBold))
        BasicText("Continuar con Google", style = KuraType.ui(16f, UiWeight.SemiBold))
    }
}

// MARK: Fusionar › el código (the entrance's code screen, for the other account's email)

@Composable
fun MergeCodeScreen(store: AppStore) {
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    val requester = remember { FocusRequester() }
    var code by rememberSaveable { mutableStateOf("") }
    val digits = code.filter(Char::isDigit).take(6)
    // After a 429 the button waits out `retryAfterSeconds` (up to an hour), counting down.
    var wait by remember { mutableLongStateOf(0L) }
    val retryAt = store.mergeRetryAt
    LaunchedEffect(retryAt) {
        while (true) {
            val left = retryAt?.let { Duration.between(java.time.Instant.now(), it).seconds + 1 } ?: 0
            wait = maxOf(0, left)
            if (wait <= 0) break
            delay(1_000)
        }
    }
    LaunchedEffect(Unit) {
        store.mergeError = null
        runCatching { requester.requestFocus() }
    }

    fun verify() {
        if (digits.length != 6 || store.mergeBusy) return
        focus.clearFocus()
        scope.launch { store.verifyMergeCode(digits) }
    }

    MergePage(store) {
        Column(Modifier.padding(horizontal = 8.dp).padding(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            BasicText("su código.", Modifier.semantics { heading() }, style = KuraType.news(40f))
            BasicText(
                buildAnnotatedString {
                    append("Lo mandamos a ")
                    withStyle(KuraType.ui(15f).toSpanStyle().copy(color = KColor.text)) { append(store.mergeEmail) }
                },
                style = KuraType.ui(15f).copy(color = KColor.text2),
            )
        }
        KuraTextField(
            value = code,
            onValueChange = { new ->
                val d = new.filter(Char::isDigit).take(6)
                code = d
                if (d.length == 6 && !store.mergeBusy) {
                    focus.clearFocus()
                    scope.launch { store.verifyMergeCode(d) }
                }
            },
            placeholder = "seis dígitos",
            keyboardType = KeyboardType.NumberPassword,
            imeAction = ImeAction.Done,
            focusRequester = requester,
            keyboardActions = KeyboardActions(onDone = { verify() }),
        )
        SolidButton(if (store.mergeBusy) "Revisando…" else "Continuar", ::verify, enabled = digits.length == 6 && !store.mergeBusy)
        MergeError(store.mergeError, Modifier.padding(horizontal = 8.dp))
        KuraTextButton(
            if (wait > 0) "Enviar otro código en ${mergeWaitLabel(wait)}" else "Enviar otro código",
            {
                if (wait > 0 || store.mergeBusy) return@KuraTextButton
                scope.launch {
                    store.requestMergeCode(store.mergeEmail)
                    code = ""
                }
            },
            Modifier.align(Alignment.CenterHorizontally),
            color = if (wait > 0) KColor.text3 else KColor.text2,
        )
    }
}

// MARK: Fusionar › confirmar

/** What the other account is, what happens to it, and the one destructive button. */
@Composable
fun MergeConfirmScreen(store: AppStore) {
    val proof = store.mergeProof
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        if (proof == null) {
            Column(Modifier.padding(start = 24.dp, end = 24.dp, top = KSize.pushedTitleTop), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                BasicText("no hay nada que fusionar.", Modifier.semantics { heading() }, style = KuraType.news(28f))
                BasicText("Vuelve a probar que la otra cuenta es tuya.", style = KuraType.ui(15f).copy(color = KColor.text2))
            }
        } else {
            val source = proof.source
            val here = if (store.me.handle.isEmpty()) "esta cuenta" else "@${store.me.handle}"
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(top = KSize.pushedTitleTop, start = 16.dp, end = 16.dp, bottom = 190.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                BasicText(
                    "¿fusionar ${source.display} con esta cuenta?",
                    Modifier.padding(horizontal = 8.dp).semantics { heading() },
                    style = KuraType.news(32f),
                )
                GroupedList {
                    Column(
                        Modifier.fillMaxWidth().background(KColor.s1).padding(16.dp).semantics(mergeDescendants = true) {},
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        BasicText(source.display, style = KuraType.ui(17f, UiWeight.SemiBold))
                        val name = source.name
                        if (source.handle != null && !name.isNullOrEmpty()) {
                            BasicText(name, style = KuraType.ui(14f).copy(color = KColor.text2))
                        }
                        BasicText(
                            source.email, style = KuraType.mono(12f).copy(color = KColor.text2),
                            maxLines = 1, overflow = TextOverflow.MiddleEllipsis,
                        )
                    }
                    Counts(source.counts)
                }
                Column(Modifier.padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Point(KIcon.ArrowRight, "Todo pasa a $here: títulos, colecciones, reseñas, seguidores y a quién sigues.")
                    Point(KIcon.Close, "${source.display} desaparece, y ${source.email} deja de servir para entrar.")
                    Point(KIcon.CheckBold, "Si las dos tienen lo mismo, se queda lo de esta cuenta.")
                    // A private account folding into a public one: its collections stay private, but its
                    // per-title activity and reviews show under this public account.
                    if (!source.isPublic && !store.profilePrivate) {
                        Point(KIcon.Globe, "${source.display} era privada. Sus colecciones siguen privadas, pero sus reseñas, completados y obsesiones se verán en tu perfil público.")
                    }
                    Point(KIcon.Retry, "No se puede deshacer.")
                }
            }
            Column(
                Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                    .background(Brush.verticalGradient(0f to KColor.bg.copy(alpha = 0f), 0.3f to KColor.bg.copy(alpha = 0.94f)))
                    .navigationBarsPadding()
                    .padding(start = 20.dp, end = 20.dp, top = 28.dp, bottom = 10.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                SolidButton(
                    if (store.mergeBusy) "Fusionando…" else "Fusionar cuentas",
                    // The store's scope: leaving this page mid-merge must not cancel it (and strand
                    // the lock `confirmMerge` holds on the sheets).
                    { store.launch { store.confirmMerge() } },
                    enabled = !store.mergeBusy,
                )
                KuraTextButton("Cancelar", { if (!store.mergeBusy) store.cancelMerge() }, Modifier.fillMaxWidth().heightIn(min = 52.dp))
            }
        }
        TopVeil()
        KuraTopBar(onBack = { store.pop() })
    }
}

@Composable
private fun Counts(c: MergeSource.Counts) {
    val items = listOf(
        c.titles to if (c.titles == 1) "título" else "títulos",
        c.collections to if (c.collections == 1) "colección" else "colecciones",
        c.reviews to if (c.reviews == 1) "reseña" else "reseñas",
        c.followers to if (c.followers == 1) "seguidor" else "seguidores",
        c.following to "siguiendo",
    )
    Column(Modifier.fillMaxWidth().background(KColor.s1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        items.chunked(3).forEach { row ->
            Row(Modifier.fillMaxWidth()) {
                row.forEach { (n, label) ->
                    Column(
                        Modifier.weight(1f).semantics(mergeDescendants = true) {},
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        BasicText("$n", style = KuraType.news(24f))
                        MonoLabel(label)
                    }
                }
                repeat(3 - row.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun Point(icon: KIcon, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.width(18.dp).padding(top = 3.dp), contentAlignment = Alignment.Center) {
            KIconView(icon, size = 14.dp, color = KColor.text2)
        }
        BasicText(text, style = KuraType.ui(15f))
    }
}
