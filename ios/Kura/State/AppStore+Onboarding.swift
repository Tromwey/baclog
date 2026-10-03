import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Onboarding (O1b · 32a · 32b): username, picks and the people to follow.
extension AppStore {
    /// Where a fresh session goes: no handle, or `onboardingComplete` false (no name OR no birth
    /// year) → O1b; else the tabs. O1b itself has two shapes (`onlyYearMissing`): the whole form
    /// for a new account, "solo falta tu fecha de nacimiento" for an old one that already has its @ and name.
    /// (The picks only run inside a fresh onboarding, right after `POST /me/onboarding`.)
    @discardableResult
    func route(after m: Me) -> Bool {
        if m.handle == nil || !m.onboarded {
            onboardingStep = .username
            withAnimation(KMotion.short) { phase = .onboarding }
            return false
        }
        return true
    }

    /// An account from before the birth year was asked: it has its @ and its name, and the server
    /// still says `onboardingComplete: false`. It is NOT a new account: O1b only asks the year.
    var onlyYearMissing: Bool {
        guard let a = account, !a.onboarded, let h = a.handle, !h.isEmpty else { return false }
        return !a.name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// "Solo falta tu fecha de nacimiento": `POST /me/onboarding` with the name the account already has, AS IT IS
    /// (never re-cased), then straight to the tabs — no @, no "elige 3", no people.
    func submitBirthDate(_ birthDate: String) async -> Bool {
        guard let a = account else { return false }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        let session = s
        do {
            let m = try await api.completeOnboarding(name: a.name, birthDate: birthDate)
            try check(session)
            applyMe(m)
            enterMain()
            return true
        } catch {
            guard s === session else { return false }
            let e = noteError(error)
            if e == .unauthorized || e == .cancelled { return false }
            if case .forbidden(let code) = e, code == "underage" {
                onboardingStep = .underage
                return false
            }
            if case .invalid(let fields, let msg) = e {
                authError = fields["birthDate"] ?? fields["name"] ?? (msg.isEmpty ? "Esa fecha no es válida." : msg)
                return false
            }
            authError = e == .offline ? e.authText : "No se pudo guardar tu fecha de nacimiento. Vuelve a intentarlo."
            return false
        }
    }

    /// O1b · `PUT /me/username` + `POST /me/onboarding` (403 underage → 13 años).
    func submitUsername(handle: String, name: String, birthDate: String?) async -> Bool {
        authBusy = true
        authError = nil
        defer { authBusy = false }
        // Bound to the session that sent it: after Volver (a fresh `SessionData`) a late claim or
        // onboarding answer must not write the abandoned account into the entrance.
        let session = s
        do {
            var m = account
            if account?.handle != handle {
                m = try await api.claimUsername(handle)
                try check(session)
                applyMe(m!)
            }
            let freshOnboarding = !(m?.onboarded ?? false)
            if freshOnboarding {
                guard let birthDate else { authError = "Escribe tu fecha de nacimiento."; return false }
                m = try await api.completeOnboarding(name: name.trimmingCharacters(in: .whitespaces).lowercased(), birthDate: birthDate)
                try check(session)
                applyMe(m!)
                if invitePending {
                    // A party link brought this account here: "elige 3" and the people are
                    // optional (fiesta-contract §3) — straight to the tabs, where the link's
                    // landing waits with "Entrar a la fiesta".
                    partyJustOnboarded = true
                    enterMain()
                    return true
                }
                onboardingStep = .pick
                Task { await loadOnboardingGrid() }
            } else {
                enterMain()
            }
            return true
        } catch {
            guard s === session else { return false }
            let e = noteError(error)
            // The session ended (`sessionExpired` already went to the door and said so): the
            // code's "es incorrecto o ya venció" would be a lie on a fresh entrance.
            if e == .unauthorized { return false }
            if case .forbidden(let code) = e, code == "underage" {
                onboardingStep = .underage
                return false
            }
            if case .conflict = e { authError = "Ese usuario ya está tomado."; return false }
            if case .invalid(let fields, let msg) = e {
                authError = fields["username"] ?? fields["name"] ?? fields["birthDate"] ?? (msg.isEmpty ? "No se creó tu cuenta. Revisa el usuario y la fecha." : msg)
                return false
            }
            authError = e.authText
            return false
        }
    }

    func checkUsername(_ handle: String) async -> UsernameStatus? {
        try? await api.checkUsername(handle)
    }

    func loadOnboardingGrid() async {
        guard onboardingGrid.isEmpty else { return }
        onboardingGridError = nil
        let session = s
        do {
            let g = try await api.onboardingGrid()
            try check(session)
            for t in g { registerPartial(t) }
            onboardingGrid = g
        } catch {
            guard s === session else { return }
            let e = noteError(error)
            if e != .cancelled, e != .unauthorized { onboardingGridError = e }
        }
    }

    /// 32a · `POST /me/onboarding/picks` with the three obsessions.
    func submitPicks() async -> Bool {
        guard onboardingPicks.count == 3 else { return false }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        let session = s
        do {
            let c = try await api.onboardingPicks(onboardingPicks.map(TitleRef.from(localID:)))
            try check(session)
            for t in c.embeddedTitles { register(t) }
            if !collections.contains(where: { $0.id == c.id }) { collections.append(applyLocal(c)) }
            for id in c.titleIDs { ensureUserState(id); userTitles[id]?.mark = .obsessed }
            if let first = c.titleIDs.first, let t = titles[first] { me.hexes = t.palette; me.featuredTitleID = first }
            onboardingStep = .people
            await loadOnboardingPeople()
            return true
        } catch {
            guard s === session else { return false }
            let e = noteError(error)
            if e != .unauthorized { authError = e.authText }
            return false
        }
    }

    func loadOnboardingPeople(force: Bool = false) async {
        guard force || !onboardingPeopleLoaded else { return }
        let session = s
        do {
            let list = try await api.onboardingPeople()
            try check(session)
            loaded(.onboardingPeople)
            for p in list { register(p) }
            onboardingPeople = list
            onboardingPeopleLoaded = true
        } catch {
            guard s === session else { return }
            fail(.onboardingPeople, error)
        }
    }

    func finishOnboarding() {
        enterMain()
    }
}
