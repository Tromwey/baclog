package com.tromwey.kura.state

import com.tromwey.kura.data.Fixtures
import com.tromwey.kura.data.api.Change
import com.tromwey.kura.data.api.Items
import com.tromwey.kura.data.api.KuraApi
import com.tromwey.kura.data.api.MePatch
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.BlockedAccount
import com.tromwey.kura.data.models.CollectionDetail
import com.tromwey.kura.data.models.DeviceSession
import com.tromwey.kura.data.models.DiscoverCreatorsPayload
import com.tromwey.kura.data.models.DiscoverFormatPayload
import com.tromwey.kura.data.models.DiscoverPayload
import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.ExternalRef
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FeedPage
import com.tromwey.kura.data.models.Identities
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.InvitePreview
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.LinkOutcome
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.MembershipResult
import com.tromwey.kura.data.models.MergeProof
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.MusicServices
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyCard
import com.tromwey.kura.data.models.PartyJoin
import com.tromwey.kura.data.models.PartySongHit
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
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.yield
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant

/**
 * `KuraApi` for the store's JVM tests, fed with the REAL server responses in
 * `src/test/resources/fixtures` (the same ones `FixtureDecodingTest` decodes). Every call:
 * 1. suspends once (`yield`), so writes interleave through the dispatcher like the network would;
 * 2. is logged in `calls` as `"name arg arg…"` (order assertions);
 * 3. waits on `holds[name]` when a test parked it there (to race writes);
 * 4. throws the next failure queued with `failNext(name, error)`.
 */
class FakeKuraApi : KuraApi {
    override var hasSession: Boolean = true
    override var needsRefresh: Boolean = false
    override var lastOfflineTimedOut: Boolean = false

    val calls = mutableListOf<String>()
    private val failures = HashMap<String, ArrayDeque<Throwable>>()
    val holds = HashMap<String, CompletableDeferred<Unit>>()

    fun failNext(name: String, error: Throwable, times: Int = 1) {
        val q = failures.getOrPut(name) { ArrayDeque() }
        repeat(times) { q.addLast(error) }
    }

    fun hold(name: String): CompletableDeferred<Unit> = CompletableDeferred<Unit>().also { holds[name] = it }

    fun callsOf(name: String) = calls.filter { it == name || it.startsWith("$name ") }

    private suspend fun <T> call(name: String, vararg args: Any?, body: () -> T): T {
        yield()
        calls += (listOf(name) + args.map { it.toString() }).joinToString(" ")
        holds.remove(name)?.await()
        failures[name]?.removeFirstOrNull()?.let { throw it }
        return body()
    }

    // MARK: Data (the fixtures, mutable per test)

    var me: Me = decode("me", Me.serializer())
    /** What `signIn` / `refresh` answer (a fresh account: `me.copy(handle = null, onboarded = false)`). */
    var signInMe: Me? = null
    var collections: List<KCollection> = decode("collections", Items(KCollection.serializer()))
    var myTitles: Map<String, UserTitleState> = decode("me_titles", Items(MyTitlesRow)).toMap()
    var following: List<Person> = decode("me_following", PeoplePage.serializer()).items
    /** `GET /me/followers` override (e.g. with a `privateCount`). */
    var followersPage: PeoplePage? = null
    /** Every title the fake can hand back by id; unknown ids are synthesized when `synthesize`. */
    val catalog = HashMap<String, Title>()
    var synthesize = true
    /** What `GET /titles/{id}` answers as its reviews block. */
    val titleReviews = HashMap<String, List<Review>>()
    /** Counts `discoverFormat` answers (a forced reload must ask again). */
    var discoverFormatAnswers = 0
    /** The shelf's provider is down: `titles` empty + `titlesUnavailable`, the Kuradas still come. */
    var discoverFormatUnavailable = false
    private var serverIds = 0

    init {
        val seeds = decode("titles_ids", Items(Title.serializer())) +
            decode("collection_detail", CollectionDetail.serializer()).titles +
            decode("title_detail", TitleDetail.serializer()).title
        for (t in seeds) catalog[t.id] = t
    }

    fun stubTitle(id: String) = Title(id = id, name = "título $id", format = MediaFormat.Film, creator = null, palette = emptyList())

    private object MyTitlesRow : WireSerializer<Pair<String, UserTitleState>>("MyTitlesRow") {
        override fun read(e: JsonElement): Pair<String, UserTitleState> {
            val o = e.jsonObject
            return o["titleId"]!!.jsonPrimitive.content to KuraJson.json.decodeFromJsonElement(UserTitleState.serializer(), o["state"]!!)
        }
    }

    companion object {
        fun <T> decode(name: String, s: DeserializationStrategy<T>): T = KuraJson.json.decodeFromString(s, Fixtures.text(name))
    }

    // MARK: Session

    override suspend fun requestCode(email: String) = call("requestCode", email) {}
    override suspend fun signIn(email: String, code: String): Me = call("signIn", email, code) {
        hasSession = true
        signInMe ?: me
    }
    override suspend fun refresh(): Me = call("refresh") { signInMe ?: me }
    override suspend fun logout() = call("logout") { hasSession = false }
    override fun forgetSession() {
        calls += "forgetSession"
        hasSession = false
    }
    override suspend fun authProviders(): AuthProviders = call("authProviders") { decode("auth_providers", AuthProviders.serializer()) }
    override suspend fun signInWithGoogle(idToken: String): Me = call("signInWithGoogle") { signInMe ?: me }

    // MARK: Devices / identities (fase 2 in the store)

    override suspend fun sessions(): List<DeviceSession> = call("sessions") { decode("me_sessions", Items(DeviceSession.serializer())) }
    override suspend fun revokeSession(id: String) = call("revokeSession", id) {}
    override suspend fun registerDevice(pushToken: String, environment: String?, provider: String) = call("registerDevice", pushToken, provider) {}
    override suspend fun unregisterDevice(pushToken: String, bearer: String?) = call("unregisterDevice", pushToken, bearer) {}
    override suspend fun identities(): Identities = call("identities") { decode("me_identities", Identities.serializer()) }
    override suspend fun linkGoogle(idToken: String): LinkOutcome = unused()
    override suspend fun unlinkIdentity(provider: IdentityProvider): Unit = unused()
    override suspend fun requestMergeCode(email: String): Unit = unused()
    override suspend fun verifyMergeCode(email: String, code: String): MergeProof = unused()
    override suspend fun merge(token: String): Me = unused()

    // MARK: Account

    override suspend fun me(): Me = call("me") { me }
    override suspend fun updateMe(patch: MePatch): Me = call("updateMe", patch) {
        me = me.copy(
            name = patch.name ?: me.name,
            isPublic = patch.isPublic ?: me.isPublic,
            notifyReleases = patch.notifyReleases ?: me.notifyReleases,
        )
        me
    }
    override suspend fun checkUsername(username: String): UsernameStatus = call("checkUsername", username) { UsernameStatus.Free }
    override suspend fun claimUsername(username: String): Me = call("claimUsername", username) {
        me = (signInMe ?: me).copy(handle = username)
        signInMe = signInMe?.copy(handle = username)
        me
    }
    override suspend fun completeOnboarding(name: String, birthDate: String): Me = call("completeOnboarding", name, birthDate) {
        me = me.copy(name = name, onboarded = true)
        me
    }
    override suspend fun onboardingGrid(): List<Title> = call("onboardingGrid") { decode("onboarding_pool", Items(Title.serializer())) }
    override suspend fun onboardingPicks(refs: List<TitleRef>): KCollection = call("onboardingPicks") {
        val ids = refs.map { (it as TitleRef.Id).id }
        KCollection(id = "picks", name = "me obsesiona", titleIds = ids, privacy = Privacy.PublicAccess, createdAt = Instant.EPOCH)
    }
    override suspend fun onboardingPeople(): List<Person> = call("onboardingPeople") {
        decode("me_onboarding_people", PeoplePage.serializer()).items
    }
    override suspend fun uploadAvatar(data: ByteArray, contentType: String): Me = call("uploadAvatar", data.size) {
        me = me.copy(avatarUrl = "https://example.test/api/avatar/nuevo")
        me
    }
    override suspend fun deleteAvatar(): Me = call("deleteAvatar") { me.copy(avatarUrl = null).also { me = it } }
    override suspend fun deleteAccount() = call("deleteAccount") {}

    // MARK: Collections

    override suspend fun collections(): List<KCollection> = call("collections") { collections }
    override suspend fun collection(id: String): CollectionDetail = call("collection", id) {
        val c = collections.firstOrNull { it.id == id } ?: throw com.tromwey.kura.data.api.KuraApiError.NotFound
        CollectionDetail(c, c.titleIds.map { catalog[it] ?: stubTitle(it) }, myTitles.filterKeys { it in c.titleIds })
    }
    override suspend fun createCollection(name: String, privacy: Privacy): KCollection = call("createCollection", name, privacy) {
        serverIds += 1
        KCollection(id = "srv-$serverIds", name = name, titleIds = emptyList(), privacy = privacy, createdAt = Instant.EPOCH)
    }
    override suspend fun updateCollection(id: String, name: String?, vibe: String?, privacy: Privacy?): KCollection =
        call("updateCollection", id, name, vibe, privacy) { collections.first { it.id == id } }
    override suspend fun deleteCollection(id: String, purge: Boolean) =
        if (purge) call("deleteCollection", id, "purge") {} else call("deleteCollection", id) {}
    override suspend fun setCollectionPinned(id: String, pinned: Boolean): KCollection =
        call("setCollectionPinned", id, pinned) { collections.first { it.id == id } }
    override suspend fun setCollectionCover(id: String, titleId: String?): KCollection =
        call("setCollectionCover", id, titleId) { collections.first { it.id == id } }
    override suspend fun reorderCollection(id: String, titleIds: List<String>): KCollection =
        call("reorderCollection", id, titleIds.joinToString(",")) { collections.first { it.id == id } }
    override suspend fun createTitleMembership(collectionId: String, ref: TitleRef, paletteHex: List<String>?): MembershipResult {
        val id = when (ref) {
            is TitleRef.Id -> ref.id
            is TitleRef.External -> ExternalRef(ref.source, ref.externalId).localId
        }
        return call("createTitleMembership", id, collectionId) {
            MembershipResult(catalog[id] ?: stubTitle(id), myTitles[id] ?: UserTitleState(savedAt = Instant.EPOCH))
        }
    }
    override suspend fun removeTitleMembership(collectionId: String, titleId: String) =
        call("removeTitleMembership", titleId, collectionId) {}

    // MARK: Titles

    override suspend fun title(id: String): TitleDetail = call("title", id) {
        val t = catalog[id] ?: throw com.tromwey.kura.data.api.KuraApiError.NotFound
        TitleDetail(t, myTitles[id], emptyList(), titleReviews[id] ?: emptyList(), null, emptyList())
    }
    override suspend fun moreReviews(titleId: String, cursor: String): ReviewPage = call("moreReviews", titleId) { ReviewPage(emptyList()) }
    override suspend fun titles(ids: List<String>): List<Title> = call("titles", ids.size) {
        ids.mapNotNull { catalog[it] ?: if (synthesize) stubTitle(it) else null }
    }
    override suspend fun fillPalette(titleId: String, hexes: List<String>): Title =
        call("fillPalette", titleId) { (catalog[titleId] ?: stubTitle(titleId)).copy(palette = hexes) }
    override suspend fun myTitles(): Map<String, UserTitleState> = call("myTitles") { myTitles }
    override suspend fun setMark(titleId: String, mark: Mark?, preview: Boolean): UserTitleState =
        call("setMark", titleId, mark?.rawValue, preview) { UserTitleState(mark = mark, savedAt = Instant.parse("2026-09-29T00:00:00Z")) }
    override suspend fun saveReview(titleId: String, body: String, hasSpoiler: Boolean): Review = call("saveReview", titleId, body) {
        Review(id = "srv-review", authorId = me.handle ?: "", titleId = titleId, text = body, mark = null, spoiler = hasSpoiler,
            date = Instant.parse("2026-09-29T00:00:00Z"))
    }
    override suspend fun deleteReview(titleId: String) = call("deleteReview", titleId) {}
    override suspend fun removeFromLibrary(titleId: String) = call("removeFromLibrary", titleId) {}

    // MARK: Discover

    override suspend fun search(query: String, kind: MediaFormat?): List<SearchResult> =
        call("search", query) { decode("search", Items(SearchResult.serializer())) }
    override suspend fun discover(): DiscoverPayload = call("discover") { decode("discover", DiscoverPayload.serializer()) }
    override suspend fun discoverCreators(): DiscoverCreatorsPayload =
        call("discoverCreators") { decode("discover_creators", DiscoverCreatorsPayload.serializer()) }
    override suspend fun discoverFormat(format: MediaFormat, time: Int?): DiscoverFormatPayload =
        call("discoverFormat", format.rawValue) {
            discoverFormatAnswers += 1
            decode("discover_formats_film", DiscoverFormatPayload.serializer()).let {
                val kuradas = listOf(DiscoverFormatPayload.Kurada("k1", "kurada", "kura", "kura", 0, emptyList(), emptyList()))
                if (discoverFormatUnavailable) it.copy(titles = emptyList(), kuradas = kuradas, titlesUnavailable = true) else it
            }
        }

    // MARK: People and feed

    override suspend fun person(handle: String): Person = call("person", handle) {
        decode("person", Person.serializer()).copy(handle = handle, isFollowing = following.any { it.handle == handle })
    }
    override suspend fun personCollection(handle: String, id: String): CollectionDetail =
        call("personCollection", handle, id) { decode("person_collection", CollectionDetail.serializer()) }
    override suspend fun people(kind: PeopleKind, cursor: String?): PeoplePage = call("people", kind, cursor) {
        when (kind) {
            PeopleKind.Following -> PeoplePage(following)
            PeopleKind.Followers -> followersPage ?: decode("me_followers", PeoplePage.serializer())
            else -> PeoplePage(emptyList())
        }
    }
    override suspend fun setFollowing(handle: String, following: Boolean) = call("setFollowing", handle, following) {}
    override suspend fun feed(cursor: String?): FeedPage =
        call("feed", cursor) { decode(if (cursor == null) "feed" else "feed_page2", FeedPage.serializer()) }
    override suspend fun feedSuggestion(): FeedEvent? = call("feedSuggestion") { null }

    // MARK: Safety

    override suspend fun reportPerson(handle: String, reason: String, details: String?) = call("reportPerson", handle, reason) {}
    override suspend fun reportReview(id: String, reason: String) = call("reportReview", id, reason) {}
    override suspend fun block(handle: String) = call("block", handle) {}
    override suspend fun unblock(handleOrId: String) = call("unblock", handleOrId) {}
    override suspend fun blocks(): List<BlockedAccount> = call("blocks") { decode("me_blocks", Items(BlockedAccount.serializer())) }

    // MARK: Recap

    override suspend fun recapMonths(): List<RecapMonth> = call("recapMonths") { decode("recap_months", Items(RecapMonth.serializer())) }
    override suspend fun recap(era: String): RecapPayload = call("recap", era) { decode("recap_era", RecapPayload.serializer()) }

    // MARK: Parties / music export — `+Parties` and `+MusicExport` are fase 2 in the store.

    override suspend fun parties(): List<PartyCard> = unused()
    override suspend fun createParty(name: String, perGuestLimit: Int?): Party = unused()
    override suspend fun party(id: String): Party = unused()
    override suspend fun updateParty(id: String, name: String?, perGuestLimit: Change<Int?>?): Party = unused()
    override suspend fun deleteParty(id: String): Unit = unused()
    override suspend fun rotatePartyInvite(id: String): Party = unused()
    override suspend fun revokePartyInvite(id: String): Party = unused()
    override suspend fun searchPartySongs(id: String, query: String): List<PartySongHit> = unused()
    override suspend fun addPartySong(id: String, titleId: String, paletteHex: List<String>?): Party = unused()
    override suspend fun removePartySong(id: String, titleId: String): Party = unused()
    override suspend fun removeAndBlockPartyGuest(id: String, titleId: String): Party = unused()
    override suspend fun fillPartySongPalette(id: String, titleId: String, hexes: List<String>): Unit = unused()
    override suspend fun unblockPartyGuest(id: String, guestRef: String): Party = unused()
    override suspend fun leaveParty(id: String): Unit = unused()
    override suspend fun invitePreview(token: String): InvitePreview = unused()
    override suspend fun joinParty(token: String): PartyJoin = unused()
    override suspend fun musicServices(): MusicServices = unused()
    override suspend fun startTidalAuth(): String = unused()
    override suspend fun completeTidalAuth(ref: String, claim: String): MusicServices = unused()
    override suspend fun disconnectTidal(): Unit = unused()
    override suspend fun partyExport(id: String, provider: MusicProvider): ExportState = unused()
    override suspend fun startPartyExport(id: String, provider: MusicProvider): ExportState = unused()
    override suspend fun stepTidalExport(id: String): ExportState = unused()

    private fun unused(): Nothing = throw UnsupportedOperationException("no lo usa el store en fase 1")
}
