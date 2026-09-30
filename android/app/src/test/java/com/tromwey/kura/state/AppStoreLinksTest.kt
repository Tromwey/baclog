package com.tromwey.kura.state

import com.tromwey.kura.app.DeepLink
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AppStoreLinksTest {
    @Before fun clearInbox() = DeepLinkInbox.reset()

    @After fun clearInboxAfter() = DeepLinkInbox.reset()

    // MARK: Parser (same shapes as ios/Kura/App/DeepLinks.swift)

    @Test fun theSharedShapesParse() {
        assertEquals(DeepLink.TitleLink("abc-123"), DeepLink.parse("https://get-kura.app/item/abc-123"))
        assertEquals(DeepLink.TitleLink("abc"), DeepLink.parse("https://get-kura.app/mariel.ok/item/abc"))
        assertEquals(DeepLink.TitleLink("abc"), DeepLink.parse("https://get-kura.app/u/mariel.ok/item/abc"))
        assertEquals(DeepLink.Profile("qa_founder"), DeepLink.parse("https://get-kura.app/QA_Founder"))
        assertEquals(DeepLink.Profile("qa_founder"), DeepLink.parse("https://get-kura.app/u/@qa_founder"))
        assertEquals(DeepLink.CollectionLink("mariel.ok", "c1"), DeepLink.parse("https://get-kura.app/mariel.ok/c1"))
        assertEquals(DeepLink.OwnCollection("c1"), DeepLink.parse("https://get-kura.app/backlogs/c1"))
        assertEquals(DeepLink.Recap, DeepLink.parse("https://get-kura.app/recap"))
        assertEquals(DeepLink.Invite("Ab_-0123456789xy"), DeepLink.parse("https://get-kura.app/f/Ab_-0123456789xy"))
        assertEquals(
            DeepLink.Party("0b0c6a3e-8f7c-4d1a-9f51-2f8f7a0e1c2d"),
            DeepLink.parse("https://get-kura.app/c/0B0C6A3E-8F7C-4D1A-9F51-2F8F7A0E1C2D"),
        )
        // The legacy domain and www still count; a trailing slash or a query doesn't matter.
        assertEquals(DeepLink.TitleLink("abc"), DeepLink.parse("https://baclog.app/item/abc/"))
        assertEquals(DeepLink.Profile("qa_founder"), DeepLink.parse("https://www.get-kura.app/qa_founder?utm=x"))
    }

    @Test fun theEntranceCarriesItsNextStop() {
        assertEquals(DeepLink.Entrance(null), DeepLink.parse("https://get-kura.app/login"))
        assertEquals(
            DeepLink.Entrance(DeepLink.Invite("Ab_-0123456789xy")),
            DeepLink.parse("https://get-kura.app/login?to=%2Ff%2FAb_-0123456789xy"),
        )
        assertEquals(DeepLink.Entrance(DeepLink.TitleLink("abc")), DeepLink.parse("https://get-kura.app/verify?email=a%40b.c&to=/item/abc"))
        // `to` is a same-site path only, and never another entrance or a web-only page.
        assertEquals(DeepLink.Entrance(null), DeepLink.parse("https://get-kura.app/login?to=//evil.com/item/abc"))
        assertEquals(DeepLink.Entrance(null), DeepLink.parse("https://get-kura.app/login?to=https://evil.com/item/abc"))
        assertEquals(DeepLink.Entrance(null), DeepLink.parse("https://get-kura.app/login?to=/login"))
        assertEquals(DeepLink.Entrance(null), DeepLink.parse("https://get-kura.app/login?to=/settings"))
    }

    @Test fun webOnlyPagesAndStrangersAreNotLinks() {
        for (url in listOf(
            "https://get-kura.app/", "https://get-kura.app", "https://get-kura.app/settings", "https://get-kura.app/admin/x",
            "https://get-kura.app/privacidad", "https://get-kura.app/party/abc", "https://get-kura.app/favicon.ico",
            "https://get-kura.app/item", "https://get-kura.app/item/abc/card", "https://get-kura.app/backlogs/lentes",
            "https://get-kura.app/backlogs/c1/card", "https://get-kura.app/recap/2026-08", "https://get-kura.app/u",
            "https://get-kura.app/f/short", "https://get-kura.app/c/not-a-uuid",
            "http://get-kura.app/item/abc", "https://evil.com/item/abc", "https://get-kura.app.evil.com/item/abc",
            "kura://music/tidal/authorized?ref=a&claim=b", "", "no es una url",
        )) {
            assertNull(url, DeepLink.parse(url))
        }
        assertTrue(DeepLink.isOurs("https://get-kura.app/settings"))
        assertFalse(DeepLink.isOurs("https://evil.com/settings"))
    }

    @Test fun nothingSmugglesASecondSegmentOrADotSegment() {
        // learning 2026-09-25-ios-urlcomponents-path-deja-pasar-dot-segments
        for (url in listOf(
            "https://get-kura.app/item/..%2F..%2Faccount", "https://get-kura.app/item/%2e%2e", "https://get-kura.app/item/a%2Fb",
            "https://get-kura.app/u/..", "https://get-kura.app/...", "https://get-kura.app/item/a+b", "https://get-kura.app/item/%zz",
            "https://get-kura.app/qa_founder/item/..",
        )) {
            assertNull(url, DeepLink.parse(url))
        }
    }

    @Test fun pushTargetsAreValidatedLikeLinks() {
        assertEquals(DeepLink.TitleLink("abc"), DeepLink.pushTarget("title:abc"))
        assertEquals(DeepLink.Profile("mariel.ok"), DeepLink.pushTarget("person:@Mariel.OK"))
        assertNull(DeepLink.pushTarget("title:../x"))
        assertNull(DeepLink.pushTarget("person:a/b"))
        assertNull(DeepLink.pushTarget("feed:x"))
        assertNull(DeepLink.pushTarget("title"))
        assertNull(DeepLink.pushTarget(null))
    }

    // MARK: Store

    @Test fun aLinkWithTheTabsUpPushesOnTheTabYouAreOn() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.select(Tab.Feed)
        assertTrue(store.openWebLink("https://get-kura.app/item/abc"))
        assertEquals(listOf<Route>(Route.TitleRoute("abc")), store.path(Tab.Feed))
        // The same link again doesn't stack a second copy.
        store.openWebLink("https://get-kura.app/item/abc")
        assertEquals(1, store.path(Tab.Feed).size)
        store.openWebLink("https://get-kura.app/mariel.ok")
        assertEquals(Route.PersonRoute("mariel.ok"), store.path(Tab.Feed).last())
        assertFalse(store.openWebLink("https://get-kura.app/settings"))
    }

    @Test fun yourOwnHandleAndCollectionOpenYourSide() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val mine = store.me.handle
        val own = store.collections.first().id
        store.select(Tab.Feed)
        store.openWebLink("https://get-kura.app/$mine")
        assertEquals(Tab.Profile, store.tab)
        assertTrue(store.path(Tab.Profile).isEmpty())
        store.openWebLink("https://get-kura.app/$mine/$own")
        assertEquals(Tab.Collections, store.tab)
        assertEquals(listOf<Route>(Route.Collection(own)), store.path(Tab.Collections))
        store.openWebLink("https://get-kura.app/backlogs/no-existe")
        assertEquals("No encontramos esa colección.", store.toast?.text)
    }

    @Test fun aLinkBeforeTheTabsWaitsForThem() = storeTest { h ->
        val store = h.store
        assertTrue(store.openWebLink("https://get-kura.app/item/abc"))
        assertEquals(DeepLink.TitleLink("abc"), store.pendingLink)
        signedIn(h)
        store.openPendingLink()
        assertNull(store.pendingLink)
        assertEquals(listOf<Route>(Route.TitleRoute("abc")), store.path(store.tab))
    }

    @Test fun anEntranceLinkWaitsForTheSignInWithItsNextStop() = storeTest { h ->
        val store = h.store
        store.openWebLink("https://get-kura.app/login?to=/u/mariel.ok")
        assertEquals(DeepLink.Profile("mariel.ok"), store.pendingLink)
    }

    @Test fun anOldPendingLinkIsDropped() = storeTest { h ->
        val store = h.store
        DeepLinkInbox.put(DeepLink.TitleLink("abc"), FIXED_NOW.minus(DeepLinkInbox.ttl).minusSeconds(1))
        signedIn(h)
        store.openPendingLink()
        assertTrue(store.path(store.tab).isEmpty())
    }

    @Test fun anInviteSignedOutOpensTheLanding() = storeTest { h ->
        h.api.hasSession = false
        val store = h.store
        store.openWebLink("https://get-kura.app/f/Ab_-0123456789xy")
        assertEquals("Ab_-0123456789xy", store.inviteLanding)
        assertNull(store.pendingLink)
    }

    @Test fun aNoticeOpensItsTarget() = storeTest { h ->
        signedIn(h)
        val store = h.store
        assertTrue(store.openPushTarget("person:mariel.ok"))
        assertEquals(Route.PersonRoute("mariel.ok"), store.path(store.tab).last())
        assertFalse(store.openPushTarget("title:../../account"))
    }
}
