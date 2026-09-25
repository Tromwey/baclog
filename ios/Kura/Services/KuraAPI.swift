import Foundation

/// The seam between the app and the backend (API.md §4/§5). The UI never talks
/// to this directly: `AppStore` applies every change optimistically and then
/// calls the API; a failure surfaces as the "No se pudo guardar · Reintentar"
/// toast. Reads are per resource (nothing loads "everything" at launch).
///
/// `LiveAPI` speaks HTTP to `/api/v1`; `MockAPI` serves `MockData` for the
/// `-kuraScreen` captures and the demo mode.
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
    var isPublic: Bool? = nil
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

// MARK: - Mock

/// In-memory API backed by `MockData`. `collections()` has a short artificial
/// latency so the loading skeleton is real; per-screen reads are instant so the
/// `-kuraScreen` captures don't race; writes succeed unless `failWrites`.
struct MockAPI: KuraAPI {
    var latency: Duration = .milliseconds(650)
    var failWrites = false

    private func wait() async { try? await Task.sleep(for: latency) }
    private func write() async throws {
        try? await Task.sleep(for: .milliseconds(120))
        if failWrites { throw KuraAPIError.server("mock") }
    }
    private func fold(_ s: String) -> String { s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil) }

    // Session — the mock is always signed in; the entrance flow only advances.
    var hasSession: Bool { true }
    var needsRefresh: Bool { false }
    func requestCode(email: String) async throws { try await write() }
    func signIn(email: String, code: String) async throws -> Me { try await write(); return Me(person: MockData.me) }
    func refresh() async throws -> Me { Me(person: MockData.me) }
    func logout() async throws {}
    func forgetSession() {}
    func webSession(to: String) async throws -> URL {
        try await write()
        return URL(string: "https://baclog.app\(to)") ?? URL(string: "https://baclog.app/recap/tarjeta")!
    }

    // Account
    func me() async throws -> Me { Me(person: MockData.me) }
    func updateMe(_ patch: MePatch) async throws -> Me {
        try await write()
        var m = Me(person: MockData.me)
        if let v = patch.notifyReleases { m.notifyReleases = v }
        if let v = patch.notifyRecap { m.notifyRecap = v }
        if let v = patch.isPublic { m.isPublic = v }
        return m
    }
    func checkUsername(_ username: String) async throws -> UsernameStatus {
        let clean = username.lowercased()
        if clean.count < 3 { return .invalid }
        return ["danpix", "luciarrr", "tono_v", "nico.ve", "kura", "feed"].contains(clean) ? .taken : .free
    }
    func claimUsername(_ username: String) async throws -> Me {
        try await write()
        let p = MockData.me
        let claimed = Person(handle: username, name: p.name, initials: p.initials, hexes: p.hexes, featuredTitleID: p.featuredTitleID,
                             followers: p.followers, followingCount: p.followingCount)
        // A fresh mock account: name/year still pending so the flow continues to "elige 3".
        return Me(person: claimed, onboarded: false)
    }
    func completeOnboarding(name: String, birthYear: Int) async throws -> Me {
        try await write()
        if birthYear > MockData.calendar.component(.year, from: MockData.now) - 13 { throw KuraAPIError.forbidden(code: "underage") }
        return Me(person: MockData.me)
    }
    func onboardingGrid() async throws -> [Title] { MockData.onboardingGrid.compactMap { id in MockData.titles.first { $0.id == id } } }
    func onboardingPicks(_ refs: [TitleRef]) async throws -> KCollection {
        try await write()
        let ids = refs.compactMap { if case .id(let s) = $0 { return s } else { return nil } }
        return KCollection(id: "obsesiones", name: "me obsesiona", titleIDs: ids, privacy: .publicAccess, createdAt: MockData.now)
    }
    func onboardingPeople() async throws -> [Person] {
        MockData.onboardingPeople.compactMap { id, why in
            guard var p = MockData.people.first(where: { $0.id == id }) else { return nil }
            p.why = why
            return p
        }
    }
    func uploadAvatar(_ data: Data, contentType: String) async throws -> Me { try await write(); return Me(person: MockData.me) }
    func deleteAvatar() async throws -> Me { try await write(); return Me(person: MockData.me) }
    func deleteAccount() async throws { try await write() }

    // Collections
    func collections() async throws -> [KCollection] { await wait(); return MockData.collections }
    func collection(id: String) async throws -> CollectionDetail {
        guard let c = MockData.collections.first(where: { $0.id == id }) else { throw KuraAPIError.notFound }
        let titles = c.titleIDs.compactMap { tid in MockData.titles.first { $0.id == tid } }
        let states = MockData.userTitles.filter { c.titleIDs.contains($0.key) }
        return CollectionDetail(collection: c, titles: titles, states: states)
    }
    func createCollection(name: String, privacy: Privacy) async throws -> KCollection {
        try await write()
        return KCollection(id: "c-\(UUID().uuidString.prefix(8))", name: name, titleIDs: [], privacy: privacy, createdAt: Date())
    }
    func updateCollection(id: String, name: String?, privacy: Privacy?) async throws -> KCollection {
        try await write()
        var c = MockData.collections.first { $0.id == id } ?? KCollection(id: id, name: name ?? "", titleIDs: [], privacy: privacy ?? .onlyMe, createdAt: Date())
        if let name { c.name = name }
        if let privacy { c.privacy = privacy }
        return c
    }
    func deleteCollection(id: String) async throws { try await write() }
    func createTitleMembership(collectionID: String, ref: TitleRef) async throws -> MembershipResult {
        try await write()
        guard case .id(let tid) = ref, let t = MockData.titles.first(where: { $0.id == tid }) else { throw KuraAPIError.notFound }
        return MembershipResult(title: t, state: MockData.userTitles[tid] ?? UserTitleState(savedAt: Date()))
    }
    func removeTitleMembership(collectionID: String, titleID: String) async throws { try await write() }

    // Titles
    func title(id: String) async throws -> TitleDetail {
        guard let t = MockData.titles.first(where: { $0.id == id }) else { throw KuraAPIError.notFound }
        let cols = MockData.collections.filter { $0.titleIDs.contains(id) }.map(\.id)
        return TitleDetail(title: t, state: MockData.userTitles[id], following: MockData.peopleMarks[id] ?? [],
                           reviews: MockData.reviews.filter { $0.titleID == id }, collections: cols)
    }
    func moreReviews(titleID: String, cursor: String) async throws -> ReviewPage { ReviewPage(items: []) }
    func titles(ids: [String]) async throws -> [Title] { MockData.titles.filter { ids.contains($0.id) } }
    func myTitles() async throws -> [String: UserTitleState] { MockData.userTitles }
    func setMark(titleID: String, mark: Mark?, preview: Bool) async throws -> UserTitleState {
        try await write()
        var s = MockData.userTitles[titleID] ?? UserTitleState(savedAt: Date())
        s.mark = mark
        return s
    }
    func saveReview(titleID: String, body: String, hasSpoiler: Bool) async throws -> Review {
        try await write()
        return Review(id: MockData.userTitles[titleID]?.reviewID ?? "r-\(UUID().uuidString.prefix(6))", authorID: MockData.me.id,
                      titleID: titleID, text: body, mark: MockData.userTitles[titleID]?.mark, spoiler: hasSpoiler, date: Date())
    }
    func deleteReview(titleID: String) async throws { try await write() }
    func removeFromLibrary(titleID: String) async throws { try await write() }

    // Discover
    func search(_ query: String, kind: MediaFormat?) async throws -> [SearchResult] {
        let q = fold(query).trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return [] }
        return MockData.titles
            .filter { kind == nil || $0.format == kind }
            .filter { fold($0.name).contains(q) || fold($0.creator ?? "").contains(q) }
            .map(SearchResult.init(title:))
    }
    func discover() async throws -> DiscoverPayload {
        func t(_ id: String) -> Title? { MockData.titles.first { $0.id == id } }
        let recs: [(String, String)] = [("ma", "Porque te obsesiona Mala"), ("pearl", "Porque guardaste Spider-Man 3"),
                                        ("severance", "Porque guardaste The Odyssey"), ("mononoke", "Porque te obsesiona El viaje de Chihiro")]
        let trending = ["odyssey", "severance", "pearl", "chihiro", "mindofmine", "spiderman3", "ma", "mala", "eduardo"]
        let upcoming = ["odyssey", "showgirl", "ycse", "doomsday", "severance", "nube"]
        return DiscoverPayload(
            recommended: recs.compactMap { id, why in t(id).map { DiscoverPayload.Recommended(title: $0, reason: why) } },
            trending: trending.enumerated().compactMap { i, id in t(id).map { DiscoverPayload.Trending(title: $0, saves: 900 - i * 80) } },
            upcoming: upcoming.compactMap { id in t(id).map { DiscoverPayload.Upcoming(title: $0) } })
    }

    // People and feed
    func person(handle: String) async throws -> Person {
        guard var p = MockData.people.first(where: { $0.id == handle }) else { throw KuraAPIError.notFound }
        p.isFollowing = MockData.following.contains(handle)
        return p
    }
    func personCollection(handle: String, id: String) async throws -> CollectionDetail {
        guard let p = MockData.people.first(where: { $0.id == handle }),
              let pc = p.collections.first(where: { ($0.remoteID ?? $0.name) == id }),
              pc.privacy != .onlyMe else { throw KuraAPIError.notFound }
        let titles = pc.titleIDs.compactMap { tid in MockData.titles.first { $0.id == tid } }
        let states = Dictionary(uniqueKeysWithValues: p.obsessions.filter(pc.titleIDs.contains).map {
            ($0, UserTitleState(mark: .obsessed, savedAt: MockData.now))
        })
        return CollectionDetail(collection: KCollection(id: id, name: pc.name, titleIDs: pc.titleIDs, privacy: pc.privacy,
                                                        createdAt: MockData.now),
                                titles: titles, states: states)
    }
    func people(kind: PeopleKind, cursor: String?) async throws -> PeoplePage {
        func list(_ ids: [String]) -> [Person] { ids.compactMap { id in MockData.people.first { $0.id == id } } }
        switch kind {
        case .following: return PeoplePage(items: list(MockData.followingOf[MockData.me.id] ?? []))
        case .followers: return PeoplePage(items: list(MockData.followersOf[MockData.me.id] ?? []))
        case .suggestions: return PeoplePage(items: MockData.people.filter { $0.id != MockData.me.id && !MockData.following.contains($0.id) && $0.why != nil })
        case .search(let q):
            let f = fold(q).replacingOccurrences(of: "@", with: "")
            guard !f.isEmpty else { return PeoplePage(items: []) }
            return PeoplePage(items: MockData.people.filter { $0.id != MockData.me.id && (fold($0.handle).contains(f) || fold($0.name).contains(f)) }
                .sorted { $0.common.count > $1.common.count })
        }
    }
    func setFollowing(handle: String, following: Bool) async throws { try await write() }
    func feed(cursor: String?) async throws -> FeedPage {
        // Like the wire: a review event carries its review.
        FeedPage(items: MockData.feed.map { e in
            var e = e
            e.embeddedReview = MockData.reviews.first { $0.id == e.reviewID }
            return e
        })
    }
    func feedSuggestion() async throws -> FeedEvent? { nil }

    // Recap
    func recapMonths() async throws -> [RecapMonth] {
        [RecapMonth(era: "2026-08", label: "agosto 2026"), RecapMonth(era: "2026-07", label: "julio 2026"),
         RecapMonth(era: "2026-06", label: "junio 2026"), RecapMonth(era: "2026-05", label: "mayo 2026")]
    }
    func recap(era: String) async throws -> RecapPayload {
        func t(_ id: String) -> Title? { MockData.titles.first { $0.id == id } }
        let tops = ["2026-08": ("agosto", "ma"), "2026-07": ("julio", "chihiro"), "2026-06": ("junio", "pearl"), "2026-05": ("mayo", "mala")]
        guard let (month, top) = tops[era] else { throw KuraAPIError.notFound }
        return RecapPayload(era: era, month: month, year: 2026,
                            stats: RecapPayload.Stats(completed: 14, obsessed: 6, reviews: 3, saved: 9, hours: 31),
                            top: t(top), also: ["chihiro", "mala", "pearl", "eduardo"].compactMap(t))
    }
}

/// People / collections / titles shown on the mock's followers screen of
/// someone else (20e). Live has no such route (lists are owner-only, §4).
extension MockAPI {
    func peopleOf(_ handle: String, following: Bool) -> [Person] {
        let ids = (following ? MockData.followingOf[handle] : MockData.followersOf[handle]) ?? []
        return ids.compactMap { id in MockData.people.first { $0.id == id } }
    }
}
