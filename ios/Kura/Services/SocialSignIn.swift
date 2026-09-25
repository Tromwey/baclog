import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// Sign in with Apple's nonce: a random value whose SHA-256 goes in the Apple request
/// (`ASAuthorizationAppleIDRequest.nonce`) and ends up as the `nonce` claim of the identity token.
/// The RAW value travels to `POST /auth/apple`, where the server hashes it again and compares:
/// a token captured elsewhere can't be replayed without the raw nonce.
enum AppleNonce {
    static func make(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        if SecRandomCopyBytes(kSecRandomDefault, length, &bytes) != errSecSuccess {
            return UUID().uuidString + UUID().uuidString
        }
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

/// Google sign-in's nonce. `GoogleOAuth` generates a random one per flow (same generator as
/// `AppleNonce`), sends it as `nonce` in the authorization URL — Google copies it verbatim into the
/// `nonce` claim of the `id_token` — and checks the returned token carries it. The raw value then
/// travels as `nonce` in the body of `POST /auth/google` and `POST /me/identities/google`, where the
/// server requires `id_token.nonce === body.nonce` when the field is present.
///
/// `KuraAPI.signInWithGoogle(idToken:)`/`linkGoogle(idToken:)` only take the token, so the nonce
/// rides alongside in this small in-memory map keyed by the token (the last few flows only; never
/// persisted, never logged). A lookup is NOT consuming: the store's "Reintentar" after an offline
/// failure re-sends the same token and must send the same nonce.
enum GoogleNonce {
    private static let lock = NSLock()
    private static var byToken: [String: String] = [:]
    private static var order: [String] = []
    private static let capacity = 4

    static func make() -> String { AppleNonce.make() }

    static func remember(_ nonce: String, for idToken: String) {
        lock.withLock {
            if byToken.updateValue(nonce, forKey: idToken) == nil { order.append(idToken) }
            while order.count > capacity { byToken[order.removeFirst()] = nil }
        }
    }

    static func nonce(for idToken: String) -> String? {
        lock.withLock { byToken[idToken] }
    }

    /// The `nonce` claim of an `id_token` (payload decoded, signature NOT checked — the server is
    /// the authority; this only catches a token that didn't come from this flow).
    static func claim(of idToken: String) -> String? {
        Session.claims(of: idToken)?["nonce"] as? String
    }
}

extension AppleCredential {
    /// What an Apple authorization hands over, ready for `POST /auth/apple` or
    /// `POST /me/identities/apple`. nil when Apple didn't return an identity token.
    init?(authorization: ASAuthorization, rawNonce: String) {
        guard let c = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = c.identityToken, let token = String(data: data, encoding: .utf8), !rawNonce.isEmpty else { return nil }
        self.init(identityToken: token, rawNonce: rawNonce,
                  authorizationCode: c.authorizationCode.flatMap { String(data: $0, encoding: .utf8) },
                  givenName: c.fullName?.givenName, familyName: c.fullName?.familyName)
    }
}

/// Sign in with Apple driven from code (no system button): for Ajustes › Conectar, where the
/// row's own button starts it. The entrance keeps `SignInWithAppleButton` (HIG); both end in the
/// same `AppleCredential`.
@MainActor
final class AppleAuthorization: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    enum Failure: Error, Equatable {
        /// Closed Apple's sheet: silent.
        case cancelled
        case rejected
    }

    private var continuation: CheckedContinuation<AppleCredential, Error>?
    private var rawNonce = ""
    /// Kept alive while Apple's sheet is up.
    private static var inFlight: AppleAuthorization?

    /// Runs Apple's sheet. Linking needs no name or email scopes: the server only reads `sub`
    /// and the verified email already inside the identity token.
    static func credential(scopes: [ASAuthorization.Scope] = [.email]) async throws -> AppleCredential {
        let flow = AppleAuthorization()
        inFlight = flow
        defer { inFlight = nil }
        return try await flow.run(scopes: scopes)
    }

    private func run(scopes: [ASAuthorization.Scope]) async throws -> AppleCredential {
        try await withCheckedThrowingContinuation { cont in
            continuation = cont
            rawNonce = AppleNonce.make()
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = scopes
            request.nonce = AppleNonce.sha256(rawNonce)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        if let c = AppleCredential(authorization: authorization, rawNonce: rawNonce) {
            continuation?.resume(returning: c)
        } else {
            continuation?.resume(throwing: Failure.rejected)
        }
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        continuation?.resume(throwing: cancelled ? Failure.cancelled : Failure.rejected)
        continuation = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return windows.first { $0.isKeyWindow } ?? windows.first ?? ASPresentationAnchor()
    }
}

/// Google sign-in without a third-party SDK: OAuth 2.0 authorization code + PKCE in an
/// `ASWebAuthenticationSession`, then the code is exchanged at Google's token endpoint by the app
/// itself (an iOS client has no secret; the `code_verifier` is the proof) for an `id_token`, which
/// goes to `POST /auth/google`.
///
/// The redirect is the client id's reversed scheme (`com.googleusercontent.apps.<X>:/oauth2redirect`).
/// `ASWebAuthenticationSession` catches it through `callbackURLScheme` on its own: nothing needs
/// to be registered in `CFBundleURLTypes`.
@MainActor
final class GoogleOAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    enum Failure: Error, Equatable {
        /// Closed the sheet or said no on Google's consent screen: silent.
        case cancelled
        /// The redirect came back without a code, with the wrong `state`, or the exchange failed.
        case rejected
        case offline
    }

    private static let authorizeURL = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    private static let tokenURL = URL(string: "https://oauth2.googleapis.com/token")!

    /// Kept alive while the sheet is up (the session is otherwise deallocated mid-flow).
    private var session: ASWebAuthenticationSession?

    /// Runs the whole browser round trip and returns Google's `id_token`.
    static func idToken(clientID: String) async throws -> String {
        let flow = GoogleOAuth()
        return try await flow.run(clientID: clientID)
    }

    /// `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`.
    static func redirectScheme(for clientID: String) -> String {
        let suffix = ".apps.googleusercontent.com"
        if clientID.hasSuffix(suffix) {
            return "com.googleusercontent.apps." + clientID.dropLast(suffix.count)
        }
        return clientID.split(separator: ".").reversed().joined(separator: ".")
    }

    private func run(clientID: String) async throws -> String {
        let scheme = Self.redirectScheme(for: clientID)
        let redirect = "\(scheme):/oauth2redirect"
        let verifier = Self.base64URL(Self.randomBytes(32))
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.base64URL(Self.randomBytes(16))
        let nonce = GoogleNonce.make()

        var comps = URLComponents(url: Self.authorizeURL, resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "prompt", value: "select_account")
        ]
        guard let url = comps.url else { throw Failure.rejected }

        let callback = try await present(url: url, scheme: scheme)
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func item(_ n: String) -> String? { items.first { $0.name == n }?.value }
        if let error = item("error") {
            throw error == "access_denied" ? Failure.cancelled : Failure.rejected
        }
        guard item("state") == state, let code = item("code"), !code.isEmpty else { throw Failure.rejected }
        let idToken = try await exchange(code: code, verifier: verifier, clientID: clientID, redirect: redirect)
        // A token without THIS flow's nonce never leaves the app.
        guard GoogleNonce.claim(of: idToken) == nonce else {
            KuraLog.api.error("google id_token nonce mismatch")
            throw Failure.rejected
        }
        GoogleNonce.remember(nonce, for: idToken)
        return idToken
    }

    private func present(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let handler: ASWebAuthenticationSession.CompletionHandler = { [weak self] url, error in
                self?.session = nil
                if let url { cont.resume(returning: url); return }
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    cont.resume(throwing: Failure.cancelled)
                } else {
                    cont.resume(throwing: Failure.rejected)
                }
            }
            let s: ASWebAuthenticationSession
            if #available(iOS 17.4, *) {
                s = ASWebAuthenticationSession(url: url, callback: .customScheme(scheme), completionHandler: handler)
            } else {
                s = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme, completionHandler: handler)
            }
            s.presentationContextProvider = self
            // Shared Safari cookies: someone already signed in to Google just picks the account.
            s.prefersEphemeralWebBrowserSession = false
            session = s
            if !s.start() {
                session = nil
                cont.resume(throwing: Failure.rejected)
            }
        }
    }

    private struct TokenResponse: Decodable { let id_token: String? }

    private func exchange(code: String, verifier: String, clientID: String, redirect: String) async throws -> String {
        var req = URLRequest(url: Self.tokenURL)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "code_verifier", value: verifier)
        ]
        // `+` isn't escaped by URLComponents but means a space in a form body.
        req.httpBody = form.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch let u as URLError {
            throw APIClient.map(u) == .offline ? Failure.offline : Failure.rejected
        }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let token = try? JSONDecoder().decode(TokenResponse.self, from: data).id_token, !token.isEmpty
        else {
            KuraLog.api.error("google token exchange failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0, privacy: .public)")
            throw Failure.rejected
        }
        return token
    }

    // MARK: ASWebAuthenticationPresentationContextProviding

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return windows.first { $0.isKeyWindow } ?? windows.first ?? ASPresentationAnchor()
    }

    // MARK: Helpers

    private static func randomBytes(_ n: Int) -> Data {
        var b = [UInt8](repeating: 0, count: n)
        if SecRandomCopyBytes(kSecRandomDefault, n, &b) != errSecSuccess {
            return Data(UUID().uuidString.utf8)
        }
        return Data(b)
    }

    private static func base64URL(_ d: Data) -> String {
        d.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
