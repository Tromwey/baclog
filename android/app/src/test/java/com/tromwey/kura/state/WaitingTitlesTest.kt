package com.tromwey.kura.state

import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.UserTitleState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** "No puedo esperar" with the clock fixed on 2026-09-29 (noon in Mexico City): derived, never stored. */
@OptIn(ExperimentalCoroutinesApi::class)
class WaitingTitlesTest {
    private fun day(iso: String) = Release.Day(KuraJson.dayAtNoon(Instant.parse(iso)))
    private fun t(id: String, release: Release?, season: Int? = null) =
        Title(id = id, name = id, format = MediaFormat.Film, creator = null, palette = emptyList(), release = release, upcomingSeason = season)
    private fun saved(iso: String, mark: Mark? = null) = UserTitleState(mark = mark, savedAt = Instant.parse(iso))

    private fun api(): FakeKuraApi {
        val api = FakeKuraApi()
        val titles = listOf(
            t("odyssey", day("2026-10-16T00:00:00Z")), // 17 days → "16 oct"
            t("manana", day("2026-09-30T00:00:00Z")), // tomorrow → "18 h"
            t("diciembre", Release.Month(2026, 12)), // "dic 2026"
            t("sin-fecha", Release.Unknown),
            t("ya-salio", day("2026-09-01T00:00:00Z")), // out, but saved while announced → stays, LAST
            t("viejo", day("2025-03-01T00:00:00Z")), // out and saved after → not waiting
            t("completo", day("2026-11-01T00:00:00Z")), // unreleased but completed → gone
            t("temporada", day("2026-11-20T00:00:00Z"), season = 3), // the show is out, its season 3 waits
            t("sin-estreno", null), // no release at all
        )
        for (x in titles) api.catalog[x.id] = x
        api.collections = listOf(
            KCollection(id = "espera", name = "espera", titleIds = titles.map { it.id }, privacy = Privacy.OnlyMe, createdAt = Instant.EPOCH),
        )
        api.myTitles = mapOf(
            "odyssey" to saved("2026-09-01T00:00:00Z"),
            "manana" to saved("2026-09-01T00:00:00Z"),
            "diciembre" to saved("2026-09-01T00:00:00Z"),
            "sin-fecha" to saved("2026-09-01T00:00:00Z"),
            "ya-salio" to saved("2026-08-01T00:00:00Z"),
            "viejo" to saved("2026-02-01T00:00:00Z"),
            "completo" to saved("2026-09-01T00:00:00Z", Mark.Completed),
            "temporada" to saved("2026-09-01T00:00:00Z"),
            "sin-estreno" to saved("2026-09-01T00:00:00Z"),
        )
        return api
    }

    @Test fun waitingIsDerivedFromTheLibraryAndTheClock() = storeTest(api = api()) { h ->
        val store = h.store
        signedIn(h)
        assertEquals(
            listOf("manana", "odyssey", "diciembre", "sin-fecha", "temporada", "ya-salio").toSet(),
            store.waitingTitles.map { it.id }.toSet(),
        )
        // Dated days first (soonest first), then months, "sin fecha"; "ya salió" goes LAST.
        assertEquals(listOf("manana", "odyssey", "temporada", "diciembre", "sin-fecha", "ya-salio"), store.waitingTitles.map { it.id })

        assertEquals("18 h", store.releaseLabel(store.title("manana")!!))
        assertEquals("16 oct", store.releaseLabel(store.title("odyssey")!!))
        assertEquals("sale el 16 oct", store.releaseSentence(store.title("odyssey")!!))
        assertEquals("dic 2026", store.releaseLabel(store.title("diciembre")!!))
        assertEquals("ya salió", store.releaseLabel(store.title("ya-salio")!!))
        assertEquals("T3 · 20 nov", store.releaseLabel(store.title("temporada")!!, withSeason = true))

        // Completing one takes it out at once (derived, nothing to "remove").
        store.setMark("odyssey", Mark.Completed)
        assertEquals(false, store.waitingTitles.any { it.id == "odyssey" })

        // The clock moves: tomorrow's release is "hoy", then out — it stays (saved while announced) but last.
        store.now = Instant.parse("2026-09-30T18:00:00Z")
        assertEquals("hoy", store.releaseLabel(store.title("manana")!!))
        assertEquals(true, store.isReleaseDay(store.title("manana")!!))
        store.now = Instant.parse("2026-10-02T18:00:00Z")
        assertEquals("ya salió", store.releaseLabel(store.title("manana")!!))
        val later = store.waitingTitles.map { it.id }
        assertEquals(setOf("manana", "ya-salio"), later.takeLast(2).toSet())
    }
}
