import Foundation

/// The bearer token and its refresh policy (API.md §2.1). The JWT payload is
/// decoded locally ONLY to read `exp`; the signature is never verified here —
/// the server is the authority, a 401 anywhere ends the session.
final class Session: @unchecked Sendable {
    static let refreshWindow: TimeInterval = 7 * 24 * 3600

    private let keychain: Keychain
    private let lock = NSLock()
    private var cached: String?
    private var loaded = false

    init(keychain: Keychain = .bearer) {
        self.keychain = keychain
    }

    var token: String? {
        lock.lock(); defer { lock.unlock() }
        if !loaded { cached = keychain.read(); loaded = true }
        return cached
    }

    func store(_ token: String) {
        lock.lock(); defer { lock.unlock() }
        cached = token
        loaded = true
        keychain.write(token)
        // A bearer on disk always comes with the marker (see `InstallMarker`).
        InstallMarker.markPresent()
    }

    func clear() {
        lock.lock(); defer { lock.unlock() }
        cached = nil
        loaded = true
        keychain.delete()
    }

    var hasToken: Bool { token != nil }

    /// `exp` claim as a date, if the token parses.
    var expiry: Date? {
        guard let token, let exp = Session.claims(of: token)?["exp"] as? TimeInterval else { return nil }
        return Date(timeIntervalSince1970: exp)
    }

    /// The app calls `POST auth/refresh` on launch when < 7 days remain (or the
    /// token can't be read, so the server decides).
    var needsRefresh: Bool {
        guard hasToken else { return false }
        guard let expiry else { return true }
        return expiry.timeIntervalSinceNow < Session.refreshWindow
    }

    /// Base64url-decodes the payload segment of a JWT. No verification.
    static func claims(of jwt: String) -> [String: Any]? {
        let parts = jwt.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj
    }
}
