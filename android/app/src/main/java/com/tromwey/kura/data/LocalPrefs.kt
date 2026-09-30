package com.tromwey.kura.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.data.models.CollectionLayout
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.SortMode
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.io.IOException

/**
 * What the API marks `unsupported` (API.md §3/§4) stays on the device, with no sync UI: sort,
 * layout, watched episodes, plus the small conveniences (recent searches, recently viewed,
 * alerts, muted, "en común"). Twin of iOS `LocalPrefs`: the SAME keys — one JSON payload under
 * `com.tromwey.kura.local` and the flag `com.tromwey.kura.local.curationMigrated` — in a
 * `DataStore<Preferences>` instead of `UserDefaults`. Disabled on the mock (`enabled = false`) so
 * debug captures stay deterministic: then `load()` is the empty payload and writes are no-ops.
 *
 * The `legacy*` fields exist for parity with the iOS migration (`migrateLegacyCuration`): no
 * Android build ever wrote them, so here they always read `null` and `curationMigrated` is moot.
 */
class LocalPrefs(private val store: DataStore<Preferences>?, val enabled: Boolean = store != null) {
    @Serializable
    data class Collection(
        val sort: SortMode = SortMode.Manual,
        val layout: CollectionLayout = CollectionLayout.Covers,
        /** Read-only leftovers of the device-local curation (older iOS builds). `null` encodes as nothing. */
        @SerialName("pinned") val legacyPinned: Boolean? = null,
        @SerialName("coverTitleID") val legacyCoverTitleId: String? = null,
        @SerialName("order") val legacyOrder: List<String>? = null,
    ) {
        val hasLegacy: Boolean get() = legacyPinned == true || legacyCoverTitleId != null || legacyOrder != null
    }

    @Serializable
    data class Payload(
        val collections: Map<String, Collection> = emptyMap(),
        val watchedEpisodes: Map<String, List<String>> = emptyMap(),
        val recentSearches: List<String> = emptyList(),
        val recentlyViewed: List<String> = emptyList(),
        val alerts: List<String> = emptyList(),
        val muted: List<String> = emptyList(),
        val showCommon: Boolean = true,
        val defaultPrivacy: String? = null,
    )

    /** The last `load` couldn't read what's on disk: saves are held until one reads it fine, so an
     *  empty in-memory payload never overwrites prefs a newer build (or a hiccup) left there. */
    @Volatile var writesHeld = false
        private set

    /** An unreadable payload (older/newer shape, a corrupt file) reads as the empty one, like iOS's
     *  `try?` — but it's logged, and nothing is written over it until a load reads it fine. */
    suspend fun load(): Payload {
        if (!enabled || store == null) return Payload()
        val raw = try {
            store.data.first()[PAYLOAD]
        } catch (e: IOException) { // DataStore's CorruptionException included
            KuraLog.w(TAG, "prefs ilegibles en disco (${e.javaClass.simpleName}); no se escriben hasta leerlas bien")
            writesHeld = true
            return Payload()
        }
        if (raw == null) {
            writesHeld = false
            return Payload()
        }
        return try {
            KuraJson.json.decodeFromString(Payload.serializer(), raw).also { writesHeld = false }
        } catch (e: IllegalArgumentException) {
            KuraLog.w(TAG, "payload de prefs ilegible (${e.javaClass.simpleName}); no se escribe encima hasta leerlo bien")
            writesHeld = true
            Payload()
        }
    }

    suspend fun save(p: Payload) {
        if (!enabled || store == null) return
        if (writesHeld) {
            KuraLog.w(TAG, "guardado de prefs omitido: la última carga no pudo leerlas")
            return
        }
        val raw = KuraJson.json.encodeToString(Payload.serializer(), p)
        store.edit { it[PAYLOAD] = raw }
    }

    /** Set once an older build's device-local pins/covers/orders reached the server. Not cleared on sign-out. */
    suspend fun curationMigrated(): Boolean {
        if (!enabled || store == null) return true
        return store.data.first()[MIGRATED] ?: false
    }

    suspend fun setCurationMigrated(value: Boolean) {
        if (!enabled || store == null) return
        store.edit { it[MIGRATED] = value }
    }

    /** Every way out of a session: what's on disk goes, readable or not (a fresh start can write). */
    suspend fun clear() {
        if (!enabled || store == null) return
        store.edit { it.remove(PAYLOAD) }
        writesHeld = false
    }

    companion object {
        const val KEY = "com.tromwey.kura.local"
        private const val TAG = "KuraPrefs"
        private val PAYLOAD = stringPreferencesKey(KEY)
        private val MIGRATED = booleanPreferencesKey("$KEY.curationMigrated")

        /** The one store of the process (DataStore must be a singleton per file). */
        private val Context.kuraLocalStore: DataStore<Preferences> by preferencesDataStore(name = "com.tromwey.kura.local")

        fun live(context: Context) = LocalPrefs(context.applicationContext.kuraLocalStore, enabled = true)

        /** The mock: nothing persists. */
        val disabled = LocalPrefs(null, enabled = false)
    }
}
