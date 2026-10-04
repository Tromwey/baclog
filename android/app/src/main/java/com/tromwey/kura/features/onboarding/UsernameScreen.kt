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
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.siteHost
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.BIRTH_DATE_INVALID
import com.tromwey.kura.state.birthDateOrNull
import com.tromwey.kura.state.owesOnlyBirthDate
import com.tromwey.kura.state.UsernameCheck
import com.tromwey.kura.state.checkUsername
import com.tromwey.kura.state.submitUsername
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 04 · O1b Elige tu usuario: @usuario (checked as you type: "libre" in salvia, "ocupado", "no válido",
 * "mín. 3"), tu nombre, and the birth DATE (día / mes / año) while the account isn't onboarded —
 * `POST /me/onboarding` computes the exact age, keeps the year only and answers `403 underage` under
 * 13 (→ the 13-años screen). An account from before the date was asked (`Me.owesOnlyBirthDate`) sees
 * only that field, under "solo falta tu fecha de nacimiento.". Volver = forget THIS device's token
 * (`signOut(global = false)`): backing out of a sign-up never signs out other devices.
 */
@Composable
fun UsernameScreen(store: AppStore) {
    val account = store.account
    // The field keeps exactly what was typed (with its "@"): rebuilding "@$handle" on every key sets a
    // new value the field didn't produce, and the cursor jumps (same fix as Editar perfil).
    var handleText by rememberSaveable { mutableStateOf("@" + account?.handle.orEmpty()) }
    var name by rememberSaveable { mutableStateOf(account?.name?.ifEmpty { null } ?: store.suggestedName.orEmpty()) }
    var day by rememberSaveable { mutableStateOf("") }
    var month by rememberSaveable { mutableStateOf("") }
    var year by rememberSaveable { mutableStateOf("") }
    var status by remember { mutableStateOf<UsernameCheck?>(null) }
    val scope = rememberCoroutineScope()

    val clean = handleText.lowercase().filter { it.isLetterOrDigit() || it == '.' || it == '_' }
    val birthDate = birthDateOrNull(day, month, year)
    // Said only once the three are in (the year with its four digits): never while still typing.
    val dateError = if (day.isNotEmpty() && month.isNotEmpty() && year.length == 4 && birthDate == null) BIRTH_DATE_INVALID else null
    val needsDate = account?.onboarded != true
    val returning = account?.owesOnlyBirthDate == true
    // Unknown (the check itself failed) is no verdict, not a no: Crear cuenta asks the server, which
    // answers "ya está tomado" if it is.
    val available = status == UsernameCheck.Free || status == UsernameCheck.Unknown
    val canSubmit = if (returning) birthDate != null && !store.authBusy
        else clean.length >= 3 && available && name.isNotBlank() && (!needsDate || birthDate != null) && !store.authBusy

    val back = { if (store.account == null) store.onboardingStep = OnboardingStep.Signup else store.signOut(global = false) }
    BackHandler(onBack = back)

    LaunchedEffect(clean) {
        status = null
        if (returning || clean.length < 3) return@LaunchedEffect
        delay(350)
        status = store.checkUsername(clean)
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()
                .padding(start = 24.dp, end = 24.dp, top = 170.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            BasicText(
                if (returning) "solo falta tu fecha de nacimiento" else "elige tu usuario",
                modifier = Modifier.semantics { heading() },
                style = KuraType.news(40f),
            )
            if (!returning) BasicText("Es tu link: $siteHost/${clean.ifEmpty { "usuario" }}", style = KuraType.ui(14f).copy(color = KColor.text2))
            Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (!returning) {
                    KuraTextField(
                        value = handleText,
                        onValueChange = { handleText = it },
                        placeholder = "@usuario",
                        imeAction = ImeAction.Next,
                    ) { Availability(clean, status) }
                    KuraTextField(value = name, onValueChange = { name = it }, placeholder = "tu nombre", imeAction = ImeAction.Next)
                }
                if (needsDate) {
                    BirthDateFields(
                        day, month, year,
                        onDay = { day = it }, onMonth = { month = it }, onYear = { year = it },
                        error = dateError,
                    )
                }
            }
            // "no válido" is short on purpose (a mono tag in the field): the server's reason goes here.
            (status as? UsernameCheck.Invalid)?.let { invalid ->
                BasicText(
                    invalid.message.ifBlank { "Usa de 3 a 30 letras sin acento, números, punto o guion bajo. Algunos nombres están reservados." },
                    style = KuraType.ui(13f),
                )
            }
            if (!returning) {
                BasicText("Tu nombre se puede cambiar después en Editar perfil.", style = KuraType.ui(13f).copy(color = KColor.text2))
            }
            InlineError(store.authError)
        }

        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding()
                .padding(start = 24.dp, end = 24.dp, bottom = 10.dp),
        ) {
            SolidButton(
                if (store.authBusy) "Creando…" else if (returning) "Continuar" else "Crear cuenta",
                onClick = { scope.launch { store.submitUsername(if (returning) account.handle.orEmpty() else clean, name, birthDate) } },
                enabled = canSubmit,
            )
        }

        KuraTopBar(onBack = back)
    }
}

/**
 * "Tu fecha de nacimiento": three numeric fields — día / mes / año — in the form's own field style
 * (Material's modal `DatePicker` breaks the frame). Digits only; two digits of day or month move on to
 * the next field; each one tells autofill which part of the birth date it is. [error] = the local
 * verdict once the three are in ("Esa fecha no es válida."); the server's own goes in the inline error.
 */
@Composable
private fun BirthDateFields(
    day: String,
    month: String,
    year: String,
    onDay: (String) -> Unit,
    onMonth: (String) -> Unit,
    onYear: (String) -> Unit,
    error: String?,
) {
    val monthFocus = remember { FocusRequester() }
    val yearFocus = remember { FocusRequester() }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BasicText("Tu fecha de nacimiento", Modifier.padding(start = 4.dp, top = 4.dp), style = KuraType.ui(13f).copy(color = KColor.text2))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f)) {
                KuraTextField(
                    value = day,
                    onValueChange = {
                        val d = it.filter(Char::isDigit).take(2)
                        onDay(d)
                        if (d.length == 2 && day.length < 2) runCatching { monthFocus.requestFocus() }
                    },
                    placeholder = "día",
                    modifier = Modifier.semantics { contentType = ContentType.BirthDateDay; contentDescription = "Día de nacimiento" },
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Next,
                )
            }
            Box(Modifier.weight(1f)) {
                KuraTextField(
                    value = month,
                    onValueChange = {
                        val m = it.filter(Char::isDigit).take(2)
                        onMonth(m)
                        if (m.length == 2 && month.length < 2) runCatching { yearFocus.requestFocus() }
                    },
                    placeholder = "mes",
                    modifier = Modifier.semantics { contentType = ContentType.BirthDateMonth; contentDescription = "Mes de nacimiento" },
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Next,
                    focusRequester = monthFocus,
                )
            }
            Box(Modifier.weight(1.4f)) {
                KuraTextField(
                    value = year,
                    onValueChange = { onYear(it.filter(Char::isDigit).take(4)) },
                    placeholder = "año",
                    modifier = Modifier.semantics { contentType = ContentType.BirthDateYear; contentDescription = "Año de nacimiento" },
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Done,
                    focusRequester = yearFocus,
                )
            }
        }
        BasicText(
            "Solo confirma que tienes 13 o más. Guardamos únicamente el año y no se muestra a nadie.",
            Modifier.padding(horizontal = 4.dp),
            style = KuraType.ui(13f).copy(color = KColor.text2),
        )
        InlineError(error)
    }
}

/** The field's trailing tag: "mín. 3" (1–2 chars), then the server's answer. */
@Composable
private fun Availability(clean: String, status: UsernameCheck?) {
    when {
        clean.length in 1..2 -> MonoLabel("mín. 3")
        // Unknown: the check didn't answer — say nothing rather than "libre" or "ocupado".
        clean.length >= 3 && status != null && status != UsernameCheck.Unknown -> Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(end = 6.dp),
        ) {
            val free = status == UsernameCheck.Free
            if (free) GlyphIcon(Glyph.Check, size = 13.dp)
            MonoLabel(
                when (status) {
                    UsernameCheck.Free -> "libre"
                    UsernameCheck.Taken -> "ocupado"
                    else -> "no válido"
                },
                color = if (free) KColor.completed else KColor.text2,
            )
        }
    }
}
