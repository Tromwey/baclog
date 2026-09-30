package com.tromwey.kura.data.api

import android.util.Log
import com.tromwey.kura.BuildConfig
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.MergeProof
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.content.ByteArrayContent
import io.ktor.http.content.TextContent
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import java.io.IOException
import java.io.InterruptedIOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/** Contract drift and server failures: method, route template, HTTP status and `X-Request-Id` —
 *  never a body, never a token, never a real path (handles, ids). */
internal object KuraLog {
    fun api(msg: String) {
        try { Log.e("KuraApi", msg) } catch (_: RuntimeException) { System.err.println("KuraApi: $msg") } // JVM tests
    }

    /** Something the app tolerated but shouldn't have seen (a model's fallback, a dropped push). */
    fun w(tag: String, msg: String) {
        try { Log.w(tag, msg) } catch (_: RuntimeException) { System.err.println("$tag: $msg") } // JVM tests
    }

    /** A bug: an error the app didn't map. Same rule: never a body, never a token. */
    fun e(tag: String, msg: String, error: Throwable? = null) {
        try { Log.e(tag, msg, error) } catch (_: RuntimeException) { System.err.println("$tag: $msg ${error?.javaClass?.name ?: ""}") } // JVM tests
    }
}

/** One HTTP call under `/api/v1`. */
class Endpoint(
    val method: Method,
    val path: ApiPath,
    val query: List<Pair<String, String>> = emptyList(),
    val body: Body? = null,
    /** `auth/…` routes run without a bearer. */
    val auth: Boolean = true,
    /** A token to send instead of the session's (logout sends the one it just forgot). */
    val explicitBearer: String? = null,
    /** True when a 401 must NOT end the session (logout, account deletion). */
    val suppressExpiry: Boolean = false,
) {
    enum class Method(val http: HttpMethod) {
        GET(HttpMethod.Get), POST(HttpMethod.Post), PUT(HttpMethod.Put), PATCH(HttpMethod.Patch), DELETE(HttpMethod.Delete)
    }

    sealed interface Body {
        class Json(val element: JsonElement) : Body
        class Raw(val bytes: ByteArray, val contentType: String) : Body
    }

    fun copy(auth: Boolean = this.auth, explicitBearer: String? = this.explicitBearer, suppressExpiry: Boolean = this.suppressExpiry) =
        Endpoint(method, path, query, body, auth, explicitBearer, suppressExpiry)

    companion object {
        fun get(path: ApiPath, query: List<Pair<String, String>> = emptyList()) = Endpoint(Method.GET, path, query)
        fun post(path: ApiPath, body: JsonElement? = null, auth: Boolean = true) = Endpoint(Method.POST, path, body = body?.let(Body::Json), auth = auth)
        fun put(path: ApiPath, body: JsonElement? = null) = Endpoint(Method.PUT, path, body = body?.let(Body::Json))
        fun patch(path: ApiPath, body: JsonElement) = Endpoint(Method.PATCH, path, body = Body.Json(body))
        fun delete(path: ApiPath) = Endpoint(Method.DELETE, path)
    }
}

/**
 * Ktor (OkHttp engine) + bearer + `KuraJson` + error mapping — twin of iOS `APIClient`.
 * Reads (`GET`) retry per `RetryPolicy`; identical reads in flight at the same time (same URL AND
 * same bearer) share one request. Writes are one attempt: the store's "Reintentar" is the retry.
 * A 401 on an authenticated call forgets the token and emits `sessionExpired`.
 *
 * Redirects: Ktor's are off and OkHttp follows them, and OkHttp drops `Authorization` whenever the
 * redirect changes scheme, host or port — the bearer never leaves the API origin. No HTTP cache.
 */
class ApiClient(
    val base: String = BuildConfig.API_BASE,
    val session: Session,
    http: HttpClient? = null,
    private val userAgent: String = defaultUserAgent(),
) {
    private val http: HttpClient = http ?: defaultHttpClient()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val expired = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    /** Emits when any authenticated call answers 401 (the token is already gone). */
    val sessionExpired: SharedFlow<Unit> = expired.asSharedFlow()

    internal class Response(val data: ByteArray, val requestId: String?)

    /** One failed attempt: the error the caller sees + how `RetryPolicy` should read it. */
    private class AttemptFailure(val error: Exception, val kind: RetryPolicy.Failure) : Exception()

    private class InFlight(val deferred: Deferred<Response>) { var waiters = 1 }
    private val inFlight = HashMap<String, InFlight>()

    private class ErrorBody(
        val code: String?, val message: String?, val fields: Map<String, String>?,
        val retryAfterSeconds: Int?, val reason: String?,
    )

    private fun url(e: Endpoint): String {
        val q = if (e.query.isEmpty()) "" else "?" + e.query.joinToString("&") { (k, v) -> enc(k) + "=" + enc(v) }
        return base.trimEnd('/') + "/" + e.path.encoded + q
    }

    private fun bearer(e: Endpoint): String? = when {
        e.explicitBearer != null -> e.explicitBearer
        e.auth -> session.token ?: throw KuraApiError.Unauthorized
        else -> null
    }

    /** The raw body (empty on 204). */
    suspend fun data(e: Endpoint): ByteArray = fetch(e).data

    suspend fun send(e: Endpoint) { fetch(e) }

    suspend fun <T> decode(e: Endpoint, strategy: DeserializationStrategy<T>): T {
        val r = fetch(e)
        return try {
            KuraJson.json.decodeFromString(strategy, r.data.toString(Charsets.UTF_8))
        } catch (x: IllegalArgumentException) { // SerializationException included
            // A contract change must leave a trace: where it broke, never the payload.
            // Only the exception's class: kotlinx's message quotes the offending JSON (it can carry a
            // name, an email, a review…).
            KuraLog.api("decode ${e.method} ${e.path.template} as ${strategy.descriptor.serialName} rid=${r.requestId ?: "-"}: ${x.javaClass.simpleName}")
            throw KuraApiError.Server("Respuesta inesperada del servidor")
        }
    }

    internal suspend fun fetch(e: Endpoint): Response {
        // A value that was empty or a dot segment: never sent (the server would say 404 too).
        if (!e.path.isValid) throw KuraApiError.NotFound
        val token = bearer(e)
        if (e.method != Endpoint.Method.GET || e.body != null) return run(e, token)
        return shared((token ?: "-") + " " + url(e)) { run(e, token) }
    }

    /** A GET in flight is joined by every caller with the same key; it dies only when EVERY caller has gone. */
    private suspend fun shared(key: String, work: suspend () -> Response): Response {
        val entry = synchronized(inFlight) {
            inFlight[key]?.also { it.waiters++ } ?: InFlight(scope.async(start = CoroutineStart.LAZY) { work() }).also { fresh ->
                inFlight[key] = fresh
                fresh.deferred.invokeOnCompletion { synchronized(inFlight) { if (inFlight[key] === fresh) inFlight.remove(key) } }
            }
        }
        entry.deferred.start()
        try {
            return entry.deferred.await()
        } finally {
            synchronized(inFlight) {
                entry.waiters--
                if (entry.waiters <= 0 && !entry.deferred.isCompleted) {
                    entry.deferred.cancel()
                    if (inFlight[key] === entry) inFlight.remove(key)
                }
            }
        }
    }

    /** One call with the `RetryPolicy` loop around it (writes: a single attempt). */
    private suspend fun run(e: Endpoint, token: String?): Response {
        var attempt = 0
        while (true) {
            try {
                return perform(e, token)
            } catch (f: AttemptFailure) {
                val wait = if (e.method == Endpoint.Method.GET) RetryPolicy.delay(attempt, f.kind) else null
                if (wait == null) throw f.error
                delay((wait * 1000).toLong()) // cancellable: cancelling the caller cuts the loop
                attempt++
            }
        }
    }

    private suspend fun perform(e: Endpoint, token: String?): Response {
        val resp: HttpResponse
        val bytes: ByteArray
        try {
            resp = http.request(url(e)) {
                method = e.method.http
                header(HttpHeaders.Accept, "application/json")
                header(HttpHeaders.UserAgent, userAgent)
                header("X-Kura-Client", "android/${BuildConfig.VERSION_NAME}")
                if (token != null) header(HttpHeaders.Authorization, "Bearer $token")
                when (val b = e.body) {
                    // Serialized here (no reflective serializer lookup, R8-proof); ContentNegotiation stays for parity.
                    is Endpoint.Body.Json -> setBody(TextContent(KuraJson.json.encodeToString(JsonElement.serializer(), b.element), ContentType.Application.Json))
                    is Endpoint.Body.Raw -> setBody(ByteArrayContent(b.bytes, ContentType.parse(b.contentType)))
                    null -> {}
                }
            }
            bytes = resp.bodyAsBytes()
        } catch (c: CancellationException) {
            throw c
        } catch (x: IOException) {
            val timedOut = x is InterruptedIOException || x.javaClass.simpleName.contains("Timeout")
            throw AttemptFailure(KuraApiError.Offline, if (timedOut) RetryPolicy.Failure.TimedOut else RetryPolicy.Failure.Transport)
        }
        val status = resp.status.value
        val rid = resp.headers["X-Request-Id"]
        if (status in 200..299) return Response(bytes, rid)
        if (status >= 500) KuraLog.api("${e.method} ${e.path.template} → HTTP $status rid=${rid ?: "-"}")

        val root = try {
            KuraJson.json.parseToJsonElement(bytes.toString(Charsets.UTF_8)) as? JsonObject
        } catch (_: IllegalArgumentException) {
            null
        }
        val errObj = root?.get("error") as? JsonObject
        val env = errObj?.let(::errorBody)
        // `409 linked_elsewhere` carries the proof to merge the other account in the envelope.
        if (status == 409 && env?.reason == "linked_elsewhere") {
            val proof = try { KuraJson.json.decodeFromJsonElement(MergeProof.serializer(), errObj) } catch (_: IllegalArgumentException) { null }
            if (proof != null) throw AttemptFailure(MergeableConflict(proof), RetryPolicy.Failure.Final)
        }
        val retryAfterHeader = resp.headers[HttpHeaders.RetryAfter]
        val err = map(status, env, retryAfterHeader)
        if (err is KuraApiError.Unauthorized) {
            // Only when THIS request carried the stored bearer: a 401 answering an older bearer (signed
            // out and back in while it was in flight) must not end the session that replaced it.
            if (e.auth && !e.suppressExpiry && e.explicitBearer == null && token != null && token == session.token) {
                session.clear()
                expired.tryEmit(Unit)
            }
            throw AttemptFailure(err, RetryPolicy.Failure.Final)
        }
        val retryAfter = RetryPolicy.parseRetryAfter(retryAfterHeader) ?: env?.retryAfterSeconds?.toDouble()
        throw AttemptFailure(err, RetryPolicy.Failure.Http(status, retryAfter))
    }

    private fun errorBody(o: JsonObject): ErrorBody {
        fun s(k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
        val fields = (o["fields"] as? JsonObject)?.mapNotNull { (k, v) ->
            (v as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { k to it }
        }?.toMap()
        return ErrorBody(s("code"), s("message"), fields, (o["retryAfterSeconds"] as? JsonPrimitive)?.intOrNull, s("reason"))
    }

    private fun map(status: Int, env: ErrorBody?, retryAfterHeader: String?): KuraApiError {
        val code = env?.code ?: ""
        val message = env?.message ?: ""
        val retryAfter = env?.retryAfterSeconds ?: retryAfterHeader?.trim()?.toIntOrNull()
        when (code) {
            "unauthorized" -> return KuraApiError.Unauthorized
            "forbidden" -> return KuraApiError.Forbidden(env?.reason)
            "not_found" -> return KuraApiError.NotFound
            // The provider token or the merge code was rejected (422, same body whatever failed).
            "invalid" -> return if (env?.reason == "invalid_proof") KuraApiError.Forbidden("proof_rejected")
                else KuraApiError.Invalid(env?.fields ?: emptyMap(), message)
            "conflict" -> return KuraApiError.Conflict(env?.reason, message)
            "rate_limited" -> return KuraApiError.RateLimited(retryAfter)
            "unsupported" -> return KuraApiError.Unsupported
            // The music export's 503s that mean something else than "not live yet".
            "unavailable" -> {
                val reason = env?.reason
                return if (reason == "not_configured" || reason == "service_failed") KuraApiError.ServiceUnavailable(reason, message)
                else KuraApiError.Unavailable
            }
            "underage" -> return KuraApiError.Forbidden("underage")
            "not_released", "reaction_required" -> return KuraApiError.Conflict(code, message)
        }
        return when (status) {
            401 -> KuraApiError.Unauthorized
            403 -> KuraApiError.Forbidden(code.ifEmpty { null })
            404 -> KuraApiError.NotFound
            400, 422 -> KuraApiError.Invalid(env?.fields ?: emptyMap(), message)
            409 -> KuraApiError.Conflict(code.ifEmpty { null }, message)
            429 -> KuraApiError.RateLimited(retryAfter)
            501 -> KuraApiError.Unsupported
            503 -> KuraApiError.Unavailable
            else -> KuraApiError.Server(message.ifEmpty { "HTTP $status" })
        }
    }

    companion object {
        /** `kura-android/<versionName> (<sdk>)`. */
        fun defaultUserAgent(): String = "kura-android/${BuildConfig.VERSION_NAME} (${android.os.Build.VERSION.SDK_INT})"

        private fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

        fun defaultHttpClient(): HttpClient = HttpClient(OkHttp) {
            expectSuccess = false
            followRedirects = false // OkHttp follows them (and strips Authorization across origins)
            install(ContentNegotiation) { json(KuraJson.json) }
            engine {
                config {
                    connectTimeout(15, TimeUnit.SECONDS)
                    readTimeout(20, TimeUnit.SECONDS)
                    writeTimeout(20, TimeUnit.SECONDS)
                    followRedirects(true)
                    followSslRedirects(false)
                }
            }
        }
    }
}
