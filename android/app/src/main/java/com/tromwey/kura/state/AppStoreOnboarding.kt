package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.TitleRef
import com.tromwey.kura.data.models.UsernameStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.DateTimeException
import java.time.LocalDate

// Onboarding (O1b · 32a · 32b): username, picks and the people to follow — twin of
// `AppStore+Onboarding.swift`.

/** Where a fresh session goes: no handle or not onboarded → O1b (false); else the tabs (true). */
fun AppStore.route(m: Me): Boolean {
    if (m.handle == null || !m.onboarded) {
        onboardingStep = OnboardingStep.Username
        phase = AppPhase.Onboarding
        return false
    }
    return true
}

const val ONBOARDING_REQUIRED_NOTE = "Termina tu registro para continuar."

/**
 * THE one place a `403 onboarding_required` is handled (`PATCH /me`, follow, review, report, parties):
 * says it (the server's words, or [note]), reads `GET /me` again and goes through `route(me)` — an
 * account without its name or its year lands on O1b. True = it was that error and it's taken care of:
 * the caller has already reverted and shows nothing else (never a Reintentar, never `pendingRetries`).
 */
internal fun AppStore.onboardingRequired(e: KuraApiError, note: String? = null): Boolean {
    if (e !is KuraApiError.Forbidden || !e.needsOnboarding) return false
    showToast(ToastModel(note ?: e.note.ifEmpty { ONBOARDING_REQUIRED_NOTE }, ToastModel.Kind.Info))
    if (onboardingRecheck?.isActive == true) return true
    val session = s
    onboardingRecheck = scope.launch {
        try {
            val m = api.me()
            if (s !== session) return@launch
            applyMe(m)
            if (m.handle == null || !m.onboarded) dismissSheet()
            route(m)
        } catch (err: Exception) {
            if (err is CancellationException) throw err
            if (s === session) noteError(err)
        }
    }
    return true
}

/** The age gate's copy, the same on web and iOS (and what the server answers in `fields.birthDate`). */
const val BIRTH_DATE_INVALID = "Esa fecha no es válida."
const val BIRTH_DATE_MISSING = "Escribe tu fecha de nacimiento."

/**
 * Día / mes / año as typed → the wire's `"YYYY-MM-DD"`, or null when it isn't a date the server takes:
 * a real calendar day (no 31 de abril, 29 de febrero only in leap years), year 1900 or later with its
 * four digits, and not after [today]. The server computes the exact age (in UTC) and keeps the year only.
 */
fun birthDateOrNull(day: String, month: String, year: String, today: LocalDate = LocalDate.now()): String? {
    if (year.length != 4 || day.length !in 1..2 || month.length !in 1..2) return null
    val d = day.toIntOrNull() ?: return null
    val m = month.toIntOrNull() ?: return null
    val y = year.toIntOrNull() ?: return null
    if (y < 1900) return null
    val date = try {
        LocalDate.of(y, m, d)
    } catch (_: DateTimeException) {
        return null
    }
    return if (date.isAfter(today)) null else date.toString()
}

/** An account from before the date was asked: it has its @ and its name, and owes only the date. */
val Me.owesOnlyBirthDate: Boolean get() = !onboarded && handle != null && name.isNotBlank()

/** O1b · `PUT /me/username` + `POST /me/onboarding` (403 underage → 13 años). [birthDate] = `"YYYY-MM-DD"`
 *  ([birthDateOrNull]). */
suspend fun AppStore.submitUsername(handle: String, name: String, birthDate: String?): Boolean {
    authBusy = true
    authError = null
    // Bound to the session that sent it: after Volver a late answer must not write the abandoned account.
    val session = s
    try {
        var m = account
        // An account from before the date was asked (it has its name, not its birth year): it only owes
        // the date — its name goes as it wrote it, and it has already been through "elige 3".
        val returning = account?.onboarded != true && account?.name?.isNotBlank() == true
        if (account?.handle != handle) {
            m = api.claimUsername(handle)
            check(session)
            applyMe(m)
        }
        val fresh = m?.onboarded != true
        if (fresh) {
            if (birthDate == null) {
                authError = BIRTH_DATE_MISSING
                return false
            }
            m = api.completeOnboarding(if (returning) name.trim() else name.trim().lowercase(), birthDate)
            check(session)
            applyMe(m)
            if (returning) {
                enterMain()
                return true
            }
            if (invitePending) {
                // A party link brought this account here: "elige 3" and the people are optional
                // (fiesta-contract §3) — straight to the party (`openPendingInvite` joins it).
                partyJustOnboarded = true
                enterMain()
                return true
            }
            onboardingStep = OnboardingStep.Pick
            scope.launch { loadOnboardingGrid() }
        } else {
            enterMain()
        }
        return true
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return false
        val e = noteError(err) ?: return false
        when {
            e is KuraApiError.Forbidden && e.code == "underage" -> {
                onboardingStep = OnboardingStep.Underage
            }
            e is KuraApiError.Conflict -> authError = "Ese usuario ya está tomado."
            e is KuraApiError.Invalid -> authError = e.fields["username"] ?: e.fields["name"] ?: e.fields["birthDate"]
                ?: e.message.ifEmpty { "No se creó tu cuenta. Revisa el usuario y la fecha." }
            else -> authError = onboardingText(e, "No se creó tu cuenta. Vuelve a intentarlo.")
        }
        return false
    } finally {
        authBusy = false
    }
}

/** What `GET /me/username/check` said about a handle — `Unknown` when it couldn't be asked (offline,
 *  5xx, 429…): the screen must NOT read that as free. */
sealed interface UsernameCheck {
    data object Free : UsernameCheck
    data object Taken : UsernameCheck
    data class Invalid(val message: String) : UsernameCheck
    data object Unknown : UsernameCheck
}

/** The server's rule for a handle, in the voice (it answers `invalid` without words). */
const val USERNAME_RULE_TEXT = "Usa de 3 a 30 letras sin acento, números, punto o guion bajo."

suspend fun AppStore.checkUsername(handle: String): UsernameCheck = try {
    when (api.checkUsername(handle)) {
        UsernameStatus.Free -> UsernameCheck.Free
        UsernameStatus.Taken -> UsernameCheck.Taken
        UsernameStatus.Invalid -> UsernameCheck.Invalid(USERNAME_RULE_TEXT)
    }
} catch (e: Exception) {
    if (e is CancellationException) throw e
    when (val err = noteError(e)) {
        is KuraApiError.Invalid -> UsernameCheck.Invalid(err.fields["u"] ?: err.fields["username"] ?: err.message.ifEmpty { USERNAME_RULE_TEXT })
        else -> UsernameCheck.Unknown
    }
}

/** Inline text for a failed onboarding step: the network's words when it's the network, else the
 *  step's own (never the code screen's "El código no coincide"). */
private fun onboardingText(e: KuraApiError, fallback: String): String = when (e) {
    KuraApiError.Offline -> "Sin conexión. Revisa tu red y vuelve a intentarlo."
    is KuraApiError.RateLimited -> "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
    is KuraApiError.Invalid -> e.message.ifEmpty { fallback }
    else -> fallback
}

suspend fun AppStore.loadOnboardingGrid() {
    if (s.onboardingGrid.isNotEmpty()) return
    s.onboardingGridError = null
    val session = s
    try {
        val g = api.onboardingGrid()
        check(session)
        for (t in g) registerPartial(t)
        s.onboardingGrid = g
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        s.onboardingGridError = noteError(err)
    }
}

/** 32a · `POST /me/onboarding/picks` with the three obsessions. */
suspend fun AppStore.submitPicks(): Boolean {
    if (onboardingPicks.size != 3) return false
    authBusy = true
    authError = null
    val session = s
    try {
        val c = api.onboardingPicks(onboardingPicks.map(TitleRef::from))
        check(session)
        registerAll(c.embeddedTitles)
        if (s.collections.none { it.id == c.id }) s.collections = s.collections + applyLocal(c)
        for (id in c.titleIds) {
            ensureUserState(id)
            updateState(id) { it.copy(mark = Mark.Obsessed) }
        }
        c.titleIds.firstOrNull()?.let { first ->
            s.titles[first]?.let { t -> me = me.copy(hexes = t.palette, featuredTitleId = first) }
        }
        onboardingStep = OnboardingStep.People
        loadOnboardingPeople()
        return true
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return false
        authError = noteError(err)?.let { onboardingText(it, "No se guardaron tus 3. Vuelve a intentarlo.") }
        return false
    } finally {
        authBusy = false
    }
}

suspend fun AppStore.loadOnboardingPeople(force: Boolean = false) {
    if (!force && s.onboardingPeopleLoaded) return
    val session = s
    try {
        val list = api.onboardingPeople()
        check(session)
        loaded(LoadKey.OnboardingPeople)
        for (p in list) register(p)
        s.onboardingPeople = list
        s.onboardingPeopleLoaded = true
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        fail(LoadKey.OnboardingPeople, err)
    }
}

fun AppStore.finishOnboarding() = enterMain()
