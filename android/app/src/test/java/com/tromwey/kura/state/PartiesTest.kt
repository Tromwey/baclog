package com.tromwey.kura.state

import com.tromwey.kura.data.api.Change
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.MusicExportCopy
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.MusicServices
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.PartyCopy
import com.tromwey.kura.data.models.PartyExportFlow
import com.tromwey.kura.data.models.PartyJoin
import com.tromwey.kura.data.models.Route
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
/** `+Parties` / `+MusicExport` over [PartyFakeApi]: create, join by link, cap, block, 503/404 and the export in steps. */
class PartiesTest {
    private val token = "AbCdEfGhIjKlMnOp"
    private val ref = "i" + "a".repeat(43)
    private val claim = "Zz_-" + "9".repeat(40)

    // MARK: Create

    @Test
    fun createPartyOpensItWithTheShareSheet() = partyTest { h ->
        signedIn(h)
        val ok = h.store.createParty("  la fiesta de qa  ", 3)
        assertTrue(ok)
        val p = h.api.party
        assertEquals("la fiesta de qa", p.name)
        assertEquals(p, h.store.party(p.id))
        assertEquals(p.id, h.store.partyCards.first().id)
        assertEquals(Route.PartyRoute(p.id), h.store.path(h.store.tab).last())
        assertEquals(SheetRoute.PartyShare(p.id), h.store.sheet)
    }

    @Test
    fun createPartyOverTheLimitSaysWhy() = partyTest { h ->
        signedIn(h)
        h.api.failNext("createParty", KuraApiError.Conflict("too_many_parties", ""))
        assertFalse(h.store.createParty("otra", 3))
        assertEquals(PartyCopy.TOO_MANY_PARTIES, h.store.toast?.text)
        assertTrue(h.store.path(h.store.tab).isEmpty())
    }

    @Test
    fun editChangesNameAndLimitToUnlimited() = partyTest { h ->
        signedIn(h)
        h.store.loadParty(h.api.party.id)
        assertTrue(h.store.updateParty(h.api.party.id, "nuevo", Change(null)))
        assertEquals("updateParty ${h.api.party.id} nuevo null", h.api.callsOf("updateParty").single())
        assertNull(h.store.party(h.api.party.id)!!.perGuestLimit)
        assertEquals("nuevo", h.store.partyCards.first { it.id == h.api.party.id }.name)
    }

    // MARK: Reads

    @Test
    fun partiesUnavailableIsSilent() = partyTest { h ->
        signedIn(h)
        h.api.failNext("parties", KuraApiError.Unavailable)
        h.store.loadParties(force = true)
        assertTrue(h.store.partiesUnavailable)
        assertTrue(h.store.partyCards.isEmpty())
        assertNull(h.store.loadError(LoadKey.Parties))
    }

    @Test
    fun partiesFailureIsALoadError() = partyTest { h ->
        signedIn(h)
        h.api.failNext("parties", KuraApiError.Server("HTTP 500"))
        h.store.loadParties(force = true)
        assertNotNull(h.store.loadError(LoadKey.Parties))
        assertFalse(h.store.partiesUnavailable)
    }

    @Test
    fun aPartyThatAnswers404IsDroppedEverywhere() = partyTest { h ->
        signedIn(h)
        val id = h.api.party.id
        h.store.loadParties()
        h.store.loadParty(id)
        h.store.push(Route.PartyRoute(id))
        h.store.push(Route.PartySearch(id))
        h.api.failNext("party", KuraApiError.NotFound)
        h.api.cards = emptyList()
        h.store.loadParty(id, force = true)
        runCurrent()
        assertNull(h.store.party(id))
        assertTrue(h.store.partyIsMissing(id))
        assertTrue(h.store.partyCards.none { it.id == id })
        assertTrue(h.store.path(h.store.tab).isEmpty())
        assertEquals(PartyCopy.GONE, h.store.toast?.text)
    }

    // MARK: Invites

    @Test
    fun anInviteBeforeTheAccountIsReadyWaitsAndSkipsTheWelcome() = partyTest { h ->
        h.store.openInvite(token)
        assertEquals(token, h.store.pendingInvite)
        assertTrue(h.store.invitePending)
        assertEquals(OnboardingStep.Signup, h.store.entryStep)
        assertTrue(h.api.callsOf("joinParty").isEmpty())

        signedIn(h)
        h.store.openPendingInvite()
        advanceTimeBy(500)
        runCurrent()
        assertNull(h.store.pendingInvite)
        assertEquals("joinParty $token", h.api.callsOf("joinParty").single())
        assertEquals(Route.PartyRoute(h.api.party.id), h.store.path(h.store.tab).last())
        assertEquals(SheetRoute.PartyWelcome(h.api.party.id, returning = true), h.store.sheet)
    }

    @Test
    fun aJustOnboardedAccountGetsTheNewWelcome() = partyTest { h ->
        signedIn(h)
        h.store.partyJustOnboarded = true
        h.store.openInvite(token)
        advanceTimeBy(500)
        runCurrent()
        assertEquals(SheetRoute.PartyWelcome(h.api.party.id, returning = false), h.store.sheet)
        assertFalse(h.store.partyJustOnboarded)
    }

    @Test
    fun aMemberComingBackGetsNoWelcome() = partyTest { h ->
        signedIn(h)
        h.api.joined = PartyJoin.Joined.Already
        h.store.openInvite(token)
        advanceUntilIdle()
        assertNull(h.store.sheet)
        assertEquals(Route.PartyRoute(h.api.party.id), h.store.path(h.store.tab).last())
    }

    @Test
    fun aDeadLinkOpensTheLandingDead() = partyTest { h ->
        signedIn(h)
        h.api.failNext("joinParty", KuraApiError.NotFound)
        h.store.openInvite(token)
        assertTrue(h.store.inviteIsDead(token))
        assertEquals(token, h.store.inviteLanding)
    }

    @Test
    fun a503LinkIsNotDead() = partyTest { h ->
        h.api.failNext("invitePreview", KuraApiError.Unavailable)
        h.store.loadInvite(token)
        assertTrue(h.store.partiesUnavailable)
        assertFalse(h.store.inviteIsDead(token))
        assertNull(h.store.loadError(LoadKey.Invite(token)))
    }

    @Test
    fun signInForInviteGoesToTheEntranceAndWaits() = partyTest { h ->
        h.store.inviteLanding = token
        h.store.signInForInvite(token)
        assertNull(h.store.inviteLanding)
        assertEquals(token, h.store.pendingInvite)
        assertEquals(OnboardingStep.Signup, h.store.onboardingStep)
        assertEquals(AppPhase.Onboarding, h.store.phase)
    }

    @Test
    fun theInvitePreviewLoads() = partyTest { h ->
        h.store.loadInvite(token)
        assertEquals(h.api.preview, h.store.invite(token))
        assertNull(h.store.loadError(LoadKey.Invite(token)))
    }

    // MARK: Cap

    @Test
    fun aFullGuestGetsTheCapSheetWithoutWriting() = partyTest { h ->
        signedIn(h)
        h.api.party = h.api.guestView(remaining = 0, mine = 2, limit = 2)
        h.store.loadParty(h.api.party.id)
        val r = h.store.addPartySong(h.api.party.id, h.api.hit())
        assertEquals(SongAdd.CapReached, r)
        assertEquals(SheetRoute.PartyCap(h.api.party.id), h.store.sheet)
        assertTrue(h.api.callsOf("addPartySong").isEmpty())
    }

    @Test
    fun theLastSongYouHadOpensTheCapSheet() = partyTest { h ->
        signedIn(h)
        h.api.party = h.api.guestView(remaining = 1, mine = 0)
        h.store.loadParty(h.api.party.id)
        assertEquals(SongAdd.Added, h.store.addPartySong(h.api.party.id, h.api.hit()))
        assertEquals(SheetRoute.PartyCap(h.api.party.id), h.store.sheet)
        assertEquals(0, h.store.party(h.api.party.id)!!.viewer.remaining)
    }

    @Test
    fun aSongWithRoomLeftSaysPusiste() = partyTest { h ->
        signedIn(h)
        h.api.party = h.api.guestView(remaining = 3, mine = 0)
        h.store.loadParty(h.api.party.id)
        assertEquals(SongAdd.Added, h.store.addPartySong(h.api.party.id, h.api.hit()))
        assertEquals("Agregaste Oye mi amor.", h.store.toast?.text)
        assertNull(h.store.sheet)
    }

    @Test
    fun theServersCapReachedRereadsAndOpensTheSheet() = partyTest { h ->
        signedIn(h)
        h.api.party = h.api.guestView(remaining = 1, mine = 0)
        h.store.loadParty(h.api.party.id)
        h.api.failNext("addPartySong", KuraApiError.Conflict("cap_reached", "Ya pusiste tus 3."))
        assertEquals(SongAdd.CapReached, h.store.addPartySong(h.api.party.id, h.api.hit()))
        assertEquals(2, h.api.callsOf("party").size)
        assertEquals(SheetRoute.PartyCap(h.api.party.id), h.store.sheet)
    }

    @Test
    fun aDuplicateShowsTheServersCopy() = partyTest { h ->
        signedIn(h)
        h.store.loadParty(h.api.party.id)
        h.api.failNext("addPartySong", KuraApiError.Conflict("duplicate_other", "Ya está, la puso @ana"))
        assertEquals(SongAdd.Failed, h.store.addPartySong(h.api.party.id, h.api.hit()))
        assertEquals("Ya está, la puso @ana", h.store.toast?.text)
    }

    // MARK: Block

    @Test
    fun removeAndBlockLeavesTheGuestInBloqueados() = partyTest { h ->
        signedIn(h)
        val id = h.api.party.id
        h.store.loadParty(id)
        val song = h.store.party(id)!!.songs.last()
        assertTrue(h.store.removeAndBlockPartyGuest(id, song))
        val p = h.store.party(id)!!
        assertTrue(p.songs.none { it.titleId == song.titleId })
        assertEquals(1, p.blockedGuests.size)
        assertTrue(h.store.toast!!.text.startsWith("Quitaste ${song.title} y bloqueaste a "))

        assertTrue(h.store.unblockPartyGuest(id, p.blockedGuests.single().guestRef))
        assertTrue(h.store.party(id)!!.blockedGuests.isEmpty())
    }

    @Test
    fun aBlockedGuestIsToldAndReread() = partyTest { h ->
        signedIn(h)
        h.api.party = h.api.guestView(remaining = 2, mine = 1)
        h.store.loadParty(h.api.party.id)
        h.api.failNext("addPartySong", KuraApiError.Forbidden("blocked"))
        assertEquals(SongAdd.Failed, h.store.addPartySong(h.api.party.id, h.api.hit()))
        assertEquals("Ya no puedes agregar canciones a esta fiesta.", h.store.toast?.text)
        assertEquals(2, h.api.callsOf("party").size)
    }

    @Test
    fun leavingDropsThePartyAndGoesHome() = partyTest { h ->
        signedIn(h)
        val id = h.api.party.id
        h.store.loadParties()
        h.store.push(Route.PartyRoute(id))
        assertTrue(h.store.leaveParty(id))
        assertTrue(h.store.partyCards.none { it.id == id })
        assertTrue(h.store.path(h.store.tab).isEmpty())
        assertEquals(PartyCopy.LEFT, h.store.toast?.text)
    }

    @Test
    fun rotateAndRevokeTheLink() = partyTest { h ->
        signedIn(h)
        val id = h.api.party.id
        h.store.loadParty(id)
        assertTrue(h.store.revokePartyInvite(id))
        assertFalse(h.store.party(id)!!.invite!!.active)
        assertTrue(h.store.rotatePartyInvite(id))
        assertTrue(h.store.party(id)!!.invite!!.active)
        h.api.failNext("rotatePartyInvite", KuraApiError.RateLimited(60))
        assertFalse(h.store.rotatePartyInvite(id))
        assertEquals(PartyCopy.ROTATE_LIMITED, h.store.toast?.text)
    }

    // MARK: Export (TIDAL, in steps)

    private suspend fun kotlinx.coroutines.test.TestScope.openExport(h: PartyHarness) {
        signedIn(h)
        h.store.loadParty(h.api.party.id)
        h.store.loadMusicServices()
        h.store.startPartyExport(h.api.party.id, MusicProvider.Tidal)
    }

    @Test
    fun exportFailsMidwayAndRetryFinishes() = partyTest { h ->
        openExport(h)
        assertEquals(PartyExportFlow.Step.Progress, h.store.partyExport!!.step)
        assertEquals(Route.PartyRoute(h.api.party.id), h.store.path(h.store.tab).last())
        // The second step: TIDAL stops answering.
        h.api.exportSteps.clear()
        h.api.failNext("stepTidalExport", KuraApiError.ServiceUnavailable("service_failed", "TIDAL dejó de responder."))
        advanceUntilIdle()
        val failed = h.store.partyExport!!
        assertEquals(PartyExportFlow.Step.Failed, failed.step)
        assertEquals("TIDAL dejó de responder.", failed.failure)

        h.api.exportSteps.add(h.api.export(ExportState.Status.Done, 2))
        h.store.retryPartyExport()
        advanceUntilIdle()
        val done = h.store.partyExport!!
        assertEquals(PartyExportFlow.Step.Done, done.step)
        assertEquals(2, done.processed)
        assertEquals(2, h.api.callsOf("startPartyExport").size)
    }

    @Test
    fun aRateLimitedStepWaitsAndGoesOn() = partyTest { h ->
        h.api.exportSteps.add(h.api.export(ExportState.Status.Done, 2))
        h.api.failNext("stepTidalExport", KuraApiError.RateLimited(2))
        openExport(h)
        runCurrent()
        assertEquals(MusicExportCopy.pause(MusicProvider.Tidal), h.store.partyExport!!.pause)
        advanceUntilIdle()
        assertEquals(PartyExportFlow.Step.Done, h.store.partyExport!!.step)
    }

    @Test
    fun notConnectedGoesBackToConnectAndTheCallbackFinishesIt() = partyTest { h ->
        h.api.failNext("startPartyExport", KuraApiError.Conflict("not_connected", ""))
        openExport(h)
        advanceUntilIdle()
        assertEquals(PartyExportFlow.Step.Connect, h.store.partyExport!!.step)
        assertEquals(false, h.store.musicServices!!.tidal.connected)

        // A callback nobody asked for is ignored.
        assertFalse(h.store.tidalCallback("kura://music/tidal/authorized?ref=$ref&claim=$claim"))

        var opened: String? = null
        h.store.connectPartyExport { opened = it }
        advanceUntilIdle()
        assertEquals(h.api.authUrl, opened)
        assertTrue(h.store.partyExport!!.busy)

        h.api.exportSteps.add(h.api.export(ExportState.Status.Done, 2))
        h.store.tidalAuthResult("kura://music/tidal/authorized?ref=$ref&claim=$claim")
        advanceUntilIdle()
        assertEquals("completeTidalAuth $ref $claim", h.api.callsOf("completeTidalAuth").single())
        assertEquals(PartyExportFlow.Step.Done, h.store.partyExport!!.step)
        // One use: the same callback again is ignored.
        assertFalse(h.store.tidalCallback("kura://music/tidal/authorized?ref=$ref&claim=$claim"))
    }

    @Test
    fun tidalSayingNoStaysOnConnectWithTheReason() = partyTest { h ->
        h.api.services = MusicServices(MusicServices.Service(false), MusicServices.Service(available = true, connected = false))
        openExport(h)
        h.store.connectPartyExport { }
        advanceUntilIdle()
        assertTrue(h.store.tidalCallback("kura://music/tidal/connected?ok=0&reason=denied"))
        val f = h.store.partyExport!!
        assertEquals(PartyExportFlow.Step.Connect, f.step)
        assertEquals(MusicExportCopy.tidalReason("denied"), f.note)
        assertFalse(f.busy)
    }

    @Test
    fun closingTheAuthTabJustStopsWaiting() = partyTest { h ->
        h.api.services = MusicServices(MusicServices.Service(false), MusicServices.Service(available = true, connected = false))
        openExport(h)
        h.store.connectPartyExport { }
        advanceUntilIdle()
        h.store.tidalAuthResult(null)
        assertFalse(h.store.partyExport!!.busy)
        assertTrue(h.api.callsOf("completeTidalAuth").isEmpty())
    }

    @Test
    fun exportUnavailableClosesWithProximamente() = partyTest { h ->
        signedIn(h)
        h.api.failNext("musicServices", KuraApiError.Unavailable)
        h.store.loadMusicServices()
        assertEquals(MusicServices.OFF, h.store.musicServices)
        h.store.startPartyExport(h.api.party.id, MusicProvider.Tidal)
        assertNull(h.store.partyExport)
    }

    @Test
    fun appleMusicNeverStartsOnAndroid() = partyTest { h ->
        h.api.services = MusicServices(MusicServices.Service(true), MusicServices.Service(true, connected = true))
        signedIn(h)
        h.store.loadMusicServices()
        h.store.startPartyExport(h.api.party.id, MusicProvider.AppleMusic)
        assertNull(h.store.partyExport)
    }

    @Test
    fun closingWhilePassingAsksFirst() = partyTest { h ->
        h.api.exportSteps.add(h.api.export(ExportState.Status.InProgress, 1, busy = true))
        openExport(h)
        runCurrent()
        h.store.closePartyExport()
        assertEquals(SheetRoute.PartyExportLeave(h.api.party.id), h.store.sheet)
        assertNotNull(h.store.partyExport)
        h.store.closePartyExport(force = true)
        assertNull(h.store.partyExport)
        assertNull(h.store.sheet)
    }

    // MARK: Callback parsing

    @Test
    fun tidalCallbackParsing() {
        assertEquals(TidalCallback.Authorized(ref, claim), TidalCallback.parse("kura://music/tidal/authorized?ref=$ref&claim=$claim"))
        assertEquals(TidalCallback.Failed("expired"), TidalCallback.parse("kura://music/tidal/connected?ok=0&reason=expired"))
        assertNull(TidalCallback.parse("kura://music/tidal/authorized?ref=nope&claim=$claim"))
        assertNull(TidalCallback.parse("kura://music/tidal/authorized?ref=$ref"))
        assertNull(TidalCallback.parse("https://get-kura.app/music/tidal/authorized?ref=$ref&claim=$claim"))
        assertNull(TidalCallback.parse("kura://evil/tidal/authorized?ref=$ref&claim=$claim"))
    }
}
