package com.tromwey.kura.state

import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.Session
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import java.time.Instant

/** The fixed clock of every store test: 2026-09-29, noon in Mexico City. */
val FIXED_NOW: Instant = Instant.parse("2026-09-29T18:00:00Z")

/** One store over a `FakeKuraApi`, on the test's virtual clock (`advanceTimeBy` drives the Deshacer window). */
class StoreHarness(
    val api: FakeKuraApi,
    val store: AppStore,
    val expiries: MutableSharedFlow<Unit>,
    val platform: InMemoryStorePlatform,
)

fun storeTest(
    api: FakeKuraApi = FakeKuraApi(),
    platform: InMemoryStorePlatform = InMemoryStorePlatform(),
    clock: () -> Instant = { FIXED_NOW },
    body: suspend TestScope.(StoreHarness) -> Unit,
) = runTest {
    // Its own supervisor scope on the test scheduler: foreground work that `advanceUntilIdle` runs, and
    // cancelled at the end (the `expiries` collector never finishes on its own).
    val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
    val expiries = MutableSharedFlow<Unit>()
    val store = AppStore(
        api = api,
        session = Session(InMemoryTokenStore("token")),
        prefs = LocalPrefs.disabled,
        clock = clock,
        scope = scope,
        platform = platform,
        expiries = expiries,
    )
    try {
        body(StoreHarness(api, store, expiries, platform))
    } finally {
        scope.cancel()
    }
}

/** Signed in with the fixtures' account, the tabs up and the library loaded. */
suspend fun TestScope.signedIn(h: StoreHarness) {
    h.store.enterMain()
    h.store.startIfNeeded()
    testScheduler.runCurrent()
}
