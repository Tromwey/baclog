package com.tromwey.kura.state

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.models.CollectionLayout
import com.tromwey.kura.data.models.SortMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

/** The device-local prefs through a REAL DataStore file: async load before `applyLocal`, the serial disk
 *  queue, and a 401 wiping them (a shared phone never hands them to the next account). */
@OptIn(ExperimentalCoroutinesApi::class)
class LocalPrefsTest {
    private val pr = "b95d0019-f01f-4b63-b6f9-8bf2e78b7d9f"
    private val yhlq = "11a4e43b-04d9-4892-b5f0-8bc24a6977be"

    @Test fun sortEpisodesAndMutedSurviveARelaunchButNotASessionEnd() = runTest {
        val dir = Files.createTempDirectory("kura-prefs").toFile()
        val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = ioScope) { File(dir, "local.preferences_pb") }
        val prefs = LocalPrefs(dataStore, enabled = true)
        fun launchStore(scope: CoroutineScope, expiries: MutableSharedFlow<Unit> = MutableSharedFlow()) = AppStore(
            api = FakeKuraApi(), session = Session(InMemoryTokenStore("t")), prefs = prefs, clock = { FIXED_NOW },
            scope = scope, expiries = expiries,
        )
        try {
            // First launch: change device-local things, then leave the foreground (flush).
            val scope1 = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
            val first = launchStore(scope1)
            first.enterMain()
            first.startIfNeeded()
            first.setSort(pr, SortMode.Title)
            first.setLayout(pr, CollectionLayout.List)
            first.toggleEpisode(yhlq, "T1E2")
            first.noteSearch("bad bunny")
            first.sceneWentInactive()
            first.disk {}.join()
            scope1.cancel()

            // Relaunch: the library comes back with THIS phone's sort, layout and episodes.
            val expiries = MutableSharedFlow<Unit>()
            val scope2 = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
            val second = launchStore(scope2, expiries)
            second.enterMain()
            second.startIfNeeded()
            assertEquals(SortMode.Title, second.collection(pr)!!.sort)
            assertEquals(CollectionLayout.List, second.collection(pr)!!.layout)
            assertEquals(setOf("T1E2"), second.userTitles[yhlq]!!.watchedEpisodes)
            assertEquals(listOf("bad bunny"), second.recentSearches)

            // A 401: back to the entrance and the disk forgets it all.
            launch { expiries.emit(Unit) }
            runCurrent()
            second.disk {}.join()
            val left = prefs.load()
            assertTrue(left.collections.isEmpty())
            assertTrue(left.watchedEpisodes.isEmpty())
            assertTrue(left.recentSearches.isEmpty())
            scope2.cancel()
        } finally {
            ioScope.cancel()
            dir.deleteRecursively()
        }
    }
}
