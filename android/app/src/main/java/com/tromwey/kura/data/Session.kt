package com.tromwey.kura.data

import com.tromwey.kura.data.models.KuraJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.time.Duration
import java.time.Instant
import java.util.Base64

/**
 * The bearer token and its refresh policy (API.md §2.1) — twin of iOS `Session`. The JWT payload
 * is decoded locally ONLY to read `exp` / `sid` / `sub`; the signature is never verified here —
 * the server is the authority, a 401 anywhere ends the session.
 */
class Session(private val store: TokenStore, private val clock: () -> Instant = Instant::now) {
    val token: String? get() = store.get()

    fun store(token: String) = store.set(token)

    fun clear() = store.clear()

    val hasToken: Boolean get() = token != null

    /** `exp` claim, if the token parses. */
    val expiry: Instant? get() = token?.let(::claims)?.let { c ->
        (c["exp"] as? JsonPrimitive)?.takeUnless { it.isString }?.doubleOrNull?.let { Instant.ofEpochSecond(it.toLong()) }
    }

    /** `sid` (`mobile_session.id`): THIS install's row in Sesiones activas. */
    val sid: String? get() = token?.let { claimString(it, "sid") }

    /** `sub`: the account id (never shown, never logged). */
    val subject: String? get() = token?.let { claimString(it, "sub") }

    /** Less than `REFRESH_WINDOW` left (or the token can't be read, so the server decides). */
    val isExpiringSoon: Boolean get() {
        val exp = expiry ?: return true
        return Duration.between(clock(), exp) < REFRESH_WINDOW
    }

    /** The app calls `POST auth/refresh` on launch when this is true (iOS `needsRefresh`). */
    val needsRefresh: Boolean get() = hasToken && isExpiringSoon

    companion object {
        val REFRESH_WINDOW: Duration = Duration.ofDays(7)

        /** Base64url-decodes the payload segment of a JWT. No verification. */
        fun claims(jwt: String): JsonObject? {
            val parts = jwt.split(".")
            if (parts.size != 3) return null
            return try {
                val bytes = Base64.getUrlDecoder().decode(parts[1].trimEnd('='))
                KuraJson.json.parseToJsonElement(String(bytes, Charsets.UTF_8)) as? JsonObject
            } catch (_: IllegalArgumentException) { // bad Base64, or not JSON (SerializationException)
                null
            }
        }

        fun claimString(jwt: String, key: String): String? =
            (claims(jwt)?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
    }
}
