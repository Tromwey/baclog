package com.tromwey.kura.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.util.Base64

class SessionTest {
    private val now = Instant.parse("2026-09-29T18:00:00Z")

    /** A JWT of lies: only the payload matters (the signature is never checked here). */
    private fun jwt(payload: String): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        return enc.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray()) + "." +
            enc.encodeToString(payload.toByteArray()) + ".c2lnbmF0dXJh"
    }

    private fun session(token: String?) = Session(InMemoryTokenStore(token)) { now }

    @Test fun readsExpSidSub() {
        val exp = now.plusSeconds(30L * 24 * 3600).epochSecond
        val s = session(jwt("""{"sub":"u-1","sid":"dfd9cdc7-89b8-4139-bdfc-23aaad2bd002","exp":$exp,"tv":0}"""))
        assertEquals(Instant.ofEpochSecond(exp), s.expiry)
        assertEquals("dfd9cdc7-89b8-4139-bdfc-23aaad2bd002", s.sid)
        assertEquals("u-1", s.subject)
        assertFalse(s.isExpiringSoon)
        assertFalse(s.needsRefresh)
    }

    @Test fun refreshWindowIsSevenDays() {
        val soon = session(jwt("""{"exp":${now.plusSeconds(6L * 24 * 3600).epochSecond}}"""))
        assertTrue(soon.isExpiringSoon)
        assertTrue(soon.needsRefresh)
        val later = session(jwt("""{"exp":${now.plusSeconds(8L * 24 * 3600).epochSecond}}"""))
        assertFalse(later.needsRefresh)
    }

    @Test fun unreadableTokenLetsTheServerDecide() {
        val s = session("not-a-jwt")
        assertNull(s.expiry)
        assertNull(s.sid)
        assertTrue(s.needsRefresh)
        // Payload that isn't JSON / isn't Base64.
        assertNull(Session.claims("a.%%%.c"))
        assertNull(Session.claims("a." + Base64.getUrlEncoder().encodeToString("nope".toByteArray()) + ".c"))
    }

    @Test fun noTokenNeverRefreshes() {
        val s = session(null)
        assertFalse(s.hasToken)
        assertFalse(s.needsRefresh)
    }

    @Test fun storeAndClear() {
        val s = session(null)
        s.store("a.b.c")
        assertEquals("a.b.c", s.token)
        s.clear()
        assertNull(s.token)
    }
}
