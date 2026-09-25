import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Onboarding (O1b · 32a · 32b): username, picks and the people to follow.
extension AppStore {
    /// Where a fresh session goes: no handle or no name → O1b; else the tabs.
    /// (`onboardingComplete` on `Me` is what decides; the picks only run inside
    /// a fresh onboarding, right after `POST /me/onboarding`.)
    @discardableResult
    func route(after m: Me) -> Bool {
        if m.handle == nil || !m.onboarded {
            onboardingStep = .username
            withAnimation(KMotion.short) { phase = .onboarding }
            return false
        }
        return true
    }

    /// O1b · `PUT /me/username` + `POST /me/onboarding` (403 underage → 13 años).
    func submitUsername(handle: String, name: String, birthYear: Int?) async -> Bool {
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
                guard let birthYear else { authError = "Falta tu año de nacimiento."; return false }
                m = try await api.completeOnboarding(name: name.trimmingCharacters(in: .whitespaces).lowercased(), birthYear: birthYear)
                try check(session)
                applyMe(m!)
                onboardingStep = .pick
                Task { await loadOnboardingGrid() }
            } else {
                enterMain()
            }
            return true
        } catch {
            guard s === session else { return false }
            let e = noteError(error)
            if case .forbidden(let code) = e, code == "underage" {
                onboardingStep = .underage
                return false
            }
            if case .conflict = e { authError = "Ese usuario ya está tomado."; return false }
            if case .invalid(let fields, let msg) = e {
                authError = fields["username"] ?? fields["name"] ?? fields["birthYear"] ?? (msg.isEmpty ? "Revisa los datos." : msg)
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
            if e != .cancelled { onboardingGridError = e }
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
            authError = noteError(error).authText
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
