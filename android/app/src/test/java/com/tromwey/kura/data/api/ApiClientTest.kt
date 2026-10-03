package com.tromwey.kura.data.api

import com.tromwey.kura.data.Fixtures
import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.LinkOutcome
import com.tromwey.kura.data.models.Mark
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.content.TextContent
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.ByteArrayContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ApiClientTest {
    private val base = "http://10.0.2.2:3010/api/v1"
    private val requests = mutableListOf<HttpRequestData>()

    private fun harness(
        token: String? = "a.b.c",
        handler: suspend MockRequestHandleScope.(HttpRequestData) -> HttpResponseData,
    ): Pair<LiveApi, Session> {
        val engine = MockEngine { req -> synchronized(requests) { requests.add(req) }; handler(req) }
        val http = HttpClient(engine) {
            expectSuccess = false
            followRedirects = false
            install(ContentNegotiation) { json(KuraJson.json) }
        }
        val session = Session(InMemoryTokenStore(token))
        val client = ApiClient(base = base, session = session, http = http, userAgent = "kura-android/test (0)")
        return LiveApi(client, DeviceInfo(name = "Pixel de prueba", appVersion = "1.0")) to session
    }

    private val json = headersOf(HttpHeaders.ContentType, "application/json")
    private fun MockRequestHandleScope.ok(body: String) = respond(body, HttpStatusCode.OK, json)
    private fun MockRequestHandleScope.status(code: Int, body: String = "", extra: List<Pair<String, String>> = emptyList()) =
        respond(body, HttpStatusCode.fromValue(code), headersOf(*(listOf(HttpHeaders.ContentType to listOf("application/json")) + extra.map { it.first to listOf(it.second) }).toTypedArray()))

    private fun bodyOf(r: HttpRequestData): JsonObject = when (val b = r.body) {
        is TextContent -> KuraJson.json.parseToJsonElement(b.text).jsonObject
        is ByteArrayContent -> KuraJson.json.parseToJsonElement(String(b.bytes())).jsonObject
        else -> error("sin cuerpo JSON: ${b::class}")
    }

    private suspend inline fun <reified E : KuraApiError> expect(block: () -> Unit): E {
        try {
            block()
        } catch (e: KuraApiError) {
            if (e is E) return e
            fail("se esperaba ${E::class.simpleName}, llegó $e")
        }
        fail("se esperaba ${E::class.simpleName}, no hubo error")
        throw IllegalStateException()
    }

    @Test fun getSendsHeadersAndDecodes() = runBlocking<Unit> {
        val (api, _) = harness { ok(Fixtures.text("me")) }
        val me = api.me()
        assertEquals("qa_founder", me.handle)
        val r = requests.single()
        assertEquals("$base/me", r.url.toString())
        assertEquals("Bearer a.b.c", r.headers[HttpHeaders.Authorization])
        assertEquals("kura-android/test (0)", r.headers[HttpHeaders.UserAgent])
        assertTrue(r.headers["X-Kura-Client"]!!.startsWith("android/"))
    }

    @Test fun pathValuesAreOneSegment() = runBlocking<Unit> {
        val (api, _) = harness { ok(Fixtures.text("person")) }
        api.person("a/b?c")
        assertEquals("$base/people/a%2Fb%3Fc", requests.single().url.toString())
        // A dot segment never leaves the phone.
        expect<KuraApiError.NotFound> { api.person("..") }
        expect<KuraApiError.NotFound> { api.person("") }
        assertEquals(1, requests.size)
    }

    @Test fun unauthorizedForgetsTheSessionAndSaysSo() = runBlocking<Unit> {
        val (api, session) = harness { status(401, Fixtures.text("error_401")) }
        val client = api.client
        val heard = async(start = CoroutineStart.UNDISPATCHED) { withTimeout(2_000) { client.sessionExpired.first() } }
        expect<KuraApiError.Unauthorized> { api.collections() }
        heard.await()
        assertNull(session.token)
        assertEquals(1, requests.size) // never retried
    }

    @Test fun logoutSwallowsA401AndClearsFirst() = runBlocking<Unit> {
        val (api, session) = harness { status(401, Fixtures.text("error_401")) }
        var expired = false
        val job = launch(start = CoroutineStart.UNDISPATCHED) { api.client.sessionExpired.first(); expired = true }
        api.logout()
        assertNull(session.token)
        assertEquals("Bearer a.b.c", requests.single().headers[HttpHeaders.Authorization])
        assertEquals("$base/auth/logout", requests.single().url.toString())
        delay(50)
        assertFalse(expired)
        job.cancel()
    }

    @Test fun errorEnvelopesMapToTheTaxonomy() = runBlocking<Unit> {
        val cases = mapOf(
            404 to Fixtures.text("error_404"),
            403 to Fixtures.text("people_qa_persona_06_followers"),
        )
        for ((code, body) in cases) {
            requests.clear()
            val (api, _) = harness { status(code, body) }
            when (code) {
                404 -> expect<KuraApiError.NotFound> { api.person("nadie") }
                403 -> assertEquals("lists_private", expect<KuraApiError.Forbidden> { api.people(com.tromwey.kura.data.models.PeopleKind.FollowersOf("qa_persona_06"), null) }.code)
            }
        }
        val (a1, _) = harness { status(422, """{"error":{"code":"invalid","message":"x","reason":"invalid_proof"}}""") }
        assertEquals("proof_rejected", expect<KuraApiError.Forbidden> { a1.verifyMergeCode("a@b.c", "123456") }.code)
        val (a2, _) = harness { status(409, """{"error":{"code":"conflict","message":"Reacciona primero","reason":"reaction_required"}}""") }
        val c = expect<KuraApiError.Conflict> { a2.saveReview("t", "hola", false) }
        assertEquals("reaction_required", c.code)
        assertEquals("Para reseñar, elige Me gusta o Me obsesiona", c.toast)
        val (a3, _) = harness { status(503, """{"error":{"code":"unavailable","message":"TIDAL no está configurado","reason":"not_configured"}}""") }
        val su = expect<KuraApiError.ServiceUnavailable> { a3.startPartyExport("p", com.tromwey.kura.data.models.MusicProvider.Tidal) }
        assertEquals("not_configured", su.reason)
        val (a4, _) = harness { status(400, """{"error":{"code":"invalid","message":"Escribe un nombre.","fields":{"name":"Escribe un nombre."}}}""") }
        val inv = expect<KuraApiError.Invalid> { a4.createCollection("", com.tromwey.kura.data.models.Privacy.OnlyMe) }
        assertEquals(mapOf("name" to "Escribe un nombre."), inv.fields)
        assertEquals("Escribe un nombre.", inv.toast)
        val (a5, _) = harness { status(429, """{"error":{"code":"rate_limited","message":"","retryAfterSeconds":42}}""") }
        assertEquals(42, expect<KuraApiError.RateLimited> { a5.requestMergeCode("a@b.c") }.retryAfter)
        val (a6, _) = harness { status(500, "<html>") }
        expect<KuraApiError.Server> { a6.deleteCollection("c") }
    }

    @Test fun getsRetryWritesDont() = runBlocking<Unit> {
        var n = 0
        val (api, _) = harness { n++; if (n < 3) status(503, "", listOf(HttpHeaders.RetryAfter to "0")) else ok(Fixtures.text("me")) }
        assertEquals("qa_founder", api.me().handle)
        assertEquals(3, requests.size)
        requests.clear()
        val (w, _) = harness { status(503, "", listOf(HttpHeaders.RetryAfter to "0")) }
        expect<KuraApiError.Unavailable> { w.updateMe(MePatch(name = "x")) }
        assertEquals(1, requests.size)
        requests.clear()
        val (r429, _) = harness { status(429, """{"error":{"code":"rate_limited","message":""}}""") }
        expect<KuraApiError.RateLimited> { r429.me() }
        assertEquals(1, requests.size) // a 429 without Retry-After isn't retried
    }

    @Test fun identicalGetsInFlightShareOneRequest() = runBlocking<Unit> {
        val (api, _) = harness { delay(150); ok(Fixtures.text("me")) }
        val results = List(3) { async { api.me() } }.awaitAll()
        assertTrue(results.all { it.handle == "qa_founder" })
        assertEquals(1, requests.size)
    }

    @Test fun linkedElsewhereIsAMergeableOutcome() = runBlocking<Unit> {
        val body = """{"error":{"code":"conflict","message":"Esa cuenta ya existe","reason":"linked_elsewhere","mergeToken":"m.t","source":{"handle":"mariel","name":"Mariel","email":"m@x.mx","counts":{"titles":3,"collections":1,"reviews":0,"followers":2,"following":4}}}}"""
        val (api, _) = harness { status(409, body) }
        val out = api.linkGoogle("id.token.x")
        assertTrue(out is LinkOutcome.Mergeable)
        val proof = (out as LinkOutcome.Mergeable).proof
        assertEquals("@mariel", proof.source.display)
        assertEquals(3, proof.source.counts.titles)
        assertFalse(proof.toString().contains("m.t"))
    }

    @Test fun bodiesMatchTheWire() = runBlocking<Unit> {
        val (api, session) = harness(token = null) { req ->
            when {
                req.url.encodedPath.endsWith("auth/otp/verify") -> ok(Fixtures.text("auth_session"))
                req.url.encodedPath.endsWith("/mark") -> ok("""{"titleId":"t","mark":null,"savedAt":"2026-09-29T00:41:25.123Z","reviewId":null}""")
                req.url.encodedPath.startsWith("/api/v1/parties") -> ok(Fixtures.text("party"))
                else -> ok(Fixtures.text("collections").let { KuraJson.json.parseToJsonElement(it).jsonObject["items"]!!.let { a -> (a as kotlinx.serialization.json.JsonArray)[0].toString() } })
            }
        }
        api.signIn("persona@example.com", "123456")
        assertEquals("FAKE.TOKEN.REDACTED", session.token)
        val device = bodyOf(requests[0])["device"]!!.jsonObject
        assertEquals(JsonPrimitive("android"), device["platform"])
        assertEquals(JsonPrimitive("Pixel de prueba"), device["name"])
        assertNull(requests[0].headers[HttpHeaders.Authorization])

        val st = api.setMark("t", null, preview = false)
        assertNull(st.mark)
        assertEquals(JsonObject(mapOf("mark" to JsonNull)), bodyOf(requests[1]))
        api.setMark("t", Mark.Obsessed, preview = true)
        assertEquals(JsonObject(mapOf("mark" to JsonPrimitive("obsessed"), "preview" to JsonPrimitive(true))), bodyOf(requests[2]))

        api.setCollectionCover("c", null)
        assertEquals(JsonObject(mapOf("coverTitleId" to JsonNull)), bodyOf(requests[3]))
        api.createParty("Fiesta", null)
        assertEquals(JsonNull, bodyOf(requests[4])["perGuestLimit"])
        api.updateParty("p", null, Change(null))
        assertEquals(JsonObject(mapOf("perGuestLimit" to JsonNull)), bodyOf(requests[5]))
        api.updateParty("p", "Otra", null)
        assertEquals(JsonObject(mapOf("name" to JsonPrimitive("Otra"))), bodyOf(requests[6]))
        api.updateMe(MePatch(notifyRecap = false))
        assertEquals(JsonObject(mapOf("notifyRecap" to JsonPrimitive(false))), bodyOf(requests[7]))
    }

    @Test fun retryPolicy() {
        val none: (Double) -> Double = { 0.0 }
        assertEquals(0.0, RetryPolicy.delay(0, RetryPolicy.Failure.Transport, none)!!, 0.0)
        assertNull(RetryPolicy.delay(3, RetryPolicy.Failure.Transport, none))
        assertNull(RetryPolicy.delay(0, RetryPolicy.Failure.TimedOut, none))
        assertNull(RetryPolicy.delay(0, RetryPolicy.Failure.Http(404, null), none))
        assertNull(RetryPolicy.delay(0, RetryPolicy.Failure.Http(429, null), none))
        assertEquals(3.0, RetryPolicy.delay(0, RetryPolicy.Failure.Http(429, 3.0), none)!!, 0.0)
        assertNull(RetryPolicy.delay(0, RetryPolicy.Failure.Http(503, 60.0), none))
        assertEquals(2.0, RetryPolicy.delay(2, RetryPolicy.Failure.Http(502, null)) { it }!!, 0.0)
        assertEquals(12.0, RetryPolicy.parseRetryAfter("Tue, 29 Sep 2026 18:00:12 GMT", java.time.Instant.parse("2026-09-29T18:00:00Z"))!!, 0.0)
        assertNull(RetryPolicy.parseRetryAfter("-1"))
    }
}
