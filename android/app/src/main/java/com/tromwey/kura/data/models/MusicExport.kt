package com.tromwey.kura.data.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement

// "Llévala a otra app": a party's songs as a playlist in the person's own Apple Music or TIDAL
// (contract `.claude/knowledge/state/export-contract.md`). TIDAL runs on the server in steps the
// app keeps calling. Apple Music runs ON THE DEVICE with MusicKit on iOS — Android has no MusicKit
// flow (BRIEF fase 2 = TIDAL), so here it's only a wire value. Twin of `ios/Kura/Models/MusicExport.swift`.

enum class MusicProvider(val rawValue: String) {
    AppleMusic("apple_music"), Tidal("tidal");

    /** The server's `serviceLabel`: "Apple Music" · "TIDAL". */
    val label: String get() = if (this == Tidal) "TIDAL" else "Apple Music"

    companion object {
        fun from(raw: String?): MusicProvider? = entries.firstOrNull { it.rawValue == raw }
    }
}

/**
 * `GET /music/services`: which button works on this deploy. `available: false` → "Próximamente".
 * DIFFERENCE WITH iOS (on purpose): iOS turns Apple Music on when `reason == "web_key_missing"`
 * because it exports with native MusicKit; Android has no native Apple Music flow, so it keeps the
 * server's answer as-is. Unknown fields (e.g. `webAvailable`) are ignored.
 */
@Serializable(with = MusicServices.Serializer::class)
data class MusicServices(val appleMusic: Service, val tidal: Service) {
    data class Service(val available: Boolean, val connected: Boolean = false, val reason: String? = null)

    operator fun get(p: MusicProvider): Service = if (p == MusicProvider.Tidal) tidal else appleMusic

    companion object {
        /** `apple_music.reason` when only the web lacks the MusicKit key. */
        const val WEB_KEY_MISSING = "web_key_missing"
        /** Both off: the switch (`MIGRATION_0034_LIVE`) or nothing configured. */
        val OFF = MusicServices(Service(false), Service(false))
    }

    internal object Serializer : WireSerializer<MusicServices>("MusicServices") {
        private fun service(o: Obj?) = o?.let { Service(it.bool("available") ?: false, it.bool("connected") ?: false, it.string("reason")) }
            ?: Service(false)

        override fun read(e: JsonElement): MusicServices {
            val c = Obj.of(e)
            return MusicServices(service(c.obj("apple_music")), service(c.obj("tidal")))
        }
    }
}

/** A song of the export (`ExportSong`), in party order. */
@Serializable(with = ExportSong.Serializer::class)
data class ExportSong(
    val titleId: String,
    val title: String,
    val artist: String?,
    val album: String? = null,
    val artworkUrl: String? = null,
    val durationMs: Int? = null,
    /** Apple Music CATALOG id (the iTunes trackId, storefront `mx`). */
    val appleMusicId: String? = null,
    val isrc: String? = null,
    val state: State = State.Pending,
    /** null → "Agregó alguien". */
    val addedBy: PartyPerson? = null,
    /** → "Agregaste". */
    val mine: Boolean = false,
) {
    enum class State(val rawValue: String) { Pending("pending"), Added("added"), Missing("missing") }

    val id: String get() = titleId
    /** "Agregaste" · "Agregó @ana" · "Agregó alguien" (the "No están en…" rows). */
    val byLine: String get() = if (mine) "Agregaste" else addedBy?.let { "Agregó ${it.at}" } ?: "Agregó alguien"

    internal object Serializer : WireSerializer<ExportSong>("ExportSong") {
        override fun read(e: JsonElement): ExportSong {
            val c = Obj.of(e)
            val st = c.lenientString("state")
            return ExportSong(
                titleId = c.requireString("titleId"),
                title = c.string("title") ?: "",
                artist = c.string("artist")?.ifEmpty { null },
                album = c.string("album")?.ifEmpty { null },
                artworkUrl = c.string("artworkUrl"),
                durationMs = c.int("durationMs"),
                appleMusicId = c.string("appleMusicId")?.ifEmpty { null },
                isrc = c.string("isrc")?.ifEmpty { null },
                state = State.entries.firstOrNull { it.rawValue == st } ?: State.Pending,
                addedBy = c.decode("addedBy", PartyPerson.serializer()),
                mine = c.bool("mine") ?: false,
            )
        }
    }
}

/** `ExportState`: where one (party, you, service) export stands. */
@Serializable(with = ExportState.Serializer::class)
data class ExportState(
    val provider: MusicProvider,
    val playlistName: String,
    val status: Status,
    val total: Int,
    /** "N de M" = exported / total. */
    val exported: Int,
    /** The bar = processed / total. */
    val processed: Int,
    val current: Current? = null,
    val playlist: Playlist? = null,
    /** "No están en {svc}", party order. */
    val missing: List<ExportSong> = emptyList(),
    val songs: List<ExportSong> = emptyList(),
    /** Another step of this export is running: call again in ~1 s. */
    val busy: Boolean = false,
) {
    enum class Status(val rawValue: String) { Idle("idle"), InProgress("in_progress"), Done("done") }

    data class Current(val titleId: String, val title: String, val artist: String?)

    /** "Abrir en {svc}" — `url` derived by the server; null → no button. */
    data class Playlist(val id: String, val url: String?)

    internal object Serializer : WireSerializer<ExportState>("ExportState") {
        override fun read(e: JsonElement): ExportState {
            val c = Obj.of(e)
            val p = c.requireString("provider")
            val st = c.lenientString("status")
            return ExportState(
                provider = MusicProvider.from(p) ?: throw SerializationException("provider desconocido: $p"),
                playlistName = c.string("playlistName") ?: "",
                status = Status.entries.firstOrNull { it.rawValue == st } ?: Status.Idle,
                total = c.int("total") ?: 0,
                exported = c.int("exported") ?: 0,
                processed = c.int("processed") ?: 0,
                current = c.obj("current")?.let { Current(it.string("titleId") ?: "", it.string("title") ?: "", it.string("artist")) },
                playlist = c.obj("playlist")?.let { Playlist(it.requireString("id"), it.string("url")) },
                missing = c.list("missing", ExportSong.serializer()) ?: emptyList(),
                songs = c.list("songs", ExportSong.serializer()) ?: emptyList(),
                busy = c.bool("busy") ?: false,
            )
        }
    }
}

/** The export screen (design `isExport`) — one at a time, over everything. */
data class PartyExportFlow(
    val partyId: String,
    val provider: MusicProvider,
    val playlistName: String,
    val step: Step,
    val state: ExportState? = null,
    /** The bar, drawn from the server (TIDAL). */
    val processed: Int = 0,
    val total: Int = 0,
    /** "Buscando {current} en {svc}…" */
    val current: String? = null,
    /** A pause the service asked for, shown instead of "Buscando…". */
    val pause: String? = null,
    /** Why the connect step is back (TIDAL said no…). */
    val note: String? = null,
    val needsSettings: Boolean = false,
    /** The connect button is working (browser up). */
    val busy: Boolean = false,
    /** "no se pudo exportar." body (the server's copy when it wrote one). */
    val failure: String? = null,
) {
    enum class Step { Connect, Progress, Done, Failed }
}

/** The export's copy, shared by the sheet and the screen (server `rules.ts` where it has one).
 *  iOS's MusicKit-only copy (`appleToken`, permission/subscription lines) isn't ported: no MusicKit here. */
object MusicExportCopy {
    fun title(step: PartyExportFlow.Step, p: MusicProvider): String = when (step) {
        PartyExportFlow.Step.Connect -> "conecta ${p.label.lowercase()}"
        PartyExportFlow.Step.Progress -> "pasando la colección"
        PartyExportFlow.Step.Done -> "lista"
        PartyExportFlow.Step.Failed -> "no se pudo exportar."
    }

    fun connectBody(name: String) = "kura solo crea la playlist «$name» en tu cuenta. No lee ni cambia tu biblioteca."

    fun searching(title: String, p: MusicProvider) = "Buscando $title en ${p.label}…"

    /** `doneLine`: "N de M canciones ya están en tu playlist de {svc}." */
    fun done(p: MusicProvider, exported: Int, total: Int) = "$exported de $total canciones ya están en tu playlist de ${p.label}."

    /** `SERVICE_FAILED_MESSAGE`. */
    fun serviceFailed(p: MusicProvider) =
        "${p.label} dejó de responder a mitad del proceso. Tu colección sigue intacta en kura; al reintentar no se duplican canciones."

    /** The same copy plus where it failed and what the service said, so a screenshot tells the cause. */
    fun serviceFailed(p: MusicProvider, stage: String, detail: String) =
        "No pudimos terminar en ${p.label}. Tu colección sigue intacta en kura; al reintentar no se duplican canciones.\n\nDetalle: $stage · $detail"

    const val OFFLINE = "Sin conexión. Tu colección sigue intacta en kura; al reintentar no se duplican canciones."
    fun pause(p: MusicProvider) = "${p.label} pidió una pausa. Seguimos en unos segundos."
    fun notConfigured(p: MusicProvider) = "${p.label} todavía no está disponible en kura."
    /** `assertMusicExportLive` (503 `migration`). */
    const val UNAVAILABLE = "Exportar a otras apps todavía no está disponible. Vuelve a intentarlo más tarde."
    fun description(name: String) = "La colección de fiesta «$name», desde kura."

    /** `kura://music/tidal/connected?ok=0&reason=…` and `complete`'s 409 (contract §4.1 copy). */
    fun tidalReason(reason: String?): String = when (reason) {
        "denied" -> "No diste permiso en TIDAL."
        "unavailable" -> "TIDAL todavía no está disponible en kura."
        "rate_limited" -> "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
        else -> "La conexión con TIDAL caducó. Vuelve a intentarlo."
    }
}
