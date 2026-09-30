import AuthenticationServices
import UIKit

// Linking TIDAL from the app (contract §4.2): the server's `authorizeUrl` opens in an
// `ASWebAuthenticationSession`; TIDAL comes back to OUR server, which bounces to
// `kura://music/tidal/authorized?ref=…` (then `POST /music/tidal/complete` with the bearer) or
// `kura://music/tidal/connected?ok=0&reason=…`. The session catches the `kura` scheme through
// `callbackURLScheme` on its own — like Google sign-in, nothing is registered in
// `CFBundleURLTypes` (registering it would only open a door any web page could knock on).

enum TidalCallback: Equatable {
    case authorized(ref: String)
    case failed(reason: String?)

    /// nil = not a TIDAL callback, or a malformed `ref`.
    init?(_ url: URL) {
        guard url.scheme?.lowercased() == "kura", url.host?.lowercased() == "music",
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        func item(_ n: String) -> String? { comps.queryItems?.first { $0.name == n }?.value }
        switch comps.path {
        case "/tidal/authorized":
            guard let ref = item("ref"), ref.range(of: "^i[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { return nil }
            self = .authorized(ref: ref)
        case "/tidal/connected":
            self = .failed(reason: item("reason"))
        default:
            return nil
        }
    }
}

protocol TidalAuthorizer {
    /// Opens TIDAL's consent page and returns the `kura://` callback. Closing the sheet throws
    /// `CancellationError`.
    @MainActor func authorize(_ url: URL) async throws -> URL
}

@MainActor
final class LiveTidalAuthorizer: NSObject, TidalAuthorizer, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func authorize(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let handler: ASWebAuthenticationSession.CompletionHandler = { [weak self] url, error in
                self?.session = nil
                if let url { cont.resume(returning: url); return }
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    cont.resume(throwing: CancellationError())
                } else {
                    cont.resume(throwing: KuraAPIError.server("TIDAL"))
                }
            }
            let s: ASWebAuthenticationSession
            if #available(iOS 17.4, *) {
                s = ASWebAuthenticationSession(url: url, callback: .customScheme("kura"), completionHandler: handler)
            } else {
                s = ASWebAuthenticationSession(url: url, callbackURLScheme: "kura", completionHandler: handler)
            }
            s.presentationContextProvider = self
            // Shared Safari cookies: someone already signed in to TIDAL just says yes.
            s.prefersEphemeralWebBrowserSession = false
            session = s
            if !s.start() {
                session = nil
                cont.resume(throwing: KuraAPIError.server("TIDAL"))
            }
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
            return windows.first { $0.isKeyWindow } ?? windows.first ?? ASPresentationAnchor()
        }
    }
}
