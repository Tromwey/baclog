package com.tromwey.kura.data

import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Releases
import com.tromwey.kura.data.models.Title
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** "No puedo esperar" with the clock fixed on 2026-09-29, 12:00 in Mexico City (18:00Z). */
class ReleasesTest {
    private val now = Instant.parse("2026-09-29T18:00:00Z")

    private fun day(y: Int, m: Int, d: Int) = Release.Day(KuraJson.utcNoon(y, m, d)!!)
    private fun title(id: String, r: Release?, season: Int? = null) =
        Title(id = id, name = id, format = MediaFormat.Film, creator = null, palette = emptyList(), release = r, upcomingSeason = season)

    @Test fun labels() {
        assertEquals("hoy", Releases.label(day(2026, 9, 29), now))
        assertEquals("ya salió", Releases.label(day(2026, 9, 20), now))
        assertEquals("18 h", Releases.label(day(2026, 9, 30), now)) // tomorrow 12:00Z = 18 h away
        assertEquals("4 d", Releases.label(day(2026, 10, 3), now))
        assertEquals("7 d", Releases.label(day(2026, 10, 6), now))
        assertEquals("16 oct", Releases.label(day(2026, 10, 16), now))
        assertEquals("5 ene 2027", Releases.label(day(2027, 1, 5), now))
        assertEquals("nov 2026", Releases.label(Release.Month(2026, 11), now))
        assertEquals("2027", Releases.label(Release.Year(2027), now))
        assertEquals("sin fecha", Releases.label(Release.Unknown, now))
    }

    @Test fun sentences() {
        assertEquals("sale el 16 oct", Releases.sentence(day(2026, 10, 16), now))
        assertEquals("sale en 18 h", Releases.sentence(day(2026, 9, 30), now))
        assertEquals("sale en 4 d", Releases.sentence(day(2026, 10, 3), now))
        assertEquals("sale en nov 2026", Releases.sentence(Release.Month(2026, 11), now))
        assertEquals("sale en 2027", Releases.sentence(Release.Year(2027), now))
        assertEquals("hoy", Releases.sentence(day(2026, 9, 29), now))
        assertEquals("T3 · 16 oct", Releases.releaseLabel(title("s", day(2026, 10, 16), season = 3), now, withSeason = true))
        assertNull(Releases.releaseLabel(title("x", null), now))
    }

    @Test fun unreleased() {
        assertFalse(Releases.isUnreleased(day(2026, 9, 29), now)) // release day is out
        assertTrue(Releases.isReleaseDay(title("t", day(2026, 9, 29)), now))
        assertTrue(Releases.isUnreleased(day(2026, 9, 30), now))
        assertFalse(Releases.isUnreleased(Release.Month(2026, 9), now))
        assertTrue(Releases.isUnreleased(Release.Month(2026, 10), now))
        assertFalse(Releases.isUnreleased(Release.Year(2026), now))
        assertTrue(Releases.isUnreleased(Release.Unknown, now))
        // A series with an announced season: the show itself is out.
        assertFalse(Releases.isUnreleased(title("s", day(2026, 12, 1), season = 2), now))
    }

    /** The wire hour never moves the day: 00:00Z would be "yesterday" in Mexico City. */
    @Test fun wireHourDoesNotShiftTheDay() {
        val r = KuraJson.json.decodeFromString(
            Title.serializer(), """{"id":"a","name":"a","format":"album","palette":[],"release":{"kind":"day","date":"2026-10-01T00:00:00Z"}}""",
        ).release
        assertEquals(day(2026, 10, 1), r)
        assertEquals("1 oct", Releases.label(r!!, Instant.parse("2026-09-01T18:00:00Z")))
    }

    @Test fun waitingList() {
        val saved = mapOf(
            "out-before" to Instant.parse("2026-09-01T00:00:00Z"), // saved while announced → stays
            "out-after" to Instant.parse("2026-09-25T00:00:00Z"), // saved after release → not waiting
        )
        val marks = mapOf("marked" to Mark.Obsessed)
        val library = listOf(
            title("out-before", day(2026, 9, 10)),
            title("unknown", Release.Unknown),
            title("year", Release.Year(2027)),
            title("month", Release.Month(2026, 11)),
            title("later", day(2026, 10, 16)),
            title("sooner", day(2026, 10, 3)),
            title("out-after", day(2026, 9, 10)),
            title("marked", day(2026, 10, 1)),
            title("no-release", null),
            title("season", day(2026, 12, 1), season = 2),
        )
        val w = Releases.waitingTitles(library, now, { marks[it] }, { saved[it] })
        assertEquals(listOf("sooner", "later", "season", "month", "year", "unknown", "out-before"), w.map { it.id })
    }
}
