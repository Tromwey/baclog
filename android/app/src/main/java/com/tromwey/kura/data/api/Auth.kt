package com.tromwey.kura.data.api

import com.tromwey.kura.BuildConfig
import com.tromwey.kura.data.Session
import kotlinx.serialization.Serializable
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * The raw nonce of a Google sign-in (Apple's scheme): Google gets `sha256hex(nonce)`, the server
 * gets the raw value and checks the `id_token`'s `nonce` claim. `signInWithGoogle(idToken)` /
 * `linkGoogle(idToken)` only take the token, so the nonce rides alongside here, keyed by the token
 * (the last few flows only; never persisted, never logged). A lookup is NOT consuming: a
 * "Reintentar" re-sends the same token and must send the same nonce. Twin of iOS `GoogleNonce`.
 */
object GoogleNonce {
    private const val CAPACITY = 4
    private val byToken = LinkedHashMap<String, String>()

    /** 32 random bytes, Base64url without padding. */
    fun make(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }
        .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

    /** Lowercase hex SHA-256 — what goes in Google's request (`GetGoogleIdOption.setNonce`). */
    fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    @Synchronized
    fun remember(nonce: String, idToken: String) {
        byToken.remove(idToken)
        byToken[idToken] = nonce
        while (byToken.size > CAPACITY) byToken.remove(byToken.keys.first())
    }

    @Synchronized
    fun nonce(idToken: String): String? = byToken[idToken]

    /** The `nonce` claim of an `id_token` (signature NOT checked — the server is the authority). */
    fun claim(idToken: String): String? = Session.claimString(idToken, "nonce")
}

/** The `device` of `auth/otp/verify` · `auth/google` · `auth/refresh`: names this install's row in
 *  Sesiones activas. `platform` is `"android"` (the server accepts `ios | android`). */
@Serializable
data class DeviceInfo(val platform: String = "android", val name: String, val appVersion: String) {
    companion object {
        /** "Google Pixel 8" (manufacturer + model, without repeating the brand), trimmed to the server's 120. */
        fun current(): DeviceInfo {
            val maker = android.os.Build.MANUFACTURER.orEmpty().trim()
            val model = android.os.Build.MODEL.orEmpty().trim()
            val name = when {
                model.isEmpty() -> maker.ifEmpty { "Android" }
                maker.isEmpty() || model.startsWith(maker, ignoreCase = true) -> model
                else -> "${maker.replaceFirstChar { it.uppercase() }} $model"
            }
            return DeviceInfo(name = name.take(120), appVersion = BuildConfig.VERSION_NAME.take(40))
        }
    }
}
