package com.tromwey.kura.data.api

import com.tromwey.kura.data.Fixtures
import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.models.KuraJson
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.PrintStream

/** A 401 only ends the session that sent it; a decode failure never logs the payload; the explicit-
 *  bearer calls of a sign-out never broadcast "session expired". */
class ApiClientFixesTest {
    private val base = "http://10.0.2.2:3010/api/v1"
    private val json = headersOf(HttpHeaders.ContentType, "application/json")

    private fun live(session: Session, handler: suspend (HttpRequestData) -> Pair<Int, String>): LiveApi {
        val engine = MockEngine { req ->
            val (code, body) = handler(req)
            respond(body, HttpStatusCode.fromValue(code), json)
        }
        val http = HttpClient(engine) {
            expectSuccess = false
            followRedirects = false
            install(ContentNegotiation) { json(KuraJson.json) }
        }
        return LiveApi(ApiClient(base = base, session = session, http = http, userAgent = "t"), DeviceInfo(name = "t", appVersion = "1"))
    }

    // Ronda 5: `POST auth/otp/verify` → 401 + `reason: "locked"` is its own case; without it, the 401 of always.
    @Test fun aLockedCodeIsNotAPlainUnauthorized() = runBlocking<Unit> {
        var body = """{"error":{"code":"unauthorized","message":"Demasiados intentos con ese código. Pide uno nuevo.","reason":"locked"}}"""
        val api = live(Session(InMemoryTokenStore(null))) { 401 to body }
        try {
            api.signIn("qa@example.invalid", "123456")
            fail("se esperaba 401")
        } catch (e: KuraApiError) {
            assertEquals(KuraApiError.CodeLocked, e)
        }
        body = Fixtures.text("error_401")
        try {
            api.signIn("qa@example.invalid", "123456")
            fail("se esperaba 401")
        } catch (e: KuraApiError) {
            assertEquals(KuraApiError.Unauthorized, e)
        }
    }

    // O
    @Test fun a401ForAnOlderBearerNeverEndsTheNewSession() = runBlocking<Unit> {
        val session = Session(InMemoryTokenStore("old.bearer.x"))
        val api = live(session) {
            // Signed out and back in while this request was on the wire.
            session.store("new.bearer.y")
            401 to Fixtures.text("error_401")
        }
        var expired = false
        val watch = launch(start = CoroutineStart.UNDISPATCHED) { api.client.sessionExpired.first(); expired = true }
        try {
            api.collections()
            fail("se esperaba 401")
        } catch (_: KuraApiError.Unauthorized) {
        }
        delay(50)
        assertEquals("new.bearer.y", session.token)
        assertFalse(expired)
        watch.cancel()
    }

    @Test fun a401ForTheCurrentBearerStillEndsIt() = runBlocking<Unit> {
        val session = Session(InMemoryTokenStore("a.b.c"))
        val api = live(session) { 401 to Fixtures.text("error_401") }
        try { api.collections() } catch (_: KuraApiError.Unauthorized) {}
        assertEquals(null, session.token)
    }

    // Q
    @Test fun aDecodeFailureLogsWhereNeverWhat() = runBlocking<Unit> {
        val secret = "secreto@correo.com"
        val api = live(Session(InMemoryTokenStore("a.b.c"))) { 200 to """{"handle":"$secret", "name": """ }
        val old = System.err
        val buf = ByteArrayOutputStream()
        System.setErr(PrintStream(buf, true))
        try {
            try { api.me(); fail("se esperaba error") } catch (_: KuraApiError.Server) {}
        } finally {
            System.setErr(old)
        }
        val out = buf.toString()
        assertTrue(out, out.contains("decode GET me"))
        assertFalse("the payload never reaches the log", out.contains(secret))
    }

    // D (LiveApi)
    @Test fun revokingThisSessionUsesTheCapturedBearerAndA401IsDone() = runBlocking<Unit> {
        val session = Session(InMemoryTokenStore(null))
        val seen = mutableListOf<HttpRequestData>()
        val api = live(session) { seen += it; 401 to Fixtures.text("error_401") }
        var expired = false
        val watch = launch(start = CoroutineStart.UNDISPATCHED) { api.client.sessionExpired.first(); expired = true }
        api.revokeOwnSession("sid-1", "old.bearer.x") // no throw: already dead
        api.logoutBearer("old.bearer.x")
        assertEquals("$base/me/sessions/sid-1", seen[0].url.toString())
        assertEquals("DELETE", seen[0].method.value)
        assertEquals("Bearer old.bearer.x", seen[0].headers[HttpHeaders.Authorization])
        assertEquals("$base/auth/logout", seen[1].url.toString())
        delay(50)
        assertFalse(expired)
        watch.cancel()
    }
}
