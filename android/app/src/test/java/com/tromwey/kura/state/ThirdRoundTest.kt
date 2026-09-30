package com.tromwey.kura.state

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.PeoplePage
import com.tromwey.kura.data.models.Privacy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.time.Instant

/** Pull to refresh on Tus colecciones, the anonymous rest of your own lists, and the local settings that
 *  persist on their own. */
@OptIn(ExperimentalCoroutinesApi::class)
class ThirdRoundTest {
    private val recs = "4f69f303-e6a1-4f76-95e3-e4b53763d0af"
    private val pr = "5c75d6dd-1e73-45e2-a4b8-78ea0168fa1d"
    private val rap = "30d54aae-a066-4be9-9bec-b36bf8f3c800"
    private val rapTitle = "d1493a89-e28c-4b8b-a40a-336133593825"
    private val recsTitle = "ed3e37c2-488b-4321-a720-76a8b6d0151c"
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be"

    @Test fun refreshLibraryBringsTheServerWithoutASkeletonAndKeepsWhatThePhoneIsWriting() = storeTest { h ->
        val store = h.store
        signedIn(h)
        store.remove(yhlq, pr) // inside its Deshacer window: must stay removed

        // Meanwhile, on the web: a rename, a new collection, one deleted, a mark, a title gone.
        h.api.collections = h.api.collections
            .filter { it.id != rap }
            .map { if (it.id == recs) it.copy(name = "renombrada en la web") else it } +
            KCollection(id = "web", name = "web", titleIds = listOf("titulo-web"), privacy = Privacy.Link, createdAt = Instant.EPOCH)
        h.api.myTitles = h.api.myTitles - rapTitle +
            (recsTitle to h.api.myTitles.getValue(recsTitle).copy(mark = Mark.Obsessed)) +
            ("titulo-web" to h.api.myTitles.getValue(recsTitle).copy(mark = null))

        val parked = h.api.hold("collections")
        store.launch { store.refreshLibrary() }
        runCurrent()
        assertEquals("sin esqueleto mientras recarga", LoadState.Loaded, store.loadState)
        parked.complete(Unit)
        runCurrent()

        assertEquals(LoadState.Loaded, store.loadState)
        assertEquals("renombrada en la web", store.collection(recs)!!.name)
        assertNotNull(store.collection("web"))
        assertNull(store.collection(rap))
        assertNull(store.userTitles[rapTitle])
        assertEquals(Mark.Obsessed, store.mark(recsTitle))
        assertNotNull("los títulos nuevos se hidratan", store.title("titulo-web"))
        assertFalse("el quitar pendiente sigue quitado", yhlq in store.collection(pr)!!.titleIds)
        assertEquals(listOf(yhlq), store.pendingRemovals(pr))
    }

    @Test fun refreshLibraryFailureKeepsEverything() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val before = store.collections
        h.api.failNext("myTitles", com.tromwey.kura.data.api.KuraApiError.Offline)
        store.refreshLibrary()
        assertEquals(before, store.collections)
        assertEquals(LoadState.Loaded, store.loadState)
        assertTrue(store.offline)
    }

    @Test fun yourOwnListKeepsTheAnonymousRest() = storeTest { h ->
        val store = h.store
        signedIn(h)
        val page = FakeKuraApi.decode("me_followers", PeoplePage.serializer())
        h.api.followersPage = page.copy(privateCount = 4)
        store.loadPeopleList(store.me.id, following = false)
        val key = AppStore.peopleListKey(store.me.id, following = false)
        assertEquals(page.items.size, store.peopleLists[key]!!.size)
        assertEquals(4, store.peopleListMeta[key]!!.anonymous)
    }

    @Test fun showCommonAndDefaultPrivacyPersistOnTheirOwn() = runTest {
        val dir = Files.createTempDirectory("kura-prefs2").toFile()
        val io = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val prefs = LocalPrefs(PreferenceDataStoreFactory.create(scope = io) { File(dir, "local.preferences_pb") }, enabled = true)
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        try {
            val store = AppStore(FakeKuraApi(), Session(InMemoryTokenStore("t")), prefs, clock = { FIXED_NOW }, scope = scope)
            store.enterMain()
            store.startIfNeeded()
            store.showCommon = false
            store.defaultPrivacy = Privacy.Link
            advanceTimeBy(600) // the debounced write
            runCurrent()
            store.disk {}.join()
            val saved = prefs.load()
            assertFalse(saved.showCommon)
            assertEquals(Privacy.Link.name, saved.defaultPrivacy)
        } finally {
            scope.cancel()
            io.cancel()
            dir.deleteRecursively()
        }
    }
}
