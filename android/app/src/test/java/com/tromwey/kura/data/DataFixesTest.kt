package com.tromwey.kura.data

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.data.models.Title
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.PrintStream
import java.nio.file.Files

/** Models never invent what the server didn't send; prefs never overwrite what they couldn't read;
 *  the queue of unconfirmed sign-outs round-trips. */
class DataFixesTest {
    private fun stderr(block: () -> Unit): String {
        val old = System.err
        val buf = ByteArrayOutputStream()
        System.setErr(PrintStream(buf, true))
        try { block() } finally { System.setErr(old) }
        return buf.toString()
    }

    private fun rejects(block: () -> Any?) {
        try {
            block()
        } catch (_: IllegalArgumentException) { // SerializationException included
            return
        }
        fail("se esperaba un error de decodificación")
    }

    // H
    @Test fun aTitleWithoutIdOrFormatIsAnError() {
        rejects { KuraJson.json.decodeFromString(Title.serializer(), """{"name":"x","format":"film","palette":[]}""") }
        rejects { KuraJson.json.decodeFromString(Title.serializer(), """{"id":"t1","name":"x","palette":[]}""") }
        // An `ext:` search result still gets its stable local id.
        val ext = KuraJson.json.decodeFromString(Title.serializer(),
            """{"name":"x","format":"album","externalRef":{"source":"itunes","externalId":"42"}}""")
        assertEquals("ext:itunes:42", ext.id)
    }

    @Test fun aReviewWithoutIdIsAnError() {
        rejects { KuraJson.json.decodeFromString(Review.serializer(), """{"body":"hola","createdAt":"2026-09-29T00:00:00Z"}""") }
    }

    @Test fun anUnknownReleaseIsSinFechaButLeavesATrace() {
        fun release(kind: String, date: String?) = KuraJson.json.decodeFromString(Title.serializer(),
            """{"id":"t","name":"x","format":"film","palette":[],"release":{"kind":"$kind"${date?.let { ",\"date\":\"$it\"" } ?: ""}}}""").release
        var r: Release? = null
        val weird = stderr { r = release("season", null) }
        assertEquals(Release.Unknown, r)
        assertTrue(weird, weird.contains("release"))
        val noDate = stderr { r = release("day", null) }
        assertEquals(Release.Unknown, r)
        assertTrue(noDate, noDate.contains("day"))
        val plain = stderr { r = release("unknown", null) }
        assertEquals(Release.Unknown, r)
        assertFalse("the wire's own unknown is not drift", plain.contains("release"))
    }

    @Test fun meWithoutIsPublicIsPrivate() {
        val o = KuraJson.json.parseToJsonElement(Fixtures.text("me")).jsonObject
        val trimmed = JsonObject(o - "isPublic")
        val me = KuraJson.json.decodeFromJsonElement(Me.serializer(), trimmed)
        assertFalse(me.isPublic)
    }

    // I
    @Test fun unreadablePrefsAreNeverOverwrittenUntilReadFine() = runBlocking {
        val dir = Files.createTempDirectory("kura-prefs-held").toFile()
        val io = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val ds = PreferenceDataStoreFactory.create(scope = io) { File(dir, "local.preferences_pb") }
            val key = stringPreferencesKey(LocalPrefs.KEY)
            ds.edit { it[key] = "{ esto no es el payload" }
            val prefs = LocalPrefs(ds, enabled = true)
            val out = stderr { runBlocking { assertEquals(LocalPrefs.Payload(), prefs.load()) } }
            assertTrue(out, out.contains("ilegible"))
            prefs.save(LocalPrefs.Payload(recentSearches = listOf("encima")))
            assertEquals("held: what was on disk stays", "{ esto no es el payload", ds.data.first()[key])
            // A sign-out clears it, and from there writes go through again.
            prefs.clear()
            prefs.save(LocalPrefs.Payload(recentSearches = listOf("nueva")))
            assertEquals(listOf("nueva"), prefs.load().recentSearches)
        } finally {
            io.cancel()
            dir.deleteRecursively()
        }
    }

    // D (the queue)
    @Test fun pendingRevokesRoundTripAndDedupe() {
        val store = InMemoryTokenStore()
        val q = PendingRevokes(store)
        assertTrue(q.isEmpty)
        val a = PendingRevoke(bearer = "b1", sid = "s1")
        q.add(a)
        q.add(a.copy())
        q.add(PendingRevoke(bearer = "b2", global = true))
        assertEquals(2, q.all().size)
        assertFalse("never logs a bearer", q.all().toString().contains("b1"))
        q.remove(a)
        assertEquals(listOf(PendingRevoke(bearer = "b2", global = true)), PendingRevokes(store).all())
        store.set("basura")
        assertTrue("an unreadable queue is dropped, never looped on", q.all().isEmpty())
    }
}
