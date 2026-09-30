package com.tromwey.kura.data

import com.tromwey.kura.data.api.Items
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.AuthSession
import com.tromwey.kura.data.models.BlockedAccount
import com.tromwey.kura.data.models.CollectionDetail
import com.tromwey.kura.data.models.DeviceSession
import com.tromwey.kura.data.models.DiscoverCreatorsPayload
import com.tromwey.kura.data.models.DiscoverFormatPayload
import com.tromwey.kura.data.models.DiscoverPayload
import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.FeedBursts
import com.tromwey.kura.data.models.FeedKind
import com.tromwey.kura.data.models.FeedPage
import com.tromwey.kura.data.models.FollowListsVisibility
import com.tromwey.kura.data.models.Identities
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.InvitePreview
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.KuraRuntime
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.MusicServices
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyCard
import com.tromwey.kura.data.models.PartyRole
import com.tromwey.kura.data.models.PartySongHit
import com.tromwey.kura.data.models.PeoplePage
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.RecapMonth
import com.tromwey.kura.data.models.RecapPayload
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.ReviewPage
import com.tromwey.kura.data.models.SearchResult
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.TitleDetail
import com.tromwey.kura.data.models.UserTitleState
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** Every fixture captured from the live server decodes with `KuraJson` into the Android models:
 *  the server is the only source of truth, so a model that drifts from it fails here. */
class FixtureDecodingTest {
    private fun <T> decode(name: String, s: DeserializationStrategy<T>): T = KuraJson.json.decodeFromString(s, Fixtures.text(name))

    private object MyTitlesRow : com.tromwey.kura.data.models.WireSerializer<Pair<String, UserTitleState>>("MyTitlesRow") {
        override fun read(e: JsonElement): Pair<String, UserTitleState> {
            val o = e.jsonObject
            return o["titleId"].toString().trim('"') to KuraJson.json.decodeFromJsonElement(UserTitleState.serializer(), o["state"]!!)
        }
    }

    /** fixture → how the client decodes it. Error envelopes are exercised in `ApiClientTest`. */
    private val decoders: Map<String, DeserializationStrategy<*>> = mapOf(
        "auth_providers" to AuthProviders.serializer(),
        "auth_session" to AuthSession.serializer(),
        "collection_detail" to CollectionDetail.serializer(),
        "collections" to Items(KCollection.serializer()),
        "discover" to DiscoverPayload.serializer(),
        "discover_creators" to DiscoverCreatorsPayload.serializer(),
        "discover_formats_album" to DiscoverFormatPayload.serializer(),
        "discover_formats_film" to DiscoverFormatPayload.serializer(),
        "discover_formats_series" to DiscoverFormatPayload.serializer(),
        "feed" to FeedPage.serializer(),
        "feed_page2" to FeedPage.serializer(),
        "invite_preview" to InvitePreview.serializer(),
        "me" to Me.serializer(),
        "me_blocks" to Items(BlockedAccount.serializer()),
        "me_followers" to PeoplePage.serializer(),
        "me_following" to PeoplePage.serializer(),
        "me_identities" to Identities.serializer(),
        "me_onboarding_people" to PeoplePage.serializer(),
        "me_sessions" to Items(DeviceSession.serializer()),
        "me_titles" to Items(MyTitlesRow),
        "music_services" to MusicServices.serializer(),
        "onboarding_pool" to Items(Title.serializer()),
        "parties" to Items(PartyCard.serializer()),
        "party" to Party.serializer(),
        "party_export_apple" to ExportState.serializer(),
        "party_export_tidal" to ExportState.serializer(),
        "party_songs_search" to Items(PartySongHit.serializer()),
        "people_search" to PeoplePage.serializer(),
        "people_suggestions" to PeoplePage.serializer(),
        "person" to Person.serializer(),
        "person_collection" to CollectionDetail.serializer(),
        "person_self" to Person.serializer(),
        "recap_era" to RecapPayload.serializer(),
        "recap_era_current" to RecapPayload.serializer(),
        "recap_months" to Items(RecapMonth.serializer()),
        "search" to Items(SearchResult.serializer()),
        "title_detail" to TitleDetail.serializer(),
        "title_detail_marked" to TitleDetail.serializer(),
        "title_reviews" to ReviewPage.serializer(),
        "titles_ids" to Items(Title.serializer()),
    )
    private val envelopes = setOf("error_401", "error_404", "people_julz_followers", "people_julz_following", "username_check", "feed_suggestion")

    @Test fun everyFixtureIsCovered() {
        val missing = Fixtures.names() - decoders.keys - envelopes
        assertTrue("fixtures sin decodificador: $missing", missing.isEmpty())
    }

    @Test fun everyFixtureDecodes() {
        for ((name, s) in decoders) {
            try {
                decode(name, s)
            } catch (e: IllegalArgumentException) {
                throw AssertionError("$name no decodifica: ${e.message}", e)
            }
        }
    }

    @Test fun me() {
        val me = decode("me", Me.serializer())
        assertEquals("ericbriseno", me.handle)
        assertEquals("Eric", me.name)
        assertEquals("e", me.initials)
        assertTrue(me.onboarded)
        assertTrue(me.isFounder)
        assertEquals(FollowListsVisibility.Private, me.followListsVisibility)
        assertEquals(7, me.stats.completed)
        assertNull("la fixture no lleva correo", me.email)
        // Relative avatar → absolute against the API origin.
        assertTrue(me.avatarUrl!!.startsWith(KuraRuntime.apiOrigin!! + "/api/avatar/"))
    }

    @Test fun authSessionRedacted() {
        val s = decode("auth_session", AuthSession.serializer())
        assertFalse(s.toString().contains(s.token))
        assertEquals("ericbriseno", s.user.handle)
    }

    @Test fun collections() {
        val cols = decode("collections", Items(KCollection.serializer()))
        assertTrue(cols.isNotEmpty())
        cols.forEach { c -> assertTrue(c.fanTitleIds.size <= 3); assertTrue(c.titleIds.containsAll(c.fanTitleIds)) }
        val d = decode("collection_detail", CollectionDetail.serializer())
        assertEquals("2026", d.collection.name)
        assertEquals(Privacy.PublicAccess, d.collection.privacy)
        assertEquals("Discovered in 2026", d.collection.shownVibe)
        assertEquals(13, d.collection.titleIds.size)
        assertEquals(13, d.titles.size)
        assertEquals(d.collection.titleIds.toSet(), d.collection.addedAt.keys)
        assertEquals(3, d.collection.fanTitleIds.size)
    }

    @Test fun titleDetail() {
        val d = decode("title_detail", TitleDetail.serializer())
        assertEquals("SE ESTÁ HACIENDO TARDE", d.title.name)
        assertEquals(MediaFormat.Album, d.title.format)
        // 2026-08-07T07:00:00Z → the UTC day at noon.
        assertEquals(Release.Day(Instant.parse("2026-08-07T12:00:00Z")), d.title.release)
        assertEquals("1", d.title.counts!!.liked)
        assertEquals(19, d.title.tracks.size)
        assertEquals(1, d.title.watch.size)
        assertTrue(d.title.isDetailed)
        assertEquals(Mark.Liked, d.state!!.mark)
        assertEquals(1, d.reviews.size)
        assertEquals("ericbriseno", d.reviews[0].authorId)
        assertNull(d.reviewsCursor)
    }

    @Test fun person() {
        val p = decode("person", Person.serializer())
        assertEquals("julz", p.handle)
        assertEquals(2, p.collections.size)
        assertEquals(7, p.obsessions.size)
        assertEquals(FollowListsVisibility.Private, p.followListsVisibility)
        assertEquals(false, p.canSeeFollowLists)
        assertNotNull(p.isFollowing)
    }

    @Test fun feedAndBursts() {
        val page = decode("feed", FeedPage.serializer())
        assertEquals(24, page.items.size)
        assertNotNull(page.nextCursor)
        assertEquals(FeedKind.Obsessed, page.items[0].kind)
        val added = page.items.filter { it.kind is FeedKind.Added }
        assertTrue(added.all { it.collectionId != null && it.at != null })
        // Consecutive adds to the same collection fold: fewer cards than events.
        val cards = FeedBursts.append(page.items, emptyList())
        assertTrue(cards.size < page.items.size)
        assertTrue(cards.any { it.kind is FeedKind.Burst })
        val suggestion = KuraJson.json.parseToJsonElement(Fixtures.text("feed_suggestion")).jsonObject["event"]!!
        val ev = KuraJson.json.decodeFromJsonElement(com.tromwey.kura.data.models.FeedEvent.serializer(), suggestion)
        val kind = ev.kind as FeedKind.Suggestion
        assertEquals("applereview", kind.personId)
        assertEquals(1, kind.titleIds.size)
    }

    @Test fun discover() {
        val d = decode("discover", DiscoverPayload.serializer())
        assertTrue(d.recommended.isNotEmpty())
        assertTrue(d.trending.all { it.people.isNotEmpty() })
        assertEquals(4, d.collections.size)
        assertTrue(d.allTitles.isNotEmpty())
        val film = decode("discover_formats_film", DiscoverFormatPayload.serializer())
        assertEquals(MediaFormat.Film, film.format)
        assertEquals(1, film.time)
        assertEquals(3, film.times.size)
        assertEquals(5, film.moods.size)
        val series = decode("discover_formats_series", DiscoverFormatPayload.serializer())
        assertTrue(series.lenses.all { it.maxMinutes != null })
    }

    @Test fun parties() {
        val p = decode("party", Party.serializer())
        assertEquals("Halloween", p.name)
        assertTrue(p.isHost)
        assertEquals(3, p.perGuestLimit)
        assertNull(p.viewer.remaining)
        assertEquals("get-kura.app/f/AbCdEfGhIjKlMnOp", p.invite!!.display)
        val cards = decode("parties", Items(PartyCard.serializer()))
        assertEquals(PartyRole.Host, cards[0].role)
        assertTrue(cards[0].meta.startsWith("De fiesta · "))
        val invite = decode("invite_preview", InvitePreview.serializer())
        assertEquals(p.id, invite.party.id)
        val tidal = decode("party_export_tidal", ExportState.serializer())
        assertEquals(MusicProvider.Tidal, tidal.provider)
        val services = decode("music_services", MusicServices.serializer())
        assertFalse(services.appleMusic.available)
        assertEquals("not_configured", services.tidal.reason)
    }

    @Test fun recapAndAccount() {
        val r = decode("recap_era", RecapPayload.serializer())
        assertEquals("2026-08", r.era)
        assertEquals("agosto", r.month)
        assertEquals(2026, r.year)
        assertEquals(1, r.stats.obsessed) // wire `obsessions`
        assertEquals(7, r.stats.saved)
        val ids = decode("me_identities", Identities.serializer())
        assertEquals(true, ids.link(IdentityProvider.Apple)?.linked)
        assertFalse(ids.appleIsLastWayIn)
        val sessions = decode("me_sessions", Items(DeviceSession.serializer()))
        assertTrue(sessions.all { it.createdAt != null && it.lastSeenAt != null })
        val following = decode("me_following", PeoplePage.serializer())
        assertEquals(0, following.privateCount)
        assertTrue(following.items.isNotEmpty())
    }

    @Test fun searchCarriesExternalRef() {
        val rs = decode("search", Items(SearchResult.serializer()))
        val first = rs.first()
        assertNotNull(first.title.externalRef)
        // A real id wins over the ext: local id, like iOS.
        assertFalse(first.id.startsWith("ext:"))
    }
}
