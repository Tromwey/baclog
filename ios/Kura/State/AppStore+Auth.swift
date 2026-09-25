import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// The entrance: splash, the email code and Sign in with Apple / Google.
extension AppStore {
    // MARK: Session

    /// After the splash: a stored token skips the entrance (refreshing it when
    /// it's about to expire); no token → entrance.
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
        if api.needsRefresh {
            let result: Result<Me, Error>
            do { result = .success(try await api.refresh()) } catch { result = .failure(error) }
            await hold()
            switch result {
            case .success(let m):
                applyMe(m)
                if !route(after: m) { return }
            case .failure(let error):
                let e = noteError(error)
                if e == .unauthorized { return }
                // Transport trouble: keep the token, try the library anyway.
            }
        }
        await hold()
        withAnimation(KMotion.fade) { phase = .main }
    }

    /// `POST auth/otp/request` — true when the code went out.
    func requestCode(email: String) async -> Bool {
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard e.contains("@"), e.contains(".") else { authError = "Revisa el correo."; return false }
        authBusy = true
        authError = nil
        defer { authBusy = false }
        do {
            try await api.requestCode(email: e)
            authEmail = e
            return true
        } catch {
            authError = noteError(error).authText
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
                showToast(ToastModel(text: "Sin conexión. Revisa tu red e inténtalo de nuevo.", kind: .info))
            case .rejected:
                showToast(ToastModel(text: "No se pudo entrar con Google. Inténtalo de nuevo.", kind: .info))
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
        case .unavailable: text = "\(provider) no responde ahora. Entra con tu correo o prueba en un rato."
        case .offline: text = "Sin conexión. Revisa tu red e inténtalo de nuevo."
        case .rateLimited: text = "Demasiados intentos. Espera un momento."
        case .conflict(_, let m) where !m.isEmpty: text = m
        case .invalid(_, let m) where !m.isEmpty: text = m
        default: text = "No se pudo entrar con \(provider). Inténtalo de nuevo."
        }
        showToast(ToastModel(text: text, kind: .info))
    }
}
