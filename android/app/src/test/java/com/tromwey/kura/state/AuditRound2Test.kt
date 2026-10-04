package com.tromwey.kura.state

import com.tromwey.kura.app.isOpenable
import com.tromwey.kura.data.api.Items
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.FeedPage
import com.tromwey.kura.data.models.KuraJson
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.Title
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** The fixes of the second audit cycle (2026-10-01): the feed's next page, `onboarding_required` in one
 *  place, the OTP's three 429s, emptied lists, timeouts, old accounts, a format page that failed. */
@OptIn(ExperimentalCoroutinesApi::class)
class AuditRound2Test {

    // MARK: 1 · The feed's next page

    /** What the feed's tail effect did before the fix: it called `loadMoreFeed` inside an effect keyed
     *  by `feedLoading`, so the caller was cancelled as soon as the read began. A cancelled call must
     *  leave the feed able to go on, and the call the screen makes now (on the store's scope) lands. */
    @Test fun aNextPageCancelledByItsCallerDoesNotLeaveTheFeedStuck() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadFeed(force = true)
        advanceUntilIdle()
        val first = store.feedCursor
        assertNotNull(first)
        val before = store.feed.size

        val gate = h.api.hold("feed")
        val caller = launch { store.loadMoreFeed() }
        runCurrent()
        assertTrue(store.feedLoading)
        caller.cancel()
        runCurrent()
        gate.complete(Unit)
        advanceUntilIdle()
        assertFalse("la lectura cancelada soltó el candado", store.feedLoading)
        assertEquals(first, store.feedCursor)
        assertNull(store.loadError(LoadKey.FeedMore))

        // The screen's call: on the store's scope, so nothing the composition does can cancel it.
        store.launch { store.loadMoreFeed() }
        advanceUntilIdle()
        assertFalse(store.feedLoading)
        assertTrue("la página 2 llegó", store.feed.size > before)
        assertTrue(store.feedCursor != first)
    }

    // MARK: 2 · onboarding_required, one handler

    @Test fun aWriteRefusedForOnboardingRevertsWithoutRetryAndRoutesByMe() = storeTest { h ->
        signedIn(h)
        val store = h.store
        store.loadPerson("nueva")
        // The account the server sees: its name is there, its year isn't.
        h.api.me = h.api.me.copy(onboarded = false)
        h.api.failNext("setFollowing", KuraApiError.Forbidden("onboarding_required", "Termina tu perfil para seguir a alguien."))
        val meCalls = h.api.callsOf("me").size
        store.toggleFollow("nueva")
        runCurrent() // not `advanceUntilIdle`: that would run past the toast's own window

        assertFalse("revertido", store.isFollowing("nueva"))
        assertEquals("un aviso, nunca un Reintentar", ToastModel.Kind.Info, store.toast?.kind)
        assertEquals("Termina tu perfil para seguir a alguien", store.toast?.text)
        assertEquals(meCalls + 1, h.api.callsOf("me").size)
        assertEquals(AppPhase.Onboarding, store.phase)
        assertEquals(OnboardingStep.Username, store.onboardingStep)
    }

    @Test fun aReportRefusedForOnboardingOffersNoRetry() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.failNext("reportPerson", KuraApiError.Forbidden("onboarding_required"))
        assertFalse(store.report(com.tromwey.kura.data.models.ReportTarget.PersonTarget("nueva"), "spam"))
        assertEquals(ToastModel.Kind.Info, store.toast?.kind)
        assertEquals(ONBOARDING_REQUIRED_NOTE, store.toast?.text)
        advanceUntilIdle()
        // `GET /me` says the account is whole: nothing moves.
        assertEquals(AppPhase.Main, store.phase)
    }

    // MARK: 3 · The OTP's 429s

    @Test fun anHourlyCapNeverClaimsACodeAndShowsTheRealWait() {
        val clock = Instant.parse("2026-10-01T18:00:00Z")
        storeTest(clock = { clock }) { h ->
            val store = h.store
            h.api.hasSession = false
            h.api.failNext("requestCode", KuraApiError.RateLimited(2400, "hourly_cap"))
            assertFalse(store.requestCode("qa@baclog.dev"))
            assertFalse(store.codeAlreadySent)
            assertTrue(store.authError!!.contains("40 minutos"))

            // No `reason` and a wait longer than the cooldown: same thing.
            h.api.failNext("requestCode", KuraApiError.RateLimited(900))
            assertFalse(store.requestCode("qa@baclog.dev"))
            assertFalse(store.codeAlreadySent)
            assertTrue(store.authError!!.contains("15 minutos"))

            // `cooldown`: the code sent before still works.
            h.api.failNext("requestCode", KuraApiError.RateLimited(42, "cooldown"))
            assertTrue(store.requestCode("qa@baclog.dev"))
            assertTrue(store.codeAlreadySent)
            assertEquals(42, store.codeResendWait())

            // On the code screen, Reenviar hits the cap: the countdown is the real one, not 600 s.
            h.api.failNext("requestCode", KuraApiError.RateLimited(3000, "ip_limit"))
            assertFalse(store.requestCode("qa@baclog.dev"))
            assertFalse(store.codeAlreadySent)
            assertEquals(3000, store.codeResendWait())
        }
    }

    @Test fun aWaitInASentenceReadsInWords() {
        assertEquals("40 segundos", waitWords(40))
        assertEquals("1 minuto", waitWords(60))
        assertEquals("2 minutos", waitWords(61))
        assertEquals("12 minutos", waitWords(700))
    }

    @Test fun aFailedCodeRequestHasItsOwnGenericText() {
        assertEquals("No pudimos enviar el código. Revisa el correo y vuelve a intentarlo.", codeRequestErrorText(KuraApiError.Unavailable))
        assertEquals("No pudimos enviar el código. Revisa el correo y vuelve a intentarlo.", codeRequestErrorText(null))
        assertEquals("Sin conexión. Revisa tu red y vuelve a intentarlo.", codeRequestErrorText(KuraApiError.Offline))
        // The generic fallback everywhere else is untouched.
        assertEquals("No se pudo entrar. Vuelve a intentarlo.", KuraApiError.Unavailable.authText)
    }

    @Test fun aWaitReadsInMinutesPastAMinuteAndAHalf() {
        assertEquals("45 s", waitText(45))
        assertEquals("90 s", waitText(90))
        assertEquals("2 min", waitText(91))
        assertEquals("40 min", waitText(2400))
    }

    // MARK: 4 · A page where nothing could be read

    @Test fun aPageEmptiedByDecodingIsAContractErrorNotAnEmptyPage() {
        assertThrows(SerializationException::class.java) {
            KuraJson.json.decodeFromString(
                FeedPage.serializer(),
                """{"items":[{"id":"e1","kind":"listened","at":"2026-09-29T00:00:00Z"},{"id":"e2","kind":"danced","at":"2026-09-29T00:00:00Z"}],"nextCursor":"c2"}""",
            )
        }
        assertThrows(SerializationException::class.java) {
            KuraJson.json.decodeFromString(Items(Title.serializer()),
                """[{"id":"t2","name":"b","format":"podcast","palette":[]},{"id":"t3","name":"c","format":"radio","palette":[]}]""")
        }
        // An empty page is still an empty page.
        assertTrue(KuraJson.json.decodeFromString(FeedPage.serializer(), """{"items":[],"nextCursor":null}""").items.isEmpty())
    }

    // MARK: 6 · A timeout is not a lost network

    @Test fun aTimeoutDoesNotTurnTheNextCapabilitiesCallbackIntoAReconnection() = storeTest { h ->
        signedIn(h)
        val store = h.store
        h.api.lastOfflineTimedOut = true
        h.api.failNext("feed", KuraApiError.Offline)
        store.loadFeed(force = true)
        advanceUntilIdle()
        assertTrue(store.pathSatisfied)

        h.api.lastOfflineTimedOut = false
        h.api.failNext("feed", KuraApiError.Offline)
        store.loadFeed(force = true)
        advanceUntilIdle()
        assertFalse(store.pathSatisfied)
    }

    // MARK: 7 · An account from before the year

    @Test fun anOldAccountThatOnlyOwedItsYearGoesStraightToTheTabs() = storeTest { h ->
        val store = h.store
        val old = h.api.me.copy(name = "Eric Briseño", onboarded = false)
        h.api.me = old
        store.applyMe(old)
        assertFalse(store.route(old))
        assertTrue(store.submitUsername(old.handle!!, "Eric Briseño", "1990-05-17"))
        assertEquals("el nombre va como lo escribió", "completeOnboarding Eric Briseño 1990-05-17", h.api.callsOf("completeOnboarding").single())
        assertEquals(AppPhase.Main, store.phase)
        assertTrue(h.api.callsOf("onboardingGrid").isEmpty())
    }

    // MARK: 9 · Links out of the app

    @Test fun onlyHttpsOpensAndHttpOnlyToTheDevOriginInDebug() {
        assertTrue(isOpenable("https", "get-kura.app", -1, debug = false, apiOrigin = null))
        assertFalse(isOpenable("http", "get-kura.app", -1, debug = false, apiOrigin = "http://10.0.2.2:3010"))
        assertTrue(isOpenable("http", "10.0.2.2", 3010, debug = true, apiOrigin = "http://10.0.2.2:3010"))
        assertFalse(isOpenable("http", "10.0.2.2", 3010, debug = false, apiOrigin = "http://10.0.2.2:3010"))
        assertFalse(isOpenable("http", "evil.example", 3010, debug = true, apiOrigin = "http://10.0.2.2:3010"))
        assertFalse(isOpenable("http", "10.0.2.2", 80, debug = true, apiOrigin = "http://10.0.2.2:3010"))
        assertFalse(isOpenable("intent", "x", -1, debug = true, apiOrigin = "http://10.0.2.2:3010"))
        assertFalse(isOpenable("https", null, -1, debug = true, apiOrigin = null))
    }

    // MARK: 11 · What the split of AppStore.kt had to open

    /** `internal` is the whole app (one module): the store's plumbing that went from `private` to
     *  `internal` when AppStore.kt was split must stay out of the screens. */
    @Test fun noScreenTouchesTheStoresPlumbing() {
        // Gradle runs the tests from the module (`app/`); an IDE or another runner may start anywhere
        // in the repo: the sources are looked for from the working directory upwards.
        val tail = "src/main/java/com/tromwey/kura"
        val root = generateSequence(java.io.File("").absoluteFile) { it.parentFile }
            .flatMap { d -> sequenceOf(java.io.File(d, tail), java.io.File(d, "app/$tail"), java.io.File(d, "android/app/$tail")) }
            .firstOrNull { it.isDirectory }
        assertNotNull("no se encontraron las fuentes desde ${java.io.File("").absolutePath}", root)
        root!!
        val names = "toastJob|pathSatisfied|revertOnly|onboardingRecheck|restoredState|saveJob|paletteSendQueue|didBootstrap|authProvidersStale"
        // Through the store (`store.s.`, `x.toastJob`), and the write queue's own names in ANY form.
        val plumbing = Regex("""\.($names)\b|\bstore\.s\.|\bstore\.toast\s*=[^=]|\b(pendingRetries|writeChains|settleRetry|resendPendingRetries)\b""")
        // Where `this` is the store — `with(store) { s.… }`, `store.run { … }`, or an extension
        // `fun AppStore.x()` declared outside `state/` — the same plumbing is reachable bare.
        val scoped = Regex("""\bwith\s*\(\s*store\s*\)|\bstore\.(run|apply)\s*\{|\b(fun|val|var)\s+(<[^>]+>\s*)?AppStore\.""")
        val bare = Regex("""(?<![\w.])s\.\w|(?<![\w.])($names)\b|(?<![\w.])toast\s*=[^=]""")
        val hits = listOf("features", "app", "designsystem", "push").flatMap { dir ->
            java.io.File(root, dir).walkTopDown().filter { it.extension == "kt" }.flatMap { f ->
                val lines = f.readLines()
                val storeIsThis = lines.any { scoped.containsMatchIn(it) }
                lines.mapIndexedNotNull { i, line ->
                    val code = line.substringBefore("//")
                    if (plumbing.containsMatchIn(code) || (storeIsThis && bare.containsMatchIn(code))) "${f.name}:${i + 1}" else null
                }
            }.toList()
        }
        assertEquals(emptyList<String>(), hits)
    }

    // MARK: 10 · A format page whose first read failed

    @Test fun aFormatPageThatFailedIsNotCachedAsAnEmptyShelf() = storeTest { h ->
        signedIn(h)
        val store = h.store
        val key = AppStore.formatKey(MediaFormat.Film, 1)
        h.api.failNext("discoverFormat", KuraApiError.Unavailable)
        store.loadDiscoverFormat(MediaFormat.Film, 1)
        assertNull("un 503 no es un estante vacío", store.discoverFormats[key])
        assertEquals(KuraApiError.Unavailable, store.loadError(LoadKey.DiscoverFormat(MediaFormat.Film, 1)))

        // Reintentar (or coming back to the page) asks again.
        store.loadDiscoverFormat(MediaFormat.Film, 1)
        assertTrue(store.discoverFormats[key]!!.titles.isNotEmpty())
        assertNull(store.loadError(LoadKey.DiscoverFormat(MediaFormat.Film, 1)))
    }
}
