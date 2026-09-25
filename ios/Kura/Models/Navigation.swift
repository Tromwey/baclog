import SwiftUI

// Tabs, routes and the onboarding steps.

// MARK: - Navigation

enum Tab: String, CaseIterable, Identifiable, Hashable {
    case collections, discover, feed, profile
    var id: String { rawValue }
    var label: String {
        switch self {
        case .collections: return "Colecciones"
        case .discover: return "Descubrir"
        case .feed: return "Feed"
        case .profile: return "Perfil"
        }
    }
}

enum Route: Hashable {
    case collection(String)
    case title(String)
    case reorder(String)
    case changeCover(String)
    case automatic
    case person(String)
    /// Someone else's public collection (`GET /people/{handle}/collections/{id}`), read-only.
    case publicCollection(handle: String, id: String)
    case followers(String, showFollowing: Bool)
    case creator(String)
    case notifications
    case recap
    case recapHistory
    case recapShare
    case settings
    case settingsPrivacy
    case musicApp
    case editProfile
    /// K1d / K1e — how your profile looks to someone who doesn't follow you.
    case profileAsStranger
    /// Ajustes › privacidad › Cuentas bloqueadas (`GET /me/blocks`).
    case blockedAccounts
    /// Ajustes › Sesiones activas (`GET /me/sessions`).
    case sessions
    /// Ajustes › Fusionar otra cuenta: prove the other account is yours (Apple, Google, correo).
    case mergeAccount
    /// The 6-digit code sent to the other account's email (`POST /me/merge/otp/verify`).
    case mergeCode
    /// What moves and what disappears, then `POST /me/merge` (the proof lives in `AppStore.mergeProof`).
    case mergeConfirm
}

enum OnboardingStep: Hashable {
    /// `signup` is the one entrance (Apple · Google · correo) for new and returning people.
    case welcome, signup, username, pick, people
    /// The code sent by email (`auth/otp/verify`).
    case code
    /// `POST /me/onboarding` answered `403 underage`.
    case underage
}
