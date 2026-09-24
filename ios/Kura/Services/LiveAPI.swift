import Foundation
import UIKit

// MARK: - Endpoint

/// One HTTP call under `/api/v1`. Paths are relative to the base URL from
/// `Info.plist` (`KuraAPIBase`, set per configuration in `project.yml`).
struct Endpoint {
    enum Method: String { case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE" }

    var method: Method
    var path: String
    var query: [URLQueryItem] = []
    var body: Data? = nil
    /// `auth/*` runs without a bearer.
    var auth = true
    /// A token to send instead of the session's (logout sends the one it just forgot).
    var explicitBearer: String? = nil
    /// True when a 401 must NOT end the session (logout).
    var suppressExpiry = false

    static func get(_ path: String, _ query: [URLQueryItem] = []) -> Endpoint {
        Endpoint(method: .get, path: path, query: query)
    }

    static func post<B: Encodable>(_ path: String, _ body: B, auth: Bool = true) throws -> Endpoint {
        Endpoint(method: .post, path: path, body: try KuraJSON.encoder.encode(body), auth: auth)
    }

    static func post(_ path: String) -> Endpoint { Endpoint(method: .post, path: path) }

    static func put<B: Encodable>(_ path: String, _ body: B) throws -> Endpoint {
        Endpoint(method: .put, path: path, body: try KuraJSON.encoder.encode(body))
    }

    static func put(_ path: String) -> Endpoint { Endpoint(method: .put, path: path) }

    static func patch<B: Encodable>(_ path: String, _ body: B) throws -> Endpoint {
        Endpoint(method: .patch, path: path, body: try KuraJSON.encoder.encode(body))
    }

    static func delete(_ path: String) -> Endpoint { Endpoint(method: .delete, path: path) }
}

extension Notification.Name {
    /// Posted (on the main queue) when any call answers 401: the token is already gone.
    static let kuraSessionExpired = Notification.Name("io.communeo.kura.sessionExpired")
}

// MARK: - Client

/// `URLSession` + bearer + decoder/encoder + error mapping. Reads (`GET`)
/// retry with exponential backoff (0.5 / 1 / 2 s) on transport failures and
/// 5xx; writes never retry — the store's "Reintentar" toast is the retry.
final class APIClient: @unchecked Sendable {
    let base: URL
    let session: Session
    private let urlSession: URLSession
    private let retryDelays: [Duration] = [.milliseconds(500), .seconds(1), .seconds(2)]

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
        urlSession = URLSession(configuration: config)
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

    private func request(for e: Endpoint) throws -> URLRequest {
        var path = base.path
        if !path.hasSuffix("/") { path += "/" }
        path += e.path
        var comps = URLComponents(url: base, resolvingAgainstBaseURL: false)!
        comps.path = path
        comps.queryItems = e.query.isEmpty ? nil : e.query
        guard let url = comps.url else { throw KuraAPIError.server("URL inválida") }
        var r = URLRequest(url: url)
        r.httpMethod = e.method.rawValue
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("ios/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0")", forHTTPHeaderField: "X-Kura-Client")
        if let body = e.body {
            r.httpBody = body
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
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
    func data(_ e: Endpoint) async throws -> Data {
        let req = try request(for: e)
        var attempt = 0
        while true {
            do {
                return try await perform(req, endpoint: e)
            } catch let err as KuraAPIError {
                guard e.method == .get, attempt < retryDelays.count, err.isRetryable else { throw err }
                // A throwing sleep: cancelling the task cuts the retry loop.
                do { try await Task.sleep(for: retryDelays[attempt]) } catch { throw KuraAPIError.cancelled }
                attempt += 1
            }
        }
    }

    private func perform(_ req: URLRequest, endpoint e: Endpoint) async throws -> Data {
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await urlSession.data(for: req)
        } catch is CancellationError {
            throw KuraAPIError.cancelled
        } catch let u as URLError {
            throw APIClient.map(u)
        } catch {
            throw KuraAPIError.server(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw KuraAPIError.server("Respuesta inválida") }
        if (200..<300).contains(http.statusCode) { return data }
        let env = try? KuraJSON.decoder.decode(ErrorEnvelope.self, from: data)
        let err = APIClient.map(status: http.statusCode, envelope: env?.error, retryAfterHeader: http.value(forHTTPHeaderField: "Retry-After"))
        if case .unauthorized = err, e.auth, !e.suppressExpiry {
            session.clear()
            await MainActor.run { NotificationCenter.default.post(name: .kuraSessionExpired, object: nil) }
        }
        throw err
    }

    func decode<T: Decodable>(_ e: Endpoint) async throws -> T {
        let data = try await self.data(e)
        do {
            return try KuraJSON.decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("[Kura] decode \(e.method.rawValue) \(e.path) failed: \(error)\n\(String(data: data.prefix(600), encoding: .utf8) ?? "")")
            #endif
            throw KuraAPIError.server("Respuesta inesperada del servidor")
        }
    }

    /// Like `decode`, but `null` / empty / 204 → nil.
    func decodeOptional<T: Decodable>(_ e: Endpoint) async throws -> T? {
        let data = try await self.data(e)
        let trimmed = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty || trimmed == "null" { return nil }
        return try KuraJSON.decoder.decode(T.self, from: data)
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

private extension KuraAPIError {
    /// Transport trouble and 5xx retry; a cancelled task never does.
    var isRetryable: Bool {
        switch self {
        case .offline, .unavailable, .server: return true
        default: return false
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
        let s: AuthSession = try await client.decode(.post("auth/refresh"))
        session.store(s.token)
        return s.user
    }

    func logout() async throws {
        // Forget the token FIRST, then tell the server with the token it had; a 401 here
        // (already-expired token) must not broadcast "session expired" to the store.
        let token = session.token
        session.clear()
        guard let token else { return }
        var e = Endpoint.post("auth/logout")
        e.auth = false
        e.explicitBearer = token
        e.suppressExpiry = true
        try? await client.send(e)
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

    func deleteAccount() async throws {
        try await client.send(.delete("me"))
        session.clear()
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

    func titles(ids: [String]) async throws -> [Title] {
        var out: [Title] = []
        for chunk in stride(from: 0, to: ids.count, by: 50).map({ Array(ids[$0..<min($0 + 50, ids.count)]) }) {
            let r: Items<Title> = try await client.decode(.get("titles", [URLQueryItem(name: "ids", value: chunk.joined(separator: ","))]))
            out += r.items
        }
        return out
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
