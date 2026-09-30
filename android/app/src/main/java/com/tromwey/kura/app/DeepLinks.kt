package com.tromwey.kura.app

import android.net.Uri
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.data.models.Route
import java.net.URI
import java.net.URISyntaxException
import java.net.URLDecoder

// Web links → the app (twin of the parser in ios/Kura/App/DeepLinks.swift). App Links: the
// `intent-filter autoVerify` of MainActivity (AndroidManifest.xml) + `/.well-known/assetlinks.json`
// (src/app/.well-known/assetlinks.json/route.ts). `MainActivity` → `AppStore.openWebLink`
// (state/AppStoreLinks.kt), which waits for the tabs, survives a sign-in, and lets invites open signed out.
// Parsed from a String with java.net.URI (not android.net.Uri) so the JVM unit tests can run it.

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
    /** `/f/{token}`: a party invite (16 chars `[A-Za-z0-9_-]`). Works signed out (the landing). */
    data class Invite(val token: String) : DeepLink
    /** `/c/{uuid}`: a party page. */
    data class Party(val id: String) : DeepLink
    /**
     * `/login`, `/verify` (Android only: iOS leaves them to Safari): the app's own entrance. [next] is the
     * web's `?to=` (a signed-out page redirects to `/login?to=/f/…`), opened once there's a session.
     */
    data class Entrance(val next: DeepLink?) : DeepLink

    /** The route it opens once the tabs are up (your own handle → the Perfil tab: decided by the caller). */
    val route: Route?
        get() = when (this) {
            is TitleLink -> Route.TitleRoute(id)
            is Profile -> Route.PersonRoute(handle)
            is CollectionLink -> Route.PublicCollection(handle, id)
            is OwnCollection -> Route.Collection(id)
            Recap -> Route.Recap()
            is Party -> Route.PartyRoute(id)
            is Invite, is Entrance -> null
        }

    companion object {
        /** get-kura.app is the domain; baclog.app is deprecated but its old shared links still count. */
        val hosts = setOf("get-kura.app", "www.get-kura.app", "baclog.app", "www.baclog.app")

        fun parse(uri: Uri?, debug: Boolean = false): DeepLink? = parse(uri?.toString(), debug)

        /**
         * Null = not ours or not a shape the app opens. Every path piece is validated as ONE segment
         * (ids `[A-Za-z0-9_-]`, handles like `USERNAME_RE`), so nothing with `/`, `.`/`..` or `%` ever
         * reaches an API path (learning 2026-09-25-ios-urlcomponents-path-deja-pasar-dot-segments).
         */
        fun parse(url: String?, debug: Boolean = false): DeepLink? {
            val u = uriOrNull(url) ?: return null
            if (!isOurs(u, debug)) return null
            val parts = segments(u) ?: return null
            if (parts.size == 1 && (parts[0] == "login" || parts[0] == "verify")) {
                return Entrance(next(u))
            }
            return pathLink(parts)
        }

        /** True for an http(s) link of our own site (the ones the app must not drop on the floor). */
        fun isOurs(url: String?, debug: Boolean = false): Boolean = uriOrNull(url)?.let { isOurs(it, debug) } == true

        /**
         * A push's target (`com.tromwey.kura.push.PushIntent.target`): `title:<id>` | `person:<handle>`,
         * validated with the same rules as a link. Anything else is null.
         */
        fun pushTarget(raw: String?): DeepLink? {
            val kind = raw?.substringBefore(':', "") ?: return null
            val value = raw.substringAfter(':')
            return when (kind) {
                "title" -> id(value)?.let(::TitleLink)
                "person" -> handle(value)?.let(::Profile)
                else -> null
            }
        }

        private fun uriOrNull(url: String?): URI? = try {
            url?.takeIf { it.isNotBlank() }?.let(::URI)
        } catch (_: URISyntaxException) {
            null
        }

        private fun isOurs(u: URI, debug: Boolean): Boolean {
            val scheme = u.scheme?.lowercase() ?: return false
            val host = u.host?.lowercase() ?: return false
            if (scheme == "https" && host in hosts) return true
            if (!debug) return false
            // Links a debug build made itself point at the dev server (`PublicLinks.base`).
            val dev = KuraRuntime.apiOrigin?.let(::uriOrNull) ?: return false
            return dev.host?.lowercase() == host && dev.scheme?.lowercase() == scheme && dev.port == u.port
        }

        /**
         * The path split on the RAW `/` first, then each piece decoded: a `%2F` can't hide a second segment
         * from the checks. A malformed escape (or `+`, which the decoder would turn into a space) → null.
         */
        private fun segments(u: URI): List<String>? {
            val raw = u.rawPath ?: return emptyList()
            return raw.split('/').filter { it.isNotEmpty() }.map { piece ->
                if ('+' in piece) return null
                try {
                    URLDecoder.decode(piece, "UTF-8")
                } catch (_: IllegalArgumentException) {
                    return null
                }
            }
        }

        /**
         * Top-level web routes that are never a handle, and static files: they stay on the web (the caller
         * hands them back to the browser). Mirror of `EXCLUDED_ROOTS` in
         * src/app/.well-known/apple-app-site-association/route.ts and of the manifest's
         * uri-relative-filter-groups (Android 15+ never even sends them) — keep the three in sync.
         */
        private val webOnlyRoots = setOf(
            "admin", "api", "app", "baclog", "kura", "colecciones", "coleccion", "blocked", "descubrir",
            "login", "onboarding", "para-ti", "perfil", "prototype", "search", "settings",
            "verify", "www", "waitlist", "analytics", "cron", "marketing", "feed", "creditos", "privacidad", "party",
            "_next", ".well-known",
        )
        private val staticSuffixes = listOf(".png", ".svg", ".ico", ".webmanifest", ".txt", ".xml", ".json")

        private fun pathLink(path: List<String>): DeepLink? {
            if (path.firstOrNull() in webOnlyRoots) return null
            if (staticSuffixes.any { path.lastOrNull()?.lowercase()?.endsWith(it) == true }) return null
            val parts = path.toMutableList()
            if (parts.firstOrNull() == "u") {
                parts.removeAt(0)
                if (parts.isEmpty()) return null
            } else {
                when (parts.firstOrNull()) {
                    "item" -> return if (parts.size == 2) id(parts[1])?.let(::TitleLink) else null
                    "backlogs" -> return if (parts.size == 2 && parts[1] != "lentes") id(parts[1])?.let(::OwnCollection) else null
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

        /** `?to=` of /login and /verify: a same-site path (never `//host` or a scheme), parsed like a link. */
        private fun next(u: URI): DeepLink? {
            val to = u.rawQuery?.split('&')
                ?.firstOrNull { it.startsWith("to=") }
                ?.removePrefix("to=")
                ?.let { runCatching { URLDecoder.decode(it, "UTF-8") }.getOrNull() }
                ?: return null
            if (!to.startsWith("/") || to.startsWith("//") || '\\' in to) return null
            val target = uriOrNull("https://${hosts.first()}$to") ?: return null
            val parts = segments(target) ?: return null
            return pathLink(parts)
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
