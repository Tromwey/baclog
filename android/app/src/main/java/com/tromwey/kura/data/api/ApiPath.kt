package com.tromwey.kura.data.api

/**
 * One path segment built from a runtime value (a handle, an id, a token, an era).
 *
 * A value that came from the server, a deep link or a push payload must never steer a
 * bearer-carrying request to another route (`people/../../account/x` → `/api/account/x`; the
 * WHATWG parser also reads `%2e` as a dot). So every value is ONE segment: percent-encoded with
 * RFC 3986 `pchar` minus `/` and `;` (so `%`, `?`, `#`, `/` are escaped), and `""`, `.`, `..` are
 * rejected outright (`null`): the request fails locally as `NotFound`, the server's own posture
 * for a malformed id. Normal values (handles, UUIDs, hex tokens, `YYYY-MM`) come out unchanged.
 * (learnings/2026-09-25-ios-urlcomponents-path-deja-pasar-dot-segments.md)
 */
object PathSegment {
    private const val ALLOWED_PUNCT = "-._~!$&'()*+,=:@"

    fun encode(raw: String): String? {
        if (raw.isEmpty() || raw == "." || raw == "..") return null
        val sb = StringBuilder(raw.length)
        for (b in raw.toByteArray(Charsets.UTF_8)) {
            val c = (b.toInt() and 0xff)
            val ch = c.toChar()
            if (c < 0x80 && (ch.isLetterOrDigit() || ALLOWED_PUNCT.indexOf(ch) >= 0)) sb.append(ch)
            else sb.append('%').append("0123456789ABCDEF"[c shr 4]).append("0123456789ABCDEF"[c and 0xf])
        }
        return sb.toString()
    }
}

/**
 * A path under `/api/v1`: a literal route TEMPLATE with `{}` holes, and the values that fill them —
 * `ApiPath("people/{}/collections/{}", handle, id)`. The template is ours (the route shape) and must
 * be plain route text (checked: `[a-z0-9_/{}-]`, so a value interpolated into it by mistake with
 * any `.`, `%`, `?`, `@` or uppercase fails fast); EVERY value goes through `PathSegment.encode`.
 * `template` (each value as `:id`) is the only form of a path that may be logged.
 */
class ApiPath(template: String, vararg values: String) {
    /** Percent-encoded, relative to the base (no leading slash). */
    val encoded: String
    /** Route shape for logs (`people/:id/collections/:id`). */
    val template: String
    /** False when a value was empty or a dot segment: the request is never sent. */
    val isValid: Boolean

    init {
        require(ROUTE.matches(template)) { "ApiPath: la plantilla debe ser texto de ruta literal: $template" }
        val holes = template.split("{}")
        require(holes.size - 1 == values.size) { "ApiPath: ${holes.size - 1} huecos, ${values.size} valores" }
        val enc = StringBuilder()
        var valid = true
        holes.forEachIndexed { i, lit ->
            enc.append(lit)
            if (i < values.size) {
                val seg = PathSegment.encode(values[i])
                if (seg == null) { valid = false; enc.append('_') } else enc.append(seg)
            }
        }
        encoded = enc.toString()
        this.template = template.replace("{}", ":id")
        isValid = valid
    }

    override fun toString() = template

    private companion object {
        val ROUTE = Regex("[a-z0-9_/{}-]+")
    }
}
