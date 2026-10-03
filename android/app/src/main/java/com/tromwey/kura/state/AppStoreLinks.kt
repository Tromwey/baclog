package com.tromwey.kura.state

import com.tromwey.kura.app.DeepLink
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import java.time.Duration
import java.time.Instant

// App Links + notice taps → a screen (iOS `App/DeepLinks.swift`, `AppStore.openWebLink`/`open(_:)`/
// `openPendingLink`). `MainActivity` calls `openWebLink` (intent data) and `openPushTarget` (the notice's
// `PushIntent.target`); `KuraRoot` calls `openPendingLink` once the tabs are up and the library read landed.
// Party invites belong to AppStoreParties.kt (`inviteLanding`, `openInvite`, `pendingInvite`): this file only
// routes to them.

/**
 * A link that arrived before the tabs were up (cold start, signed out, the splash): opened by
 * [openPendingLink] once they are — after a sign-in too, which is the point. One per process (the store is
 * one per process too, `KuraApp.store`), kept for an hour like iOS. Memory only: a process death while the
 * person fetches the code from Mail drops it (a party invite does survive that: `pendingInvite` + the landing).
 */
internal object DeepLinkInbox {
    val ttl: Duration = Duration.ofHours(1)
    private var saved: Pair<DeepLink, Instant>? = null

    fun put(link: DeepLink?, now: Instant) {
        saved = link?.let { it to now }
    }

    fun take(now: Instant): DeepLink? {
        val (link, at) = saved ?: return null
        saved = null
        return link.takeIf { Duration.between(at, now) < ttl }
    }

    fun peek(): DeepLink? = saved?.first

    /** Tests: one store after another in the same JVM. */
    fun reset() {
        saved = null
    }
}

/** The tabs are up and the library read landed (iOS `phase == .main, didBootstrap, loadState != .loading`). */
val AppStore.linksReady: Boolean
    get() = phase == AppPhase.Main && didBootstrap && loadState != LoadState.Loading

/** What's waiting in the inbox (debug / tests). */
val AppStore.pendingLink: DeepLink? get() = DeepLinkInbox.peek()

/**
 * `MainActivity`'s intent data. True = the app took it (opened, queued, or the invite landing); false =
 * it isn't a shape the app opens — if it's our own site (`DeepLink.isOurs`) the caller hands it back to
 * the browser rather than drop the tap (Android < 15 sends every path of the host; see the manifest).
 */
fun AppStore.openWebLink(url: String?, debug: Boolean = false): Boolean {
    val link = DeepLink.parse(url, debug) ?: return false
    openLink(link)
    return true
}

/** A tapped notice (`PushIntent.target`: `title:<id>` | `person:<handle>`). False = not a valid target. */
fun AppStore.openPushTarget(raw: String?): Boolean {
    val link = DeepLink.pushTarget(raw) ?: return false
    openLink(link)
    return true
}

/** iOS `open(_ link:)`: now if the tabs are up, else it waits for them. */
fun AppStore.openLink(link: DeepLink) {
    when (link) {
        // The entrance itself: signed out it's already on screen (the splash routes there); what matters is
        // `?to=`, which waits for the session like any other link.
        is DeepLink.Entrance -> {
            link.next?.let(::openLink)
            return
        }
        // A party invite ALWAYS opens the landing (founder, 2026-10-01): signed out it's the public preview
        // + "Entra a kura…"; signed in it's the same preview with "Entrar a la fiesta", and only THAT tap
        // joins (`openInvite`). A link never puts you in a party by itself.
        is DeepLink.Invite -> {
            if (sheet != null && !sheetLocked) dismissSheet()
            inviteLanding = link.token
            return
        }
        else -> Unit
    }
    if (!linksReady) {
        DeepLinkInbox.put(link, now)
        return
    }
    if (sheet != null) dismissSheet()
    val mine = me.handle.lowercase()
    when (link) {
        is DeepLink.TitleLink -> show(Route.TitleRoute(link.id))
        is DeepLink.Profile ->
            if (mine.isNotEmpty() && link.handle == mine) goHome(Tab.Profile) else show(Route.PersonRoute(link.handle))
        is DeepLink.CollectionLink ->
            // A link to one of YOUR collections opens your collection (editable), not the public view.
            if (mine.isNotEmpty() && link.handle == mine && collection(link.id) != null) openOwnCollection(link.id)
            else show(Route.PublicCollection(link.handle, link.id))
        is DeepLink.OwnCollection ->
            if (collection(link.id) != null) openOwnCollection(link.id)
            else showToast(ToastModel("Esa colección ya no existe", ToastModel.Kind.Info))
        DeepLink.Recap -> show(Route.Recap())
        is DeepLink.Party -> show(Route.PartyRoute(link.id))
        is DeepLink.Invite, is DeepLink.Entrance -> Unit // handled above
    }
}

/** Once the tabs are up (`KuraRoot`): the link that waited, then the invite that waited (AppStoreParties). */
suspend fun AppStore.openPendingLink() {
    if (!linksReady) return
    DeepLinkInbox.take(now)?.let(::openLink)
    openPendingInvite()
}

/** Someone else's page: pushed on the tab you're on (like a notice), so Volver returns to where you were. */
private fun AppStore.show(route: Route) {
    if (path(tab).lastOrNull() != route) push(route)
}

private fun AppStore.goHome(t: Tab) {
    if (tab == t) s.heroResets = s.heroResets + (t to (s.heroResets[t] ?: 0) + 1)
    paths = paths + (t to emptyList())
    tab = t
}

private fun AppStore.openOwnCollection(id: String) {
    if (tab == Tab.Collections) s.heroResets = s.heroResets + (Tab.Collections to (s.heroResets[Tab.Collections] ?: 0) + 1)
    paths = paths + (Tab.Collections to listOf(Route.Collection(id)))
    tab = Tab.Collections
}
