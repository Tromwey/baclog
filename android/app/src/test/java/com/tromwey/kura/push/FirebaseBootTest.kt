package com.tromwey.kura.push

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** `FirebaseBoot` starts Firebase by hand: its options must be exactly the ones in `app/google-services.json`
 *  (a new Firebase app or a rotated key there, and this fails instead of FCM refusing tokens in silence). */
class FirebaseBootTest {
    @Test fun optionsMatchGoogleServicesJson() {
        val file = listOf(File("google-services.json"), File("app/google-services.json")).first { it.exists() }
        val root = Json.parseToJsonElement(file.readText()).jsonObject
        val project = root["project_info"]!!.jsonObject
        val client = root["client"]!!.jsonArray.map { it.jsonObject }.single {
            it["client_info"]!!.jsonObject["android_client_info"]!!.jsonObject["package_name"]!!.jsonPrimitive.content == "com.tromwey.kura"
        }
        assertEquals(project["project_id"]!!.jsonPrimitive.content, FirebaseBoot.PROJECT_ID)
        assertEquals(project["project_number"]!!.jsonPrimitive.content, FirebaseBoot.GCM_SENDER_ID)
        assertEquals(client["client_info"]!!.jsonObject["mobilesdk_app_id"]!!.jsonPrimitive.content, FirebaseBoot.APPLICATION_ID)
        assertEquals(client["api_key"]!!.jsonArray.first().jsonObject["current_key"]!!.jsonPrimitive.content, FirebaseBoot.API_KEY)
    }

    @Test fun bothTapShapesFoldIntoOneTarget() {
        assertEquals("title:abc", PushIntent.target("release", "abc", null))
        assertEquals("person:ana", PushIntent.target("follower", null, "@ana"))
        assertEquals("person:ana", PushIntent.target(mapOf("type" to "follower", "handle" to "ana")))
        assertEquals(null, PushIntent.target("release", "  ", null))
        assertEquals(null, PushIntent.target("party", "abc", null))
        assertEquals(null, PushIntent.target(null, "abc", "ana"))
    }
}
