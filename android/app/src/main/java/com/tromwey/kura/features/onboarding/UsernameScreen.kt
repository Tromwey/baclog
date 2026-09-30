package com.tromwey.kura.features.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.siteHost
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.UsernameStatus
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.checkUsername
import com.tromwey.kura.state.submitUsername
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 04 · O1b Elige tu usuario: @usuario (checked as you type: "libre" in salvia, "ocupado", "no válido",
 * "mín. 3"), tu nombre, and the birth year while the account isn't onboarded — `POST /me/onboarding`
 * answers `403 underage` under 13 (→ the 13-años screen). Volver = forget THIS device's token
 * (`signOut(global = false)`): backing out of a sign-up never signs out other devices.
 */
@Composable
fun UsernameScreen(store: AppStore) {
    val account = store.account
    // The field keeps exactly what was typed (with its "@"): rebuilding "@$handle" on every key sets a
    // new value the field didn't produce, and the cursor jumps (same fix as Editar perfil).
    var handleText by rememberSaveable { mutableStateOf("@" + account?.handle.orEmpty()) }
    var name by rememberSaveable { mutableStateOf(account?.name?.ifEmpty { null } ?: store.suggestedName.orEmpty()) }
    var year by rememberSaveable { mutableStateOf("") }
    var status by remember { mutableStateOf<UsernameStatus?>(null) }
    val scope = rememberCoroutineScope()

    val clean = handleText.lowercase().filter { it.isLetterOrDigit() || it == '.' || it == '_' }
    val birthYear = year.filter(Char::isDigit).toIntOrNull()?.takeIf { it in 1900..2100 }
    val needsYear = account?.onboarded != true
    val canSubmit = clean.length >= 3 && status == UsernameStatus.Free && name.isNotBlank() &&
        (!needsYear || birthYear != null) && !store.authBusy

    val back = { if (store.account == null) store.onboardingStep = OnboardingStep.Signup else store.signOut(global = false) }
    BackHandler(onBack = back)

    LaunchedEffect(clean) {
        status = null
        if (clean.length < 3) return@LaunchedEffect
        delay(350)
        status = store.checkUsername(clean) ?: UsernameStatus.Free
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()
                .padding(start = 24.dp, end = 24.dp, top = 170.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            BasicText("elige tu usuario.", modifier = Modifier.semantics { heading() }, style = KuraType.news(40f))
            BasicText("Es tu link: $siteHost/${clean.ifEmpty { "usuario" }}", style = KuraType.ui(14f).copy(color = KColor.text2))
            Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                KuraTextField(
                    value = handleText,
                    onValueChange = { handleText = it },
                    placeholder = "@usuario",
                    imeAction = ImeAction.Next,
                ) { Availability(clean, status) }
                KuraTextField(value = name, onValueChange = { name = it }, placeholder = "tu nombre", imeAction = ImeAction.Next)
                if (needsYear) {
                    KuraTextField(
                        value = year,
                        onValueChange = { year = it.filter(Char::isDigit).take(4) },
                        placeholder = "año de nacimiento",
                        keyboardType = KeyboardType.Number,
                    )
                }
            }
            // "no válido" is short on purpose (a mono tag in the field): the rule goes here.
            if (status == UsernameStatus.Invalid) {
                BasicText(
                    "Usa de 3 a 30 letras sin acento, números, punto o guion bajo. Algunos nombres están reservados.",
                    style = KuraType.ui(13f),
                )
            }
            BasicText(
                if (needsYear) "Tu nombre se puede cambiar después en Editar perfil. El año solo confirma que tienes 13 o más. No se muestra a nadie."
                else "Tu nombre se puede cambiar después en Editar perfil.",
                style = KuraType.ui(13f).copy(color = KColor.text2),
            )
            InlineError(store.authError)
        }

        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding()
                .padding(start = 24.dp, end = 24.dp, bottom = 10.dp),
        ) {
            SolidButton(
                if (store.authBusy) "Un momento…" else "Crear cuenta",
                onClick = { scope.launch { store.submitUsername(clean, name, birthYear) } },
                enabled = canSubmit,
            )
        }

        KuraTopBar(onBack = back)
    }
}

/** The field's trailing tag: "mín. 3" (1–2 chars), then the server's answer. */
@Composable
private fun Availability(clean: String, status: UsernameStatus?) {
    when {
        clean.length in 1..2 -> MonoLabel("mín. 3")
        clean.length >= 3 && status != null -> Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(end = 6.dp),
        ) {
            val free = status == UsernameStatus.Free
            if (free) GlyphIcon(Glyph.Check, size = 13.dp)
            MonoLabel(
                when (status) {
                    UsernameStatus.Free -> "libre"
                    UsernameStatus.Taken -> "ocupado"
                    UsernameStatus.Invalid -> "no válido"
                },
                color = if (free) KColor.completed else KColor.text2,
            )
        }
    }
}
