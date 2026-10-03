package com.tromwey.kura.state

import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.PartyExportFlow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ExportAndAvatarFixesTest {
    // T
    @Test fun anExportThatNeverFinishesIsNeverListo() = partyTest { h ->
        h.api.exportSteps.add(h.api.export(ExportState.Status.InProgress, 1)) // forever "in progress"
        signedIn(h)
        h.store.loadParty(h.api.party.id)
        h.store.loadMusicServices()
        h.store.startPartyExport(h.api.party.id, MusicProvider.Tidal)
        advanceUntilIdle()
        val flow = h.store.partyExport!!
        assertNotEquals(PartyExportFlow.Step.Done, flow.step)
        assertEquals(PartyExportFlow.Step.Failed, flow.step)
        assertEquals(TIDAL_UNFINISHED, flow.failure)
        // The first step passed a song; every one after it passed none (ronda 5: the stall cap).
        assertEquals(1 + TIDAL_MAX_STALLED, h.api.callsOf("stepTidalExport").size)
    }

    // J (the decode budget; OOM itself can't be staged on the JVM)
    @Test fun bigPhotosDecodeDownsampledButNeverBelowTheCrop() {
        assertEquals(4, AvatarEncoder.sampleSize(4000, 3000)) // 1000×750
        assertEquals(8, AvatarEncoder.sampleSize(8000, 6000)) // 1000×750
        assertEquals(1, AvatarEncoder.sampleSize(1024, 768))
        assertEquals(2, AvatarEncoder.sampleSize(6000, 1100)) // short side stays ≥ 512
        assertEquals(1, AvatarEncoder.sampleSize(0, 0))
    }
}
