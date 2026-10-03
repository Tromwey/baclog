package com.tromwey.kura.features.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tromwey.kura.features.googleCredential
import com.tromwey.kura.state.GoogleCredential
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.requestCode
import com.tromwey.kura.state.signInWithGoogle
import kotlinx.coroutines.launch
import com.tromwey.kura.state.showToast

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
    // The system Back never leaves the app from the door (after a sign-out the welcome was already
    // seen, so there's no Volver chip): it goes back to the welcome.
    BackHandler {
        store.authError = null
        store.onboardingStep = OnboardingStep.Welcome
    }
    // Android's Google = the WEB client id as `serverClientId` (`google.androidClientId`); the iOS
    // `clientId` means nothing here. null → no button (never a button that doesn't work).
    val google = store.authProviders?.googleAndroidClientId
    val social = google != null

    fun send() {
        if (store.authBusy) return
        focus.clearFocus()
        scope.launch { if (store.requestCode(email)) store.onboardingStep = OnboardingStep.Code }
    }

    // With the keyboard up a phone this size has no room for the header AND the whole bottom block:
    // the header slides up and the Google row and the note step aside until the keyboard goes.
    @OptIn(ExperimentalLayoutApi::class)
    val imeUp = WindowInsets.isImeVisible
    val headerTop by animateDpAsState(if (imeUp) 72.dp else 170.dp, label = "signupHeaderTop")

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = headerTop),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
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
            AnimatedVisibility(visible = social && !imeUp, enter = fadeIn(), exit = fadeOut()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (google != null) GoogleButton(store, google)
                    Box(Modifier.fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) { MonoLabel("o con correo") }
                }
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
            AnimatedVisibility(visible = !imeUp, enter = fadeIn(), exit = fadeOut()) {
                BasicText(
                    "Sin contraseña: te enviamos un código de seis dígitos.",
                    modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                    style = KuraType.ui(13f).copy(color = KColor.text2, textAlign = TextAlign.Center),
                )
            }
        }

        KuraTopBar(onBack = back)
    }
}

/**
 * "Continuar con Google" (tonal, 52): the shared Credential Manager recipe (`features/GoogleSignIn.kt`)
 * hands back an ID token and `POST /auth/google` verifies it.
 */
@Composable
private fun GoogleButton(store: AppStore, clientId: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    GlassButton(
        "Continuar con Google",
        onClick = {
            scope.launch {
                when (val c = googleCredential(context, store, clientId)) {
                    is GoogleCredential.Token -> store.signInWithGoogle(c.idToken)
                    GoogleCredential.NoAccount ->
                        store.showToast(ToastModel("No hay una cuenta de Google en este teléfono. Entra con tu correo.", ToastModel.Kind.Info))
                    GoogleCredential.Failed ->
                        store.showToast(ToastModel("No se pudo entrar con Google. Vuelve a intentarlo.", ToastModel.Kind.Info))
                    // They closed Google's sheet, or the recipe already said why.
                    GoogleCredential.Cancelled -> Unit
                }
            }
        },
        height = 52.dp,
        fontSize = 16f,
        fullWidth = true,
        fill = KColor.glassBg,
        enabled = !store.authBusy,
    )
}
