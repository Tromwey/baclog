package com.tromwey.kura.state

import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.Change
import com.tromwey.kura.data.api.Items
import com.tromwey.kura.data.api.KuraApi
import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.InvitePreview
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.MusicServices
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyBlockedGuest
import com.tromwey.kura.data.models.PartyCard
import com.tromwey.kura.data.models.PartyInvite
import com.tromwey.kura.data.models.PartyJoin
import com.tromwey.kura.data.models.PartyRole
import com.tromwey.kura.data.models.PartySong
import com.tromwey.kura.data.models.PartySongHit
import com.tromwey.kura.data.models.PartyViewer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield

/**
 * The party + music-export side of `KuraApi` for the store tests (`+Parties`, `+MusicExport`), over
 * the fixtures (`party`, `parties`, `invite_preview`, `party_export_tidal`). Everything else is
 * [FakeKuraApi] (delegated), so the library bootstrap works as in every other store test.
 */
class PartyFakeApi(val base: FakeKuraApi = FakeKuraApi()) : KuraApi by base {
    val calls = mutableListOf<String>()
    private val failures = HashMap<String, ArrayDeque<Throwable>>()

    fun failNext(name: String, error: Throwable, times: Int = 1) {
        val q = failures.getOrPut(name) { ArrayDeque() }
        repeat(times) { q.addLast(error) }
    }

    fun callsOf(name: String) = calls.filter { it == name || it.startsWith("$name ") }

    private suspend fun <T> call(name: String, vararg args: Any?, body: () -> T): T {
        yield()
        calls += (listOf(name) + args.map { it.toString() }).joinToString(" ")
        failures[name]?.removeFirstOrNull()?.let { throw it }
        return body()
    }

    // MARK: Data

    /** The host's view of the fixture party ("Halloween", 2 songs, cap 3). */
    var party: Party = FakeKuraApi.decode("party", Party.serializer())
    var cards: List<PartyCard> = FakeKuraApi.decode("parties", Items(PartyCard.serializer()))
    var preview: InvitePreview = FakeKuraApi.decode("invite_preview", InvitePreview.serializer())
    var joined: PartyJoin.Joined = PartyJoin.Joined.New
    var services = MusicServices(MusicServices.Service(false), MusicServices.Service(available = true, connected = true))
    /** What `startPartyExport` answers, then each `stepTidalExport` in order (the last one repeats). */
    var exportStart: ExportState = export(ExportState.Status.InProgress, processed = 0)
    val exportSteps = ArrayDeque<ExportState>()
    var authUrl = "https://login.tidal.com/authorize?client_id=x"

    fun export(status: ExportState.Status, processed: Int, total: Int = 2, busy: Boolean = false) = ExportState(
        provider = MusicProvider.Tidal, playlistName = party.name, status = status, total = total,
        exported = processed, processed = processed, busy = busy,
    )

    /** The fixture party as a guest sees it: [mine] of the songs are theirs, [remaining] left. */
    fun guestView(remaining: Int?, mine: Int = 0, blocked: Boolean = false, limit: Int? = party.perGuestLimit): Party = party.copy(
        perGuestLimit = limit,
        viewer = PartyViewer(PartyRole.Guest, blocked = blocked, mineCount = mine, remaining = remaining, canAdd = !blocked && remaining != 0),
        songs = party.songs.mapIndexed { i, s -> s.copy(mine = i < mine, byHost = i >= mine, canRemove = i < mine, canBlockAuthor = false) },
        invite = null,
        blockedGuests = emptyList(),
    )

    fun hit(id: String = "11111111-1111-4111-8111-111111111111", title: String = "Oye mi amor") =
        PartySongHit(titleId = id, title = title, artist = "Maná", album = null)

    // MARK: Parties

    override suspend fun parties(): List<PartyCard> = call("parties") { cards }
    override suspend fun createParty(name: String, perGuestLimit: Int?): Party = call("createParty", name, perGuestLimit) {
        party = party.copy(id = "22222222-2222-4222-8222-222222222222", name = name, perGuestLimit = perGuestLimit, songs = emptyList(), contributors = emptyList())
        party
    }
    override suspend fun party(id: String): Party = call("party", id) { party }
    override suspend fun updateParty(id: String, name: String?, perGuestLimit: Change<Int?>?): Party = call("updateParty", id, name, perGuestLimit?.value) {
        party = party.copy(name = name ?: party.name, perGuestLimit = if (perGuestLimit != null) perGuestLimit.value else party.perGuestLimit)
        party
    }
    override suspend fun deleteParty(id: String) = call("deleteParty", id) {}
    override suspend fun rotatePartyInvite(id: String): Party = call("rotatePartyInvite", id) {
        party = party.copy(invite = PartyInvite(true, "BbBbBbBbBbBbBbBb", "https://get-kura.app/f/BbBbBbBbBbBbBbBb", null))
        party
    }
    override suspend fun revokePartyInvite(id: String): Party = call("revokePartyInvite", id) {
        party = party.copy(invite = party.invite?.copy(active = false))
        party
    }
    override suspend fun searchPartySongs(id: String, query: String): List<PartySongHit> = call("searchPartySongs", id, query) { listOf(hit()) }
    override suspend fun addPartySong(id: String, titleId: String, paletteHex: List<String>?): Party = call("addPartySong", id, titleId) {
        val song = PartySong(titleId = titleId, title = "Oye mi amor", artist = "Maná", addedBy = null, mine = true, canRemove = true)
        val v = party.viewer
        party = party.copy(
            songs = party.songs + song,
            viewer = v.copy(mineCount = v.mineCount + 1, remaining = v.remaining?.let { maxOf(0, it - 1) }),
        )
        party
    }
    override suspend fun removePartySong(id: String, titleId: String): Party = call("removePartySong", id, titleId) {
        party = party.copy(songs = party.songs.filterNot { it.titleId == titleId })
        party
    }
    override suspend fun removeAndBlockPartyGuest(id: String, titleId: String): Party = call("removeAndBlockPartyGuest", id, titleId) {
        val s = party.songs.first { it.titleId == titleId }
        party = party.copy(
            songs = party.songs.filterNot { it.titleId == titleId },
            blockedGuests = party.blockedGuests + PartyBlockedGuest("ref-${s.addedBy?.handle}", s.addedBy, null),
        )
        party
    }
    override suspend fun fillPartySongPalette(id: String, titleId: String, hexes: List<String>) = call("fillPartySongPalette", id, titleId) {}
    override suspend fun unblockPartyGuest(id: String, guestRef: String): Party = call("unblockPartyGuest", id, guestRef) {
        party = party.copy(blockedGuests = party.blockedGuests.filterNot { it.guestRef == guestRef })
        party
    }
    override suspend fun leaveParty(id: String) = call("leaveParty", id) {}
    override suspend fun invitePreview(token: String): InvitePreview = call("invitePreview", token) { preview }
    override suspend fun joinParty(token: String): PartyJoin = call("joinParty", token) { PartyJoin(party, joined) }

    // MARK: Music export

    override suspend fun musicServices(): MusicServices = call("musicServices") { services }
    override suspend fun startTidalAuth(): String = call("startTidalAuth") { authUrl }
    override suspend fun completeTidalAuth(ref: String, claim: String): MusicServices = call("completeTidalAuth", ref, claim) {
        services = services.copy(tidal = services.tidal.copy(connected = true))
        services
    }
    override suspend fun disconnectTidal() = call("disconnectTidal") {}
    override suspend fun partyExport(id: String, provider: MusicProvider): ExportState = call("partyExport", id, provider.rawValue) { exportStart }
    override suspend fun startPartyExport(id: String, provider: MusicProvider): ExportState = call("startPartyExport", id, provider.rawValue) { exportStart }
    override suspend fun stepTidalExport(id: String): ExportState = call("stepTidalExport", id) {
        if (exportSteps.size > 1) exportSteps.removeFirst() else exportSteps.firstOrNull() ?: export(ExportState.Status.Done, 2)
    }
}

class PartyHarness(val api: PartyFakeApi, val store: AppStore, val platform: InMemoryStorePlatform)

/** `storeTest` over a [PartyFakeApi] (the shared harness takes a `FakeKuraApi`). */
fun partyTest(
    api: PartyFakeApi = PartyFakeApi(),
    platform: InMemoryStorePlatform = InMemoryStorePlatform(),
    body: suspend TestScope.(PartyHarness) -> Unit,
) = runTest {
    val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
    val store = AppStore(
        api = api,
        session = Session(InMemoryTokenStore("token")),
        prefs = LocalPrefs.disabled,
        clock = { FIXED_NOW },
        scope = scope,
        platform = platform,
        expiries = MutableSharedFlow(),
    )
    try {
        body(PartyHarness(api, store, platform))
    } finally {
        scope.cancel()
    }
}

/** Signed in with the fixtures' account, the tabs up and the library loaded. */
suspend fun TestScope.signedIn(h: PartyHarness) {
    h.store.enterMain()
    h.store.startIfNeeded()
    testScheduler.runCurrent()
}
