package com.tromwey.kura.state

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.DeviceSession
import com.tromwey.kura.data.models.Identities
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.LinkOutcome
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.MergeProof
import com.tromwey.kura.data.models.Route
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.Locale
import java.util.WeakHashMap
import kotlin.math.ceil

// Inicio de sesión (identities), Fusionar otra cuenta and Sesiones activas — twin of
// `AppStore+AccountLink.swift` (its push half lives in AppStorePush.kt). Apple never exists on Android:
// its row is never painted and nothing here can start it; a linked Apple (made on iOS) is still listed
// by the server and can be disconnected.
//
// Everything here belongs to ONE account, like `SessionData`: it lives in a slot keyed by the current
// `SessionData` instance (identity, weakly held), so a sign-out / 401 / deleted account — which
// replace `s` whole — leave the next account with nothing. Reading any of it reads `s` (a
// `mutableStateOf`), so Compose also recomposes when the session changes.

internal class AccountLinkState {
    /** `GET /me/sessions`: this device first, then the most recently seen. null until the first read. */
    var deviceSessions by mutableStateOf<List<DeviceSession>?>(null)
    var identities by mutableStateOf<Identities?>(null)
    /** The provider whose Conectar/Desconectar is in flight (its row shows the indicator). */
    var identityBusy by mutableStateOf<IdentityProvider?>(null)
    /** The other account's email, once `merge/otp/request` accepted it (the code screen says it). */
    var mergeEmail by mutableStateOf("")
    /** Proof that the other account is yours (10 min, one use): only in memory, never persisted. */
    var mergeProof by mutableStateOf<MergeProof?>(null)
    var mergeBusy by mutableStateOf(false)
    var mergeError by mutableStateOf<String?>(null)
    /** After a 429: "Enviar otro código" waits until then. */
    var mergeRetryAt by mutableStateOf<Instant?>(null)
}

private val linkSlots = WeakHashMap<SessionData, AccountLinkState>()

private fun link(session: SessionData): AccountLinkState =
    synchronized(linkSlots) { linkSlots.getOrPut(session) { AccountLinkState() } }

private val AppStore.st: AccountLinkState get() = link(s)

// MARK: Reads (what the screens draw)

val AppStore.deviceSessions: List<DeviceSession>? get() = st.deviceSessions
val AppStore.identities: Identities? get() = st.identities
val AppStore.identityBusy: IdentityProvider? get() = st.identityBusy
val AppStore.mergeEmail: String get() = st.mergeEmail
val AppStore.mergeBusy: Boolean get() = st.mergeBusy
val AppStore.mergeRetryAt: Instant? get() = st.mergeRetryAt

var AppStore.mergeProof: MergeProof?
    get() = st.mergeProof
    set(v) { st.mergeProof = v }

var AppStore.mergeError: String?
    get() = st.mergeError
    set(v) { st.mergeError = v }

/** The `serverClientId` Credential Manager needs (`auth/providers.google.androidClientId` = the web
 *  client id). null = no Google on Android in this deploy: nothing offers it. */
val AppStore.googleLinkClientId: String? get() = authProviders?.googleAndroidClientId

/** Whether THIS app can run the provider's flow: Google with its client id; Apple never on Android. */
fun AppStore.canRun(p: IdentityProvider): Boolean = when (p) {
    IdentityProvider.Apple -> false
    IdentityProvider.Google -> googleLinkClientId != null
}

/** What Credential Manager handed back — the screen maps its exceptions here (the store never touches
 *  Credential Manager: it's UI + Context). */
sealed interface GoogleCredential {
    data class Token(val idToken: String) : GoogleCredential
    /** Google's sheet closed: not an error. */
    data object Cancelled : GoogleCredential
    /** `NoCredentialException`: no Google account on this phone. */
    data object NoAccount : GoogleCredential
    data object Failed : GoogleCredential
}

// MARK: Inicio de sesión (identities)

/** `GET /me/identities` (+ `auth/providers` for Google's client id, which the flow needs). */
suspend fun AppStore.loadIdentities() = coroutineScope {
    val providers = async { loadAuthProviders() }
    val session = s
    try {
        val v = api.identities()
        check(session)
        loaded(LoadKey.Identities)
        link(session).identities = v
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s === session) fail(LoadKey.Identities, err)
    }
    providers.await()
}

/**
 * Conectar Google: [credential] runs Credential Manager (the screen's lambda), then
 * `POST /me/identities/google`. `linked_elsewhere` → the merge confirmation for that account.
 * [fromMerge]: started on Fusionar otra cuenta, where a plain link (that Google had no other kura
 * account) is news worth saying.
 */
suspend fun AppStore.connectGoogle(fromMerge: Boolean = false, credential: suspend () -> GoogleCredential) {
    val p = IdentityProvider.Google
    val state = st
    if (state.identityBusy != null || state.mergeBusy || !canRun(p)) return
    val session = s
    state.identityBusy = p
    val outcome: LinkOutcome
    try {
        val token = when (val c = credential()) {
            is GoogleCredential.Token -> c.idToken
            GoogleCredential.Cancelled -> return
            GoogleCredential.NoAccount -> {
                if (s === session) showToast(ToastModel("No hay una cuenta de Google en este teléfono.", ToastModel.Kind.Info))
                return
            }
            GoogleCredential.Failed -> {
                if (s === session) showToast(ToastModel("Google no respondió. Vuelve a intentarlo.", ToastModel.Kind.Info))
                return
            }
        }
        outcome = api.linkGoogle(token)
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s === session) identityFailed(err, p)
        return
    } finally {
        state.identityBusy = null
    }
    if (s !== session) return
    online()
    when (outcome) {
        LinkOutcome.Linked -> {
            setLinked(state, p, true)
            haptic(StoreHaptic.Success)
            showToast(ToastModel(
                if (fromMerge) "Ese ${p.label} no tenía otra cuenta en kura: quedó conectado a esta."
                else "${p.label} conectada. Ya puedes entrar con ${p.label}.",
                ToastModel.Kind.Info,
            ))
        }
        is LinkOutcome.Mergeable -> {
            state.mergeProof = outcome.proof
            push(Route.MergeConfirm)
        }
    }
}

private fun setLinked(state: AccountLinkState, p: IdentityProvider, linked: Boolean) {
    val ids = state.identities ?: return
    if (ids.providers.none { it.provider == p }) return
    state.identities = ids.copy(providers = ids.providers.map { if (it.provider == p) it.copy(linked = linked) else it })
}

private fun AppStore.identityFailed(error: Throwable, p: IdentityProvider) {
    val e = noteError(error) ?: return
    val text = when {
        e == KuraApiError.Unauthorized -> return
        e is KuraApiError.Conflict && e.code == "provider_already_linked" ->
            "Ya tienes otra cuenta de ${p.label} conectada. Desconéctala primero."
        e is KuraApiError.Forbidden && e.code == "proof_rejected" -> "${p.label} no confirmó esa cuenta. Vuelve a intentarlo."
        e == KuraApiError.Unavailable -> "${p.label} no responde ahora. Vuelve a intentarlo más tarde."
        e == KuraApiError.Offline -> "Sin conexión. Revisa tu red y vuelve a intentarlo."
        e is KuraApiError.RateLimited -> "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
        else -> "No se pudo conectar ${p.label}. Vuelve a intentarlo."
    }
    showToast(ToastModel(text, ToastModel.Kind.Info))
}

/** Why Apple can't be disconnected (the row, the 409 toast and the sheet say the same). */
const val LAST_WAY_IN_TEXT = "Tu correo es el privado de Apple: sin Apple no te quedaría cómo entrar. Conecta Google antes."

/** `DELETE /me/identities/{p}`. 409 `last_way_in`: Apple is the only real way in (relay email). */
suspend fun AppStore.disconnect(p: IdentityProvider): Boolean {
    val state = st
    if (state.identityBusy != null) return false
    state.identityBusy = p
    try {
        return when (val r = boundWrite { api.unlinkIdentity(p) }) {
            BoundWrite.Stale -> false
            is BoundWrite.Ok -> {
                setLinked(state, p, false)
                haptic(StoreHaptic.Success)
                showToast(ToastModel("Desconectaste ${p.label}. Sigues entrando con tu correo.", ToastModel.Kind.Info))
                true
            }
            is BoundWrite.Failed -> {
                val e = r.error
                when {
                    e == KuraApiError.Unauthorized -> false
                    e == KuraApiError.NotFound -> {
                        setLinked(state, p, false)
                        true
                    }
                    e is KuraApiError.Conflict && e.code == "last_way_in" -> {
                        showToast(ToastModel(LAST_WAY_IN_TEXT, ToastModel.Kind.Info))
                        false
                    }
                    else -> {
                        val text = if (e == KuraApiError.Offline) "Sin conexión. ${p.label} sigue conectada." else "No se pudo desconectar ${p.label}."
                        showToast(ToastModel(text, ToastModel.Kind.Retry) {
                            dismissToast()
                            scope.launch { disconnect(p) }
                        })
                        false
                    }
                }
            }
        }
    } finally {
        state.identityBusy = null
    }
}

// MARK: Fusionar otra cuenta

/** Fusionar › correo: `POST /me/merge/otp/request` (204 whether or not the account exists). */
suspend fun AppStore.requestMergeCode(email: String): Boolean {
    val state = st
    val e = email.trim().lowercase(Locale.ROOT)
    if (!e.contains("@") || !e.contains(".")) {
        state.mergeError = "Ese correo no parece válido. Revísalo."
        return false
    }
    val own = (state.identities?.email ?: account?.email ?: "").lowercase(Locale.ROOT)
    if (e == own) {
        state.mergeError = "Ese es el correo de esta cuenta. Escribe el de la otra."
        return false
    }
    if (state.mergeBusy) return false
    state.mergeBusy = true
    state.mergeError = null
    try {
        return when (val r = boundWrite { api.requestMergeCode(e) }) {
            BoundWrite.Stale -> false
            is BoundWrite.Ok -> {
                state.mergeEmail = e
                state.mergeRetryAt = null
                true
            }
            is BoundWrite.Failed -> {
                val err = r.error
                if (err !is KuraApiError.RateLimited) {
                    state.mergeError = mergeText(err)
                    return false
                }
                // The wall clock, not `now` (which only ticks each minute): the code screen counts down
                // this deadline second by second against `Instant.now()`.
                val wait = err.retryAfter?.takeIf { it > 0 }
                when (err.reason) {
                    // A code went out less than a minute ago and still works: on to the code screen,
                    // where "Enviar otro código" counts the wait down. Nothing failed.
                    "cooldown" -> {
                        state.mergeEmail = e
                        state.mergeRetryAt = Instant.now().plusSeconds((wait ?: 60).toLong())
                        true
                    }
                    // Too many codes this hour: no code is promised, and the wait is said in minutes.
                    // …or from this network (`ip_limit`): same shape, its own words.
                    "hourly_cap", "ip_limit" -> {
                        state.mergeRetryAt = wait?.let { Instant.now().plusSeconds(it.toLong()) }
                        state.mergeError = codeLimitText(err.reason, wait, email = "ese correo")
                        false
                    }
                    // No `reason` (an older server, the per-IP limiter): just too fast.
                    else -> {
                        state.mergeRetryAt = wait?.let { Instant.now().plusSeconds(it.toLong()) }
                        state.mergeError = tooFastText(wait)
                        false
                    }
                }
            }
        }
    } finally {
        state.mergeBusy = false
    }
}

/** Fusionar › código: `POST /me/merge/otp/verify` → the confirmation screen. */
suspend fun AppStore.verifyMergeCode(code: String) {
    val state = st
    if (state.mergeBusy) return
    state.mergeBusy = true
    state.mergeError = null
    try {
        val email = state.mergeEmail
        when (val r = boundWrite { api.verifyMergeCode(email, code) }) {
            BoundWrite.Stale -> Unit
            is BoundWrite.Ok -> {
                state.mergeProof = r.value
                push(Route.MergeConfirm)
            }
            is BoundWrite.Failed -> {
                val e = r.error
                state.mergeError = if (e is KuraApiError.Forbidden && e.code == "proof_rejected") {
                    "El código es incorrecto o ya venció. Revísalo o pide otro."
                } else {
                    mergeText(e)
                }
            }
        }
    } finally {
        state.mergeBusy = false
    }
}

/** "45 s" under a minute and a half, else "40 min" (the wait after a 429). */
fun mergeWaitLabel(seconds: Long): String =
    if (seconds >= 90) "${ceil(seconds / 60.0).toInt()} min" else "$seconds s"

/** A plain `rate_limited` (no code was promised or denied): the wait when the server sent one. */
private fun tooFastText(wait: Int?): String =
    if (wait == null) "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
    else "Demasiados intentos seguidos. Espera ${waitText(wait)} y vuelve a intentarlo."

private fun mergeText(e: KuraApiError): String? = when {
    e == KuraApiError.Unauthorized -> null
    e == KuraApiError.Offline -> "Sin conexión. Revisa tu red y vuelve a intentarlo."
    e is KuraApiError.RateLimited -> tooFastText(e.retryAfter?.takeIf { it > 0 })
    e is KuraApiError.Invalid && e.message.isNotEmpty() -> e.message
    e is KuraApiError.Invalid -> "Ese correo no parece válido. Revísalo."
    else -> "Algo falló de nuestro lado. Vuelve a intentarlo."
}

/** Cancelar on the confirmation: the proof is dropped (it's one use; a new one is cheap). */
fun AppStore.cancelMerge() {
    st.mergeProof = null
    pop()
}

/**
 * `POST /me/merge`: the other account folds into this one. On success everything that depends on
 * the account is read again from the returned `Me`, and Ajustes comes back.
 */
suspend fun AppStore.confirmMerge() {
    val state = st
    val proof = state.mergeProof ?: return
    if (state.mergeBusy) return
    val session = s
    state.mergeBusy = true
    state.mergeError = null
    session.sheetLocked = true
    val m: Me
    try {
        when (val r = boundWrite { api.merge(proof.mergeToken) }) {
            BoundWrite.Stale -> return
            is BoundWrite.Ok -> m = r.value
            is BoundWrite.Failed -> {
                val e = r.error
                when {
                    e == KuraApiError.Unauthorized -> Unit
                    e is KuraApiError.Forbidden && e.code == "underage" -> {
                        state.mergeProof = null
                        popToSettings()
                        showToast(ToastModel("Una de las dos cuentas es de alguien menor de 13 años. No se pueden fusionar.", ToastModel.Kind.Info))
                    }
                    e is KuraApiError.Conflict && e.code == "merge_token_invalid" -> {
                        state.mergeProof = null
                        popToSettings(keeping = Route.MergeAccount)
                        showToast(ToastModel("Pasaron más de 10 minutos. Vuelve a probar que la otra cuenta es tuya.", ToastModel.Kind.Info))
                    }
                    // Anything else (a 500 included: the server no longer burns the token on it) keeps
                    // the proof, and Reintentar sends the SAME token again.
                    else -> {
                        val text = if (e == KuraApiError.Offline) "Sin conexión. No se movió nada." else "No se pudo fusionar. No se movió nada."
                        showToast(ToastModel(text, ToastModel.Kind.Retry) {
                            dismissToast()
                            scope.launch { confirmMerge() }
                        })
                    }
                }
                return
            }
        }
    } finally {
        state.mergeBusy = false
        session.sheetLocked = false
    }
    val moved = proof.source.display
    state.mergeProof = null
    state.mergeEmail = ""
    applyMe(m)
    popToSettings()
    haptic(StoreHaptic.Success)
    showToast(ToastModel("Listo. Todo lo de $moved ya está aquí.", ToastModel.Kind.Info))
    reloadAfterMerge()
}

/**
 * Everything read for the old shape of the account goes stale: library, feed, people, recap,
 * Ajustes' lists. The library re-bootstraps; the rest reloads on its next visit.
 */
private suspend fun AppStore.reloadAfterMerge() {
    val d = s
    d.feed = emptyList()
    d.feedLoaded = false
    d.feedCursor = null
    d.feedDirty = false
    d.discover = null
    d.discoverCreators = null
    d.discoverFormats = emptyMap()
    d.loadedCollections = emptySet()
    d.loadedPeople = emptySet()
    d.peopleLists = emptyMap()
    d.peopleListMeta = emptyMap()
    d.recapMonths = null
    d.recaps = emptyMap()
    d.blockedAccounts = null
    val state = link(d)
    state.deviceSessions = null
    state.identities = null
    bootstrap()
    if (s === d) loadIdentities()
}

/** Back to Ajustes in the current tab (optionally leaving one screen on top of it). */
private fun AppStore.popToSettings(keeping: Route? = null) {
    val p = path(tab)
    val i = p.lastIndexOf(Route.Settings)
    if (i < 0) return
    paths = paths + (tab to (p.take(i + 1) + listOfNotNull(keeping)))
}

// MARK: Sesiones activas

/** Every device signed in to the account, on every visit to Sesiones activas. */
suspend fun AppStore.loadSessions() {
    val session = s
    try {
        val items = api.sessions()
        check(session)
        loaded(LoadKey.Sessions)
        link(session).deviceSessions = items.sortedWith(
            compareByDescending<DeviceSession> { it.current }.thenByDescending { it.lastSeenAt ?: Instant.MIN },
        )
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        fail(LoadKey.Sessions, err)
    }
}

/**
 * `DELETE /me/sessions/{id}` → that device lands on the entrance on its next call (its 401). The row
 * goes only after the 204; a 404 (already signed out there, or expired) just catches the list up; any
 * other failure keeps the row and offers Reintentar. Never this device's own session: that's Cerrar
 * sesión in Ajustes.
 */
suspend fun AppStore.revokeSession(device: DeviceSession): Boolean {
    val session = s
    return when (val r = boundWrite { api.revokeSession(device.id) }) {
        BoundWrite.Stale -> false
        is BoundWrite.Ok -> {
            dropSession(session, device.id)
            haptic(StoreHaptic.Success)
            showToast(ToastModel("Cerraste la sesión en ${device.title}.", ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> when (r.error) {
            KuraApiError.Unauthorized -> false
            KuraApiError.NotFound -> {
                dropSession(session, device.id)
                true
            }
            else -> {
                val text = if (r.error == KuraApiError.Offline) "Sin conexión. La sesión sigue abierta." else "No se pudo cerrar esa sesión."
                showToast(ToastModel(text, ToastModel.Kind.Retry) {
                    dismissToast()
                    scope.launch { revokeSession(device) }
                })
                false
            }
        }
    }
}

private fun dropSession(session: SessionData, id: String) {
    val state = link(session)
    state.deviceSessions = state.deviceSessions?.filterNot { it.id == id }
}
