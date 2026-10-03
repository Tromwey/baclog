package com.tromwey.kura.data.api

import com.tromwey.kura.data.Session
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.AuthSession
import com.tromwey.kura.data.models.BlockedAccount
import com.tromwey.kura.data.models.CollectionDetail
import com.tromwey.kura.data.models.DeviceSession
import com.tromwey.kura.data.models.DiscoverCreatorsPayload
import com.tromwey.kura.data.models.DiscoverFormatPayload
import com.tromwey.kura.data.models.DiscoverPayload
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FeedPage
import com.tromwey.kura.data.models.Identities
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.LinkOutcome
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.MembershipResult
import com.tromwey.kura.data.models.MergeProof
import com.tromwey.kura.data.models.Obj
import com.tromwey.kura.data.models.PeopleKind
import com.tromwey.kura.data.models.PeoplePage
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.RecapMonth
import com.tromwey.kura.data.models.RecapPayload
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.data.models.ReviewPage
import com.tromwey.kura.data.models.SearchResult
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.TitleDetail
import com.tromwey.kura.data.models.TitleRef
import com.tromwey.kura.data.models.UserTitleState
import com.tromwey.kura.data.models.UsernameStatus
import com.tromwey.kura.data.models.WireSerializer
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** `{ items: [T] }` (or a bare array). A body without `items` is a decoding error, not an empty list. */
internal class Items<T>(private val item: KSerializer<T>) : WireSerializer<List<T>>("Items") {
    override fun read(e: JsonElement): List<T> {
        if (e is JsonArray) return com.tromwey.kura.data.models.lossyList(e, item, strict = true)
        return Obj.of(e).list("items", item, strict = true) ?: Obj.missing("items")
    }
}

internal fun strings(values: List<String>) = JsonArray(values.map(::JsonPrimitive))

/**
 * `KuraApi` over HTTP (API.md §4) — the twin of iOS `LiveAPI`. Every path below is the wire
 * contract this client expects; cross it against `src/app/api/v1/_lib/schemas.ts`.
 */
class LiveApi(
    val client: ApiClient,
    private val device: DeviceInfo = DeviceInfo.current(),
) : KuraApi {
    private val session: Session get() = client.session
    override val lastOfflineTimedOut: Boolean get() = client.lastOfflineTimedOut

    private fun deviceJson(): JsonElement = KuraJson.json.encodeToJsonElement(DeviceInfo.serializer(), device)

    private suspend fun storeSession(e: Endpoint): Me {
        val s = client.decode(e, AuthSession.serializer())
        session.store(s.token)
        return s.user
    }

    // MARK: Session

    override val hasSession: Boolean get() = session.hasToken
    override val needsRefresh: Boolean get() = session.needsRefresh

    override suspend fun requestCode(email: String) {
        client.send(Endpoint.post(ApiPath("auth/otp/request"), buildJsonObject { put("email", email) }, auth = false))
    }

    override suspend fun signIn(email: String, code: String): Me = storeSession(
        Endpoint.post(ApiPath("auth/otp/verify"), buildJsonObject {
            put("email", email); put("code", code); put("device", deviceJson())
        }, auth = false),
    )

    /** The `device` keeps this install's row in Sesiones activas named and versioned. */
    override suspend fun refresh(): Me =
        storeSession(Endpoint.post(ApiPath("auth/refresh"), buildJsonObject { put("device", deviceJson()) }))

    override suspend fun authProviders(): AuthProviders =
        client.decode(Endpoint(Endpoint.Method.GET, ApiPath("auth/providers"), auth = false), AuthProviders.serializer())

    override suspend fun signInWithGoogle(idToken: String): Me = storeSession(
        Endpoint.post(ApiPath("auth/google"), buildJsonObject {
            put("idToken", idToken)
            GoogleNonce.nonce(idToken)?.let { put("nonce", it) }
            put("device", deviceJson())
        }, auth = false),
    )

    override suspend fun logout() {
        // Forget the token FIRST, then tell the server with the token it had. A 401 (already
        // revoked/expired) is not a failure and must not broadcast "session expired"; anything else
        // (offline, 5xx, 429) propagates — the other devices are still signed in. No `DELETE
        // me/devices` first: the server's logout deletes every `device_token` of the account.
        val token = session.token
        session.clear()
        if (token == null) return
        logoutBearer(token)
    }

    /**
     * Called with the bearer being forgotten, AFTER it's gone from disk (iOS `LiveAPI.forgetSession`):
     * push uses it to `DELETE /me/devices/{token}` for that session — after the forget, this install's
     * token can't be removed from the server anymore. Set once by `AppStore.create`.
     */
    var onForgetSession: ((bearer: String) -> Unit)? = null

    override fun forgetSession() {
        val token = session.token
        session.clear()
        if (token != null) onForgetSession?.invoke(token)
    }

    // MARK: Account

    override suspend fun me(): Me = client.decode(Endpoint.get(ApiPath("me")), Me.serializer())

    override suspend fun updateMe(patch: MePatch): Me =
        client.decode(Endpoint.patch(ApiPath("me"), KuraJson.json.encodeToJsonElement(MePatch.serializer(), patch)), Me.serializer())

    private object UsernameCheck : WireSerializer<UsernameStatus>("UsernameCheck") {
        override fun read(e: JsonElement): UsernameStatus {
            val raw = Obj.of(e).requireString("status")
            return UsernameStatus.from(raw) ?: throw SerializationException("status desconocido: $raw")
        }
    }

    override suspend fun checkUsername(username: String): UsernameStatus =
        client.decode(Endpoint.get(ApiPath("me/username/check"), listOf("u" to username)), UsernameCheck)

    override suspend fun claimUsername(username: String): Me =
        client.decode(Endpoint.put(ApiPath("me/username"), buildJsonObject { put("username", username) }), Me.serializer())

    override suspend fun completeOnboarding(name: String, birthDate: String): Me =
        client.decode(Endpoint.post(ApiPath("me/onboarding"), buildJsonObject { put("name", name); put("birthDate", birthDate) }), Me.serializer())

    /** `GET /onboarding/pool?page=1` — the curated pick pool the web uses (`{ items, nextPage }`). */
    override suspend fun onboardingGrid(): List<Title> =
        client.decode(Endpoint.get(ApiPath("onboarding/pool"), listOf("page" to "1")), Items(Title.serializer()))

    private object PicksResponse : WireSerializer<KCollection>("PicksResponse") {
        override fun read(e: JsonElement) = Obj.of(e).require("collection", KCollection.serializer())
    }

    override suspend fun onboardingPicks(refs: List<TitleRef>): KCollection =
        client.decode(Endpoint.post(ApiPath("me/onboarding/picks"), buildJsonObject {
            put("titles", JsonArray(refs.map { it.toJson() }))
        }), PicksResponse)

    override suspend fun onboardingPeople(): List<Person> =
        client.decode(Endpoint.get(ApiPath("me/onboarding/people")), PeoplePage.serializer()).items

    /** Raw body with the image's own `Content-Type` (the server sniffs magic bytes either way). */
    override suspend fun uploadAvatar(data: ByteArray, contentType: String): Me =
        client.decode(Endpoint(Endpoint.Method.PUT, ApiPath("me/avatar"), body = Endpoint.Body.Raw(data, contentType)), Me.serializer())

    override suspend fun deleteAvatar(): Me = client.decode(Endpoint.delete(ApiPath("me/avatar")), Me.serializer())

    override suspend fun deleteAccount() {
        // Only a 204 means "deleted". A 401 is a revoked/expired bearer on a LIVE account: the store
        // handles it itself — no global "session expired" broadcast racing its own message.
        client.send(Endpoint.delete(ApiPath("me")).copy(suppressExpiry = true))
        session.clear()
    }

    // MARK: Devices

    override suspend fun sessions(): List<DeviceSession> =
        client.decode(Endpoint.get(ApiPath("me/sessions")), Items(DeviceSession.serializer()))

    override suspend fun revokeSession(id: String) = client.send(Endpoint.delete(ApiPath("me/sessions/{}", id)))

    override suspend fun revokeOwnSession(sid: String, bearer: String) {
        try {
            client.send(Endpoint.delete(ApiPath("me/sessions/{}", sid)).copy(auth = false, explicitBearer = bearer, suppressExpiry = true))
        } catch (_: KuraApiError.Unauthorized) {
            return // that bearer is already dead: nothing left to revoke
        }
    }

    override suspend fun logoutBearer(bearer: String) {
        try {
            client.send(Endpoint.post(ApiPath("auth/logout")).copy(auth = false, explicitBearer = bearer, suppressExpiry = true))
        } catch (_: KuraApiError.Unauthorized) {
            return
        }
    }

    override suspend fun registerDevice(pushToken: String, environment: String?, provider: String) =
        client.send(Endpoint.put(ApiPath("me/devices/{}", pushToken), buildJsonObject {
            environment?.let { put("environment", it) }
            put("provider", provider)
        }))

    override suspend fun unregisterDevice(pushToken: String, bearer: String?) {
        val e = Endpoint.delete(ApiPath("me/devices/{}", pushToken))
        client.send(if (bearer != null) e.copy(auth = false, explicitBearer = bearer, suppressExpiry = true) else e.copy(suppressExpiry = true))
    }

    // MARK: Identities and merge (fase 4g)

    override suspend fun identities(): Identities = client.decode(Endpoint.get(ApiPath("me/identities")), Identities.serializer())

    private suspend fun link(e: Endpoint): LinkOutcome = try {
        client.send(e)
        LinkOutcome.Linked
    } catch (c: MergeableConflict) {
        LinkOutcome.Mergeable(c.proof)
    }

    override suspend fun linkGoogle(idToken: String): LinkOutcome = link(Endpoint.post(ApiPath("me/identities/google"), buildJsonObject {
        put("idToken", idToken)
        GoogleNonce.nonce(idToken)?.let { put("nonce", it) }
    }))

    override suspend fun unlinkIdentity(provider: IdentityProvider) =
        client.send(Endpoint.delete(ApiPath("me/identities/{}", provider.rawValue)))

    override suspend fun requestMergeCode(email: String) =
        client.send(Endpoint.post(ApiPath("me/merge/otp/request"), buildJsonObject { put("email", email) }))

    override suspend fun verifyMergeCode(email: String, code: String): MergeProof =
        client.decode(Endpoint.post(ApiPath("me/merge/otp/verify"), buildJsonObject { put("email", email); put("code", code) }), MergeProof.serializer())

    private object UserEnvelope : WireSerializer<Me>("UserEnvelope") {
        override fun read(e: JsonElement) = Obj.of(e).require("user", Me.serializer())
    }

    override suspend fun merge(token: String): Me =
        client.decode(Endpoint.post(ApiPath("me/merge"), buildJsonObject { put("mergeToken", token) }), UserEnvelope)

    // MARK: Collections

    override suspend fun collections(): List<KCollection> =
        client.decode(Endpoint.get(ApiPath("collections")), Items(KCollection.serializer()))

    override suspend fun collection(id: String): CollectionDetail =
        client.decode(Endpoint.get(ApiPath("collections/{}", id)), CollectionDetail.serializer())

    override suspend fun createCollection(name: String, privacy: Privacy): KCollection =
        client.decode(Endpoint.post(ApiPath("collections"), buildJsonObject { put("name", name); put("visibility", privacy.wire) }), KCollection.serializer())

    /** `vibe`: absent = untouched, `""` = clear (the server stores it as `null`). */
    override suspend fun updateCollection(id: String, name: String?, vibe: String?, privacy: Privacy?): KCollection =
        client.decode(Endpoint.patch(ApiPath("collections/{}", id), buildJsonObject {
            name?.let { put("name", it) }; vibe?.let { put("vibe", it) }; privacy?.let { put("visibility", it.wire) }
        }), KCollection.serializer())

    override suspend fun deleteCollection(id: String, purge: Boolean) = client.send(
        Endpoint(Endpoint.Method.DELETE, ApiPath("collections/{}", id), query = if (purge) listOf("purge" to "1") else emptyList()),
    )

    override suspend fun setCollectionPinned(id: String, pinned: Boolean): KCollection =
        client.decode(Endpoint.patch(ApiPath("collections/{}", id), buildJsonObject { put("pinned", pinned) }), KCollection.serializer())

    /** `coverTitleId` always goes on the wire: `null` is "back to automatic", not "unchanged". */
    override suspend fun setCollectionCover(id: String, titleId: String?): KCollection =
        client.decode(Endpoint.patch(ApiPath("collections/{}", id), JsonObject(mapOf("coverTitleId" to (titleId?.let(::JsonPrimitive) ?: JsonNull)))),
            KCollection.serializer())

    override suspend fun reorderCollection(id: String, titleIds: List<String>): KCollection =
        client.decode(Endpoint.put(ApiPath("collections/{}/order", id), buildJsonObject { put("titleIds", strings(titleIds)) }), KCollection.serializer())

    override suspend fun createTitleMembership(collectionId: String, ref: TitleRef, paletteHex: List<String>?): MembershipResult {
        val palette = paletteHex?.takeIf { it.isNotEmpty() }
        return when (ref) {
            is TitleRef.Id -> client.decode(
                Endpoint.put(ApiPath("collections/{}/titles/{}", collectionId, ref.id), palette?.let { buildJsonObject { put("paletteHex", strings(it)) } }),
                MembershipResult.serializer(),
            )
            // Uncached catalog item: the path carries the externalId and the body the ref.
            is TitleRef.External -> client.decode(
                Endpoint.put(ApiPath("collections/{}/titles/{}", collectionId, ref.externalId), buildJsonObject {
                    put("externalRef", buildJsonObject { put("source", ref.source); put("externalId", ref.externalId) })
                    palette?.let { put("paletteHex", strings(it)) }
                }),
                MembershipResult.serializer(),
            )
        }
    }

    override suspend fun removeTitleMembership(collectionId: String, titleId: String) =
        client.send(Endpoint.delete(ApiPath("collections/{}/titles/{}", collectionId, titleId)))

    // MARK: Titles

    override suspend fun title(id: String): TitleDetail = client.decode(Endpoint.get(ApiPath("titles/{}", id)), TitleDetail.serializer())

    /** Pages of 10; only public reviews, never the caller's own (that one is pinned in the ficha). */
    override suspend fun moreReviews(titleId: String, cursor: String): ReviewPage =
        client.decode(Endpoint.get(ApiPath("titles/{}/reviews", titleId), listOf("cursor" to cursor)), ReviewPage.serializer())

    override suspend fun fillPalette(titleId: String, hexes: List<String>): Title =
        client.decode(Endpoint.put(ApiPath("titles/{}/palette", titleId), buildJsonObject { put("paletteHex", strings(hexes)) }), Title.serializer())

    /** Chunks of 50, at most 4 in flight; concatenated IN CHUNK ORDER. The first failure fails the
     *  whole call and cancels the rest. */
    override suspend fun titles(ids: List<String>): List<Title> {
        val chunks = ids.chunked(50)
        if (chunks.isEmpty()) return emptyList()
        suspend fun fetch(chunk: List<String>) =
            client.decode(Endpoint.get(ApiPath("titles"), listOf("ids" to chunk.joinToString(","))), Items(Title.serializer()))
        if (chunks.size == 1) return fetch(chunks[0])
        val gate = Semaphore(4)
        return coroutineScope { chunks.map { c -> async { gate.withPermit { fetch(c) } } }.awaitAll() }.flatten()
    }

    private object MyTitles : WireSerializer<Map<String, UserTitleState>>("MyTitles") {
        override fun read(e: JsonElement): Map<String, UserTitleState> {
            val out = LinkedHashMap<String, UserTitleState>()
            val rows = if (e is JsonArray) e.toList() else Obj.of(e).array("items") ?: Obj.missing("items")
            for (r in rows) {
                val o = Obj.of(r)
                val id = o.requireString("titleId")
                if (!out.containsKey(id)) out[id] = o.require("state", UserTitleState.serializer())
            }
            return out
        }
    }

    override suspend fun myTitles(): Map<String, UserTitleState> = client.decode(Endpoint.get(ApiPath("me/titles")), MyTitles)

    override suspend fun setMark(titleId: String, mark: Mark?, preview: Boolean): UserTitleState =
        client.decode(Endpoint.put(ApiPath("me/titles/{}/mark", titleId), buildJsonObject {
            put("mark", mark?.rawValue?.let(::JsonPrimitive) ?: JsonNull) // null when none
            if (preview) put("preview", true)
        }), UserTitleState.serializer())

    override suspend fun saveReview(titleId: String, body: String, hasSpoiler: Boolean): Review =
        client.decode(Endpoint.put(ApiPath("me/titles/{}/review", titleId), buildJsonObject {
            put("body", body); put("hasSpoiler", hasSpoiler)
        }), Review.serializer())

    override suspend fun deleteReview(titleId: String) = client.send(Endpoint.delete(ApiPath("me/titles/{}/review", titleId)))

    override suspend fun removeFromLibrary(titleId: String) = client.send(Endpoint.delete(ApiPath("me/titles/{}", titleId)))

    // MARK: Discover

    override suspend fun search(query: String, kind: MediaFormat?): List<SearchResult> =
        client.decode(Endpoint.get(ApiPath("search"), listOf("q" to query, "kind" to (kind?.rawValue ?: "all"))), Items(SearchResult.serializer()))

    override suspend fun discover(): DiscoverPayload = client.decode(Endpoint.get(ApiPath("discover")), DiscoverPayload.serializer())

    override suspend fun discoverCreators(): DiscoverCreatorsPayload =
        client.decode(Endpoint.get(ApiPath("discover/creators")), DiscoverCreatorsPayload.serializer())

    override suspend fun discoverFormat(format: MediaFormat, time: Int?): DiscoverFormatPayload =
        client.decode(Endpoint.get(ApiPath("discover/formats/{}", format.rawValue), time?.let { listOf("time" to it.toString()) } ?: emptyList()),
            DiscoverFormatPayload.serializer())

    // MARK: People and feed

    override suspend fun person(handle: String): Person = client.decode(Endpoint.get(ApiPath("people/{}", handle)), Person.serializer())

    override suspend fun personCollection(handle: String, id: String): CollectionDetail =
        client.decode(Endpoint.get(ApiPath("people/{}/collections/{}", handle, id)), CollectionDetail.serializer())

    override suspend fun people(kind: PeopleKind, cursor: String?): PeoplePage {
        val q = cursor?.let { listOf("cursor" to it) } ?: emptyList()
        val e = when (kind) {
            PeopleKind.Following -> Endpoint.get(ApiPath("me/following"), q)
            PeopleKind.Followers -> Endpoint.get(ApiPath("me/followers"), q)
            PeopleKind.Suggestions -> Endpoint.get(ApiPath("people/suggestions"), q)
            is PeopleKind.Search -> Endpoint.get(ApiPath("people/search"), q + ("q" to kind.query))
            // 404 = private / nonexistent / a block; 403 `lists_private` = their setting keeps you out.
            is PeopleKind.FollowersOf -> Endpoint.get(ApiPath("people/{}/followers", kind.handle), q)
            is PeopleKind.FollowingOf -> Endpoint.get(ApiPath("people/{}/following", kind.handle), q)
        }
        return client.decode(e, PeoplePage.serializer())
    }

    override suspend fun setFollowing(handle: String, following: Boolean) {
        val path = ApiPath("me/following/{}", handle)
        client.send(if (following) Endpoint.put(path) else Endpoint.delete(path))
    }

    override suspend fun feed(cursor: String?): FeedPage =
        client.decode(Endpoint.get(ApiPath("feed"), cursor?.let { listOf("cursor" to it) } ?: emptyList()), FeedPage.serializer())

    /** `{ event: FeedEvent | null }` — any other shape (no `event` key) is a decoding error. */
    private object SuggestionEnvelope : WireSerializer<FeedEvent?>("SuggestionEnvelope") {
        override fun read(e: JsonElement): FeedEvent? {
            val c = Obj.of(e)
            if (!c.has("event")) throw SerializationException("feed/suggestion sin `event`")
            return c.decode("event", FeedEvent.serializer())
        }
    }

    override suspend fun feedSuggestion(): FeedEvent? = client.decode(Endpoint.get(ApiPath("feed/suggestion")), SuggestionEnvelope)

    // MARK: Safety

    override suspend fun reportPerson(handle: String, reason: String, details: String?) =
        client.send(Endpoint.post(ApiPath("people/{}/report", handle), buildJsonObject {
            put("reason", reason); details?.let { put("details", it) } // null → key omitted
        }))

    override suspend fun reportReview(id: String, reason: String) =
        client.send(Endpoint.post(ApiPath("reviews/{}/report", id), buildJsonObject { put("reason", reason) }))

    override suspend fun block(handle: String) = client.send(Endpoint.put(ApiPath("me/blocks/{}", handle)))

    override suspend fun unblock(handleOrId: String) = client.send(Endpoint.delete(ApiPath("me/blocks/{}", handleOrId)))

    override suspend fun blocks(): List<BlockedAccount> = client.decode(Endpoint.get(ApiPath("me/blocks")), Items(BlockedAccount.serializer()))

    // MARK: Recap

    override suspend fun recapMonths(): List<RecapMonth> = client.decode(Endpoint.get(ApiPath("recap/months")), Items(RecapMonth.serializer()))

    override suspend fun recap(era: String): RecapPayload {
        // The payload may carry `era`; when it doesn't, the path does.
        val r = client.decode(Endpoint.get(ApiPath("recap/{}", era)), RecapPayload.serializer())
        return if (r.era.isEmpty()) r.adopting(era, null) else r
    }

    // Parties → LiveApiParties.kt · Music export → LiveApiMusicExport.kt

    override suspend fun parties() = partiesImpl()
    override suspend fun createParty(name: String, perGuestLimit: Int?) = createPartyImpl(name, perGuestLimit)
    override suspend fun party(id: String) = partyImpl(id)
    override suspend fun updateParty(id: String, name: String?, perGuestLimit: Change<Int?>?) = updatePartyImpl(id, name, perGuestLimit)
    override suspend fun deleteParty(id: String) = deletePartyImpl(id)
    override suspend fun rotatePartyInvite(id: String) = rotatePartyInviteImpl(id)
    override suspend fun revokePartyInvite(id: String) = revokePartyInviteImpl(id)
    override suspend fun searchPartySongs(id: String, query: String) = searchPartySongsImpl(id, query)
    override suspend fun addPartySong(id: String, titleId: String, paletteHex: List<String>?) = addPartySongImpl(id, titleId, paletteHex)
    override suspend fun removePartySong(id: String, titleId: String) = removePartySongImpl(id, titleId)
    override suspend fun removeAndBlockPartyGuest(id: String, titleId: String) = removeAndBlockPartyGuestImpl(id, titleId)
    override suspend fun fillPartySongPalette(id: String, titleId: String, hexes: List<String>) = fillPartySongPaletteImpl(id, titleId, hexes)
    override suspend fun unblockPartyGuest(id: String, guestRef: String) = unblockPartyGuestImpl(id, guestRef)
    override suspend fun leaveParty(id: String) = leavePartyImpl(id)
    override suspend fun invitePreview(token: String) = invitePreviewImpl(token)
    override suspend fun joinParty(token: String) = joinPartyImpl(token)

    override suspend fun musicServices() = musicServicesImpl()
    override suspend fun startTidalAuth() = startTidalAuthImpl()
    override suspend fun completeTidalAuth(ref: String, claim: String) = completeTidalAuthImpl(ref, claim)
    override suspend fun disconnectTidal() = disconnectTidalImpl()
    override suspend fun partyExport(id: String, provider: com.tromwey.kura.data.models.MusicProvider) = partyExportImpl(id, provider)
    override suspend fun startPartyExport(id: String, provider: com.tromwey.kura.data.models.MusicProvider) = startPartyExportImpl(id, provider)
    override suspend fun stepTidalExport(id: String) = stepTidalExportImpl(id)
}

