package com.tromwey.kura.data.models

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import java.time.Instant

// The Kotlin twin of the iOS `init(from decoder:)` pattern: every read model is TOLERANT
// (unknown keys ignored, anything optional read "if present" with its default, aliases such as
// `handle ?? username`), and dates go through `KuraJson.parseDate` (ISO 8601 with and without
// fraction, or a bare date). A key that IS present with the wrong JSON type still fails, exactly
// like Swift's `decodeIfPresent` — contract drift must surface as a decoding error, not as a
// silent default. Enums that iOS reads with `try?` use the `lenient*` readers instead.

/** A read-only wire model decoded from its `JsonElement` by hand (iOS: `Decodable` only). */
internal abstract class WireSerializer<T>(name: String) : KSerializer<T> {
    final override val descriptor: SerialDescriptor = buildClassSerialDescriptor(name)

    final override fun deserialize(decoder: Decoder): T {
        val json = decoder as? JsonDecoder ?: throw SerializationException("$descriptor solo se lee de JSON")
        return read(json.decodeJsonElement())
    }

    abstract fun read(e: JsonElement): T

    final override fun serialize(encoder: Encoder, value: T): Unit =
        throw SerializationException("${descriptor.serialName} es un modelo de lectura (el cuerpo de un request es su propio tipo)")
}

/** Keyed reads over one JSON object, with Swift's `decodeIfPresent` semantics. */
internal class Obj(val o: JsonObject) {
    fun has(k: String) = o.containsKey(k)

    /** Present and not `null`. */
    fun el(k: String): JsonElement? = o[k]?.takeUnless { it is JsonNull }

    private fun prim(k: String, e: JsonElement, type: String): JsonPrimitive =
        e as? JsonPrimitive ?: mismatch(k, type)

    fun string(k: String): String? = el(k)?.let { e ->
        prim(k, e, "String").takeIf { it.isString }?.content ?: mismatch(k, "String")
    }

    fun int(k: String): Int? = el(k)?.let { e ->
        prim(k, e, "Int").takeUnless { it.isString }?.intOrNull ?: mismatch(k, "Int")
    }

    fun double(k: String): Double? = el(k)?.let { e ->
        prim(k, e, "Double").takeUnless { it.isString }?.doubleOrNull ?: mismatch(k, "Double")
    }

    fun bool(k: String): Boolean? = el(k)?.let { e ->
        prim(k, e, "Bool").takeUnless { it.isString }?.booleanOrNull ?: mismatch(k, "Bool")
    }

    fun instant(k: String): Instant? = string(k)?.let {
        KuraJson.parseDate(it) ?: throw SerializationException("Fecha ISO 8601 inválida en `$k`")
    }

    fun array(k: String): JsonArray? = el(k)?.let { it as? JsonArray ?: mismatch(k, "Array") }

    fun obj(k: String): Obj? = el(k)?.let { Obj(it as? JsonObject ?: mismatch(k, "Object")) }

    fun strings(k: String): List<String>? = array(k)?.map { e ->
        (e as? JsonPrimitive)?.takeIf { it.isString }?.content ?: mismatch(k, "[String]")
    }

    fun ints(k: String): List<Int>? = array(k)?.map { e ->
        (e as? JsonPrimitive)?.takeUnless { it.isString }?.intOrNull ?: mismatch(k, "[Int]")
    }

    /** `[String?]` — nulls kept (e.g. `artworkUrls`). */
    fun optionalStrings(k: String): List<String?>? = array(k)?.map { e ->
        if (e is JsonNull) null else (e as? JsonPrimitive)?.takeIf { it.isString }?.content ?: mismatch(k, "[String?]")
    }

    fun <T> decode(k: String, ser: KSerializer<T>): T? = el(k)?.let { KuraJson.json.decodeFromJsonElement(ser, it) }

    fun <T> list(k: String, ser: KSerializer<T>): List<T>? = array(k)?.map { KuraJson.json.decodeFromJsonElement(ser, it) }

    fun <T> map(k: String, ser: KSerializer<T>): Map<String, T>? = obj(k)?.o?.mapValues { (_, v) ->
        KuraJson.json.decodeFromJsonElement(ser, v)
    }

    fun instants(k: String): Map<String, Instant>? = obj(k)?.o?.mapValues { (key, v) ->
        val s = (v as? JsonPrimitive)?.takeIf { it.isString }?.content ?: mismatch(k, "[String: Date]")
        KuraJson.parseDate(s) ?: throw SerializationException("Fecha ISO 8601 inválida en `$k.$key`")
    }

    fun requireString(k: String): String = string(k) ?: missing(k)
    fun <T> require(k: String, ser: KSerializer<T>): T = decode(k, ser) ?: missing(k)

    /** iOS `try? c.decode(String…)`: the wrong type reads as absent (used for enums read with `try?`). */
    fun lenientString(k: String): String? = (el(k) as? JsonPrimitive)?.takeIf { it.isString }?.content

    companion object {
        fun of(e: JsonElement): Obj = Obj(e as? JsonObject ?: throw SerializationException("Se esperaba un objeto JSON"))
        fun missing(k: String): Nothing = throw SerializationException("Falta la llave `$k`")
        fun mismatch(k: String, type: String): Nothing = throw SerializationException("`$k` no es $type")
    }
}
