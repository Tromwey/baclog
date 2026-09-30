package com.tromwey.kura.data

import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.data.models.KuraJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

/**
 * A sign-out the server never confirmed (offline, 5xx): the bearer was already forgotten on the phone,
 * but it's still alive on the server. Kept ENCRYPTED (`SecureStore` slot [SLOT] on the device) until a
 * retry lands — next launch or when the network comes back (`AppStore.retryPendingRevokes`).
 * - `global = false`: "Cerrar sesión en este teléfono" → `DELETE /me/sessions/{sid}` with that bearer.
 * - `global = true`: "Cerrar sesión" everywhere → `POST auth/logout` with that bearer.
 */
@Serializable
data class PendingRevoke(val bearer: String, val sid: String? = null, val global: Boolean = false) {
    override fun toString() = "PendingRevoke(sid=${sid ?: "-"}, global=$global, bearer=<redacted>)"
}

class PendingRevokes(private val store: TokenStore) {
    private val serializer = ListSerializer(PendingRevoke.serializer())

    @Synchronized
    fun all(): List<PendingRevoke> {
        val raw = store.get() ?: return emptyList()
        return try {
            KuraJson.json.decodeFromString(serializer, raw)
        } catch (_: IllegalArgumentException) {
            // An unreadable queue can't be retried: say so and start over (never loop on it).
            KuraLog.w(TAG, "cola de cierres de sesión ilegible; se descarta")
            store.clear()
            emptyList()
        }
    }

    @Synchronized
    fun add(p: PendingRevoke) {
        // The same bearer twice is one revocation; the queue is capped (oldest dropped).
        val next = (all().filterNot { it.bearer == p.bearer } + p).takeLast(MAX)
        store.set(KuraJson.json.encodeToString(serializer, next))
    }

    @Synchronized
    fun remove(p: PendingRevoke) {
        val next = all().filterNot { it.bearer == p.bearer }
        if (next.isEmpty()) store.clear() else store.set(KuraJson.json.encodeToString(serializer, next))
    }

    val isEmpty: Boolean get() = all().isEmpty()

    companion object {
        /** `SecureStore` slot of the queue (same Keystore key and file as the bearer). */
        const val SLOT = "pendingRevoke"
        const val MAX = 8
        private const val TAG = "KuraSession"
    }
}
