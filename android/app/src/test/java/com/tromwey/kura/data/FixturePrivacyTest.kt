package com.tromwey.kura.data

import com.tromwey.kura.data.models.KuraJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Guardrail: the fixtures are real server captures and this repo is PUBLIC. Every identity in them has to
 *  have gone through `fixtures/_anonymize.py` (see `_FIXTURES.md`) — a raw capture committed by mistake
 *  fails here instead of shipping other people's handles, names, emails or tokens. */
class FixturePrivacyTest {
    private val fakeHandle = Regex("^qa_[a-z0-9_]+$")
    private val fakeName = Regex("^Persona [A-Za-zÁÉÍÓÚáéíóú0-9 ]+$")
    private val fakeEmail = Regex("^qa\\.[a-z0-9]+@example\\.invalid$")
    private val handleKeys = setOf("handle", "authorHandle")

    /** What a fixture leaks, as "key=value" (empty = clean). Person names are checked where a person is. */
    private fun leaks(json: String): List<String> {
        val out = mutableListOf<String>()
        fun walk(e: JsonElement, key: String?) {
            when (e) {
                is JsonObject -> {
                    val isPerson = e["handle"] is JsonPrimitive && !e.containsKey("titleIds") && !e.containsKey("covers")
                    for ((k, v) in e) {
                        val s = (v as? JsonPrimitive)?.takeIf { it.isString }?.content
                        when {
                            s == null -> walk(v, k)
                            k in handleKeys && !fakeHandle.matches(s) -> out += "$k=$s"
                            (k == "owner" || (k == "name" && isPerson)) && !fakeName.matches(s) -> out += "$k=$s"
                            k == "email" && !fakeEmail.matches(s) -> out += "$k=$s"
                            k == "token" && e.containsKey("user") && s != "FAKE.TOKEN.REDACTED" -> out += "$k=<bearer>"
                        }
                    }
                }
                is JsonArray -> e.forEach { item ->
                    val s = (item as? JsonPrimitive)?.takeIf { it.isString }?.content
                    if (key == "people" && s != null && !fakeHandle.matches(s)) out += "people=$s" else walk(item, key)
                }
                else -> Unit
            }
        }
        walk(KuraJson.json.parseToJsonElement(json), null)
        // @mentions inside server-written sentences ("Sigue a @alguien y 1 más"), not the @ of an email.
        Regex("(?<![A-Za-z0-9._])@([A-Za-z0-9_.]{2,30})").findAll(json).map { it.groupValues[1].trimEnd('.') }
            .filterNot { fakeHandle.matches(it) }.forEach { out += "@$it" }
        return out
    }

    @Test fun everyFixtureIsAnonymized() {
        val dirty = Fixtures.names().sorted().associateWith { leaks(Fixtures.text(it)) }.filterValues { it.isNotEmpty() }
        assertTrue("fixtures con datos reales (corre _anonymize.py): $dirty", dirty.isEmpty())
        val listFiles = Regex("^people_(.+)_(followers|following)$")
        val named = Fixtures.names().mapNotNull { listFiles.find(it)?.groupValues?.get(1) }
        assertTrue("un archivo people_<handle>_… delata el handle: $named", named.all { fakeHandle.matches(it) })
    }

    @Test fun theCheckCatchesARawCapture() {
        val raw = """{"items":[{"handle":"alguien.real","name":"Alguien Real","avatarUrl":null}],
            "suggest":{"common":"Sigue a @otra_real y 1 más"},"email":"alguien@gmail.com",
            "user":{"handle":"qa_founder"},"token":"eyJhbGciOi.real.jwt","trending":[{"people":["tercera"]}]}"""
        assertEquals(
            listOf("handle=alguien.real", "name=Alguien Real", "email=alguien@gmail.com", "token=<bearer>", "people=tercera", "@otra_real"),
            leaks(raw),
        )
        val clean = """{"handle":"qa_persona_01","name":"Persona Uno","owner":"Persona Uno","email":"qa.persona01@example.invalid",
            "common":"Sigue a @qa_persona_02","collections":[{"id":"c","name":"Mi colección","handle":"qa_persona_01","titleIds":[]}]}"""
        assertEquals(emptyList<String>(), leaks(clean))
    }
}
