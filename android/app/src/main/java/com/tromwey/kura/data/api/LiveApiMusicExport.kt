package com.tromwey.kura.data.api

import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.MusicServices
import com.tromwey.kura.data.models.Obj
import com.tromwey.kura.data.models.WireSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URI

// "Llévala a otra app" over HTTP (`.claude/knowledge/state/export-contract.md` §8, zod in
// `schemas.ts` › "Music export") — twin of iOS `LiveAPI+MusicExport.swift`.

internal suspend fun LiveApi.musicServicesImpl(): MusicServices =
    client.decode(Endpoint.get(ApiPath("music/services")), MusicServices.serializer())

private object TidalStart : WireSerializer<String>("TidalStart") {
    override fun read(e: JsonElement) = Obj.of(e).requireString("authorizeUrl")
}

/** Only TIDAL's own https consent page is ever opened in the browser. */
internal suspend fun LiveApi.startTidalAuthImpl(): String {
    val raw = client.decode(Endpoint.post(ApiPath("music/tidal/start")), TidalStart)
    val u = try { URI(raw) } catch (_: java.net.URISyntaxException) { null }
    val host = u?.host?.lowercase()
    if (u == null || u.scheme != "https" || host == null || !(host == "tidal.com" || host.endsWith(".tidal.com"))) {
        throw KuraApiError.Server("Respuesta inesperada del servidor")
    }
    return raw
}

internal suspend fun LiveApi.completeTidalAuthImpl(ref: String, claim: String): MusicServices =
    client.decode(Endpoint.post(ApiPath("music/tidal/complete"), buildJsonObject { put("ref", ref); put("claim", claim) }), MusicServices.serializer())

internal suspend fun LiveApi.disconnectTidalImpl() = client.send(Endpoint.delete(ApiPath("music/tidal")))

internal suspend fun LiveApi.partyExportImpl(id: String, provider: MusicProvider): ExportState =
    client.decode(Endpoint.get(ApiPath("parties/{}/exports/{}", id, provider.rawValue)), ExportState.serializer())

internal suspend fun LiveApi.startPartyExportImpl(id: String, provider: MusicProvider): ExportState =
    client.decode(Endpoint.post(ApiPath("parties/{}/exports/{}", id, provider.rawValue)), ExportState.serializer())

internal suspend fun LiveApi.stepTidalExportImpl(id: String): ExportState =
    client.decode(Endpoint.post(ApiPath("parties/{}/exports/tidal/step", id)), ExportState.serializer())
