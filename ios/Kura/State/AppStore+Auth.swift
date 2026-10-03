import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// The entrance: splash, the email code and Sign in with Apple / Google.
extension AppStore {
    // MARK: Session

    /// After the splash: a stored token skips the entrance (refreshing it when
    /// it's about to expire, else `GET /me`) and goes where `route(after:)` says — O1b
    /// for an account that never finished it; no token → entrance.
    /// `minimumHold`: the splash's brand beat. It runs concurrently with the refresh
    /// (never added on top of it); nothing leaves the splash before it's over.
    func finishSplash(minimumHold: Duration = .zero) async {
        guard phase == .splash else { return }
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: minimumHold)
        func hold() async { try? await Task.sleep(until: deadline, clock: clock) }
        guard api.hasSession else {
            // The entrance's buttons depend on it: ask during the brand beat, not after it.
            async let providers: Void = loadAuthProviders()
            await hold()
            await providers
            onboardingStep = entryStep
            withAnimation(KMotion.fade) { phase = .onboarding }
            return
        }
        // ALWAYS who this is before the tabs (a refresh already answers it): an account killed
        // half-way through the onboarding (no handle, no name/year) must land back on O1b, never
        // on tabs with an empty "@".
        let result: Result<Me, Error>
        let readStamp = s.readStamp
        do { result = .success(try await api.needsRefresh ? api.refresh() : api.me()) } catch { result = .failure(error) }
        await hold()
        switch result {
        case .success(let m):
            applyMe(m, readAt: readStamp)
            if !route(after: m) { return }
        case .failure(let error):
            let e = noteError(error)
            // `.unauthorized` here always means the token is gone (`noteError`): the entrance.
            if e == .unauthorized {
                if phase == .splash {
                    onboardingStep = entryStep
                    withAnimation(KMotion.fade) { phase = .onboarding }
                }
                return
            }
            // Transport trouble: keep the token, try the library anyway (`bootstrap` routes
            // once `GET /me` answers).
        }
        withAnimation(KMotion.fade) { phase = .main }
    }

    /// `POST auth/otp/request` — true when the code went out.
    func requestCode(email: String) async -> Bool {
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard e.contains("@"), e.contains(".") else { authError = "Ese correo no parece válido. Revísalo."; return false }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            try await api.requestCode(email: e)
            authEmail = e
            otpRetry = nil
            return true
        } catch {
            let err = noteError(error)
            guard case .rateLimited(let retryAfter, let reason) = err else {
                authError = err.authText
                return false
            }
            // API.md §2: `cooldown` = a code for this address went out less than a minute ago and
            // STILL WORKS; anything else (`hourly_cap`, `ip_limit`) = no code, wait the real time.
            // Without a `reason` (older server) a wait of a minute or less is the cooldown.
            let wait = max(retryAfter ?? 60, 1)
            let cooldown = reason == "cooldown" || (reason == nil && wait <= 60)
            otpRetry = (reason == "ip_limit" ? nil : e, Date().addingTimeInterval(TimeInterval(wait)), cooldown)
            if cooldown {
                authEmail = e
                authError = "Ya te enviamos un código hace poco y sigue siendo válido. Revisa tu correo."
                return true
            }
            authError = reason == "ip_limit"
                ? "Demasiados intentos desde esta red. Podrás pedir un código en \(KuraAPIError.waitLabel(wait))."
                : "Se pidieron demasiados códigos para este correo. Podrás pedir otro en \(KuraAPIError.waitLabel(wait))."
            return false
        }
    }

    /// `POST auth/otp/verify` — stores the token and routes: username → picks → main.
    func verifyCode(_ code: String) async -> Bool {
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            let m = try await api.signIn(email: authEmail, code: code.trimmingCharacters(in: .whitespaces))
            finishSignIn(m)
            return true
        } catch {
            authError = noteError(error).authText
            return false
        }
    }

    /// The one path after ANY sign-in (código, Apple, Google): token already stored by the API,
    /// then O1b if the account isn't set up, else the tabs.
    private func finishSignIn(_ m: Me) {
        applyMe(m)
        if route(after: m) { enterMain() }
    }

    // MARK: Sign in with Apple / Google

    /// `GET /auth/providers`. Failure → correo only (and asked again on the next entrance).
    func loadAuthProviders() async {
        guard authProvidersStale else { return }
        do {
            let p = try await api.authProviders()
            authProvidersStale = false
            withAnimation(KMotion.fade) { authProviders = p }
        } catch {
            if case .cancelled = noteError(error) { return }
            authProviders = .emailOnly
        }
    }

    /// `POST /auth/apple` with what `SignInWithAppleButton` returned.
    func signInWithApple(_ credential: AppleCredential) async {
        guard !authBusy, !signingOut else { return }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            // The server ignores `fullName`: it only pre-fills "tu nombre" on O1b (Apple sends it once).
            let given = [credential.givenName, credential.familyName].compactMap { $0 }.joined(separator: " ")
            suggestedName = given.isEmpty ? nil : given.lowercased()
            finishSignIn(try await api.signInWithApple(credential))
        } catch {
            socialSignInFailed(error, provider: "Apple")
        }
    }

    /// Google: the browser round trip (PKCE) for an `id_token`, then `POST /auth/google`.
    func signInWithGoogle() async {
        guard !authBusy, !signingOut, let clientID = authProviders?.googleClientID else { return }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            let idToken = try await googleIDToken(clientID: clientID)
            finishSignIn(try await api.signInWithGoogle(idToken: idToken))
        } catch {
            socialSignInFailed(error, provider: "Google")
        }
    }

    /// The browser round trip for Google's `id_token` (sign-in and Conectar share it).
    /// The mock never opens accounts.google.com: the captures stay offline and deterministic.
    func googleIDToken(clientID: String) async throws -> String {
        #if DEBUG
        if KuraRuntime.usesMock { return "mock.id.token" }
        #endif
        return try await GoogleOAuth.idToken(clientID: clientID)
    }

    /// Cancelling is silent; `403 underage` is the same screen as the code path; everything else is
    /// an honest toast (the entrance has no inline error line under the buttons).
    func socialSignInFailed(_ error: Error, provider: String) {
        if let g = error as? GoogleOAuth.Failure {
            switch g {
            case .cancelled: return
            case .offline:
                offline = true
                showToast(ToastModel(text: "Sin conexión. Revisa tu red y vuelve a intentarlo.", kind: .info))
            case .rejected:
                showToast(ToastModel(text: "No se pudo entrar con Google. Vuelve a intentarlo.", kind: .info))
            }
            return
        }
        let e = noteError(error)
        let text: String
        switch e {
        case .cancelled: return
        case .forbidden(let code) where code == "underage":
            onboardingStep = .underage
            return
        case .unavailable: text = "\(provider) no responde ahora. Entra con tu correo o vuelve a intentarlo más tarde."
        case .offline: text = "Sin conexión. Revisa tu red y vuelve a intentarlo."
        case .rateLimited: text = "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
        case .conflict(_, let m) where !m.isEmpty: text = m
        case .invalid(_, let m) where !m.isEmpty: text = m
        default: text = "No se pudo entrar con \(provider). Vuelve a intentarlo."
        }
        showToast(ToastModel(text: text, kind: .info))
    }
}
