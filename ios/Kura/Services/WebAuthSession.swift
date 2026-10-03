import AuthenticationServices
import UIKit

/// The window a system auth sheet hangs from (Sign in with Apple, the web auth session).
@MainActor
enum KeyWindow {
    static var anchor: ASPresentationAnchor {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return windows.first { $0.isKeyWindow } ?? windows.first ?? ASPresentationAnchor()
    }
}

/// One `ASWebAuthenticationSession` round trip: opens `url`, returns the redirect that came back
/// on `scheme`. Shared by Google sign-in (`GoogleOAuth`) and the TIDAL link (`LiveTidalAuthorizer`);
/// each maps `Failure` to its own error. The session catches the scheme through its callback on
/// its own — nothing is registered in `CFBundleURLTypes`.
@MainActor
final class WebAuthSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    enum Failure: Error, Equatable {
        /// The person closed the sheet.
        case cancelled
        /// The sheet couldn't start, or ended without a redirect.
        case failed
    }

    /// Kept alive while the sheet is up (the session is otherwise deallocated mid-flow).
    private var session: ASWebAuthenticationSession?

    static func run(url: URL, scheme: String) async throws -> URL {
        let flow = WebAuthSession()
        return try await flow.start(url: url, scheme: scheme)
    }

    private func start(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let handler: ASWebAuthenticationSession.CompletionHandler = { [self] url, error in
                // `self` is held on purpose until the sheet answers (the provider is weak).
                session = nil
                if let url { cont.resume(returning: url); return }
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    cont.resume(throwing: Failure.cancelled)
                } else {
                    cont.resume(throwing: Failure.failed)
                }
            }
            let s: ASWebAuthenticationSession
            if #available(iOS 17.4, *) {
                s = ASWebAuthenticationSession(url: url, callback: .customScheme(scheme), completionHandler: handler)
            } else {
                s = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme, completionHandler: handler)
            }
            s.presentationContextProvider = self
            // Shared Safari cookies: someone already signed in there just picks the account / says yes.
            s.prefersEphemeralWebBrowserSession = false
            session = s
            if !s.start() {
                session = nil
                cont.resume(throwing: Failure.failed)
            }
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated { KeyWindow.anchor }
    }
}
