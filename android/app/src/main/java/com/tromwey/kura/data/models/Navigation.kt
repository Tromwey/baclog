package com.tromwey.kura.data.models

// Tabs, routes and the onboarding steps — the twin of `ios/Kura/Models/Navigation.swift`. The
// app lane maps these to Navigation Compose's typed routes; the shape (and `keepsDock`) is shared.

enum class Tab {
    Collections, Discover, Feed, Profile;

    val label: String get() = when (this) {
        Collections -> "Colecciones"; Discover -> "Descubrir"; Feed -> "Feed"; Profile -> "Perfil"
    }
}

sealed interface Route {
    data class Collection(val id: String) : Route
    data class TitleRoute(val id: String) : Route
    data object Automatic : Route
    data class PersonRoute(val handle: String) : Route
    /** Someone else's public collection (`GET /people/{handle}/collections/{id}`), read-only. */
    data class PublicCollection(val handle: String, val id: String) : Route
    data class Followers(val handle: String, val showFollowing: Boolean) : Route
    data class CreatorRoute(val name: String) : Route
    data object Notifications : Route
    /** A month's recap; null = the newest. */
    data class Recap(val era: String? = null) : Route
    data object RecapHistory : Route
    data class RecapShare(val era: String? = null) : Route
    data object Settings : Route
    data object SettingsPrivacy : Route
    data object MusicApp : Route
    data object EditProfile : Route
    /** K1d / K1e — how your profile looks to someone who doesn't follow you. */
    data object ProfileAsStranger : Route
    /** Ajustes › privacidad › Cuentas bloqueadas (`GET /me/blocks`). */
    data object BlockedAccounts : Route
    /** Ajustes › Sesiones activas (`GET /me/sessions`). */
    data object Sessions : Route
    /** Ajustes › Fusionar otra cuenta. */
    data object MergeAccount : Route
    /** The 6-digit code sent to the other account's email. */
    data object MergeCode : Route
    /** What moves and what disappears, then `POST /me/merge`. */
    data object MergeConfirm : Route
    /** A party (colección de fiesta): host and members only. */
    data class PartyRoute(val id: String) : Route
    /** Its song search ("Buscar canción"), full screen with Cancelar. */
    data class PartySearch(val id: String) : Route

    /** The dock stays on browsing (a title, a collection, a person and their seguidores) and hides
     *  on the management flows (ajustes, recap, avisos, fusionar…). */
    val keepsDock: Boolean get() = when (this) {
        is Collection, is TitleRoute, Automatic, is PublicCollection, is PersonRoute, is Followers -> true
        else -> false
    }
}

enum class OnboardingStep {
    /** `Signup` is the one entrance (Google · correo on Android) for new and returning people. */
    Welcome, Signup, Username, Pick, People,
    /** The code sent by email (`auth/otp/verify`). */
    Code,
    /** `POST /me/onboarding` answered `403 underage`. */
    Underage,
}
