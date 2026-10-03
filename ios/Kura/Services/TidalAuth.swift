import AuthenticationServices
import UIKit

// Linking TIDAL from the app (contract §4.2): the server's `authorizeUrl` opens in an
// `ASWebAuthenticationSession`; TIDAL comes back to OUR server, which bounces to
// `kura://music/tidal/authorized?ref=…&claim=…` (then `POST /music/tidal/complete { ref, claim }`
// with the bearer) or `kura://music/tidal/connected?ok=0&reason=…`. The `claim` is a random
// base64url token only this redirect carries: without it a `ref` alone can't finish the link. A
// missing or malformed `claim` is a failed connection, never a partial one. Neither `ref` nor
// `claim` is ever logged. The session catches the `kura` scheme through
// `callbackURLScheme` on its own — like Google sign-in, nothing is registered in
// `CFBundleURLTypes` (registering it would only open a door any web page could knock on).

enum TidalCallback: Equatable {
    case authorized(ref: String, claim: String)
    case failed(reason: String?)

    /// nil = not a TIDAL callback, or a malformed/missing `ref` or `claim`.
    init?(_ url: URL) {
        guard url.scheme?.lowercased() == "kura", url.host?.lowercased() == "music",
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        func item(_ n: String) -> String? { comps.queryItems?.first { $0.name == n }?.value }
        switch comps.path {
        case "/tidal/authorized":
            guard let ref = item("ref"), ref.range(of: "^i[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
                  let claim = item("claim"), claim.range(of: "^[A-Za-z0-9_-]{16,256}$", options: .regularExpression) != nil
            else { return nil }
            self = .authorized(ref: ref, claim: claim)
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
final class LiveTidalAuthorizer: TidalAuthorizer {
    func authorize(_ url: URL) async throws -> URL {
        do {
            return try await WebAuthSession.run(url: url, scheme: "kura")
        } catch WebAuthSession.Failure.cancelled {
            throw CancellationError()
        } catch {
            throw KuraAPIError.server("TIDAL")
        }
    }
}
