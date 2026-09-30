package com.tromwey.kura.state

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.DeviceSession
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.WeakHashMap

// Ajustes › Sesiones activas — the minimal twin of `AppStore+AccountLink.swift` § Sesiones activas.
// The rest of `+AccountLink` (identities, link/unlink, merge) is fase 2 on Android.
//
// `deviceSessions` belongs to ONE account, like everything in `SessionData`: it lives in a slot keyed
// by the current `SessionData` instance (identity, weakly held), so a sign-out / 401 / deleted account
// — which replace `s` whole — leave the next account with nothing (null = not loaded yet). Reading it
// reads `s` (a `mutableStateOf`), so Compose also recomposes when the session changes.

private val deviceSessionSlots = WeakHashMap<SessionData, MutableState<List<DeviceSession>?>>()

private fun slot(session: SessionData): MutableState<List<DeviceSession>?> =
    synchronized(deviceSessionSlots) { deviceSessionSlots.getOrPut(session) { mutableStateOf(null) } }

/** `GET /me/sessions`: this device first, then the most recently seen. null until the first read. */
val AppStore.deviceSessions: List<DeviceSession>? get() = slot(s).value

/** Every device signed in to the account, on every visit to Sesiones activas. */
suspend fun AppStore.loadSessions() {
    val session = s
    try {
        val items = api.sessions()
        check(session)
        loaded(LoadKey.Sessions)
        slot(session).value = items.sortedWith(
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
            drop(session, device.id)
            haptic(StoreHaptic.Success)
            showToast(ToastModel("Cerraste la sesión en ${device.title}.", ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> when (r.error) {
            KuraApiError.Unauthorized -> false
            KuraApiError.NotFound -> {
                drop(session, device.id)
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

private fun drop(session: SessionData, id: String) {
    val s = slot(session)
    s.value = s.value?.filterNot { it.id == id }
}
