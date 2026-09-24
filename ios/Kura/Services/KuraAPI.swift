import Foundation

/// The seam between the app and the backend. The UI never talks to this
/// directly: `AppStore` applies every change optimistically and then calls the
/// API; a failure surfaces as the "No se pudo guardar · Reintentar" toast.
///
/// To plug in the real backend, write a `LiveAPI: KuraAPI` (URLSession against
/// the Next.js server actions / route handlers) and pass it to `AppStore(api:)`
/// in `KuraApp`. Nothing else changes.
protocol KuraAPI: Sendable {
    // Session
    func currentUser() async throws -> Person

    // Reads
    func catalog() async throws -> [Title]
    func collections() async throws -> [KCollection]
    func userTitles() async throws -> [String: UserTitleState]
    func people() async throws -> [Person]
    func following() async throws -> Set<String>
    func reviews() async throws -> [Review]
    func feed() async throws -> [FeedEvent]
    func search(_ query: String) async throws -> [Title]

    // Collection writes
    func createCollection(_ collection: KCollection) async throws
    func updateCollection(_ collection: KCollection) async throws
    func deleteCollection(id: String) async throws

    // Per-title writes (keyed on the title, identical across collections)
    func setMark(titleID: String, mark: Mark?) async throws
    func saveReview(_ review: Review) async throws
    func setEpisodeWatched(titleID: String, key: String, watched: Bool) async throws

    // Social
    func setFollowing(personID: String, following: Bool) async throws
}

enum KuraAPIError: Error {
    case offline
    case server(String)
}

/// In-memory API backed by `MockData`. Reads have a short artificial latency
/// so the loading skeletons are real; writes succeed unless `failWrites`.
struct MockAPI: KuraAPI {
    var latency: Duration = .milliseconds(650)
    var failWrites = false

    private func wait() async { try? await Task.sleep(for: latency) }
    private func write() async throws {
        try? await Task.sleep(for: .milliseconds(120))
        if failWrites { throw KuraAPIError.server("mock") }
    }

    func currentUser() async throws -> Person { MockData.me }
    func catalog() async throws -> [Title] { MockData.titles }
    func collections() async throws -> [KCollection] { await wait(); return MockData.collections }
    func userTitles() async throws -> [String: UserTitleState] { MockData.userTitles }
    func people() async throws -> [Person] { MockData.people }
    func following() async throws -> Set<String> { MockData.following }
    func reviews() async throws -> [Review] { MockData.reviews }
    func feed() async throws -> [FeedEvent] { MockData.feed }

    func search(_ query: String) async throws -> [Title] {
        let q = query.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return [] }
        return MockData.titles.filter {
            $0.name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).contains(q)
                || $0.creator.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).contains(q)
        }
    }

    func createCollection(_ collection: KCollection) async throws { try await write() }
    func updateCollection(_ collection: KCollection) async throws { try await write() }
    func deleteCollection(id: String) async throws { try await write() }
    func setMark(titleID: String, mark: Mark?) async throws { try await write() }
    func saveReview(_ review: Review) async throws { try await write() }
    func setEpisodeWatched(titleID: String, key: String, watched: Bool) async throws { try await write() }
    func setFollowing(personID: String, following: Bool) async throws { try await write() }
}
