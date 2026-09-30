package com.tromwey.kura.data

import com.tromwey.kura.data.api.ApiPath
import com.tromwey.kura.data.api.PathSegment
import com.tromwey.kura.data.models.ExternalRef
import com.tromwey.kura.data.models.FanOrder
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.PublicLinks
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.TitleRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ModelsTest {
    @Test fun privacyWire() {
        assertEquals(Privacy.PublicAccess, Privacy.fromWire("profile"))
        assertEquals(Privacy.PublicAccess, Privacy.fromWire("public"))
        assertEquals(Privacy.OnlyMe, Privacy.fromWire("whatever"))
        assertEquals("link", Privacy.Followers.wire) // never offered in live; saved as link
        assertEquals(listOf(Privacy.OnlyMe, Privacy.Link, Privacy.PublicAccess), Privacy.options)
    }

    @Test fun fanOrder() {
        assertEquals(listOf("c", "a", "b"), FanOrder.fan(listOf("a", "b", "c", "d"), "c"))
        assertEquals(listOf("a", "b", "c"), FanOrder.fan(listOf("a", "b", "c", "d"), "gone"))
        assertEquals(listOf("#111111"), FanOrder.kuraHexes(listOf("#D8FF3E", "#111111")))
    }

    @Test fun collectionDefaultsFromAnOlderServer() {
        val c = KuraJson.json.decodeFromString(KCollection.serializer(), """{"id":"x","name":"Café Ñoño 2","titleIds":["a","b","c","d"],"coverTitleId":"c"}""")
        assertEquals(Privacy.OnlyMe, c.privacy)
        assertFalse(c.pinned)
        assertEquals(listOf("c", "a", "b"), c.fanTitleIds)
        assertEquals("cafe-nono-2", c.slug)
    }

    @Test fun counts() {
        assertEquals("214", KuraJson.count(214))
        assertEquals("12,4 k", KuraJson.count(12_400))
        assertEquals("48 k", KuraJson.count(48_000))
        assertEquals("1,2 M", KuraJson.count(1_200_000))
    }

    @Test fun datesWithAndWithoutFraction() {
        assertEquals(Instant.parse("2026-09-29T00:41:25Z"), KuraJson.parseDate("2026-09-29T00:41:25Z"))
        assertEquals(Instant.parse("2026-09-29T00:41:25.123Z"), KuraJson.parseDate("2026-09-29T00:41:25.123Z"))
        assertEquals(Instant.parse("2026-09-29T00:41:25Z"), KuraJson.parseDate("2026-09-28T18:41:25-06:00"))
        assertEquals(Instant.parse("2026-09-29T00:00:00Z"), KuraJson.parseDate("2026-09-29"))
        assertNull(KuraJson.parseDate("ayer"))
    }

    @Test fun peopleAndMe() {
        assertEquals("gm", Person.initials("Gael Martínez López"))
        assertEquals("k", Person.initials(" "))
        val me = KuraJson.json.decodeFromString(Me.serializer(), """{"username":"ana","displayName":"","followersCount":2}""")
        assertEquals("ana", me.handle)
        assertFalse("sin nombre = onboarding pendiente", me.onboarded)
        assertEquals(2, me.followers)
        assertTrue(me.notifyRecap)
        assertEquals(Mark.Completed, Mark.lenient("disliked"))
        assertNull(Mark.lenient("meh"))
    }

    @Test fun titleTolerance() {
        val t = KuraJson.json.decodeFromString(Title.serializer(),
            """{"title":"Nombre","format":"series","byline":"  ","overview":"s","watch":{"provider":"Netflix","kind":"stream"},"seriesStatus":{"kind":"airing","seasons":2},"externalRef":{"source":"tmdb","externalId":"42"}}""")
        assertEquals("Nombre", t.name)
        assertNull(t.creator)
        assertEquals("s", t.synopsis)
        assertEquals("net", t.watch.single().short)
        assertEquals("2 temporadas", t.detail)
        assertEquals("ext:tmdb:42", t.id)
        assertEquals(TitleRef.External("tmdb", "42"), TitleRef.from(t.id))
        assertEquals("""{"externalRef":{"source":"tmdb","externalId":"42"}}""", TitleRef.from(t.id).toJson().toString())
        assertEquals(ExternalRef("itunes", "a:b"), ExternalRef.parse("ext:itunes:a:b"))
    }

    @Test fun wrongTypeStillFails() {
        // Like Swift's decodeIfPresent: a present key with the wrong type is contract drift, not a default.
        val r = runCatching { KuraJson.json.decodeFromString(Title.serializer(), """{"id":"a","name":"a","format":"film","palette":[],"year":"2001"}""") }
        assertTrue(r.isFailure)
        val unknownFormat = runCatching { KuraJson.json.decodeFromString(Title.serializer(), """{"id":"a","name":"a","format":"podcast","palette":[]}""") }
        assertTrue(unknownFormat.isFailure)
    }

    @Test fun publicLinksAndAvatar() {
        val base = PublicLinks.base
        assertEquals("$base/mariel.ok", PublicLinks.profile("@mariel.ok"))
        assertEquals("$base/mariel.ok/item/t1", PublicLinks.item("mariel.ok", "t1"))
        assertNull(PublicLinks.item("mariel.ok", "ext:tmdb:1"))
        assertNull(PublicLinks.profile("@"))
        assertEquals("get-kura.app/a", PublicLinks.display("https://get-kura.app/a"))
        assertEquals(KuraRuntime.apiOrigin + "/api/avatar/k", KuraRuntime.resolve("/api/avatar/k"))
        assertEquals("https://x.y/a.jpg", KuraRuntime.resolve("https://x.y/a.jpg"))
        assertEquals("http://10.0.2.2:3010", KuraRuntime.originOf("http://10.0.2.2:3010/api/v1"))
    }

    @Test fun pathSegments() {
        assertEquals("ana.ok_1", PathSegment.encode("ana.ok_1"))
        assertEquals("a%2F..%2Fb", PathSegment.encode("a/../b"))
        assertEquals("%25%3F%23%3B%20", PathSegment.encode("%?#; "))
        assertEquals("%C3%B1", PathSegment.encode("ñ"))
        assertNull(PathSegment.encode(".."))
        assertNull(PathSegment.encode("."))
        assertNull(PathSegment.encode(""))
        val p = ApiPath("people/{}/collections/{}", "ana", "c1")
        assertEquals("people/ana/collections/c1", p.encoded)
        assertEquals("people/:id/collections/:id", p.template)
        assertFalse(ApiPath("people/{}", "..").isValid)
        // A value interpolated into the template by mistake is refused.
        assertTrue(runCatching { ApiPath("people/ana.ok") }.isFailure)
        assertTrue(runCatching { ApiPath("people/{}") }.isFailure)
    }

    @Test fun coverPaletteRank() {
        // Half vivid red, a quarter blue, a quarter near-white: three distinct tones, red first.
        val px = IntArray(64 * 64 * 4)
        for (i in 0 until 64 * 64) {
            val (r, g, b) = when {
                i < 2048 -> Triple(200, 30, 40)
                i < 3072 -> Triple(30, 60, 200)
                else -> Triple(245, 245, 240)
            }
            px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255
        }
        val out = CoverPalette.rank(px)
        assertEquals(listOf("#c81e28", "#1e3cc8", "#f5f5f0"), out)
        // Transparent pixels don't count; nothing opaque = no palette.
        assertEquals(emptyList<String>(), CoverPalette.rank(IntArray(16)))
        // Monochrome: ranked by coverage alone.
        val gray = IntArray(4 * 4) { if (it % 4 == 3) 255 else 128 }
        assertEquals(listOf("#808080"), CoverPalette.rank(gray))
    }
}
