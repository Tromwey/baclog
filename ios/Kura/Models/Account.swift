import SwiftUI

// Your account: `Me`, the entrance payloads, identities, merge, device sessions and push destinations.

/// The signed-in account (`GET /me`). Superset of `Person`: `handle` is nil
/// until claimed, plus the settings the API owns.
struct Me: Hashable, Decodable {
    var handle: String?
    var name: String
    var initials: String
    var hexes: [String]
    var featuredTitleID: String?
    var followers: Int
    var followingCount: Int
    var stats: PersonStats
    var email: String?
    var preferredService: String?
    var notifyReleases: Bool
    /// The monthly recap email (`notify_recap`). Absent on an older server → assumed on (its default).
    var notifyRecap: Bool
    /// Push when someone new follows you (`notify_followers`). Absent → assumed on.
    var notifyFollowers: Bool
    var isPublic: Bool
    var avatarURL: URL?
    var isFounder: Bool
    /// `onboardingComplete` — `name` is set; the app skips the onboarding. Absent → assumed done.
    var onboarded: Bool

    var person: Person {
        var p = Person(handle: handle ?? "", name: name, initials: initials, hexes: hexes, featuredTitleID: featuredTitleID,
                       isPrivate: !isPublic, followers: followers, followingCount: followingCount, stats: stats)
        p.avatarURL = avatarURL
        return p
    }

    init(person p: Person, email: String? = nil, preferredService: String? = nil, notifyReleases: Bool = true,
         notifyRecap: Bool = true, notifyFollowers: Bool = true, isPublic: Bool = true, onboarded: Bool = true) {
        handle = p.handle.isEmpty ? nil : p.handle
        name = p.name; initials = p.initials; hexes = p.hexes; featuredTitleID = p.featuredTitleID
        followers = p.followers; followingCount = p.followingCount; stats = p.stats
        self.email = email; self.preferredService = preferredService; self.notifyReleases = notifyReleases
        self.notifyRecap = notifyRecap
        self.notifyFollowers = notifyFollowers
        self.isPublic = isPublic; avatarURL = p.avatarURL; isFounder = false; self.onboarded = onboarded
    }

    private enum CodingKeys: String, CodingKey {
        case handle, username, name, displayName, initials, hexes, featuredTitleId, followers, followersCount, followingCount,
             stats, email, preferredService, notifyReleases, notifyRecap, notifyFollowers, isPublic, avatarUrl, isFounder, onboardingComplete
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let h = try c.decodeIfPresent(String.self, forKey: .handle) ?? c.decodeIfPresent(String.self, forKey: .username)
        handle = (h?.isEmpty ?? true) ? nil : h
        let n = try c.decodeIfPresent(String.self, forKey: .name) ?? c.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        name = n
        initials = try c.decodeIfPresent(String.self, forKey: .initials) ?? Person.initials(of: n.isEmpty ? (handle ?? "k") : n)
        hexes = try c.decodeIfPresent([String].self, forKey: .hexes) ?? []
        featuredTitleID = try c.decodeIfPresent(String.self, forKey: .featuredTitleId)
        followers = try c.decodeIfPresent(Int.self, forKey: .followers) ?? c.decodeIfPresent(Int.self, forKey: .followersCount) ?? 0
        followingCount = try c.decodeIfPresent(Int.self, forKey: .followingCount) ?? 0
        stats = try c.decodeIfPresent(PersonStats.self, forKey: .stats) ?? PersonStats()
        email = try c.decodeIfPresent(String.self, forKey: .email)
        preferredService = try c.decodeIfPresent(String.self, forKey: .preferredService)
        notifyReleases = try c.decodeIfPresent(Bool.self, forKey: .notifyReleases) ?? true
        notifyRecap = try c.decodeIfPresent(Bool.self, forKey: .notifyRecap) ?? true
        notifyFollowers = try c.decodeIfPresent(Bool.self, forKey: .notifyFollowers) ?? true
        isPublic = try c.decodeIfPresent(Bool.self, forKey: .isPublic) ?? true
        avatarURL = KuraRuntime.resolve(try c.decodeIfPresent(String.self, forKey: .avatarUrl))
        isFounder = try c.decodeIfPresent(Bool.self, forKey: .isFounder) ?? false
        onboarded = try c.decodeIfPresent(Bool.self, forKey: .onboardingComplete) ?? !n.isEmpty
    }
}

enum UsernameStatus: String, Decodable {
    case free, taken, invalid
}

/// `POST auth/otp/verify` / `POST auth/refresh` / `POST auth/apple` / `POST auth/google` → `{ token, user }`.
struct AuthSession: Decodable {
    let token: String
    let user: Me
}

/// `GET /auth/providers` → `{ apple: Bool, google: { clientId } | null }`. The entrance paints
/// ONLY the buttons that work (App Review 2.1): Apple when `apple`, Google when there's a client id.
/// If the call fails the entrance is correo only (`.emailOnly`).
struct AuthProviders: Hashable, Decodable, Sendable {
    var apple: Bool
    /// The iOS OAuth client id (`….apps.googleusercontent.com`); nil = no Google button.
    var googleClientID: String?

    static let emailOnly = AuthProviders(apple: false, googleClientID: nil)

    init(apple: Bool, googleClientID: String?) {
        self.apple = apple; self.googleClientID = googleClientID
    }

    private enum CodingKeys: String, CodingKey { case apple, google }
    private struct Google: Decodable { let clientId: String? }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        apple = try c.decodeIfPresent(Bool.self, forKey: .apple) ?? false
        let id = try c.decodeIfPresent(Google.self, forKey: .google)?.clientId?.trimmingCharacters(in: .whitespaces)
        googleClientID = (id?.isEmpty ?? true) ? nil : id
    }
}

// MARK: - Identities and merge (fase 4g)

/// A third-party sign-in that can be attached to the account.
enum IdentityProvider: String, Hashable, Sendable, CaseIterable, Identifiable {
    case apple, google
    var id: String { rawValue }
    var label: String { self == .apple ? "Apple" : "Google" }
}

/// `GET /me/identities` → `{ email, providers: [{ provider, linked }] }`. `providers` only lists
/// what the server has enabled today; an unknown provider string is dropped.
struct Identities: Hashable, Decodable, Sendable {
    struct Link: Hashable, Sendable {
        var provider: IdentityProvider
        var linked: Bool
    }
    var email: String
    var providers: [Link]
    /// The account email is an Apple private relay: with no other provider linked, Apple is the
    /// only real way in, so the server refuses to disconnect it (409 `last_way_in`).
    var emailIsRelay: Bool

    init(email: String, providers: [Link], emailIsRelay: Bool = false) {
        self.email = email; self.providers = providers; self.emailIsRelay = emailIsRelay
    }

    /// Disconnecting Apple would leave only a relay email (which the person may not be able to read).
    var appleIsLastWayIn: Bool {
        emailIsRelay && link(.apple)?.linked == true && !providers.contains { $0.provider != .apple && $0.linked }
    }

    func link(_ p: IdentityProvider) -> Link? { providers.first { $0.provider == p } }

    private enum CodingKeys: String, CodingKey { case email, providers, emailIsRelay }
    private struct Raw: Decodable { let provider: String; let linked: Bool? }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        email = try c.decodeIfPresent(String.self, forKey: .email) ?? ""
        let raw = try c.decodeIfPresent([Raw].self, forKey: .providers) ?? []
        providers = raw.compactMap { r in IdentityProvider(rawValue: r.provider).map { Link(provider: $0, linked: r.linked ?? false) } }
        emailIsRelay = try c.decodeIfPresent(Bool.self, forKey: .emailIsRelay) ?? false
    }
}

/// The OTHER account (the one that disappears) as the merge screens show it. Its owner already
/// proved it's theirs, so its email is visible.
struct MergeSource: Hashable, Decodable, Sendable {
    struct Counts: Hashable, Decodable, Sendable {
        var titles: Int
        var collections: Int
        var reviews: Int
        var followers: Int
        var following: Int
    }
    var handle: String?
    var name: String?
    var email: String
    var counts: Counts
    /// The other account was public (and had a handle). Absent on an older server → assumed
    /// public, so no warning is shown that the server didn't ask for.
    var isPublic: Bool

    init(handle: String?, name: String?, email: String, counts: Counts, isPublic: Bool = true) {
        self.handle = handle; self.name = name; self.email = email; self.counts = counts; self.isPublic = isPublic
    }

    private enum CodingKeys: String, CodingKey { case handle, name, email, counts, isPublic }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        handle = try c.decodeIfPresent(String.self, forKey: .handle)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        email = try c.decode(String.self, forKey: .email)
        counts = try c.decode(Counts.self, forKey: .counts)
        isPublic = try c.decodeIfPresent(Bool.self, forKey: .isPublic) ?? true
    }

    /// "@mariel.viejo", else the name, else the email.
    var display: String {
        if let h = handle, !h.isEmpty { return "@\(h)" }
        if let n = name, !n.isEmpty { return n }
        return email
    }
}

/// `{ mergeToken, source }`: proof that the other account is yours (10 min, one use).
struct MergeProof: Hashable, Decodable, Sendable {
    var mergeToken: String
    var source: MergeSource
}

/// `POST /me/identities/{provider}`: attached to this account, or it belongs to another Kura
/// account (409 `linked_elsewhere`), which comes with the proof to merge that one in.
enum LinkOutcome: Sendable {
    case linked
    case mergeable(MergeProof)
}

/// One signed-in device (`GET /me/sessions` → `{ items }`). `current` = the bearer making the call.
struct DeviceSession: Identifiable, Hashable, Decodable, Sendable {
    let id: String
    var platform: String
    var deviceName: String
    var appVersion: String?
    var createdAt: Date?
    var lastSeenAt: Date?
    var current: Bool

    init(id: String, platform: String, deviceName: String, appVersion: String?, createdAt: Date?, lastSeenAt: Date?, current: Bool) {
        self.id = id; self.platform = platform; self.deviceName = deviceName; self.appVersion = appVersion
        self.createdAt = createdAt; self.lastSeenAt = lastSeenAt; self.current = current
    }

    private enum CodingKeys: String, CodingKey { case id, platform, deviceName, appVersion, createdAt, lastSeenAt, current }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        platform = try c.decodeIfPresent(String.self, forKey: .platform) ?? "ios"
        let n = try c.decodeIfPresent(String.self, forKey: .deviceName)?.trimmingCharacters(in: .whitespaces) ?? ""
        deviceName = n
        appVersion = try c.decodeIfPresent(String.self, forKey: .appVersion)
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
        lastSeenAt = try c.decodeIfPresent(Date.self, forKey: .lastSeenAt)
        current = try c.decodeIfPresent(Bool.self, forKey: .current) ?? false
    }

    /// The row title: the device name, or the platform when the name is empty.
    var title: String {
        if !deviceName.isEmpty { return deviceName }
        switch platform.lowercased() {
        case "ios": return "iPhone"
        case "web": return "Navegador"
        default: return platform
        }
    }
}

/// `{ kura: { type: "release", titleId } }` / `{ kura: { type: "follower", handle } }` — what a
/// remote notification opens when tapped.
enum PushDestination: Hashable, Sendable {
    case title(String)
    case person(String)

    init?(userInfo: [AnyHashable: Any]) {
        guard let k = userInfo["kura"] as? [String: Any], let type = k["type"] as? String else { return nil }
        switch type {
        case "release":
            guard let id = k["titleId"] as? String, !id.isEmpty else { return nil }
            self = .title(id)
        case "follower":
            guard let h = k["handle"] as? String, !h.isEmpty else { return nil }
            self = .person(h)
        default:
            return nil
        }
    }
}
