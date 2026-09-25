import Foundation

/// The seam between the app and the backend (API.md §4/§5). The UI never talks
/// to this directly: `AppStore` applies every change optimistically and then
/// calls the API; a failure surfaces as the "No se pudo guardar · Reintentar"
/// toast. Reads are per resource (nothing loads "everything" at launch).
///
/// `LiveAPI` speaks HTTP to `/api/v1`; `MockAPI` (`Mock/MockAPI.swift`, DEBUG only) serves
/// `MockData` for the `-kuraScreen` captures and `-kuraMock`.
protocol KuraAPI: Sendable {
    // MARK: Session (§2)
    /// True when a bearer token is stored (the app can skip the entrance).
    var hasSession: Bool { get }
    /// True when the token expires in < 7 days (the app refreshes on launch).
    var needsRefresh: Bool { get }
    func requestCode(email: String) async throws
    func signIn(email: String, code: String) async throws -> Me
    func refresh() async throws -> Me
    /// `POST auth/logout` — "en todos tus dispositivos" (bumps `token_version`, API.md §2.1).
    /// Forgets the stored token FIRST and sends the old one explicitly. Throws when the server
    /// did not confirm (offline, 5xx, 429): the local session is gone anyway, but the other
    /// devices may still be signed in, and the caller must say so. A 401 is not an error here
    /// (that token was already dead: nothing left to revoke with it).
    func logout() async throws
    /// Forgets the stored token without telling the server (closing an account just created
    /// on this device, or after `DELETE /me` / a 401): never touches other devices.
    func forgetSession()
    /// `POST auth/web-session` → a one-shot (60 s) URL that opens the web already signed in
    /// and lands on `to` (server allow-list: `/recap/tarjeta`, `/recap`; the recap pair
    /// optionally with `?mes=YYYY-MM`). Open it in an `SFSafariViewController`, never share it.
    func webSession(to: String) async throws -> URL
    /// `GET /auth/providers` (no bearer) — which third-party sign-ins the server can honor.
    func authProviders() async throws -> AuthProviders
    /// `POST /auth/apple` → `{ token, user }` (stores the token like `signIn`). 403 `underage`,
    /// 503 `unavailable` when the server can't verify Apple right now.
    func signInWithApple(_ credential: AppleCredential) async throws -> Me
    /// `POST /auth/google` `{ idToken, nonce?, device }` → `{ token, user }`. 503 when Google isn't
    /// configured. `nonce` is looked up by `LiveAPI` from `GoogleNonce` (set by `GoogleOAuth`).
    func signInWithGoogle(idToken: String) async throws -> Me

    // MARK: Devices (sessions + push)
    /// `GET /me/sessions` → `{ items }`: every device signed in to this account.
    func sessions() async throws -> [DeviceSession]
    /// `DELETE /me/sessions/{id}` → 204. Signs out THAT device only (never the current one here).
    func revokeSession(id: String) async throws
    /// `PUT /me/devices/{token}` `{ environment }` → 204. `environment` = `sandbox` | `production`.
    func registerDevice(pushToken: String, environment: String) async throws

    // MARK: Identities and merge (fase 4g)
    /// `GET /me/identities` → the account email + the enabled providers and whether each is linked.
    func identities() async throws -> Identities
    /// `POST /me/identities/apple` `{ identityToken, rawNonce, authorizationCode? }`. A 409
    /// `linked_elsewhere` comes back as `.mergeable` (not thrown). A rejected Apple token is
    /// `422 invalid_proof`, thrown as `.forbidden("proof_rejected")`.
    func linkApple(_ credential: AppleCredential) async throws -> LinkOutcome
    /// `POST /me/identities/google` `{ idToken, nonce? }`. Same outcomes as `linkApple`.
    func linkGoogle(idToken: String) async throws -> LinkOutcome
    /// `DELETE /me/identities/{provider}` → 204. 409 `last_way_in` for Apple when the account email
    /// is an Apple relay and nothing else is linked (nothing is touched).
    func unlinkIdentity(_ provider: IdentityProvider) async throws
    /// `POST /me/merge/otp/request { email }` → 204 always (no oracle); 429 on the 60 s cooldown or
    /// the 3-per-hour cap per target email (`retryAfterSeconds` up to ~3600).
    func requestMergeCode(email: String) async throws
    /// `POST /me/merge/otp/verify { email, code }` → `{ mergeToken, source }`. A bad/expired code
    /// (or no such account) is `422 invalid_proof`, thrown as `.forbidden("proof_rejected")`.
    func verifyMergeCode(email: String, code: String) async throws -> MergeProof
    /// `POST /me/merge { mergeToken }` → `{ user: Me }` (this account, with the other one folded in).
    /// 409 `merge_token_invalid` (expired / used), 403 `underage`.
    func merge(token: String) async throws -> Me

    // MARK: Account
    func me() async throws -> Me
    func updateMe(_ patch: MePatch) async throws -> Me
    func checkUsername(_ username: String) async throws -> UsernameStatus
    func claimUsername(_ username: String) async throws -> Me
    func completeOnboarding(name: String, birthYear: Int) async throws -> Me
    /// Titles offered on "elige 3" before typing (`GET /onboarding/pool?page=1` on live).
    func onboardingGrid() async throws -> [Title]
    func onboardingPicks(_ refs: [TitleRef]) async throws -> KCollection
    func onboardingPeople() async throws -> [Person]
    /// `PUT /me/avatar` — the photo already cropped and reduced on the device (≤ 400 KB).
    func uploadAvatar(_ data: Data, contentType: String) async throws -> Me
    /// `DELETE /me/avatar`.
    func deleteAvatar() async throws -> Me
    func deleteAccount() async throws

    // MARK: Collections
    func collections() async throws -> [KCollection]
    func collection(id: String) async throws -> CollectionDetail
    func createCollection(name: String, privacy: Privacy) async throws -> KCollection
    func updateCollection(id: String, name: String?, privacy: Privacy?) async throws -> KCollection
    func deleteCollection(id: String) async throws
    func createTitleMembership(collectionID: String, ref: TitleRef) async throws -> MembershipResult
    func removeTitleMembership(collectionID: String, titleID: String) async throws

    // MARK: Titles and your state (keyed on the title, identical across collections)
    func title(id: String) async throws -> TitleDetail
    /// "Más reseñas": the next page of a title's reviews (`GET /titles/{id}/reviews?cursor=`,
    /// same `paginated(ReviewSchema)` as the ficha's first page).
    func moreReviews(titleID: String, cursor: String) async throws -> ReviewPage
    func titles(ids: [String]) async throws -> [Title]
    func myTitles() async throws -> [String: UserTitleState]
    /// `PUT /me/titles/{id}/mark`. On a catalog title you haven't saved it CREATES your state
    /// (200: the title enters `GET /me/titles` in no collection); `mark: nil` on an unsaved title
    /// is 404, as is an id the catalog doesn't know (the app reverts: "búscalo de nuevo"). An
    /// `ext:` search result isn't in the catalog yet, so the store never sends it here: it has to
    /// be saved first. `409 not_released` without `preview` while it isn't out.
    func setMark(titleID: String, mark: Mark?, preview: Bool) async throws -> UserTitleState
    func saveReview(titleID: String, body: String, hasSpoiler: Bool) async throws -> Review
    func deleteReview(titleID: String) async throws
    func removeFromLibrary(titleID: String) async throws

    // MARK: Discover
    func search(_ query: String, kind: MediaFormat?) async throws -> [SearchResult]
    func discover() async throws -> DiscoverPayload

    // MARK: People and feed
    func person(handle: String) async throws -> Person
    /// Someone's public collection; `states` are the OWNER's (read-only).
    func personCollection(handle: String, id: String) async throws -> CollectionDetail
    func people(kind: PeopleKind, cursor: String?) async throws -> PeoplePage
    func setFollowing(handle: String, following: Bool) async throws
    func feed(cursor: String?) async throws -> FeedPage
    func feedSuggestion() async throws -> FeedEvent?

    // MARK: Safety (App Review 1.2: report and block user-generated content)
    /// `POST /people/{handle}/report` `{ reason, details? }` → 204. `reason` is a `ReportReason.profile` id.
    func reportPerson(handle: String, reason: String, details: String?) async throws
    /// `POST /reviews/{id}/report` `{ reason }` → 204. `reason` is a `ReportReason.review` id.
    func reportReview(id: String, reason: String) async throws
    /// `PUT /me/blocks/{handle}` → 204 (404 when the handle doesn't exist). The server drops the
    /// follows both ways and hides each one's activity, reviews, search and suggestions from the other.
    func block(handle: String) async throws
    /// `DELETE /me/blocks/{handleOrId}` → 204.
    func unblock(_ handleOrID: String) async throws
    /// `GET /me/blocks` → `{ items }`.
    func blocks() async throws -> [BlockedAccount]

    // MARK: Recap
    func recapMonths() async throws -> [RecapMonth]
    func recap(era: String) async throws -> RecapPayload
}

/// `PATCH /me` body — only the fields you set are sent.
struct MePatch: Encodable, Sendable {
    var name: String? = nil
    var preferredService: String? = nil
    var notifyReleases: Bool? = nil
    /// The monthly recap email on/off.
    var notifyRecap: Bool? = nil
    /// Push when someone new follows you.
    var notifyFollowers: Bool? = nil
    var isPublic: Bool? = nil
}

/// What `ASAuthorizationAppleIDCredential` hands over, ready for `POST /auth/apple`. `rawNonce`
/// is the value whose SHA-256 went in the Apple request (the server re-hashes and compares it
/// with the `nonce` claim of `identityToken`).
struct AppleCredential: Sendable {
    var identityToken: String
    var rawNonce: String
    var authorizationCode: String?
    var givenName: String?
    var familyName: String?
}

/// `error.code` → typed cases (API.md §1). `unauthorized` anywhere means the
/// session is gone: the store forgets the token and goes back to the entrance.
enum KuraAPIError: Error, Equatable {
    case unauthorized
    case forbidden(code: String?)
    case notFound
    case invalid(fields: [String: String], message: String)
    case conflict(code: String?, message: String)
    case rateLimited(retryAfter: Int?)
    case unsupported
    case unavailable
    case offline
    /// The task was cancelled (a view went away): never retried, never shown.
    case cancelled
    case server(String)

    var isRateLimit: Bool { if case .rateLimited = self { return true }; return false }

    /// Text for the toast, in the Kura voice (what happened, what to do).
    var toast: String {
        switch self {
        case .offline: return "Sin conexión"
        case .rateLimited: return "Demasiado rápido. Espera un momento"
        case .unavailable: return "El catálogo no responde"
        case .conflict(let code, _) where code == "not_released": return "Todavía no sale. Márcala como preestreno"
        // The server unlocks reviews only with a reaction (`obsessed || verdict != null`):
        // "Completo" alone saves `verdict = null`, so it never unlocks them.
        case .conflict(let code, _) where code == "reaction_required": return "Para reseñar, elige Me gusta o Me obsesiona."
        case .invalid(_, let m) where !m.isEmpty: return m
        default: return "No se pudo guardar"
        }
    }
}
