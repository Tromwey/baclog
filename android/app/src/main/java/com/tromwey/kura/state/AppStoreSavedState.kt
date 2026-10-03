package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

// Surviving a process death. The store lives for the PROCESS (`KuraApp.store`), so a recreated activity
// finds everything where it was — but when Android kills the app in the background and the person comes
// back from Recents, a new store boots at the root of Colecciones. `MainActivity` saves this snapshot in
// `onSaveInstanceState` and hands it back in `onCreate`; the store applies it once the SAME account is
// back in the tabs: the tab, each tab's pages, and review text typed but not published.
// Sheets are not restored (their writes are mid-flight state); a review's draft waits in its sheet.

/** What goes into the activity's saved state. Small on purpose (the Binder limit is shared). */
@Serializable
internal data class SavedState(
    /** The session it belongs to (`mobile_session.id`): another account never inherits it. */
    val sid: String,
    val tab: Tab,
    val paths: Map<Tab, List<Route>> = emptyMap(),
    val reviewDrafts: Map<String, String> = emptyMap(),
)

private val savedStateJson = Json { ignoreUnknownKeys = true }

/** Pages deeper than this aren't worth a Binder transaction; the newest ones stay. */
private const val MAX_SAVED_ROUTES = 12
private const val MAX_SAVED_DRAFTS = 5

/** `MainActivity.onSaveInstanceState`. null = nothing worth saving (signed out, still booting). */
fun AppStore.savedState(): String? {
    if (phase != AppPhase.Main) return null
    val sid = session.sid ?: return null
    val state = SavedState(
        sid = sid,
        tab = tab,
        paths = s.paths.filterValues { it.isNotEmpty() }.mapValues { (_, routes) -> routes.takeLast(MAX_SAVED_ROUTES) },
        reviewDrafts = s.reviewDrafts.entries.toList().takeLast(MAX_SAVED_DRAFTS).associate { it.key to it.value },
    )
    return try {
        savedStateJson.encodeToString(SavedState.serializer(), state)
    } catch (e: SerializationException) {
        KuraLog.w("KuraStore", "estado guardado: ${e.javaClass.simpleName}")
        null
    }
}

/**
 * `MainActivity.onCreate` with a saved state. Only a store that hasn't started yet takes it (a process
 * death): a recreated activity over a live store already has the real thing.
 */
fun AppStore.restoreSavedState(raw: String?) {
    raw ?: return
    if (phase != AppPhase.Splash || didBootstrap) return
    restoredState = try {
        savedStateJson.decodeFromString(SavedState.serializer(), raw)
    } catch (_: IllegalArgumentException) { // SerializationException included: a build that changed a Route
        null
    }
}

/** The saved state, when it belongs to the session that's entering. */
private fun AppStore.restoredForThisSession(): SavedState? = restoredState?.takeIf { it.sid == session.sid }

/** `enterMain`: the tab the person was on (so the tabs open there, not on Colecciones and then jump). */
internal fun AppStore.restoredTab(): Tab? = restoredForThisSession()?.tab

/**
 * `startIfNeeded`, after the library read: the pages come back — up to the first one that can't (a
 * collection that no longer exists or was still a local id, a step of Fusionar whose proof lived in
 * memory). Consumed once; another account, or a person who already navigated, drops it.
 */
internal fun AppStore.applyRestoredState() {
    val r = restoredForThisSession()
    restoredState = null
    r ?: return
    if (phase != AppPhase.Main) return
    s.reviewDrafts = r.reviewDrafts
    if (s.paths.values.any { it.isNotEmpty() }) return
    s.paths = r.paths.mapValues { (_, routes) -> routes.takeWhile(::canRestore) }.filterValues { it.isNotEmpty() }
    tab = r.tab
}

private fun AppStore.canRestore(route: Route): Boolean = when (route) {
    is Route.Collection -> collection(route.id) != null
    Route.MergeAccount, Route.MergeCode, Route.MergeConfirm -> false
    is Route.PartySearch -> false
    else -> true
}

// MARK: Review drafts

/** The text the Completar sheet opens with: what was typed and not published, else null. */
fun AppStore.reviewDraft(titleId: String): String? = s.reviewDrafts[titleId]

/** Every keystroke of the review field. Text equal to what's published (or empty with nothing published) is no draft. */
fun AppStore.setReviewDraft(titleId: String, text: String) {
    val published = myReview(titleId)?.text.orEmpty()
    s.reviewDrafts = if (text.trim() == published.trim()) s.reviewDrafts - titleId else s.reviewDrafts - titleId + (titleId to text)
}

/** Published or deleted: nothing left to keep. */
internal fun AppStore.clearReviewDraft(titleId: String) {
    if (titleId in s.reviewDrafts) s.reviewDrafts = s.reviewDrafts - titleId
}
