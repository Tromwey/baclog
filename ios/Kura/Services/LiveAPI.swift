import Foundation
import UIKit
import os

/// Contract drift and server failures, in every configuration (TestFlight included):
/// method, path, HTTP status and the server's `X-Request-Id` — never a body, never a token.
enum KuraLog {
    static let api = Logger(subsystem: "com.tromwey.kura", category: "api")
}

/// Redirects never carry the bearer to another origin (scheme + host + port). `URLSession`
/// copies `Authorization` onto the redirected request; this strips it when the origin changes.
final class SameOriginRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest) async -> URLRequest? {
        var next = request
        let from = task.originalRequest?.url
        if !SameOriginRedirects.sameOrigin(from, request.url) {
            next.setValue(nil, forHTTPHeaderField: "Authorization")
        }
        return next
    }

    static func sameOrigin(_ a: URL?, _ b: URL?) -> Bool {
        guard let a, let b else { return false }
        return a.scheme?.lowercased() == b.scheme?.lowercased() && a.host?.lowercased() == b.host?.lowercased()
            && (a.port ?? defaultPort(a)) == (b.port ?? defaultPort(b))
    }

    private static func defaultPort(_ u: URL) -> Int? {
        switch u.scheme?.lowercased() { case "https": return 443; case "http": return 80; default: return nil }
    }
}

// MARK: - Endpoint

/// One path segment built from a runtime value (a handle, an id, an APNs token, an era).
///
/// `URLComponents.path` lets `/` and `..` through untouched (`people/../../account/x` resolved to
/// `/api/account/x`), so a value that came from the server, a deep link or a push payload could
/// steer a bearer-carrying request to another route. Every interpolated value is therefore ONE
/// segment: percent-encoded with `urlPathAllowed` minus `/` and `;` (so `%`, `?`, `#`, `/` are
/// escaped), and the dot segments `.` / `..` — which the WHATWG URL parser also recognizes when
/// spelled `%2e` — plus the empty string are rejected outright (`nil`): the request fails locally
/// as `notFound`, the server's own posture for a malformed id in the path. Normal values
/// (`[a-z0-9_]` handles, UUIDs, hex tokens, `YYYY-MM` eras) come out byte-for-byte unchanged.
enum PathSegment {
    static let allowed: CharacterSet = {
        var s = CharacterSet.urlPathAllowed
        s.remove(charactersIn: "/;")
        return s
    }()

    static func encode(_ raw: String) -> String? {
        guard !raw.isEmpty, raw != ".", raw != ".." else { return nil }
        return raw.addingPercentEncoding(withAllowedCharacters: allowed)
    }
}

/// A path under `/api/v1`, written as a string literal with interpolations:
/// `"people/\(handle)/collections/\(id)"`. The literal text is ours (the route shape) and passes
/// through as-is; EVERY interpolated value goes through `PathSegment.encode`, so no call site can
/// forget to encode. `template` is the same path with each value as `:id` — the only form of a
/// path that may be logged `.public`.
struct APIPath: ExpressibleByStringInterpolation, Equatable, Sendable {
    /// Percent-encoded, relative to the base (no leading slash).
    let encoded: String
    /// Route shape for public logs (`people/:id/collections/:id`).
    let template: String
    /// False when a value was empty or a dot segment: the request is never sent.
    let isValid: Bool

    init(stringLiteral value: String) {
        encoded = value
        template = value
        isValid = true
    }

    init(stringInterpolation s: Interpolation) {
        encoded = s.encoded
        template = s.template
        isValid = s.isValid
    }

    struct Interpolation: StringInterpolationProtocol {
        var encoded = ""
        var template = ""
        var isValid = true

        init(literalCapacity: Int, interpolationCount: Int) {
            encoded.reserveCapacity(literalCapacity + interpolationCount * 36)
        }

        mutating func appendLiteral(_ literal: String) {
            encoded += literal
            template += literal
        }

        /// Only `String` on purpose: every value is named explicitly (`provider.rawValue`).
        mutating func appendInterpolation(_ value: String) {
            template += ":id"
            if let seg = PathSegment.encode(value) {
                encoded += seg
            } else {
                isValid = false
                encoded += "_"
            }
        }
    }
}

/// One HTTP call under `/api/v1`. Paths are relative to the base URL from
/// `Info.plist` (`KuraAPIBase`, set per configuration in `project.yml`).
struct Endpoint: Sendable {
    enum Method: String, Sendable { case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE" }

    var method: Method
    var path: APIPath
    var query: [URLQueryItem] = []
    var body: Data? = nil
    /// `Content-Type` of `body` (JSON unless a raw upload says otherwise).
    var contentType = "application/json"
    /// `auth/*` runs without a bearer.
    var auth = true
    /// A token to send instead of the session's (logout sends the one it just forgot).
    var explicitBearer: String? = nil
    /// True when a 401 must NOT end the session (logout).
    var suppressExpiry = false

    static func get(_ path: APIPath, _ query: [URLQueryItem] = []) -> Endpoint {
        Endpoint(method: .get, path: path, query: query)
    }

    static func post<B: Encodable>(_ path: APIPath, _ body: B, auth: Bool = true) throws -> Endpoint {
        Endpoint(method: .post, path: path, body: try KuraJSON.encoder.encode(body), auth: auth)
    }

    static func post(_ path: APIPath) -> Endpoint { Endpoint(method: .post, path: path) }

    static func put<B: Encodable>(_ path: APIPath, _ body: B) throws -> Endpoint {
        Endpoint(method: .put, path: path, body: try KuraJSON.encoder.encode(body))
    }

    static func put(_ path: APIPath) -> Endpoint { Endpoint(method: .put, path: path) }

    static func patch<B: Encodable>(_ path: APIPath, _ body: B) throws -> Endpoint {
        Endpoint(method: .patch, path: path, body: try KuraJSON.encoder.encode(body))
    }

    static func delete(_ path: APIPath) -> Endpoint { Endpoint(method: .delete, path: path) }
}

extension Notification.Name {
    /// Posted (on the main queue) when any call answers 401: the token is already gone.
    static let kuraSessionExpired = Notification.Name("com.tromwey.kura.sessionExpired")
}

/// A `409 linked_elsewhere` from `POST /me/identities/{provider}`: that sign-in belongs to another
/// Kura account, and the server already issued the proof to merge it in. `LiveAPI` turns it into
/// `LinkOutcome.mergeable`; it never reaches the store as an error.
struct MergeableConflict: Error {
    let proof: MergeProof
}

// MARK: - Client

/// When a failed `GET` is tried again (writes never are — the store's "Reintentar" toast is the
/// retry). Pure, so the scratch test can pin it down.
///
/// - Transport failures (offline, connection lost, DNS…) and 5xx: up to 3 retries with FULL
///   jitter — a uniform delay in `0...0.5 s`, `0...1 s`, `0...2 s` — so thousands of phones that
///   lost the same backend don't come back in lockstep.
/// - A timeout never retries: the request already waited `timeoutIntervalForRequest` (20 s), and
///   retrying it turned one slow backend into ~80 s of spinner and 4× the load.
/// - `503`/`429` honor `Retry-After` (header or envelope) when it is at most `maxRetryAfter`
///   seconds (+ up to 0.5 s of jitter); a longer wait is surfaced instead of slept through. A `429`
///   without `Retry-After` isn't retried; a `503` without it backs off like any 5xx.
enum RetryPolicy {
    static let maxRetries = 3
    static let backoff: [Double] = [0.5, 1, 2]
    static let maxRetryAfter: Double = 5

    enum Failure: Equatable {
        case transport
        case timedOut
        case http(status: Int, retryAfter: Double?)
        /// Cancelled, unauthorized, a bad response, any 4xx…: never retried.
        case final
    }

    /// Seconds to wait before retry number `attempt + 1`, or nil to give up. `jitter(x)` returns a
    /// uniform value in `0...x` (injectable for the test).
    static func delay(afterAttempt attempt: Int, failure: Failure,
                      jitter: (Double) -> Double = { Double.random(in: 0...$0) }) -> Double? {
        guard attempt >= 0, attempt < maxRetries else { return nil }
        switch failure {
        case .timedOut, .final:
            return nil
        case .transport:
            return jitter(backoff[attempt])
        case .http(let status, let retryAfter):
            if status == 429 || status == 503, let retryAfter {
                return retryAfter <= maxRetryAfter ? max(0, retryAfter) + jitter(0.5) : nil
            }
            if status == 429 { return nil }
            return (500...599).contains(status) ? jitter(backoff[attempt]) : nil
        }
    }

    /// `Retry-After` as seconds: delta-seconds or an HTTP-date.
    static func parseRetryAfter(_ header: String?, now: Date = Date()) -> Double? {
        guard let raw = header?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return nil }
        if let s = Double(raw) { return s >= 0 ? s : nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "GMT")
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        guard let d = f.date(from: raw) else { return nil }
        return max(0, d.timeIntervalSince(now))
    }
}

/// `URLSession` + bearer + decoder/encoder + error mapping. Reads (`GET`) retry per
/// `RetryPolicy`; identical reads in flight at the same time share one request.
final class APIClient: @unchecked Sendable {
    typealias Response = (data: Data, requestID: String?)

    let base: URL
    let session: Session
    private let urlSession: URLSession

    /// One failed attempt: the error the caller sees + how `RetryPolicy` should read it.
    private struct AttemptFailure: Error {
        let error: Error
        let kind: RetryPolicy.Failure
    }

    /// A `GET` in flight, shared by every caller that asks for the same URL with the same bearer.
    private final class InFlight: @unchecked Sendable {
        let id = UUID()
        var task: Task<Response, Error>?
        var waiters = 1
    }
    private let inFlightLock = NSLock()
    private var inFlight: [String: InFlight] = [:]

    /// `KuraAPIBase` from `Info.plist`; Release falls back to production.
    static var configuredBase: URL {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "KuraAPIBase") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return URL(string: raw.isEmpty ? "https://baclog.app/api/v1" : raw) ?? URL(string: "https://baclog.app/api/v1")!
    }

    init(base: URL = APIClient.configuredBase, session: Session = Session()) {
        self.base = base
        self.session = session
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.waitsForConnectivity = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        urlSession = URLSession(configuration: config, delegate: SameOriginRedirects(), delegateQueue: nil)
    }

    private struct ErrorEnvelope: Decodable {
        struct Body: Decodable {
            let code: String?
            let message: String?
            let fields: [String: String]?
            let retryAfterSeconds: Int?
            let reason: String?
        }
        let error: Body
    }

    private struct MergeEnvelope: Decodable { let error: MergeProof }

    private func request(for e: Endpoint) throws -> URLRequest {
        // A value that was empty or a dot segment: never sent (the server would say 404 too).
        guard e.path.isValid else { throw KuraAPIError.notFound }
        guard var comps = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            throw KuraAPIError.server("URL inválida")
        }
        // `percentEncodedPath`: `APIPath.encoded` is already escaped — the plain `path` setter
        // would escape the `%` again (`%2F` → `%252F`).
        var path = comps.percentEncodedPath
        if !path.hasSuffix("/") { path += "/" }
        comps.percentEncodedPath = path + e.path.encoded
        comps.queryItems = e.query.isEmpty ? nil : e.query
        guard let url = comps.url else { throw KuraAPIError.server("URL inválida") }
        var r = URLRequest(url: url)
        r.httpMethod = e.method.rawValue
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("ios/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0")", forHTTPHeaderField: "X-Kura-Client")
        if let body = e.body {
            r.httpBody = body
            r.setValue(e.contentType, forHTTPHeaderField: "Content-Type")
        }
        if let token = e.explicitBearer {
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else if e.auth {
            guard let token = session.token else { throw KuraAPIError.unauthorized }
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return r
    }

    /// Runs the call and returns the raw body (empty on 204).
    func data(_ e: Endpoint) async throws -> Data { try await fetch(e).data }

    /// The body plus the server's `X-Request-Id` (for the log).
    ///
    /// A `GET` whose exact URL (path + query) is already in flight WITH THE SAME BEARER joins that
    /// request instead of sending another (two screens hydrating the same title on appear). The
    /// bearer is part of the key on purpose: a response is never handed to a different session
    /// (logout → sign in as someone else while the old read is still in flight).
    private func fetch(_ e: Endpoint) async throws -> Response {
        let req = try request(for: e)
        guard e.method == .get, e.body == nil, let url = req.url?.absoluteString else {
            return try await run(req, endpoint: e)
        }
        let key = (req.value(forHTTPHeaderField: "Authorization") ?? "-") + " " + url
        return try await shared(key) { [self] in try await run(req, endpoint: e) }
    }

    private func shared(_ key: String, _ work: @escaping @Sendable () async throws -> Response) async throws -> Response {
        let entry: InFlight = inFlightLock.withLock {
            if let existing = inFlight[key] {
                existing.waiters += 1
                return existing
            }
            let fresh = InFlight()
            let id = fresh.id
            fresh.task = Task { [weak self] in
                defer { self?.finish(key, id: id) }
                return try await work()
            }
            inFlight[key] = fresh
            return fresh
        }
        return try await withTaskCancellationHandler {
            guard let task = entry.task else { throw KuraAPIError.cancelled }
            let r = try await task.value
            if Task.isCancelled { throw KuraAPIError.cancelled }
            return r
        } onCancel: { [self] in
            // The shared request dies only when EVERY caller has gone (same cut as before: a
            // cancelled screen stops its own read and the retry sleep).
            inFlightLock.withLock {
                entry.waiters -= 1
                guard entry.waiters <= 0 else { return }
                entry.task?.cancel()
                if inFlight[key]?.id == entry.id { inFlight[key] = nil }
            }
        }
    }

    private func finish(_ key: String, id: UUID) {
        inFlightLock.withLock {
            if inFlight[key]?.id == id { inFlight[key] = nil }
        }
    }

    /// One call with the `RetryPolicy` loop around it (writes: a single attempt).
    private func run(_ req: URLRequest, endpoint e: Endpoint) async throws -> Response {
        var attempt = 0
        while true {
            do {
                return try await perform(req, endpoint: e)
            } catch let f as AttemptFailure {
                guard e.method == .get, let wait = RetryPolicy.delay(afterAttempt: attempt, failure: f.kind) else {
                    throw f.error
                }
                // A throwing sleep: cancelling the task cuts the retry loop.
                do { try await Task.sleep(for: .seconds(wait)) } catch { throw KuraAPIError.cancelled }
                attempt += 1
            }
        }
    }

    private func perform(_ req: URLRequest, endpoint e: Endpoint) async throws -> Response {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await urlSession.data(for: req)
        } catch is CancellationError {
            throw AttemptFailure(error: KuraAPIError.cancelled, kind: .final)
        } catch let u as URLError {
            let mapped = APIClient.map(u)
            let kind: RetryPolicy.Failure = u.code == .timedOut ? .timedOut : (mapped == .offline ? .transport : .final)
            throw AttemptFailure(error: mapped, kind: kind)
        } catch {
            throw AttemptFailure(error: KuraAPIError.server(error.localizedDescription), kind: .final)
        }
        guard let http = response as? HTTPURLResponse else {
            throw AttemptFailure(error: KuraAPIError.server("Respuesta inválida"), kind: .final)
        }
        let rid = http.value(forHTTPHeaderField: "X-Request-Id")
        if (200..<300).contains(http.statusCode) { return (data, rid) }
        if http.statusCode >= 500 {
            // The route shape is public; the real path (handles, ids, tokens) only `.private`.
            KuraLog.api.error("\(e.method.rawValue, privacy: .public) \(e.path.template, privacy: .public) → HTTP \(http.statusCode, privacy: .public) rid=\(rid ?? "-", privacy: .public) path=\(e.path.encoded, privacy: .private)")
        }
        let env = try? KuraJSON.decoder.decode(ErrorEnvelope.self, from: data)
        // `409 linked_elsewhere` carries the proof to merge the other account inside the envelope
        // (`error.mergeToken` + `error.source`): hand it over instead of a bare conflict.
        if http.statusCode == 409, env?.error.reason == "linked_elsewhere",
           let proof = (try? KuraJSON.decoder.decode(MergeEnvelope.self, from: data))?.error {
            throw AttemptFailure(error: MergeableConflict(proof: proof), kind: .final)
        }
        let retryAfterHeader = http.value(forHTTPHeaderField: "Retry-After")
        let err = APIClient.map(status: http.statusCode, envelope: env?.error, retryAfterHeader: retryAfterHeader)
        if case .unauthorized = err {
            if e.auth, !e.suppressExpiry {
                session.clear()
                await MainActor.run { NotificationCenter.default.post(name: .kuraSessionExpired, object: nil) }
            }
            throw AttemptFailure(error: err, kind: .final)
        }
        let retryAfter = RetryPolicy.parseRetryAfter(retryAfterHeader) ?? env?.error.retryAfterSeconds.map(Double.init)
        throw AttemptFailure(error: err, kind: .http(status: http.statusCode, retryAfter: retryAfter))
    }

    func decode<T: Decodable>(_ e: Endpoint) async throws -> T {
        let (data, rid) = try await fetch(e)
        do {
            return try KuraJSON.decoder.decode(T.self, from: data)
        } catch {
            // A contract change must leave a trace outside DEBUG too: where it broke (type + key
            // path), never the payload.
            KuraLog.api.error("decode \(e.method.rawValue, privacy: .public) \(e.path.template, privacy: .public) as \(String(describing: T.self), privacy: .public) rid=\(rid ?? "-", privacy: .public): \(APIClient.describe(error), privacy: .public) path=\(e.path.encoded, privacy: .private)")
            #if DEBUG
            print("[Kura] decode \(e.method.rawValue) \(e.path.encoded) failed: \(error)\n\(String(data: data.prefix(600), encoding: .utf8) ?? "")")
            #endif
            throw KuraAPIError.server("Respuesta inesperada del servidor")
        }
    }

    /// `DecodingError` without its `debugDescription` values (which can quote the payload).
    static func describe(_ error: Error) -> String {
        func path(_ c: DecodingError.Context) -> String { c.codingPath.map(\.stringValue).joined(separator: ".") }
        switch error {
        case DecodingError.keyNotFound(let k, let c): return "keyNotFound \(k.stringValue) at \(path(c))"
        case DecodingError.typeMismatch(let t, let c): return "typeMismatch \(t) at \(path(c))"
        case DecodingError.valueNotFound(let t, let c): return "valueNotFound \(t) at \(path(c))"
        case DecodingError.dataCorrupted(let c): return "dataCorrupted at \(path(c))"
        default: return String(describing: type(of: error))
        }
    }

    func send(_ e: Endpoint) async throws {
        _ = try await data(e)
    }

    static func map(_ u: URLError) -> KuraAPIError {
        switch u.code {
        case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost,
             .dnsLookupFailed, .timedOut, .internationalRoamingOff, .dataNotAllowed, .secureConnectionFailed:
            return .offline
        case .cancelled:
            return .cancelled
        default:
            return .server(u.localizedDescription)
        }
    }

    private static func map(status: Int, envelope: ErrorEnvelope.Body?, retryAfterHeader: String?) -> KuraAPIError {
        let code = envelope?.code ?? ""
        let message = envelope?.message ?? ""
        switch code {
        case "unauthorized": return .unauthorized
        case "forbidden": return .forbidden(code: envelope?.reason)
        case "not_found": return .notFound
        // `me/identities/{provider}` and `me/merge/otp/verify`: the provider token or the code was
        // rejected (422, same body whatever failed). The store knows it as `proof_rejected`.
        case "invalid" where envelope?.reason == "invalid_proof": return .forbidden(code: "proof_rejected")
        case "invalid": return .invalid(fields: envelope?.fields ?? [:], message: message)
        case "conflict": return .conflict(code: envelope?.reason, message: message)
        case "rate_limited": return .rateLimited(retryAfter: envelope?.retryAfterSeconds ?? retryAfterHeader.flatMap(Int.init))
        case "unsupported": return .unsupported
        case "unavailable": return .unavailable
        case "underage": return .forbidden(code: "underage")
        case "not_released", "reaction_required": return .conflict(code: code, message: message)
        default: break
        }
        switch status {
        case 401: return .unauthorized
        case 403: return .forbidden(code: code.isEmpty ? nil : code)
        case 404: return .notFound
        case 400, 422: return .invalid(fields: envelope?.fields ?? [:], message: message)
        case 409: return .conflict(code: code.isEmpty ? nil : code, message: message)
        case 429: return .rateLimited(retryAfter: envelope?.retryAfterSeconds ?? retryAfterHeader.flatMap(Int.init))
        case 501: return .unsupported
        case 503: return .unavailable
        default: return .server(message.isEmpty ? "HTTP \(status)" : message)
        }
    }
}

// MARK: - Live API

/// `KuraAPI` over HTTP (API.md §4). Every path below is the wire contract this
/// client expects; cross it against the backend's zod schemas.
struct LiveAPI: KuraAPI {
    let client: APIClient
    private let deviceName: String
    private let appVersion: String

    @MainActor
    init(client: APIClient = APIClient()) {
        self.client = client
        deviceName = UIDevice.current.name
        appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    private var session: Session { client.session }

    // MARK: Session

    var hasSession: Bool { session.hasToken }
    var needsRefresh: Bool { session.needsRefresh }

    private struct OTPRequest: Encodable { let email: String }
    private struct Device: Encodable { let platform = "ios"; let name: String; let appVersion: String }
    private struct OTPVerify: Encodable { let email: String; let code: String; let device: Device }
    private struct RefreshBody: Encodable { let device: Device }

    func requestCode(email: String) async throws {
        try await client.send(try .post("auth/otp/request", OTPRequest(email: email), auth: false))
    }

    func signIn(email: String, code: String) async throws -> Me {
        let body = OTPVerify(email: email, code: code, device: Device(name: deviceName, appVersion: appVersion))
        let s: AuthSession = try await client.decode(try .post("auth/otp/verify", body, auth: false))
        session.store(s.token)
        return s.user
    }

    func refresh() async throws -> Me {
        // The optional `device` keeps this install's row in Sesiones activas named and versioned.
        let s: AuthSession = try await client.decode(try .post("auth/refresh", RefreshBody(device: Device(name: deviceName, appVersion: appVersion))))
        session.store(s.token)
        return s.user
    }

    private struct AppleName: Encodable { let givenName: String?; let familyName: String? }
    private struct AppleBody: Encodable {
        let identityToken: String
        let rawNonce: String
        let authorizationCode: String?
        let fullName: AppleName?
        let device: Device
    }
    /// `nonce`: the raw value this app put in Google's authorization URL (`GoogleNonce`);
    /// the key is omitted when there is none.
    private struct GoogleBody: Encodable { let idToken: String; let nonce: String?; let device: Device }

    func authProviders() async throws -> AuthProviders {
        try await client.decode(Endpoint(method: .get, path: "auth/providers", auth: false))
    }

    func signInWithApple(_ c: AppleCredential) async throws -> Me {
        // Apple sends the name only on the FIRST authorization of this app: forward it when present.
        let name = (c.givenName ?? c.familyName) == nil ? nil : AppleName(givenName: c.givenName, familyName: c.familyName)
        let body = AppleBody(identityToken: c.identityToken, rawNonce: c.rawNonce, authorizationCode: c.authorizationCode,
                             fullName: name, device: Device(name: deviceName, appVersion: appVersion))
        let s: AuthSession = try await client.decode(try .post("auth/apple", body, auth: false))
        session.store(s.token)
        return s.user
    }

    func signInWithGoogle(idToken: String) async throws -> Me {
        let body = GoogleBody(idToken: idToken, nonce: GoogleNonce.nonce(for: idToken), device: Device(name: deviceName, appVersion: appVersion))
        let s: AuthSession = try await client.decode(try .post("auth/google", body, auth: false))
        session.store(s.token)
        return s.user
    }

    /// `DELETE /me/devices/{token}` with a bearer captured BEFORE the session was forgotten.
    /// Best effort: a failure (offline, already gone, 401) never blocks leaving; the local flag
    /// goes off either way so release notices fall back to local ones.
    private func unregisterPush(bearer: String?) async {
        defer { PushRegistration.markUnregistered() }
        guard let bearer, let push = PushRegistration.token else { return }
        var e = Endpoint.delete("me/devices/\(push)")
        e.auth = false
        e.explicitBearer = bearer
        e.suppressExpiry = true
        try? await client.send(e)
    }

    func logout() async throws {
        // Forget the token FIRST, then tell the server with the token it had; a 401 here
        // (already-revoked or expired token) must not broadcast "session expired" to the store,
        // and isn't a failure: that token can't revoke anything anymore. Anything else
        // (offline, 5xx, 429) propagates — the other devices are still signed in.
        // The push token goes first (with the same bearer): after the logout it can't be removed.
        let token = session.token
        session.clear()
        guard let token else { return }
        await unregisterPush(bearer: token)
        var e = Endpoint.post("auth/logout")
        e.auth = false
        e.explicitBearer = token
        e.suppressExpiry = true
        #if DEBUG
        // `-kuraFailLogout YES`: the POST "fails" (as offline), to see the honest warning.
        if UserDefaults.standard.bool(forKey: "kuraFailLogout") { throw KuraAPIError.offline }
        #endif
        do {
            try await client.send(e)
        } catch KuraAPIError.unauthorized {
            return
        }
    }

    func forgetSession() {
        // The bearer is captured before it's cleared, so the device can still be unregistered
        // (a later sign-in on this iPhone never has its new token wiped by this).
        let token = session.token
        session.clear()
        guard token != nil, PushRegistration.token != nil else { return }
        Task { await unregisterPush(bearer: token) }
    }

    private struct WebSessionBody: Encodable { let to: String }
    private struct WebSessionResponse: Decodable { let url: URL }

    func webSession(to: String) async throws -> URL {
        let r: WebSessionResponse = try await client.decode(try .post("auth/web-session", WebSessionBody(to: to)))
        return r.url
    }

    // MARK: Account

    private struct Username: Encodable { let username: String }
    private struct Onboarding: Encodable { let name: String; let birthYear: Int }
    private struct Picks: Encodable { let titles: [TitleRef] }
    private struct PicksResponse: Decodable { let collection: KCollection }
    private struct UsernameCheck: Decodable { let status: UsernameStatus }

    func me() async throws -> Me { try await client.decode(.get("me")) }

    func updateMe(_ patch: MePatch) async throws -> Me { try await client.decode(try .patch("me", patch)) }

    func checkUsername(_ username: String) async throws -> UsernameStatus {
        let r: UsernameCheck = try await client.decode(.get("me/username/check", [URLQueryItem(name: "u", value: username)]))
        return r.status
    }

    func claimUsername(_ username: String) async throws -> Me {
        try await client.decode(try .put("me/username", Username(username: username)))
    }

    func completeOnboarding(name: String, birthYear: Int) async throws -> Me {
        try await client.decode(try .post("me/onboarding", Onboarding(name: name, birthYear: birthYear)))
    }

    private struct Pool: Decodable {
        let items: [Title]
        let nextPage: Int?
        private enum CodingKeys: String, CodingKey { case items, nextPage }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            items = try c.decode([Title].self, forKey: .items)
            nextPage = try c.decodeIfPresent(Int.self, forKey: .nextPage)
        }
    }

    /// `GET /onboarding/pool?page=N` (N from 1) — the curated pick pool the web uses.
    /// The first page fills the grid; a later round can page with `nextPage`.
    func onboardingGrid() async throws -> [Title] {
        let pool: Pool = try await client.decode(.get("onboarding/pool", [URLQueryItem(name: "page", value: "1")]))
        return pool.items
    }

    func onboardingPicks(_ refs: [TitleRef]) async throws -> KCollection {
        let r: PicksResponse = try await client.decode(try .post("me/onboarding/picks", Picks(titles: refs)))
        return r.collection
    }

    func onboardingPeople() async throws -> [Person] {
        let page: PeoplePage = try await client.decode(.get("me/onboarding/people"))
        return page.items
    }

    /// Raw body with the image's own `Content-Type` (API.md §4: multipart or raw; the
    /// server sniffs magic bytes either way).
    func uploadAvatar(_ data: Data, contentType: String) async throws -> Me {
        try await client.decode(Endpoint(method: .put, path: "me/avatar", body: data, contentType: contentType))
    }

    func deleteAvatar() async throws -> Me {
        try await client.decode(.delete("me/avatar"))
    }

    func deleteAccount() async throws {
        // Only a 204 means "deleted". A 401 is a revoked/expired bearer on a LIVE account
        // (logout on another device, token past `exp`): the store handles it itself — no global
        // "session expired" broadcast, which would race its own message.
        var e = Endpoint.delete("me")
        e.suppressExpiry = true
        #if DEBUG
        // `-kuraDelete401 YES`: send a bearer the server rejects, to see the honest 401 path.
        if UserDefaults.standard.bool(forKey: "kuraDelete401") { e.explicitBearer = "debug.invalid.bearer" }
        #endif
        // Best effort, before the account (and this bearer) is gone.
        await unregisterPush(bearer: session.token)
        try await client.send(e)
        session.clear()
    }

    // MARK: Devices

    func sessions() async throws -> [DeviceSession] {
        let r: Items<DeviceSession> = try await client.decode(.get("me/sessions"))
        return r.items
    }

    func revokeSession(id: String) async throws {
        try await client.send(.delete("me/sessions/\(id)"))
    }

    // MARK: Identities and merge (fase 4g)

    func identities() async throws -> Identities { try await client.decode(.get("me/identities")) }

    private struct LinkAppleBody: Encodable { let identityToken: String; let rawNonce: String; let authorizationCode: String? }
    private struct LinkGoogleBody: Encodable { let idToken: String; let nonce: String? }
    private struct MergeOTPRequest: Encodable { let email: String }
    private struct MergeOTPVerify: Encodable { let email: String; let code: String }
    private struct MergeBody: Encodable { let mergeToken: String }
    private struct UserEnvelope: Decodable { let user: Me }

    private func link(_ e: Endpoint) async throws -> LinkOutcome {
        do {
            try await client.send(e)
            return .linked
        } catch let c as MergeableConflict {
            return .mergeable(c.proof)
        }
    }

    func linkApple(_ c: AppleCredential) async throws -> LinkOutcome {
        try await link(try .post("me/identities/apple",
                                 LinkAppleBody(identityToken: c.identityToken, rawNonce: c.rawNonce, authorizationCode: c.authorizationCode)))
    }

    func linkGoogle(idToken: String) async throws -> LinkOutcome {
        try await link(try .post("me/identities/google", LinkGoogleBody(idToken: idToken, nonce: GoogleNonce.nonce(for: idToken))))
    }

    func unlinkIdentity(_ provider: IdentityProvider) async throws {
        try await client.send(.delete("me/identities/\(provider.rawValue)"))
    }

    func requestMergeCode(email: String) async throws {
        try await client.send(try .post("me/merge/otp/request", MergeOTPRequest(email: email)))
    }

    func verifyMergeCode(email: String, code: String) async throws -> MergeProof {
        try await client.decode(try .post("me/merge/otp/verify", MergeOTPVerify(email: email, code: code)))
    }

    func merge(token: String) async throws -> Me {
        let r: UserEnvelope = try await client.decode(try .post("me/merge", MergeBody(mergeToken: token)))
        return r.user
    }

    private struct DeviceBody: Encodable { let environment: String }

    /// Skips the `PUT` when THIS token + environment were already registered for THIS account
    /// (the bearer's `sub`) in the last `PushRegistration.maxRegistrationAge` — the cold-start
    /// `PUT` on every launch was pure load. Any change (rotated token, other gateway, another
    /// account signed in, `markUnregistered()` on logout/expiry, a week passed) sends it again.
    func registerDevice(pushToken: String, environment: String) async throws {
        let account = session.token.flatMap { Session.claims(of: $0)?["sub"] as? String }
        if let account, PushRegistration.isCurrent(token: pushToken, environment: environment, account: account) { return }
        try await client.send(try .put("me/devices/\(pushToken)", DeviceBody(environment: environment)))
        if let account { PushRegistration.recordRegistration(token: pushToken, environment: environment, account: account) }
    }

    // MARK: Collections

    /// `{ items: [T] }` (or a bare array). A body without `items` is a decoding error, not an empty list.
    private struct Items<T: Decodable>: Decodable {
        let items: [T]
        init(from decoder: Decoder) throws {
            if let list = try? decoder.singleValueContainer().decode([T].self) { items = list; return }
            let c = try decoder.container(keyedBy: CodingKeys.self)
            items = try c.decode([T].self, forKey: .items)
        }
        private enum CodingKeys: String, CodingKey { case items }
    }
    private struct NewCollection: Encodable { let name: String; let visibility: String }
    private struct CollectionPatch: Encodable { let name: String?; let visibility: String? }
    private struct MembershipBody: Encodable { let externalRef: ExternalRef }

    func collections() async throws -> [KCollection] {
        let r: Items<KCollection> = try await client.decode(.get("collections"))
        return r.items
    }

    func collection(id: String) async throws -> CollectionDetail {
        try await client.decode(.get("collections/\(id)"))
    }

    func createCollection(name: String, privacy: Privacy) async throws -> KCollection {
        try await client.decode(try .post("collections", NewCollection(name: name, visibility: privacy.wire)))
    }

    func updateCollection(id: String, name: String?, privacy: Privacy?) async throws -> KCollection {
        try await client.decode(try .patch("collections/\(id)", CollectionPatch(name: name, visibility: privacy?.wire)))
    }

    func deleteCollection(id: String) async throws {
        try await client.send(.delete("collections/\(id)"))
    }

    func createTitleMembership(collectionID: String, ref: TitleRef) async throws -> MembershipResult {
        switch ref {
        case .id(let id):
            return try await client.decode(.put("collections/\(collectionID)/titles/\(id)"))
        case .external(let source, let externalId):
            // Uncached catalog item: the path carries the externalId and the body the ref;
            // the backend resolves `(source, externalId)` and caches it (§4 `{ externalRef? }`).
            let body = MembershipBody(externalRef: ExternalRef(source: source, externalId: externalId))
            return try await client.decode(try .put("collections/\(collectionID)/titles/\(externalId)", body))
        }
    }

    func removeTitleMembership(collectionID: String, titleID: String) async throws {
        try await client.send(.delete("collections/\(collectionID)/titles/\(titleID)"))
    }

    // MARK: Titles

    private struct MyTitle: Decodable {
        let titleId: String
        let state: UserTitleState
    }
    private struct MarkBody: Encodable { let mark: Mark?; let preview: Bool?
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: Keys.self)
            try c.encode(mark, forKey: .mark) // null when nil
            if let preview, preview { try c.encode(true, forKey: .preview) }
        }
        enum Keys: String, CodingKey { case mark, preview }
    }
    private struct ReviewBody: Encodable { let body: String; let hasSpoiler: Bool }

    func title(id: String) async throws -> TitleDetail {
        try await client.decode(.get("titles/\(id)"))
    }

    /// `GET /titles/{id}/reviews?cursor=` → `{ items, nextCursor }` (pages of 10; only public
    /// reviews, never the caller's own — that one is pinned in `GET /titles/{id}`).
    func moreReviews(titleID: String, cursor: String) async throws -> ReviewPage {
        try await client.decode(.get("titles/\(titleID)/reviews", [URLQueryItem(name: "cursor", value: cursor)]))
    }

    /// `GET /titles?ids=` in chunks of 50, at most 4 in flight at once. The result is the
    /// chunks' items concatenated IN CHUNK ORDER (same as the old serial loop); the first chunk
    /// that fails fails the whole call and cancels the rest (same error behavior as before).
    func titles(ids: [String]) async throws -> [Title] {
        let chunks = stride(from: 0, to: ids.count, by: 50).map { Array(ids[$0..<min($0 + 50, ids.count)]) }
        let client = self.client
        @Sendable func fetch(_ chunk: [String]) async throws -> [Title] {
            let r: Items<Title> = try await client.decode(.get("titles", [URLQueryItem(name: "ids", value: chunk.joined(separator: ","))]))
            return r.items
        }
        if chunks.count <= 1 {
            guard let only = chunks.first else { return [] }
            return try await fetch(only)
        }
        let maxConcurrent = 4
        var results = [[Title]](repeating: [], count: chunks.count)
        try await withThrowingTaskGroup(of: (Int, [Title]).self) { group in
            var next = 0
            while next < min(maxConcurrent, chunks.count) {
                let i = next
                group.addTask { (i, try await fetch(chunks[i])) }
                next += 1
            }
            while let (i, items) = try await group.next() {
                results[i] = items
                if next < chunks.count {
                    let j = next
                    group.addTask { (j, try await fetch(chunks[j])) }
                    next += 1
                }
            }
        }
        return results.flatMap { $0 }
    }

    func myTitles() async throws -> [String: UserTitleState] {
        let r: Items<MyTitle> = try await client.decode(.get("me/titles"))
        return Dictionary(r.items.map { ($0.titleId, $0.state) }, uniquingKeysWith: { a, _ in a })
    }

    func setMark(titleID: String, mark: Mark?, preview: Bool) async throws -> UserTitleState {
        try await client.decode(try .put("me/titles/\(titleID)/mark", MarkBody(mark: mark, preview: preview)))
    }

    func saveReview(titleID: String, body: String, hasSpoiler: Bool) async throws -> Review {
        try await client.decode(try .put("me/titles/\(titleID)/review", ReviewBody(body: body, hasSpoiler: hasSpoiler)))
    }

    func deleteReview(titleID: String) async throws {
        try await client.send(.delete("me/titles/\(titleID)/review"))
    }

    func removeFromLibrary(titleID: String) async throws {
        try await client.send(.delete("me/titles/\(titleID)"))
    }

    // MARK: Discover

    func search(_ query: String, kind: MediaFormat?) async throws -> [SearchResult] {
        let r: Items<SearchResult> = try await client.decode(.get("search", [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "kind", value: kind?.rawValue ?? "all")
        ]))
        return r.items
    }

    func discover() async throws -> DiscoverPayload {
        try await client.decode(.get("discover"))
    }

    // MARK: People and feed

    func person(handle: String) async throws -> Person {
        try await client.decode(.get("people/\(handle)"))
    }

    func personCollection(handle: String, id: String) async throws -> CollectionDetail {
        try await client.decode(.get("people/\(handle)/collections/\(id)"))
    }

    func people(kind: PeopleKind, cursor: String?) async throws -> PeoplePage {
        var q: [URLQueryItem] = []
        if let cursor { q.append(URLQueryItem(name: "cursor", value: cursor)) }
        switch kind {
        case .following: return try await client.decode(.get("me/following", q))
        case .followers: return try await client.decode(.get("me/followers", q))
        case .suggestions: return try await client.decode(.get("people/suggestions", q))
        case .search(let s): return try await client.decode(.get("people/search", q + [URLQueryItem(name: "q", value: s)]))
        }
    }

    func setFollowing(handle: String, following: Bool) async throws {
        try await client.send(following ? .put("me/following/\(handle)") : .delete("me/following/\(handle)"))
    }

    func feed(cursor: String?) async throws -> FeedPage {
        try await client.decode(.get("feed", cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? []))
    }

    /// `{ event: FeedEvent | null }` — any other shape is a decoding error.
    private struct SuggestionEnvelope: Decodable {
        let event: FeedEvent?
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Keys.self)
            guard c.contains(.event) else {
                throw DecodingError.keyNotFound(Keys.event, .init(codingPath: c.codingPath, debugDescription: "feed/suggestion sin `event`"))
            }
            event = try c.decodeIfPresent(FeedEvent.self, forKey: .event)
        }
        enum Keys: String, CodingKey { case event }
    }

    func feedSuggestion() async throws -> FeedEvent? {
        let env: SuggestionEnvelope = try await client.decode(.get("feed/suggestion"))
        return env.event
    }

    // MARK: Safety

    private struct PersonReport: Encodable { let reason: String; let details: String? } // nil → key omitted
    private struct ReviewReport: Encodable { let reason: String }

    func reportPerson(handle: String, reason: String, details: String?) async throws {
        try await client.send(try .post("people/\(handle)/report", PersonReport(reason: reason, details: details)))
    }

    func reportReview(id: String, reason: String) async throws {
        try await client.send(try .post("reviews/\(id)/report", ReviewReport(reason: reason)))
    }

    func block(handle: String) async throws {
        try await client.send(.put("me/blocks/\(handle)"))
    }

    func unblock(_ handleOrID: String) async throws {
        try await client.send(.delete("me/blocks/\(handleOrID)"))
    }

    func blocks() async throws -> [BlockedAccount] {
        let r: Items<BlockedAccount> = try await client.decode(.get("me/blocks"))
        return r.items
    }

    // MARK: Recap

    func recapMonths() async throws -> [RecapMonth] {
        let r: Items<RecapMonth> = try await client.decode(.get("recap/months"))
        return r.items
    }

    func recap(era: String) async throws -> RecapPayload {
        // The payload is `{ stats, top, also }` — the era is only in the path.
        var r: RecapPayload = try await client.decode(.get("recap/\(era)"))
        if r.era.isEmpty { r.adopt(era: era, label: nil) }
        return r
    }
}
