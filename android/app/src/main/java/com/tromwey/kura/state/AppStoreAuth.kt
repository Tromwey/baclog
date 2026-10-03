package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.OnboardingStep
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.time.Duration

// The entrance: splash, the email code and Google — twin of `AppStore+Auth.swift`. Apple never exists
// on Android (BRIEF); Google is wired but OFF until fase 2 (the server checks `aud` = the iOS client).

/**
 * After the splash: a stored token skips the entrance (refreshing it when it's about to expire, else
 * `GET /me`) and goes where `route(me)` says — O1b for an account that never finished it; no token →
 * entrance. `minimumHold` is the splash's brand beat: it runs CONCURRENTLY with the refresh
 * (never added on top of it); nothing leaves the splash before it's over.
 */
suspend fun AppStore.finishSplash(minimumHold: Duration = Duration.ZERO) {
    if (phase != AppPhase.Splash) return
    coroutineScope {
        val hold = launch { delay(minimumHold) }
        if (!api.hasSession) {
            // The entrance's buttons depend on it: ask during the brand beat, not after it.
            loadAuthProviders()
            hold.join()
            onboardingStep = entryStep
            phase = AppPhase.Onboarding
            return@coroutineScope
        }
        // ALWAYS who this is before the tabs (a refresh already answers it): an account killed half-way
        // through the onboarding (no handle, no name/year) must land back on O1b, never on tabs with an
        // empty "@" (iOS `finishSplash` got the same fix on 2026-09-30).
        val result: Result<Me> = try {
            Result.success(if (api.needsRefresh) api.refresh() else api.me())
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            Result.failure(e)
        }
        hold.join()
        val m = result.getOrNull()
        if (m != null) {
            applyMe(m)
            if (!route(m)) return@coroutineScope
        } else {
            val e = noteError(result.exceptionOrNull()!!)
            if (e == KuraApiError.Unauthorized) return@coroutineScope
            // Transport trouble: keep the token, try the library anyway (`bootstrap` routes once `GET /me`
            // answers).
        }
        phase = AppPhase.Main
    }
}

/** `POST auth/otp/request` — true when the code went out. */
suspend fun AppStore.requestCode(email: String): Boolean {
    val e = email.trim().lowercase()
    if (!e.contains("@") || !e.contains(".")) {
        authError = "Ese correo no parece válido. Revísalo."
        return false
    }
    authBusy = true
    authError = null
    try {
        api.requestCode(e)
        authEmail = e
        codeAlreadySent = false
        codeResendAt = realNow().plusSeconds(CODE_RESEND_SECONDS)
        return true
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        val k = noteError(err)
        if (k is KuraApiError.RateLimited) {
            val wait = k.retryAfter?.takeIf { it > 0 }
            val known = codeResendAt?.takeIf { authEmail == e && it.isAfter(realNow()) }
            // `cooldown` (or an older server without `reason` and a wait of a minute at most): a code
            // for this email went out less than a minute ago (Volver, or the process died on O1c) and
            // is still valid for 10 minutes — the code screen opens to type it, with the wait before
            // another on its Reenviar.
            if (k.reason == "cooldown" || (k.reason == null && (wait ?: CODE_RESEND_SECONDS.toInt()) <= CODE_RESEND_SECONDS)) {
                authEmail = e
                codeAlreadySent = true
                codeResendAt = known ?: realNow().plusSeconds((wait ?: CODE_RESEND_SECONDS.toInt()).toLong())
                return true
            }
            // `hourly_cap` / `ip_limit` (or anything longer than the cooldown): NO code went out and
            // nothing says one is waiting. The real wait, in minutes, never clipped; on the code screen
            // (same email) Reenviar counts it down.
            codeAlreadySent = false
            if (authEmail == e && wait != null) codeResendAt = realNow().plusSeconds(wait.toLong())
            authError = codeLimitText(k.reason, wait)
            return false
        }
        authError = k?.authText
        return false
    } finally {
        authBusy = false
    }
}

/**
 * No code went out (429 on `auth/otp/request`): `ip_limit` is about this network, anything else
 * (`hourly_cap`, or a long wait without a `reason`) about the email. The real wait when the server
 * sent one, "más tarde" when it didn't — never an invented one. [email] = "este correo" at the
 * entrance, "ese correo" when it is another account's (Fusionar).
 */
fun codeLimitText(reason: String?, wait: Int?, email: String = "este correo"): String = when {
    reason == "ip_limit" && wait != null -> "Demasiados intentos desde esta red. Podrás pedir un código en ${waitText(wait)}."
    reason == "ip_limit" -> "Demasiados intentos desde esta red. Pide un código más tarde."
    wait != null -> "Se pidieron demasiados códigos para $email. Podrás pedir otro en ${waitText(wait)}."
    else -> "Se pidieron demasiados códigos para $email. Pide otro más tarde."
}

/** A wait as people read it: seconds up to a minute and a half, whole minutes (rounded up) after. */
fun waitText(seconds: Int): String = if (seconds <= 90) "$seconds s" else "${(seconds + 59) / 60} min"

/** The server's cooldown between two codes for one email (`auth/otp/request`, `COOLDOWN_SECONDS`). */
const val CODE_RESEND_SECONDS = 60L

/** Whole seconds until "Enviar otro código" works again (0 = now). Rounded up: never "0 s" while waiting. */
fun AppStore.codeResendWait(at: java.time.Instant = realNow()): Int {
    val until = codeResendAt ?: return 0
    val ms = java.time.Duration.between(at, until).toMillis()
    return if (ms <= 0) 0 else ((ms + 999) / 1000).toInt()
}

/** `POST auth/otp/verify` — stores the token and routes: username → picks → main. */
suspend fun AppStore.verifyCode(code: String): Boolean {
    authBusy = true
    authError = null
    try {
        val m = api.signIn(authEmail, code.trim())
        finishSignIn(m)
        return true
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        val e = noteError(err)
        // A minor already blocked (their birth year is on file) coming back through the door: the same
        // 13 años screen as the onboarding and Google, never "No se pudo entrar".
        if (e is KuraApiError.Forbidden && e.code == "underage") {
            onboardingStep = OnboardingStep.Underage
            return false
        }
        authError = e?.authText
        return false
    } finally {
        authBusy = false
    }
}

/** The one path after ANY sign-in (código, Google): token already stored by the API, then O1b if the
 *  account isn't set up, else the tabs. */
internal fun AppStore.finishSignIn(m: Me) {
    applyMe(m)
    if (route(m)) enterMain()
}

// MARK: Google (fase 2: the server must accept Android's `aud` and announce it in `auth/providers`)

/** `GET /auth/providers`. Failure → correo only (and asked again on the next entrance). */
suspend fun AppStore.loadAuthProviders() {
    if (!authProvidersStale) return
    try {
        val p = api.authProviders()
        authProvidersStale = false
        authProviders = p
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        noteError(e)
        authProviders = AuthProviders.EMAIL_ONLY
    }
}

/**
 * `POST /auth/google` with the `idToken` Credential Manager handed the screen (the store never touches
 * Credential Manager: it's UI + Context). A user cancel never reaches here.
 */
suspend fun AppStore.signInWithGoogle(idToken: String) {
    if (authBusy || signingOut) return
    authBusy = true
    authError = null
    try {
        finishSignIn(api.signInWithGoogle(idToken))
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        socialSignInFailed(e, "Google")
    } finally {
        authBusy = false
    }
}

/** `403 underage` is the same screen as the code path; everything else is an honest toast. */
fun AppStore.socialSignInFailed(error: Throwable, provider: String) {
    val e = noteError(error) ?: return
    val text = when {
        e is KuraApiError.Forbidden && e.code == "underage" -> {
            onboardingStep = OnboardingStep.Underage
            return
        }
        e is KuraApiError.Unavailable -> "$provider no responde ahora. Entra con tu correo o vuelve a intentarlo más tarde."
        e is KuraApiError.Offline -> "Sin conexión. Revisa tu red y vuelve a intentarlo."
        e is KuraApiError.RateLimited -> "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
        e is KuraApiError.Conflict && e.message.isNotEmpty() -> e.message
        e is KuraApiError.Invalid && e.message.isNotEmpty() -> e.message
        else -> "No se pudo entrar con $provider. Vuelve a intentarlo."
    }
    showToast(ToastModel(text, ToastModel.Kind.Info))
}

/**
 * What to tell the person when Credential Manager threw (the screen passes `GetCredentialException.type`
 * and its message; the store never touches Credential Manager). null = say nothing (they closed
 * Google's sheet). The raw type/message go to the log on the screen's side, never to the toast.
 */
@Suppress("UnusedReceiverParameter")
fun AppStore.googleFailureText(type: String?, message: String?, elapsedMs: Long? = null): String? {
    val t = type.orEmpty()
    val m = message.orEmpty()
    fun has(vararg keys: String) = keys.any { t.contains(it, ignoreCase = true) }
    return when {
        // Some Play services builds answer "no account on this phone" as a CANCEL (logcat: `status:
        // CANCELED, source: REMOTE_PROVIDER`) before any sheet was drawn. Nobody closes a sheet that
        // fast: a cancel under `GOOGLE_SILENT_CANCEL_MS` is that, and it gets its words.
        has("USER_CANCELED", "CANCELLATION", "CANCELED") && elapsedMs != null && elapsedMs < GOOGLE_SILENT_CANCEL_MS ->
            "No hay una cuenta de Google en este teléfono"
        has("USER_CANCELED", "CANCELLATION", "CANCELED") -> null
        has("NO_CREDENTIAL", "NoCredential") -> "No hay una cuenta de Google en este teléfono"
        // A client id / SHA-1 that doesn't match this build: Play services says 10 (DEVELOPER_ERROR) or
        // 16 in brackets, or the provider isn't configured at all.
        has("PROVIDER_CONFIGURATION", "ProviderConfiguration", "DEVELOPER_ERROR") ||
            GOOGLE_CONFIG_CODE.containsMatchIn(m) || GOOGLE_CONFIG_CODE.containsMatchIn(t) || m.contains("DEVELOPER_ERROR") ->
            "Google no está configurado para esta versión de la app"
        else -> "No se pudo entrar con Google"
    }
}

/** Faster than any person can close Google's sheet (it takes ~300 ms just to rise): see `googleFailureText`. */
const val GOOGLE_SILENT_CANCEL_MS = 700L

private val GOOGLE_CONFIG_CODE = Regex("""\[(10|16)]|\b(10|16):""")
