package com.tromwey.kura.data.models

import com.tromwey.kura.BuildConfig
import com.tromwey.kura.data.api.PathSegment
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import java.net.URI
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeParseException
import java.util.Locale

// Wire conventions (`KuraJson`), the Kura calendar, the welcome art, `KuraRuntime` and the public
// links — the twin of `ios/Kura/Models/Runtime.swift`.

/**
 * Wire conventions (API.md §1): every read model is tolerant (see `Wire.kt`), dates accept ISO 8601
 * with and without fractional seconds (and a bare date). Request bodies are their own types.
 */
object KuraJson {
    /** The one `Json` of the app: API responses, request bodies and `LocalPrefs`. */
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = true
    }

    /** iOS `KuraJSON.date(from:)`: with fraction, without, or `YYYY-MM-DD` (UTC midnight). */
    fun parseDate(s: String): Instant? {
        try { return Instant.parse(s) } catch (_: DateTimeParseException) {}
        try { return OffsetDateTime.parse(s).toInstant() } catch (_: DateTimeParseException) {}
        try { return LocalDate.parse(s).atStartOfDay(ZoneOffset.UTC).toInstant() } catch (_: DateTimeParseException) {}
        return null
    }

    /**
     * A calendar day pinned to 12:00 UTC so the start of day lands on the same date in every zone
     * the app can run in. The wire's `release.date` hour varies by source (video 06:00Z, albums
     * iTunes' hour) but the release DAY is always the UTC date of that instant. Never read the
     * wire hour: 00:00Z would be "yesterday" in Mexico City.
     */
    fun utcNoon(year: Int, month: Int, day: Int): Instant? = try {
        LocalDate.of(year, month, day).atTime(12, 0).toInstant(ZoneOffset.UTC)
    } catch (_: java.time.DateTimeException) {
        null
    }

    fun utcDate(i: Instant): LocalDate = i.atOffset(ZoneOffset.UTC).toLocalDate()

    fun dayAtNoon(i: Instant): Instant = utcDate(i).atTime(12, 0).toInstant(ZoneOffset.UTC)

    /** "12,4 k" / "48,7 k" / "214" — the ribbon format the frames use. */
    fun count(n: Int): String = when {
        n >= 1_000_000 -> trimmed(n / 1_000_000.0) + " M"
        n >= 1_000 -> trimmed(n / 1_000.0) + " k"
        else -> n.toString()
    }

    private fun trimmed(v: Double): String {
        val s = String.format(Locale.ROOT, "%.1f", v).replace('.', ',')
        return if (s.endsWith(",0")) s.dropLast(2) else s
    }
}

/** ISO 8601 `Instant` for `@Serializable` types (lenient on read, like `KuraJson.parseDate`). */
object InstantIsoSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("KuraInstant", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): Instant {
        val s = decoder.decodeString()
        return KuraJson.parseDate(s) ?: throw SerializationException("Fecha ISO 8601 inválida")
    }
    override fun serialize(encoder: Encoder, value: Instant) = encoder.encodeString(value.toString())
}

/**
 * Kura's calendar for release days and countdowns ("hoy", "14 h", "16 oct"): Mexico City time,
 * Spanish (MX). Production code reads THIS.
 */
object KCalendar {
    val zone: ZoneId = ZoneId.of("America/Mexico_City")
    val locale: Locale = Locale.forLanguageTag("es-MX")

    fun date(i: Instant): LocalDate = i.atZone(zone).toLocalDate()
    fun startOfDay(i: Instant): Instant = date(i).atStartOfDay(zone).toInstant()
    fun startOfDay(d: LocalDate): Instant = d.atStartOfDay(zone).toInstant()
}

/** The three covers fanned out on the welcome (13): a fixed, named art source — NOT the mock. */
object WelcomeArt {
    private fun tmdb(path: String) = "https://image.tmdb.org/t/p/w500/$path"

    val titles: List<Title> = listOf(
        Title(id = "chihiro", name = "El viaje de Chihiro", format = MediaFormat.Film, year = 2001, creator = "Hayao Miyazaki",
            palette = listOf("#c53e42", "#794244"), coverUrl = tmdb("2RcxjDykOssx4SfqshewyI9vfSl.jpg")),
        Title(id = "odyssey", name = "The Odyssey", format = MediaFormat.Film, year = 2026, creator = "Christopher Nolan",
            palette = listOf("#5ca6cb", "#33566e"), coverUrl = tmdb("mKPGRRyXIwN8JOLhAbWnxV1gNrS.jpg")),
        Title(id = "ma", name = "Ma", format = MediaFormat.Album, year = 2019, creator = "Devendra Banhart",
            palette = listOf("#c33d3b", "#ae4c69"),
            coverUrl = "https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/b3/84/c8/b384c84d-b4a8-8f05-a37e-8aab02ba698d/075597924053.jpg/600x600bb.jpg"),
    )

    fun title(id: String): Title? = titles.firstOrNull { it.id == id }
}

/** Runtime switches a model needs before the store exists. */
object KuraRuntime {
    /** True when the app runs on `MockApi` (debug `kuraScreen` / `kuraMock`). Never set in release. */
    @Volatile var usesMock: Boolean = false

    /** Origin of `BuildConfig.API_BASE` (no `/api/v1`): relative `avatarUrl`s resolve against it. */
    @Volatile var apiOrigin: String? = originOf(BuildConfig.API_BASE)

    /** The session's bearer, for requests outside `ApiClient` (profile photos on `/api/avatar`,
     *  which serve a private account's photo only to its owner — Coil adds it). */
    @Volatile var bearer: () -> String? = { null }

    /** `avatarUrl` may come relative (`/api/avatar/{key}`). */
    fun resolve(raw: String?): String? {
        if (raw.isNullOrEmpty()) return null
        if (raw.startsWith("/")) {
            val origin = apiOrigin ?: return raw
            return try { URI(origin).resolve(raw).toString() } catch (_: IllegalArgumentException) { null }
        }
        return raw
    }

    fun originOf(base: String): String? = try {
        val u = URI(base)
        if (u.scheme == null || u.host == null) null
        else buildString {
            append(u.scheme).append("://").append(u.host)
            if (u.port != -1) append(':').append(u.port)
        }
    } catch (_: java.net.URISyntaxException) {
        null
    }
}

/**
 * The web's public URLs, built in ONE place (the clean URLs of `next.config.ts`): profile
 * `/{handle}` · public collection `/{handle}/{collectionId}` · public item `/{handle}/item/{titleId}`.
 * Every one 404s unless the profile (and the collection) is public — callers decide whether to
 * offer it. Base = the API origin (debug → the dev host), else `BuildConfig.SITE_URL`.
 */
object PublicLinks {
    val base: String get() = KuraRuntime.apiOrigin ?: BuildConfig.SITE_URL

    fun profile(handle: String): String? {
        val h = clean(handle) ?: return null
        return join(h)
    }

    fun collection(handle: String, id: String): String? {
        val h = clean(handle) ?: return null
        if (id.isEmpty()) return null
        return join(h, id)
    }

    fun item(handle: String, titleId: String): String? {
        val h = clean(handle) ?: return null
        if (titleId.isEmpty() || ExternalRef.parse(titleId) != null) return null
        return join(h, "item", titleId)
    }

    /** "get-kura.app/mariel.ok/…" — the link as printed on a card (no scheme). */
    fun display(url: String): String = url.substringAfter("://", url)

    private fun join(vararg segments: String): String? {
        val encoded = segments.map { PathSegment.encode(it) ?: return null }
        return base.trimEnd('/') + "/" + encoded.joinToString("/")
    }

    private fun clean(handle: String): String? = handle.trim().trimStart('@').ifEmpty { null }
}
