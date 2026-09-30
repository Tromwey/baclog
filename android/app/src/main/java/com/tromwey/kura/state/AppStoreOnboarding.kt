package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.TitleRef
import com.tromwey.kura.data.models.UsernameStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

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

/** O1b · `PUT /me/username` + `POST /me/onboarding` (403 underage → 13 años). */
suspend fun AppStore.submitUsername(handle: String, name: String, birthYear: Int?): Boolean {
    authBusy = true
    authError = null
    // Bound to the session that sent it: after Volver a late answer must not write the abandoned account.
    val session = s
    try {
        var m = account
        if (account?.handle != handle) {
            m = api.claimUsername(handle)
            check(session)
            applyMe(m)
        }
        val fresh = m?.onboarded != true
        if (fresh) {
            if (birthYear == null) {
                authError = "Falta tu año de nacimiento."
                return false
            }
            m = api.completeOnboarding(name.trim().lowercase(), birthYear)
            check(session)
            applyMe(m)
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
            e is KuraApiError.Invalid -> authError = e.fields["username"] ?: e.fields["name"] ?: e.fields["birthYear"]
                ?: e.message.ifEmpty { "No se creó tu cuenta. Revisa el usuario y el año." }
            else -> authError = e.authText
        }
        return false
    } finally {
        authBusy = false
    }
}

suspend fun AppStore.checkUsername(handle: String): UsernameStatus? = try {
    api.checkUsername(handle)
} catch (e: Exception) {
    if (e is CancellationException) throw e
    null
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
        authError = noteError(err)?.authText
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
