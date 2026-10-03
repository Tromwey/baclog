package com.tromwey.kura.data.api

import kotlinx.coroutines.CopyableThrowable
import kotlinx.coroutines.ExperimentalCoroutinesApi
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import kotlin.random.Random

/**
 * `error.code` (+ `reason`) → typed cases (API.md §1) — the twin of iOS `KuraAPIError`. `Unauthorized`
 * anywhere means the session is gone: `ApiClient` already forgot the token and emitted
 * `sessionExpired`; the store goes back to the entrance.
 *
 * Cancellation is NOT a case here (iOS has `.cancelled`): a cancelled coroutine propagates
 * kotlinx's `CancellationException` untouched — never retried, never shown, never swallowed.
 */
@OptIn(ExperimentalCoroutinesApi::class)
sealed class KuraApiError(detail: String) : Exception(detail), CopyableThrowable<KuraApiError> {
    /** Never copied by coroutine stack-trace recovery (it would rebuild e.g. `Forbidden(code)` from
     *  its message): the case and its fields reach the caller exactly as mapped. */
    override fun createCopy(): KuraApiError? = null

    data object Unauthorized : KuraApiError("unauthorized")
    /** `code` = the server's `reason` (`underage`, `lists_private`, `onboarding_required`, `blocked`,
     *  `view_only`, `not_yours`…) or `proof_rejected` (a 422 `invalid_proof`, fase 4g). */
    data class Forbidden(val code: String?, val note: String = "") : KuraApiError("forbidden ${code ?: ""}") {
        /** `403 onboarding_required`: the account lacks its name or its year (`Me.onboardingComplete`).
         *  Handled in ONE place, `AppStore.onboardingRequired` — never a Reintentar. */
        val needsOnboarding: Boolean get() = code == "onboarding_required"
    }
    /** `POST auth/otp/verify` → 401 with `reason: "locked"`: the code's attempts (or a guess budget)
     *  are spent, no retyping fixes it. Its own case so it is never taken for "the session ended". */
    data object CodeLocked : KuraApiError("locked")
    data object NotFound : KuraApiError("not_found")
    data class Invalid(val fields: Map<String, String>, override val message: String) : KuraApiError("invalid")
    /** `code` = `reason` (`taken`, `not_released`, `reaction_required`, `duplicate_mine`, `last_way_in`…). */
    data class Conflict(val code: String?, override val message: String) : KuraApiError("conflict")
    /** `reason` (only `auth/otp/request` sends one): `cooldown` (the code already sent still works),
     *  `hourly_cap`, `ip_limit`. `retryAfter` = the real wait in seconds, never clipped. */
    data class RateLimited(val retryAfter: Int?, val reason: String? = null) : KuraApiError("rate_limited")
    data object Unsupported : KuraApiError("unsupported")
    data object Unavailable : KuraApiError("unavailable")
    /** A `503 unavailable` WITH a reason this client acts on (`not_configured`, `service_failed` —
     *  only the music export sends them) and the server's `message`, ready to show. */
    data class ServiceUnavailable(val reason: String, override val message: String) : KuraApiError("service_unavailable")
    /** No connection, DNS, TLS, connection lost or a timeout. */
    data object Offline : KuraApiError("offline")
    /** Anything else (5xx, an unexpected body — "Respuesta inesperada del servidor"). */
    data class Server(val detail: String) : KuraApiError(detail)

    val isRateLimit: Boolean get() = this is RateLimited

    /** Text for the toast, in the Kura voice (what happened, what to do). */
    val toast: String get() = toast("No se pudo guardar.")

    /** The toast with the caller's own verb for the generic failure ("No se pudo seguir a @x."). */
    fun toast(fallback: String): String = when {
        this is Offline -> "Sin conexión."
        this is RateLimited -> "Demasiados intentos seguidos. Espera un momento."
        this is Unavailable -> "El catálogo no responde. Vuelve a intentarlo en unos minutos."
        this is Conflict && code == "not_released" -> "Todavía no sale. Usa La vi en preestreno."
        this is Conflict && code == "reaction_required" -> REACTION_REQUIRED_TEXT
        this is Invalid && message.isNotEmpty() -> message
        this is ServiceUnavailable && message.isNotEmpty() -> message
        else -> fallback
    }
}

/** The server unlocks reviews only with a reaction (`obsessed || verdict != null`). */
const val REACTION_REQUIRED_TEXT = "Para reseñar, elige Me gusta o Me obsesiona."

/**
 * When a failed `GET` is tried again (writes never are — the store's "Reintentar" toast is the
 * retry). Pure, so the tests pin it down. Twin of iOS `RetryPolicy`:
 * - transport failures and 5xx: up to 3 retries with FULL jitter (uniform in 0…0.5 s, 0…1 s, 0…2 s);
 * - a timeout never retries (it already waited the whole timeout);
 * - `503`/`429` honor `Retry-After` (header or envelope) when ≤ `MAX_RETRY_AFTER` s (+ ≤ 0.5 s of
 *   jitter); a longer wait is surfaced. A `429` without it isn't retried; a `503` without it backs off.
 */
object RetryPolicy {
    const val MAX_RETRIES = 3
    val BACKOFF = doubleArrayOf(0.5, 1.0, 2.0)
    const val MAX_RETRY_AFTER = 5.0

    sealed interface Failure {
        data object Transport : Failure
        data object TimedOut : Failure
        data class Http(val status: Int, val retryAfter: Double?) : Failure
        /** Unauthorized, a bad response, any 4xx…: never retried. */
        data object Final : Failure
    }

    private val defaultJitter: (Double) -> Double = { x -> if (x <= 0.0) 0.0 else Random.nextDouble(0.0, x) }

    /** Seconds to wait before retry number `attempt + 1`, or null to give up. */
    fun delay(afterAttempt: Int, failure: Failure, jitter: (Double) -> Double = defaultJitter): Double? {
        if (afterAttempt < 0 || afterAttempt >= MAX_RETRIES) return null
        return when (failure) {
            Failure.TimedOut, Failure.Final -> null
            Failure.Transport -> jitter(BACKOFF[afterAttempt])
            is Failure.Http -> {
                val ra = failure.retryAfter
                when {
                    (failure.status == 429 || failure.status == 503) && ra != null ->
                        if (ra <= MAX_RETRY_AFTER) maxOf(0.0, ra) + jitter(0.5) else null
                    failure.status == 429 -> null
                    failure.status in 500..599 -> jitter(BACKOFF[afterAttempt])
                    else -> null
                }
            }
        }
    }

    /** `Retry-After` as seconds: delta-seconds or an HTTP-date. */
    fun parseRetryAfter(header: String?, now: Instant = Instant.now()): Double? {
        val raw = header?.trim()?.ifEmpty { null } ?: return null
        raw.toDoubleOrNull()?.let { return if (it >= 0) it else null }
        return try {
            val d = ZonedDateTime.parse(raw, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()
            maxOf(0.0, (d.toEpochMilli() - now.toEpochMilli()) / 1000.0)
        } catch (_: DateTimeParseException) {
            null
        }
    }
}

/** A `409 linked_elsewhere` from `POST /me/identities/{provider}`: `LiveApi` turns it into
 *  `LinkOutcome.Mergeable`; it never reaches the store as an error. */
internal class MergeableConflict(val proof: com.tromwey.kura.data.models.MergeProof) : Exception("linked_elsewhere")
