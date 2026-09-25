import SwiftUI
import Observation
import UIKit
import Network
import SafariServices

/// Push, inicio de sesión (identities), Fusionar otra cuenta and Sesiones activas.
extension AppStore {
    // MARK: Push

    func refreshNotificationStatus() async {
        if let s = debugNotificationStatus { notificationStatus = s; return }
        guard !KuraRuntime.usesMock else { return }
        notificationStatus = await NotificationPermission.status()
    }

    /// Once per install, after the tabs are up: if iOS hasn't been asked yet, Kura's own sheet says
    /// what the notices are before the system prompt. Never over another sheet or a tapped push.
    func offerNotificationsIfNeeded() async {
        await refreshNotificationStatus()
        guard notificationStatus == .undetermined, !NotificationPermission.didOfferPrompt,
              sheet == nil, pendingSheet == nil else { return }
        try? await Task.sleep(for: .milliseconds(900))
        guard sheet == nil, phase == .main else { return }
        NotificationPermission.didOfferPrompt = true
        present(.notificationsAsk)
    }

    /// "Activar avisos" (the sheet or Ajustes): iOS's prompt, then the APNs token if allowed.
    func enableNotifications() async {
        if debugNotificationStatus != nil { debugNotificationStatus = .allowed }
        if !KuraRuntime.usesMock, await NotificationPermission.requestIfUndetermined() {
            NotificationPermission.registerForRemote()
        }
        await refreshNotificationStatus()
    }

    /// After the tabs come up with a session: if notifications are ALREADY allowed, ask APNs for
    /// the token (every launch, as Apple recommends: it can rotate). Never asks for permission.
    func refreshPushRegistration() {
        guard !KuraRuntime.usesMock else { return }
        Task {
            if await NotificationPermission.isAllowed() { NotificationPermission.registerForRemote() }
        }
    }

    /// A switch turned back on in Ajustes: the one other moment Kura asks (if it never did).
    func askNotificationsIfNeeded() {
        guard !KuraRuntime.usesMock else { return }
        Task {
            if await NotificationPermission.requestIfUndetermined() { NotificationPermission.registerForRemote() }
            await refreshNotificationStatus()
        }
    }

    /// APNs answered with this install's token → `PUT /me/devices/{token}` (idempotent). Once the
    /// server has it, release notices come as push: the pending local ones are removed.
    func didReceivePushToken(_ hex: String) {
        PushRegistration.store(token: hex)
        guard api.hasSession, phase == .main else { return }
        let api = self.api
        Task {
            do {
                try await api.registerDevice(pushToken: hex, environment: PushRegistration.environment)
                PushRegistration.markRegistered()
                ReleaseNotifier.cancelAll()
            } catch {
                // Not the user's problem right now: the next launch registers again.
                KuraLog.api.error("push register failed: \(String(describing: error), privacy: .public)")
            }
        }
    }

    /// A tapped notification: the release's ficha or the new follower's profile, on top of the
    /// current tab. Before the tabs are up it waits for `startIfNeeded`.
    func openPush(_ d: PushDestination) {
        let route: Route
        switch d {
        case .title(let id): route = .title(id)
        case .person(let handle): route = .person(handle)
        }
        guard phase == .main, didBootstrap, loadState != .loading else {
            pendingPush = route
            return
        }
        if sheet != nil { dismissSheet() }
        if path(tab).last != route { push(route) }
    }

    // MARK: Inicio de sesión (identities) and Fusionar otra cuenta

    /// `GET /me/identities` (+ `auth/providers` for Google's client id, which the flow needs).
    func loadIdentities() async {
        async let providers: Void = loadAuthProviders()
        let session = s
        do {
            let v = try await api.identities()
            try check(session)
            loaded(.identities)
            withAnimation(KMotion.fade) { identities = v }
        } catch {
            guard s === session else { return }
            fail(.identities, error)
        }
        await providers
    }

    /// Google can only run with the iOS client id from `auth/providers`.
    func canRun(_ p: IdentityProvider) -> Bool {
        switch p {
        case .apple: return true
        case .google: return authProviders?.googleClientID != nil
        }
    }

    /// The provider's own sheet, then `POST /me/identities/{p}`. `linked_elsewhere` goes straight
    /// to the merge confirmation for that account. `fromMerge`: started on Fusionar otra cuenta,
    /// where a plain link (that Apple/Google had no other account) is news worth saying.
    func connect(_ p: IdentityProvider, fromMerge: Bool = false) async {
        guard identityBusy == nil, !mergeBusy, canRun(p) else { return }
        identityBusy = p
        let outcome: LinkOutcome
        do {
            switch p {
            case .apple:
                #if DEBUG
                let credential = KuraRuntime.usesMock
                    ? AppleCredential(identityToken: "mock.apple.token", rawNonce: "mock", authorizationCode: nil, givenName: nil, familyName: nil)
                    : try await AppleAuthorization.credential()
                #else
                let credential = try await AppleAuthorization.credential()
                #endif
                outcome = try await api.linkApple(credential)
            case .google:
                let idToken = try await googleIDToken(clientID: authProviders?.googleClientID ?? "")
                outcome = try await api.linkGoogle(idToken: idToken)
            }
        } catch {
            identityBusy = nil
            identityFailed(error, provider: p)
            return
        }
        identityBusy = nil
        online()
        switch outcome {
        case .linked:
            setLinked(p, true)
            KHaptic.impact(.light)
            showToast(ToastModel(text: fromMerge
                ? "Ese \(p.label) no tenía otra cuenta en kura: quedó conectado a esta."
                : "\(p.label) conectada. Ya puedes entrar con \(p.label).", kind: .info))
        case .mergeable(let proof):
            mergeProof = proof
            push(.mergeConfirm)
        }
    }

    private func setLinked(_ p: IdentityProvider, _ linked: Bool) {
        guard let i = identities?.providers.firstIndex(where: { $0.provider == p }) else { return }
        withAnimation(KMotion.fade) { identities?.providers[i].linked = linked }
    }

    private func identityFailed(_ error: Error, provider p: IdentityProvider) {
        if let a = error as? AppleAuthorization.Failure {
            if a == .rejected { showToast(ToastModel(text: "Apple no respondió. Inténtalo de nuevo.", kind: .info)) }
            return
        }
        if let g = error as? GoogleOAuth.Failure {
            switch g {
            case .cancelled: return
            case .offline:
                offline = true
                showToast(ToastModel(text: "Sin conexión. Revisa tu red e inténtalo de nuevo.", kind: .info))
            case .rejected:
                showToast(ToastModel(text: "Google no respondió. Inténtalo de nuevo.", kind: .info))
            }
            return
        }
        let e = noteError(error)
        let text: String
        switch e {
        case .cancelled, .unauthorized: return
        case .conflict(let code, _) where code == "provider_already_linked":
            text = "Ya tienes otra cuenta de \(p.label) conectada. Desconéctala primero."
        case .forbidden(let code) where code == "proof_rejected":
            text = "\(p.label) no confirmó esa cuenta. Inténtalo de nuevo."
        case .unavailable: text = "\(p.label) no responde ahora. Prueba en un rato."
        case .offline: text = "Sin conexión. Revisa tu red e inténtalo de nuevo."
        case .rateLimited: text = "Demasiados intentos. Espera un momento."
        default: text = "No se pudo conectar \(p.label). Inténtalo de nuevo."
        }
        showToast(ToastModel(text: text, kind: .info))
    }

    /// Why Apple can't be disconnected (the row, the 409 toast and the sheet say the same).
    static let lastWayInText = "Tu correo es el privado de Apple: sin Apple no te quedaría cómo entrar. Conecta Google antes."

    /// `DELETE /me/identities/{p}`. 409 `last_way_in`: Apple is the only real way in (relay email).
    @discardableResult
    func disconnect(_ p: IdentityProvider) async -> Bool {
        guard identityBusy == nil else { return false }
        identityBusy = p
        defer { identityBusy = nil }
        do {
            try await api.unlinkIdentity(p)
            online()
            setLinked(p, false)
            KHaptic.impact(.light)
            showToast(ToastModel(text: "Desconectaste \(p.label). Sigues entrando con tu correo.", kind: .info))
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized: return false
            case .notFound:
                setLinked(p, false)
                return true
            case .conflict(let c, _) where c == "last_way_in":
                showToast(ToastModel(text: Self.lastWayInText, kind: .info))
                return false
            default:
                let text = e == .offline ? "Sin conexión. \(p.label) sigue conectada." : "No se pudo desconectar \(p.label)."
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.disconnect(p) }
                })
                return false
            }
        }
    }

    /// Fusionar › correo: `POST /me/merge/otp/request` (204 whether or not the account exists).
    func requestMergeCode(email: String) async -> Bool {
        let e = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard e.contains("@"), e.contains(".") else { mergeError = "Revisa el correo."; return false }
        let own = (identities?.email ?? account?.email ?? "").lowercased()
        guard e != own else { mergeError = "Ese es el correo de esta cuenta. Escribe el de la otra."; return false }
        guard !mergeBusy else { return false }
        mergeBusy = true
        mergeError = nil
        defer { mergeBusy = false }
        do {
            try await api.requestMergeCode(email: e)
            online()
            mergeEmail = e
            mergeRetryAt = nil
            return true
        } catch {
            let err = noteError(error)
            if case .rateLimited(let s) = err { mergeRetryAt = Date().addingTimeInterval(TimeInterval(max(s ?? 60, 1))) }
            mergeError = mergeText(err)
            return false
        }
    }

    /// Fusionar › código: `POST /me/merge/otp/verify` → the confirmation screen.
    func verifyMergeCode(_ code: String) async {
        guard !mergeBusy else { return }
        mergeBusy = true
        mergeError = nil
        defer { mergeBusy = false }
        do {
            mergeProof = try await api.verifyMergeCode(email: mergeEmail, code: code)
            online()
            push(.mergeConfirm)
        } catch {
            let e = noteError(error)
            if case .forbidden(let c) = e, c == "proof_rejected" {
                mergeError = "Ese código no sirve. Revísalo o pide otro."
            } else {
                mergeError = mergeText(e)
            }
        }
    }

    private func mergeText(_ e: KuraAPIError) -> String? {
        switch e {
        case .cancelled, .unauthorized: return nil
        case .offline: return "Sin conexión. Revisa tu red e inténtalo de nuevo."
        case .rateLimited(let s):
            guard let s, s > 0 else { return "Demasiados intentos. Espera un momento." }
            if s < 90 { return "Espera \(s) s para pedir otro código." }
            let min = Int((Double(s) / 60).rounded(.up))
            return "Ya pediste varios códigos para ese correo. Intenta en \(min) min."
        case .invalid(_, let m) where !m.isEmpty: return m
        case .invalid: return "Revisa el correo."
        default: return "Algo falló de nuestro lado. Inténtalo de nuevo."
        }
    }

    /// `POST /me/merge`: the other account folds into this one. On success everything that
    /// depends on the account is read again from the returned `Me`, and Ajustes comes back.
    func confirmMerge() async {
        guard let proof = mergeProof, !mergeBusy else { return }
        mergeBusy = true
        mergeError = nil
        sheetLocked = true
        defer { mergeBusy = false; sheetLocked = false }
        let m: Me
        do {
            m = try await api.merge(token: proof.mergeToken)
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized: return
            case .forbidden(let c) where c == "underage":
                mergeProof = nil
                popToSettings()
                showToast(ToastModel(text: "Una de las dos cuentas es de alguien menor de 13. No se pueden juntar.", kind: .info))
            case .conflict(let c, _) where c == "merge_token_invalid":
                mergeProof = nil
                popToSettings(keeping: .mergeAccount)
                showToast(ToastModel(text: "Pasaron más de 10 minutos. Vuelve a probar que la otra cuenta es tuya.", kind: .info))
            case .offline:
                showToast(ToastModel(text: "Sin conexión. No se movió nada.", kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.confirmMerge() }
                })
            default:
                showToast(ToastModel(text: "No se pudo fusionar. No se movió nada.", kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.confirmMerge() }
                })
            }
            return
        }
        online()
        let moved = proof.source.display
        mergeProof = nil
        mergeEmail = ""
        applyMe(m)
        popToSettings()
        KHaptic.impact(.medium)
        showToast(ToastModel(text: "Listo. Todo lo de \(moved) ya está aquí.", kind: .info))
        await reloadAfterMerge()
    }

    /// Everything read for the old shape of the account goes stale: library, feed, people,
    /// recap, Ajustes' lists. The library re-bootstraps; the rest reloads on its next visit.
    private func reloadAfterMerge() async {
        feed = []
        feedLoaded = false
        feedCursor = nil
        feedDirty = false
        discover = nil
        loadedCollections = []
        loadedPeople = []
        peopleLists = [:]
        recapMonths = nil
        recaps = [:]
        blockedAccounts = nil
        deviceSessions = nil
        identities = nil
        await bootstrap()
        await loadIdentities()
    }

    /// Back to Ajustes in the current tab (optionally leaving one screen on top of it).
    private func popToSettings(keeping extra: Route? = nil) {
        var p = paths[tab] ?? []
        if let i = p.lastIndex(of: .settings) {
            p = Array(p.prefix(through: i))
            if let extra { p.append(extra) }
            paths[tab] = p
        }
    }

    // MARK: Sesiones activas

    func loadSessions() async {
        let session = s
        do {
            let items = try await api.sessions()
            try check(session)
            loaded(.sessions)
            // This device first, then the most recently seen.
            deviceSessions = items.sorted {
                if $0.current != $1.current { return $0.current }
                return ($0.lastSeenAt ?? .distantPast) > ($1.lastSeenAt ?? .distantPast)
            }
        } catch {
            guard s === session else { return }
            fail(.sessions, error)
        }
    }

    /// `DELETE /me/sessions/{id}` → that device lands on the entrance on its next call (its 401).
    @discardableResult
    func revokeSession(_ s: DeviceSession) async -> Bool {
        do {
            try await api.revokeSession(id: s.id)
            online()
            withAnimation(KMotion.fade) { deviceSessions?.removeAll { $0.id == s.id } }
            KHaptic.impact(.light)
            showToast(ToastModel(text: "Cerraste la sesión en \(s.title).", kind: .info))
            return true
        } catch {
            let e = noteError(error)
            switch e {
            case .cancelled, .unauthorized:
                return false
            case .notFound:
                // Already gone (signed out there, or expired): the list just catches up.
                withAnimation(KMotion.fade) { deviceSessions?.removeAll { $0.id == s.id } }
                return true
            default:
                let text = e == .offline ? "Sin conexión. La sesión sigue abierta." : "No se pudo cerrar esa sesión."
                showToast(ToastModel(text: text, kind: .retry) { [weak self] in
                    self?.dismissToast()
                    Task { await self?.revokeSession(s) }
                })
                return false
            }
        }
    }
}
