package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.MusicExportCopy
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.MusicServices
import com.tromwey.kura.data.models.PartyExportFlow
import com.tromwey.kura.data.models.Route
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.net.URI
import java.net.URISyntaxException
import java.net.URLDecoder
import kotlin.time.Duration.Companion.seconds

// "Llévala a otra app" — twin of `ios/Kura/State/AppStore+MusicExport.swift`
// (`.claude/knowledge/state/export-contract.md`, design `fiesta-app-v2` · `shExport` / `isExport`).
// Host AND guests export, each to their own account; the playlist is named like the party.
//
// ANDROID ONLY DOES TIDAL. Apple Music runs on iOS with MusicKit on the device; Android has no
// MusicKit, so its row says "Solo en iPhone" (dimmed, never a flow that can't finish). TIDAL runs
// on the server: link once (the server's `authorizeUrl` in an Auth Tab → `kura://music/tidal/…` →
// `complete`), then `step` in a loop painting `processed/total`; `busy` waits ~1 s, a 429 waits
// `retryAfterSeconds`, `not_connected` goes back to "conecta tidal.".
//
// Everything is `503` while `MIGRATION_0034_LIVE` is off: the sheet says "Próximamente" and never
// fails mid-flow. The screen lives in `SessionData.party.export`, so a sign-out drops it.

// MARK: Lookups

val AppStore.musicServices: MusicServices? get() = s.party.musicServices
val AppStore.musicServicesError: KuraApiError? get() = s.party.musicServicesError
val AppStore.partyExport: PartyExportFlow? get() = s.party.export

/** A provider this build can actually export to (MusicKit doesn't exist on Android). */
val MusicProvider.supportedHere: Boolean get() = this == MusicProvider.Tidal

// MARK: Services

/**
 * `GET /music/services` when the export sheet opens. A 503 is the feature not being live: both
 * buttons "Próximamente". Anything else is a real failure (the sheet offers Reintentar).
 */
suspend fun AppStore.loadMusicServices() {
    s.party.musicServicesError = null
    val session = s
    try {
        val sv = api.musicServices()
        if (s !== session) return
        online()
        s.party.musicServices = sv
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) return
        when (val e = noteError(err)) {
            KuraApiError.Unavailable, is KuraApiError.ServiceUnavailable -> s.party.musicServices = MusicServices.OFF
            null, KuraApiError.Unauthorized -> Unit
            else -> {
                s.party.musicServicesError = e
                logError("music services failed: $e")
            }
        }
    }
}

/** "Desconectar TIDAL" (`DELETE /music/tidal`). */
suspend fun AppStore.disconnectTidal() {
    when (val r = boundWrite { api.disconnectTidal() }) {
        is BoundWrite.Ok -> {
            s.party.musicServices = s.party.musicServices?.let { it.copy(tidal = it.tidal.copy(connected = false)) }
            showToast(ToastModel("Desconectaste TIDAL.", ToastModel.Kind.Info))
        }
        is BoundWrite.Failed -> showToast(
            ToastModel(if (r.error == KuraApiError.Unavailable) MusicExportCopy.UNAVAILABLE else r.error.toast("No se pudo desconectar TIDAL."), ToastModel.Kind.Info),
        )
        BoundWrite.Stale -> Unit
    }
}

// MARK: The screen

/**
 * A service tapped in the sheet: the screen opens on "conecta tidal." when the link is missing, or
 * straight on "pasando la colección.". The screen is drawn by the party's page, so the page comes
 * to the front of the tab first (the sheet may have been opened from Tus colecciones).
 */
fun AppStore.startPartyExport(partyId: String, provider: MusicProvider) {
    if (!provider.supportedHere || musicServices?.get(provider)?.available != true) return
    if (sheet != null) dismissSheet()
    s.party.exportJob?.cancel()
    s.party.tidalInFlight = false
    val run = musicServices?.tidal?.connected == true
    val route = Route.PartyRoute(partyId)
    if (path(tab).lastOrNull() != route) push(route)
    s.party.export = PartyExportFlow(
        partyId = partyId,
        provider = provider,
        playlistName = party(partyId)?.name.orEmpty(),
        step = if (run) PartyExportFlow.Step.Progress else PartyExportFlow.Step.Connect,
        total = if (run) party(partyId)?.songs?.size ?: 0 else 0,
    )
    if (run) launchExport()
}

/**
 * "Conectar TIDAL": asks the server for TIDAL's consent page and hands it to [open] (the screen
 * launches it in an Auth Tab). The answer comes back through [tidalAuthResult] (the Auth Tab's
 * result) or [tidalCallback] (a `kura://` link, when the browser had no Auth Tab).
 */
fun AppStore.connectPartyExport(open: (String) -> Unit) {
    val flow = s.party.export ?: return
    if (flow.step != PartyExportFlow.Step.Connect || flow.busy) return
    s.party.exportJob?.cancel()
    s.party.exportJob = scope.launch {
        updateExport { it.copy(busy = true, note = null) }
        val url = startTidalAuth() ?: return@launch
        s.party.tidalInFlight = true
        open(url)
    }
}

/** `POST /music/tidal/start` → TIDAL's https consent page, or null (the connect step says why). */
suspend fun AppStore.startTidalAuth(): String? = try {
    exportCall { api.startTidalAuth() }
} catch (e: Exception) {
    if (e is CancellationException && e !is StaleExport) throw e
    updateExport { it.copy(busy = false) }
    connectFailed(e)
    null
}

/**
 * The Auth Tab came back. [uri] = the `kura://music/tidal/…` it caught; null = closed / cancelled
 * (or a browser without Auth Tab, whose callback may still arrive through [tidalCallback]).
 */
fun AppStore.tidalAuthResult(uri: String?) {
    updateExport { it.copy(busy = false) }
    if (uri != null) tidalCallback(uri)
}

/**
 * A `kura://music/tidal/authorized?ref=…&claim=…` or `kura://music/tidal/connected?ok=0&reason=…`.
 * Only honored while THIS app has a TIDAL consent out (like iOS, which only reads the callback its
 * own `ASWebAuthenticationSession` returns): any other `kura://music/…` a page throws at the app is
 * ignored. True = it was ours and was consumed. `ref`/`claim` are never logged.
 */
fun AppStore.tidalCallback(uri: String): Boolean {
    val cb = TidalCallback.parse(uri) ?: return false
    val flow = s.party.export
    if (!s.party.tidalInFlight || flow == null || flow.step != PartyExportFlow.Step.Connect) return false
    s.party.tidalInFlight = false
    when (cb) {
        is TidalCallback.Authorized -> {
            s.party.exportJob?.cancel()
            s.party.exportJob = scope.launch { if (completeTidalAuth(cb.ref, cb.claim)) launchExport() }
        }
        is TidalCallback.Failed -> updateExport { it.copy(busy = false, note = MusicExportCopy.tidalReason(cb.reason)) }
    }
    return true
}

/** `POST /music/tidal/complete { ref, claim }` with this bearer. True = TIDAL is linked. */
suspend fun AppStore.completeTidalAuth(ref: String, claim: String): Boolean {
    updateExport { it.copy(busy = true, note = null) }
    return try {
        s.party.musicServices = exportCall { api.completeTidalAuth(ref, claim) }
        updateExport { it.copy(busy = false) }
        true
    } catch (e: Exception) {
        if (e is CancellationException && e !is StaleExport) throw e
        updateExport { it.copy(busy = false) }
        connectFailed(e)
        false
    }
}

/** "Reintentar" (contract: POST again re-queues the missing; nothing is duplicated). */
fun AppStore.retryPartyExport() {
    if (s.party.export?.step != PartyExportFlow.Step.Failed) return
    launchExport()
}

/** The ✕ / "Volver a la colección". While the songs are passing it asks first (`PartyExportLeave`). */
fun AppStore.closePartyExport(force: Boolean = false) {
    val flow = s.party.export ?: return
    if (!force && flow.step == PartyExportFlow.Step.Progress) {
        present(SheetRoute.PartyExportLeave(flow.partyId))
        return
    }
    s.party.exportJob?.cancel()
    s.party.exportJob = null
    s.party.tidalInFlight = false
    if (sheet is SheetRoute.PartyExportLeave) dismissSheet()
    s.party.export = null
}

// MARK: Steps

private fun AppStore.updateExport(f: (PartyExportFlow) -> PartyExportFlow) {
    val flow = s.party.export ?: return
    s.party.export = f(flow)
}

/** A write of an old session: thrown as a cancellation so every step just stops. */
private class StaleExport : CancellationException("stale session")

/** One API call bound to this session (a sign-out mid-export drops the answer). */
private suspend fun <T> AppStore.exportCall(op: suspend () -> T): T = when (val r = boundWrite(op)) {
    is BoundWrite.Ok -> r.value
    is BoundWrite.Failed -> throw r.error
    BoundWrite.Stale -> throw StaleExport()
}

private fun AppStore.launchExport() {
    val flow = s.party.export ?: return
    s.party.exportJob?.cancel()
    updateExport { it.copy(step = PartyExportFlow.Step.Progress, note = null, failure = null, pause = null, busy = false) }
    s.party.exportJob = scope.launch { runTidal(flow.partyId) }
}

private fun AppStore.applyExportState(st: ExportState) = updateExport { f ->
    f.copy(
        state = st,
        playlistName = st.playlistName.ifEmpty { f.playlistName },
        total = st.total,
        processed = minOf(st.processed, st.total),
        current = st.current?.title ?: f.current,
    )
}

private fun AppStore.finishExport(st: ExportState) {
    applyExportState(st)
    updateExport { it.copy(step = PartyExportFlow.Step.Done, processed = it.total, pause = null, current = null) }
}

/** A failure on the connect step stays on it, with a line saying why. */
private fun AppStore.connectFailed(error: Throwable) {
    if (error is CancellationException) return
    val e = error as? KuraApiError ?: KuraApiError.Server(error.toString())
    when {
        e == KuraApiError.Unauthorized -> Unit
        e is KuraApiError.Conflict && e.code == "auth_expired" -> updateExport { it.copy(note = MusicExportCopy.tidalReason("expired")) }
        e is KuraApiError.RateLimited -> updateExport { it.copy(note = MusicExportCopy.tidalReason("rate_limited")) }
        e == KuraApiError.Offline -> updateExport { it.copy(note = "Sin conexión. Vuelve a intentarlo.") }
        e == KuraApiError.Unavailable || e == KuraApiError.NotFound ||
            (e is KuraApiError.ServiceUnavailable && e.reason == "not_configured") -> exportFailed(e)
        e is KuraApiError.ServiceUnavailable && e.message.isNotEmpty() -> updateExport { it.copy(note = e.message) }
        else -> updateExport { it.copy(note = MusicExportCopy.tidalReason(null)) }
    }
}

// MARK: TIDAL (server, in steps)

/** Steps before giving up on an export the server keeps calling "in progress". */
internal const val TIDAL_MAX_ROUNDS = 2_000

/** The export ran out of rounds: what's passed stays in the playlist, Reintentar resumes. */
internal const val TIDAL_UNFINISHED = "La exportación no terminó. Lo que ya pasó sigue en TIDAL: vuelve a intentarlo para seguir."

private suspend fun AppStore.runTidal(partyId: String) {
    try {
        var st = exportCall { api.startPartyExport(partyId, MusicProvider.Tidal) }
        applyExportState(st)
        var rounds = 0
        while (currentCoroutineContext().isActive && rounds < TIDAL_MAX_ROUNDS) {
            rounds++
            if (st.status == ExportState.Status.Done || (st.status == ExportState.Status.Idle && !st.busy)) break
            if (st.busy) delay(1.seconds)
            try {
                st = exportCall { api.stepTidalExport(partyId) }
                updateExport { it.copy(pause = null) }
                applyExportState(st)
            } catch (e: KuraApiError.RateLimited) {
                // `service_rate_limited` (TIDAL) or ours: wait and call the same step again.
                updateExport { it.copy(pause = MusicExportCopy.pause(MusicProvider.Tidal)) }
                delay(((e.retryAfter ?: 3).coerceIn(1, 120)).seconds)
            }
        }
        val finished = st.status == ExportState.Status.Done || (st.status == ExportState.Status.Idle && !st.busy)
        if (finished) {
            finishExport(st)
        } else if (currentCoroutineContext().isActive) {
            // Out of rounds with the server still "in progress": never "Listo" over a playlist that isn't.
            logError("export tidal: sin terminar tras $TIDAL_MAX_ROUNDS rondas (${st.processed}/${st.total})")
            updateExport { it.copy(step = PartyExportFlow.Step.Failed, pause = null, current = null, failure = TIDAL_UNFINISHED) }
        }
    } catch (e: Exception) {
        if (e is CancellationException) return
        exportFailed(e)
    }
}

// MARK: Failures

private fun AppStore.exportFailed(error: Throwable) {
    if (error is CancellationException) return
    val p = s.party.export?.provider ?: MusicProvider.Tidal
    val e = error as? KuraApiError ?: KuraApiError.Server(error.toString())
    when {
        e == KuraApiError.Unauthorized -> Unit
        e is KuraApiError.Conflict && e.code == "not_connected" -> {
            // The TIDAL link died (refresh rejected / scope gone): link again.
            s.party.musicServices = s.party.musicServices?.let { it.copy(tidal = it.tidal.copy(connected = false)) }
            updateExport { it.copy(step = PartyExportFlow.Step.Connect, note = e.message.ifEmpty { null }) }
        }
        e is KuraApiError.ServiceUnavailable && e.reason == "not_configured" -> {
            closePartyExport(force = true)
            showToast(ToastModel(e.message.ifEmpty { MusicExportCopy.notConfigured(p) }, ToastModel.Kind.Info))
            scope.launch { loadMusicServices() }
        }
        e == KuraApiError.Unavailable -> {
            closePartyExport(force = true)
            s.party.musicServices = MusicServices.OFF
            showToast(ToastModel(MusicExportCopy.UNAVAILABLE, ToastModel.Kind.Info))
        }
        e == KuraApiError.NotFound -> {
            val id = s.party.export?.partyId
            closePartyExport(force = true)
            if (id != null) scope.launch { loadParty(id, force = true) }
            showToast(ToastModel("No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella.", ToastModel.Kind.Info))
        }
        e is KuraApiError.ServiceUnavailable ->
            updateExport { it.copy(step = PartyExportFlow.Step.Failed, failure = e.message.ifEmpty { MusicExportCopy.serviceFailed(p) }) }
        e == KuraApiError.Offline -> updateExport { it.copy(step = PartyExportFlow.Step.Failed, failure = MusicExportCopy.OFFLINE) }
        e is KuraApiError.RateLimited ->
            updateExport { it.copy(step = PartyExportFlow.Step.Failed, failure = "Demasiados intentos. Espera un momento y vuelve a intentarlo.") }
        else -> {
            logError("export ${p.rawValue} failed: $e")
            updateExport { it.copy(step = PartyExportFlow.Step.Failed, failure = MusicExportCopy.serviceFailed(p)) }
        }
    }
}

// MARK: The callback

/** What TIDAL's bounce says (iOS `TidalCallback`). A malformed/missing `ref` or `claim` = not ours. */
sealed interface TidalCallback {
    data class Authorized(val ref: String, val claim: String) : TidalCallback {
        override fun toString() = "Authorized(<redacted>)"
    }
    data class Failed(val reason: String?) : TidalCallback

    companion object {
        private val refRe = Regex("^i[A-Za-z0-9_-]{43}$")
        private val claimRe = Regex("^[A-Za-z0-9_-]{16,256}$")

        fun parse(raw: String): TidalCallback? {
            val u = try {
                URI(raw)
            } catch (_: URISyntaxException) {
                return null
            }
            if (u.scheme?.lowercase() != "kura" || u.host?.lowercase() != "music") return null
            val q = (u.rawQuery ?: "").split('&').filter { it.isNotEmpty() }.associate { kv ->
                val i = kv.indexOf('=')
                val k = if (i < 0) kv else kv.substring(0, i)
                val v = if (i < 0) "" else kv.substring(i + 1)
                decode(k) to decode(v)
            }
            return when (u.rawPath) {
                "/tidal/authorized" -> {
                    val ref = q["ref"]?.takeIf { refRe.matches(it) } ?: return null
                    val claim = q["claim"]?.takeIf { claimRe.matches(it) } ?: return null
                    Authorized(ref, claim)
                }
                "/tidal/connected" -> Failed(q["reason"])
                else -> null
            }
        }

        private fun decode(s: String) = try {
            URLDecoder.decode(s, "UTF-8")
        } catch (_: IllegalArgumentException) {
            s
        }
    }
}
