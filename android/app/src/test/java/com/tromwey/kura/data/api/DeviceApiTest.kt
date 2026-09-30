package com.tromwey.kura.data.api

import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.models.KuraJson
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/** `PUT/DELETE /me/devices/{token}` (API.md §2.4) and the forget hook that unregisters push. */
class DeviceApiTest {
    private val base = "http://10.0.2.2:3010/api/v1"
    private val requests = mutableListOf<HttpRequestData>()
    /** A real FCM token has a `:` — it must travel as ONE path segment. */
    private val fcm = "fYk3_x-Q:APA91bH_abc-DEF_123"

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

    private fun MockRequestHandleScope.noContent() = respond("", HttpStatusCode.NoContent)
    private fun bodyOf(r: HttpRequestData): JsonObject = KuraJson.json.parseToJsonElement((r.body as TextContent).text).jsonObject

    @Test fun registerSendsFcmProviderWithoutEnvironment() = runBlocking<Unit> {
        val (api, _) = harness { noContent() }
        api.registerDevice(fcm, environment = null, provider = "fcm")
        val r = requests.single()
        assertEquals(HttpMethod.Put, r.method)
        assertEquals("$base/me/devices/fYk3_x-Q:APA91bH_abc-DEF_123", r.url.toString())
        val body = bodyOf(r)
        assertEquals("fcm", body["provider"]!!.jsonPrimitive.content)
        assertNull("FCM no manda environment", body["environment"])
        assertEquals("Bearer a.b.c", r.headers[HttpHeaders.Authorization])
    }

    @Test fun registerKeepsApnsDefault() = runBlocking<Unit> {
        val (api, _) = harness { noContent() }
        api.registerDevice("ab".repeat(32), environment = "sandbox")
        val body = bodyOf(requests.single())
        assertEquals("apns", body["provider"]!!.jsonPrimitive.content)
        assertEquals("sandbox", body["environment"]!!.jsonPrimitive.content)
    }

    @Test fun unregisterUsesTheCapturedBearerAndNeverExpiresTheSession() = runBlocking<Unit> {
        val (api, session) = harness(token = "new.session.token") { respond("", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType, "application/json")) }
        var expired = false
        val watcher = CoroutineScope(Dispatchers.Unconfined).launch { api.client.sessionExpired.collect { expired = true } }
        try {
            api.unregisterDevice(fcm, bearer = "old.session.token")
        } catch (_: KuraApiError.Unauthorized) {
            // the store swallows it; what matters is that nothing else happened
        }
        val r = requests.single()
        assertEquals(HttpMethod.Delete, r.method)
        assertEquals("$base/me/devices/fYk3_x-Q:APA91bH_abc-DEF_123", r.url.toString())
        assertEquals("Bearer old.session.token", r.headers[HttpHeaders.Authorization])
        assertEquals("the new session survives", "new.session.token", session.token)
        watcher.cancel()
        assertFalse("un 401 aquí no es 'sesión caducada'", expired)
    }

    @Test fun forgetSessionHandsTheForgottenBearerToTheHook() {
        val (api, session) = harness(token = "x.y.z") { noContent() }
        var got: String? = null
        api.onForgetSession = { got = it }
        api.forgetSession()
        assertNull(session.token)
        assertEquals("x.y.z", got)
        got = null
        api.forgetSession() // nothing stored: nothing to hand over
        assertNull(got)
    }
}
