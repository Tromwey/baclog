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
 * After the splash: a stored token skips the entrance (refreshing it when it's about to expire); no
 * token → entrance. `minimumHold` is the splash's brand beat: it runs CONCURRENTLY with the refresh
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
        if (api.needsRefresh) {
            val result: Result<Me> = try {
                Result.success(api.refresh())
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
                // Transport trouble: keep the token, try the library anyway.
            }
        }
        hold.join()
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
        return true
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        authError = noteError(err)?.authText
        return false
    } finally {
        authBusy = false
    }
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
        authError = noteError(err)?.authText
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
        e is KuraApiError.Unavailable -> "$provider no responde ahora. Entra con tu correo o prueba en un rato."
        e is KuraApiError.Offline -> "Sin conexión. Revisa tu red e inténtalo de nuevo."
        e is KuraApiError.RateLimited -> "Demasiados intentos. Espera un momento."
        e is KuraApiError.Conflict && e.message.isNotEmpty() -> e.message
        e is KuraApiError.Invalid && e.message.isNotEmpty() -> e.message
        else -> "No se pudo entrar con $provider. Inténtalo de nuevo."
    }
    showToast(ToastModel(text, ToastModel.Kind.Info))
}
