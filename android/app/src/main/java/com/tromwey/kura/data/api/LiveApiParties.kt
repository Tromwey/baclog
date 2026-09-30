package com.tromwey.kura.data.api

import com.tromwey.kura.data.models.InvitePreview
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyCard
import com.tromwey.kura.data.models.PartyJoin
import com.tromwey.kura.data.models.PartySongHit
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// Colecciones de fiesta over HTTP (`.claude/knowledge/state/fiesta-contract.md` §5, zod in
// `schemas.ts` › "Parties") — twin of iOS `LiveAPI+Parties.swift`. Every id and token goes through
// `ApiPath` like the rest of the client.

internal suspend fun LiveApi.partiesImpl(): List<PartyCard> =
    client.decode(Endpoint.get(ApiPath("parties")), Items(PartyCard.serializer()))

/** `perGuestLimit` always goes on the wire: `null` is "ilimitadas", not "the default 3". */
internal suspend fun LiveApi.createPartyImpl(name: String, perGuestLimit: Int?): Party =
    client.decode(Endpoint.post(ApiPath("parties"), JsonObject(mapOf(
        "name" to JsonPrimitive(name),
        "perGuestLimit" to (perGuestLimit?.let(::JsonPrimitive) ?: JsonNull),
    ))), Party.serializer())

internal suspend fun LiveApi.partyImpl(id: String): Party =
    client.decode(Endpoint.get(ApiPath("parties/{}", id)), Party.serializer())

/** Only the fields set; `Change(null)` is an explicit `null` (ilimitadas). */
internal suspend fun LiveApi.updatePartyImpl(id: String, name: String?, perGuestLimit: Change<Int?>?): Party {
    val body = buildMap {
        name?.let { put("name", JsonPrimitive(it)) }
        perGuestLimit?.let { put("perGuestLimit", it.value?.let(::JsonPrimitive) ?: JsonNull) }
    }
    return client.decode(Endpoint.patch(ApiPath("parties/{}", id), JsonObject(body)), Party.serializer())
}

internal suspend fun LiveApi.deletePartyImpl(id: String) = client.send(Endpoint.delete(ApiPath("parties/{}", id)))

internal suspend fun LiveApi.rotatePartyInviteImpl(id: String): Party =
    client.decode(Endpoint.post(ApiPath("parties/{}/invite", id)), Party.serializer())

internal suspend fun LiveApi.revokePartyInviteImpl(id: String): Party =
    client.decode(Endpoint.delete(ApiPath("parties/{}/invite", id)), Party.serializer())

internal suspend fun LiveApi.searchPartySongsImpl(id: String, query: String): List<PartySongHit> =
    client.decode(Endpoint.get(ApiPath("parties/{}/songs", id), listOf("q" to query)), Items(PartySongHit.serializer()))

/** Body `{ paletteHex? }` (`{}` when there's no palette, like iOS). */
internal suspend fun LiveApi.addPartySongImpl(id: String, titleId: String, paletteHex: List<String>?): Party =
    client.decode(Endpoint.put(ApiPath("parties/{}/songs/{}", id, titleId), buildJsonObject {
        paletteHex?.let { put("paletteHex", strings(it)) }
    }), Party.serializer())

internal suspend fun LiveApi.removePartySongImpl(id: String, titleId: String): Party =
    client.decode(Endpoint.delete(ApiPath("parties/{}/songs/{}", id, titleId)), Party.serializer())

internal suspend fun LiveApi.removeAndBlockPartyGuestImpl(id: String, titleId: String): Party =
    client.decode(Endpoint.post(ApiPath("parties/{}/songs/{}/block", id, titleId)), Party.serializer())

internal suspend fun LiveApi.fillPartySongPaletteImpl(id: String, titleId: String, hexes: List<String>) =
    client.send(Endpoint.put(ApiPath("parties/{}/songs/{}/palette", id, titleId), buildJsonObject { put("paletteHex", strings(hexes)) }))

internal suspend fun LiveApi.unblockPartyGuestImpl(id: String, guestRef: String): Party =
    client.decode(Endpoint.delete(ApiPath("parties/{}/blocked/{}", id, guestRef)), Party.serializer())

internal suspend fun LiveApi.leavePartyImpl(id: String) = client.send(Endpoint.post(ApiPath("parties/{}/leave", id)))

/** Public route with an OPTIONAL bearer: signed out it goes bare, signed in it carries the token so
 *  `viewer` comes back filled. `auth = false` also keeps a 401 here from ending the session. */
internal suspend fun LiveApi.invitePreviewImpl(token: String): InvitePreview =
    client.decode(Endpoint.get(ApiPath("invites/{}", token)).copy(auth = false, explicitBearer = client.session.token), InvitePreview.serializer())

internal suspend fun LiveApi.joinPartyImpl(token: String): PartyJoin =
    client.decode(Endpoint.post(ApiPath("invites/{}/join", token)), PartyJoin.serializer())
