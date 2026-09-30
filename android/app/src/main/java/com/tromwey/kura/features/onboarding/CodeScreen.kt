package com.tromwey.kura.features.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.requestCode
import com.tromwey.kura.state.verifyCode
import kotlinx.coroutines.launch

/**
 * 07 · O1c el código: "tu código." + where it went, six digits (entering the sixth sends it), Entrar,
 * "Enviar otro código". Errors inline, in the voice, without a wink (`authText`: "El código no
 * coincide o ya caducó.", "Espera N s antes de pedir otro código." on a 429).
 */
@Composable
fun CodeScreen(store: AppStore) {
    var code by rememberSaveable { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    val requester = remember { FocusRequester() }
    val digits = code.filter(Char::isDigit).take(6)

    val back = {
        store.authError = null
        store.onboardingStep = OnboardingStep.Signup
    }
    BackHandler(onBack = back)

    fun verify() {
        if (digits.length != 6 || store.authBusy) return
        focus.clearFocus()
        scope.launch { store.verifyCode(digits) }
    }

    LaunchedEffect(Unit) { requester.requestFocus() }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 170.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BasicText("tu código.", modifier = Modifier.semantics { heading() }, style = KuraType.news(40f))
            BasicText(
                buildAnnotatedString {
                    withStyle(KuraType.ui(15f).toSpanStyle().copy(color = KColor.text2)) { append("Lo mandamos a ") }
                    withStyle(KuraType.ui(15f).toSpanStyle().copy(color = KColor.text)) { append(store.authEmail) }
                },
                modifier = Modifier.padding(bottom = 20.dp),
                style = KuraType.ui(15f),
            )
            KuraTextField(
                value = code,
                onValueChange = { new ->
                    val d = new.filter(Char::isDigit).take(6)
                    code = d
                    if (d.length == 6 && !store.authBusy) {
                        focus.clearFocus()
                        scope.launch { store.verifyCode(d) }
                    }
                },
                placeholder = "seis dígitos",
                keyboardType = KeyboardType.NumberPassword,
                imeAction = ImeAction.Done,
                focusRequester = requester,
            )
            SolidButton(
                if (store.authBusy) "Entrando…" else "Entrar",
                onClick = ::verify,
                enabled = digits.length == 6 && !store.authBusy,
            )
            InlineError(store.authError)
            KuraTextButton(
                "Enviar otro código",
                onClick = {
                    if (!store.authBusy) {
                        scope.launch {
                            store.requestCode(store.authEmail)
                            code = ""
                        }
                    }
                },
                color = KColor.text2,
            )
        }
        KuraTopBar(onBack = back)
    }
}

/**
 * 13 años: `POST /me/onboarding` (or a social sign-in) answered `403 underage`. Entendido forgets
 * this device's token only (`signOut(global = false)`): never touches other devices.
 */
@Composable
fun UnderageScreen(store: AppStore) {
    Column(
        Modifier.fillMaxSize().navigationBarsPadding().padding(start = 28.dp, end = 28.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(Modifier.weight(1f))
        BasicText(
            "kura es para personas de 13 años o más.",
            modifier = Modifier.semantics { heading() },
            style = KuraType.news(36f),
        )
        BasicText(
            "Todavía no podemos abrirte una cuenta. Vuelve cuando cumplas 13.",
            style = KuraType.ui(15f).copy(color = KColor.text2),
        )
        Spacer(Modifier.weight(1f))
        GlassButton(
            "Entendido",
            onClick = { store.signOut(global = false) },
            height = 52.dp,
            fontSize = 16f,
            fullWidth = true,
        )
    }
}
