package com.tromwey.kura.features.onboarding

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.tromwey.kura.app.art
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.requestCode
import com.tromwey.kura.state.signInWithGoogle
import kotlinx.coroutines.launch

/**
 * 03 · O1a "entra a kura." — ONE door for new and returning people (iOS since f31effe; flujos-v2
 * still draws the old "crea tu cuenta." + "¿Ya tienes cuenta? Entrar"). Google only when
 * `GET /auth/providers` announces a client id (never a button that doesn't work); Apple never exists
 * on Android; correo always. The code goes to O1c.
 */
@Composable
fun SignupScreen(store: AppStore) {
    var email by rememberSaveable { mutableStateOf(store.authEmail) }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    // Volver only when the welcome is part of this entrance (first launch).
    val back: (() -> Unit)? = if (store.welcomeSeen) null else { { store.onboardingStep = OnboardingStep.Welcome } }
    BackHandler(enabled = back != null) { back?.invoke() }
    val google = store.authProviders?.googleClientId
    val social = store.hasSocialSignIn

    fun send() {
        if (store.authBusy) return
        focus.clearFocus()
        scope.launch { if (store.requestCode(email)) store.onboardingStep = OnboardingStep.Code }
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 170.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Only for someone who arrived from a title shared on the web (App Links: fase 2).
            store.pendingSaveTitle?.let { t ->
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Cover(t.art, width = 44.dp, height = 66.dp, radius = KRadius.coverS)
                    BasicText(
                        buildAnnotatedString {
                            append("Para guardar ")
                            withStyle(KuraType.newsItalic(16f).toSpanStyle().copy(color = KColor.text)) {
                                append(t.name)
                            }
                            append(" en una colección.")
                        },
                        style = KuraType.ui(14f).copy(color = KColor.text2, lineHeight = 20.sp),
                    )
                }
            }
            BasicText(
                "entra a kura.",
                modifier = Modifier.padding(top = 14.dp).semantics { heading() },
                style = KuraType.news(40f),
            )
            BasicText("Si es tu primera vez, tu cuenta se crea al entrar.", style = KuraType.ui(15f).copy(color = KColor.text2))
        }

        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding()
                .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (google != null) GoogleButton(store, google)
            if (social) {
                Box(Modifier.fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) { MonoLabel("o con correo") }
            }
            KuraTextField(
                value = email,
                onValueChange = { email = it },
                placeholder = "tu correo",
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Send,
                keyboardActions = KeyboardActions(onSend = { send() }),
            )
            val title = if (store.authBusy) "Enviando…" else "Enviarme un código"
            // Solid while correo is the only way in; glass next to Google's.
            if (social) {
                GlassButton(title, onClick = ::send, height = 52.dp, fontSize = 16f, fullWidth = true, enabled = !store.authBusy)
            } else {
                SolidButton(title, onClick = ::send, enabled = !store.authBusy)
            }
            InlineError(store.authError)
            BasicText(
                "Sin contraseña: te mandamos un código de seis dígitos.",
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                style = KuraType.ui(13f).copy(color = KColor.text2, textAlign = TextAlign.Center),
            )
        }

        KuraTopBar(onBack = back)
    }
}

/**
 * "Continuar con Google" (glass pill 52). Credential Manager + Sign in with Google hands back an ID
 * token whose `aud` is the server client id (`authProviders.google.clientId`); `POST /auth/google`
 * verifies it. Fase 2 on the server side (it checks `aud` = the iOS client today), so locally
 * `auth/providers` has no Google and this never shows.
 */
@Composable
private fun GoogleButton(store: AppStore, clientId: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val busy = store.authBusy
    Row(
        Modifier
            .fillMaxWidth()
            .kPressable(enabled = !busy, onClickLabel = "Continuar con Google") { scope.launch { googleSignIn(context, clientId, store) } }
            .alpha(if (busy) 0.6f else 1f)
            .height(52.dp)
            .background(KColor.glassBg, CircleShape),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicText("G", style = KuraType.ui(15f, UiWeight.SemiBold))
        BasicText("Continuar con Google", style = KuraType.ui(16f, UiWeight.SemiBold))
    }
}

private suspend fun googleSignIn(context: Context, clientId: String, store: AppStore) {
    val option = GetGoogleIdOption.Builder()
        .setServerClientId(clientId)
        .setFilterByAuthorizedAccounts(false)
        .build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val failed = "No se pudo entrar con Google. Inténtalo de nuevo."
    val token = try {
        val credential = CredentialManager.create(context).getCredential(context, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            GoogleIdTokenCredential.createFrom(credential.data).idToken
        } else {
            null
        }
    } catch (_: GetCredentialCancellationException) {
        return // closing Google's sheet is not an error
    } catch (_: NoCredentialException) {
        store.showToast(ToastModel("No hay una cuenta de Google en este teléfono. Entra con tu correo.", ToastModel.Kind.Info))
        return
    } catch (_: GoogleIdTokenParsingException) {
        null
    } catch (_: GetCredentialException) {
        null
    }
    if (token == null) {
        store.showToast(ToastModel(failed, ToastModel.Kind.Info))
        return
    }
    store.signInWithGoogle(token)
}
