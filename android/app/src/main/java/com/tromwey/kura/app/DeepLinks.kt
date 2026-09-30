package com.tromwey.kura.app

import android.net.Uri
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.data.models.Route

// Web links → the app (twin of the parser in ios/Kura/App/DeepLinks.swift). ONLY the map for now:
// App Links (`intent-filter autoVerify` + `/.well-known/assetlinks.json`) are fase 2 (android/BRIEF.md),
// so nothing calls `DeepLink.parse` yet. When they land: `MainActivity.onNewIntent`/`onCreate` →
// `DeepLink.parse(intent.data)` → the store's open-link path (iOS `openWebLink`: waits for the tabs,
// survives a sign-in, invites open signed out).

/** Where a web link points, in the app's terms. Built ONLY from a URL of our own site. */
sealed interface DeepLink {
    /** `/item/{id}`, `/{handle}/item/{id}`, `/u/{handle}/item/{id}`. */
    data class TitleLink(val id: String) : DeepLink
    /** `/{handle}`, `/u/{handle}`. */
    data class Profile(val handle: String) : DeepLink
    /** `/{handle}/{id}`, `/u/{handle}/{id}` (someone's public collection — or yours). */
    data class CollectionLink(val handle: String, val id: String) : DeepLink
    /** `/backlogs/{id}`: the web app's own-collection route (only ever yours). */
    data class OwnCollection(val id: String) : DeepLink
    /** `/recap` (the monthly recap email). */
    data object Recap : DeepLink
    /** `/f/{token}`: a party invite (16 chars `[A-Za-z0-9_-]`). */
    data class Invite(val token: String) : DeepLink
    /** `/c/{uuid}`: a party page. */
    data class Party(val id: String) : DeepLink

    /** The route it opens once the tabs are up (your own handle → the Perfil tab: decided by the caller). */
    val route: Route?
        get() = when (this) {
            is TitleLink -> Route.TitleRoute(id)
            is Profile -> Route.PersonRoute(handle)
            is CollectionLink -> Route.PublicCollection(handle, id)
            is OwnCollection -> Route.Collection(id)
            Recap -> Route.Recap()
            is Party -> Route.PartyRoute(id)
            is Invite -> null
        }

    companion object {
        /** get-kura.app is the domain; baclog.app is deprecated but its old shared links still count. */
        val hosts = setOf("get-kura.app", "www.get-kura.app", "baclog.app", "www.baclog.app")

        /**
         * Null = not ours or not a shape the app opens. Every path piece is validated as ONE segment
         * (ids `[A-Za-z0-9_-]`, handles like `USERNAME_RE`), so nothing with `/`, `.`/`..` or `%` ever
         * reaches an API path (learning 2026-09-25-ios-urlcomponents-path-deja-pasar-dot-segments).
         */
        fun parse(uri: Uri?, debug: Boolean = false): DeepLink? {
            uri ?: return null
            val scheme = uri.scheme?.lowercase() ?: return null
            val host = uri.host?.lowercase() ?: return null
            var ours = scheme == "https" && host in hosts
            if (debug && !ours) {
                // Links a debug build made itself point at the dev server (`PublicLinks.base`).
                val dev = KuraRuntime.apiOrigin?.let(Uri::parse)
                ours = dev != null && dev.host?.lowercase() == host && dev.scheme == scheme && dev.port == uri.port
            }
            if (!ours) return null
            // `pathSegments` are decoded: a `%2F` can't hide a second segment from the checks below.
            val parts = uri.pathSegments.filter { it.isNotEmpty() }.toMutableList()
            if (parts.firstOrNull() == "u") {
                parts.removeAt(0)
                if (parts.isEmpty()) return null
            } else {
                when (parts.firstOrNull()) {
                    "item" -> return if (parts.size == 2) id(parts[1])?.let(::TitleLink) else null
                    "backlogs" -> return if (parts.size == 2) id(parts[1])?.let(::OwnCollection) else null
                    "recap" -> return if (parts.size == 1) Recap else null
                    "f" -> return if (parts.size == 2) inviteToken(parts[1])?.let(::Invite) else null
                    "c" -> return if (parts.size == 2) uuid(parts[1])?.let(::Party) else null
                }
            }
            val h = parts.firstOrNull()?.let(::handle) ?: return null
            return when (parts.size) {
                1 -> Profile(h)
                2 -> id(parts[1])?.let { CollectionLink(h, it) }
                3 -> if (parts[1] == "item") id(parts[2])?.let(::TitleLink) else null
                else -> null
            }
        }

        private val idChars = Regex("^[A-Za-z0-9_-]{1,64}$")
        private val tokenChars = Regex("^[A-Za-z0-9_-]{16}$")
        private val handleChars = Regex("^[a-z0-9_.]{3,30}$")

        private fun id(raw: String): String? = raw.takeIf { idChars.matches(it) }

        fun inviteToken(raw: String): String? = raw.takeIf { tokenChars.matches(it) }

        private val uuidChars = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

        /** A party id: a canonical UUID (the server 404s anything else anyway). */
        private fun uuid(raw: String): String? = raw.takeIf { uuidChars.matches(it) }?.lowercase()

        /** Same shape as the server's `USERNAME_RE` (lowercased, `@` dropped, not only dots). */
        private fun handle(raw: String): String? {
            val h = raw.lowercase().removePrefix("@")
            return h.takeIf { handleChars.matches(it) && it.any { c -> c != '.' } }
        }
    }
}
