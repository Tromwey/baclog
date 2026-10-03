package com.tromwey.kura.state

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.tromwey.kura.data.InMemoryTokenStore
import com.tromwey.kura.data.LocalPrefs
import com.tromwey.kura.data.PendingRevokes
import com.tromwey.kura.data.Session
import com.tromwey.kura.data.api.KuraApi
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.data.api.MePatch
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.BlockedAccount
import com.tromwey.kura.data.models.CollectionDetail
import com.tromwey.kura.data.models.DeviceSession
import com.tromwey.kura.data.models.DiscoverCreatorsPayload
import com.tromwey.kura.data.models.DiscoverFormatPayload
import com.tromwey.kura.data.models.DiscoverPayload
import com.tromwey.kura.data.models.ExternalRef
import com.tromwey.kura.data.models.FanOrder
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FollowListsVisibility
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.KNotification
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.PeopleMark
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.PersonCollection
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.PublicLinks
import com.tromwey.kura.data.models.RecapMonth
import com.tromwey.kura.data.models.RecapPayload
import com.tromwey.kura.data.models.ReportTarget
import com.tromwey.kura.data.models.RequestState
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.SearchResult
import com.tromwey.kura.data.models.SortMode
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.UserTitleState
import com.tromwey.kura.data.models.WelcomeArt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

// Sheets, tabs and pages: which sheet is up, each tab's path, the dock — moved out of AppStore.kt as
// extensions (2026-10-01). Entering the tabs (`enterMain`, `startIfNeeded`) stays with the session's life
// in AppStore.kt.

enum class SheetStyle { Compact, Tall }

/**
 * Every bottom sheet in the app (iOS `SheetRoute`). The screens lane draws them (`KuraSheet`); the store
 * only says which one is up. The party sheets (`PartyWelcome`…`PartyLeave`) are drawn by `features/party` (fase 2).
 */
sealed interface SheetRoute {
    data class NewCollection(val addingTitleId: String?, val movingFrom: String? = null) : SheetRoute
    data class CollectionQuick(val id: String) : SheetRoute
    data class More(val id: String) : SheetRoute
    data class Sort(val id: String) : SheetRoute
    /** O2b Editar: nombre + frase. The case keeps its old iOS name. */
    data class Rename(val id: String) : SheetRoute
    data class Privacy(val id: String) : SheetRoute
    data class Share(val id: String) : SheetRoute
    data class DeleteCollection(val id: String) : SheetRoute
    /** 18c. `collectionId` null = 9b, a title of "no puedo esperar" (Tu reacción · Reseñar only). */
    data class TitleActions(val titleId: String, val collectionId: String?) : SheetRoute
    data class MoveTo(val titleId: String, val fromId: String) : SheetRoute
    data class Complete(val titleId: String, val focusReview: Boolean) : SheetRoute
    data class SaveTo(val titleId: String) : SheetRoute
    data class TitleMore(val titleId: String) : SheetRoute
    data class PersonOptions(val handle: String) : SheetRoute
    data class Report(val target: ReportTarget) : SheetRoute
    /** "¿bloquear a @…?" — what blocking does, then `PUT /me/blocks/{handle}`. */
    data class Block(val handle: String) : SheetRoute
    data object DeleteAccount : SheetRoute
    /** "tu reseña se borra con la reacción." — [mark] (Completo, or none) leaves the title without a
     *  reaction and you have a review of it: Quitar y borrar reseña sends it, Conservar doesn't. */
    data class DropReview(val titleId: String, val mark: Mark?, val preview: Boolean = false) : SheetRoute
    data class AddTitles(val id: String) : SheetRoute
    /** O3b · Reordenar: "Guardar orden" writes it all, closing discards. */
    data class Reorder(val id: String) : SheetRoute
    /** Ajustes › Sesiones activas › "Cerrar sesión" on another device (`+AccountLink`, fase 2). */
    data class RevokeSession(val device: DeviceSession) : SheetRoute
    /** Ajustes › Inicio de sesión › "¿desconectar…?" (`+AccountLink`, fase 2). */
    data class UnlinkIdentity(val provider: IdentityProvider) : SheetRoute
    /** "¿te avisamos?" — Kura's own ask before the system permission prompt. */
    data object NotificationsAsk : SheetRoute
    // Colecciones de fiesta (fase 2: `features/party/PartyScreens.kt`), twins of iOS's party cases.
    /** "ya estás dentro." after joining by the link (`returning`: the account already existed). */
    data class PartyWelcome(val id: String, val returning: Boolean) : SheetRoute
    /** "ya pusiste tus 3." — your songs with Quitar, and Listo. */
    data class PartyCap(val id: String) : SheetRoute
    /** A song's sheet: Quitar de la colección · Quitar y bloquear a @x. */
    data class PartySong(val partyId: String, val titleId: String) : SheetRoute
    /** "invita a la fiesta." — the link, Copiar, Compartir link, Gestionar link. */
    data class PartyShare(val id: String) : SheetRoute
    /** Opciones — the host's: Gestionar link · Llevar a otra app · Editar · Bloqueados · Borrar;
     *  a guest's: Salir de la fiesta. */
    data class PartyOptions(val id: String) : SheetRoute
    /** "el link." — active / desactivado, Crear link nuevo, Desactivar link. */
    data class PartyLink(val id: String) : SheetRoute
    /** "llévala a otra app." — Apple Music · TIDAL ("Próximamente" when the service isn't on). */
    data class PartyExport(val id: String) : SheetRoute
    /** "¿salir ahora?" — closing the export screen while it's passing the songs. */
    data class PartyExportLeave(val id: String) : SheetRoute
    data class PartyEdit(val id: String) : SheetRoute
    data class PartyBlocked(val id: String) : SheetRoute
    data class PartyDelete(val id: String) : SheetRoute
    /** A guest's "¿salir de la fiesta?" (`POST /parties/{id}/leave`). */
    data class PartyLeave(val id: String) : SheetRoute

    val style: SheetStyle get() = if (this is AddTitles) SheetStyle.Tall else SheetStyle.Compact
    val showsGrabber: Boolean get() = this !is DeleteCollection
    /** Opened by holding something (18c on a title, 9a on a fan): it rises in place instead of sliding up. */
    val isHold: Boolean get() = this is TitleActions || this is CollectionQuick
}


// MARK: Sheets & navigation

/** A new sheet never inherits the lock of the one it replaces. */
fun AppStore.present(route: SheetRoute) {
    sheetLocked = false
    sheet = route
}

/** Any close (a button, the write that finished, a sign-out) also drops the lock. */
fun AppStore.dismissSheet() {
    sheetLocked = false
    sheet = null
}

/** Scrim tap / handle drag / TalkBack back: ignored while the sheet is mid-write. False = it stays. */
fun AppStore.dismissSheetInteractively(): Boolean {
    if (sheetLocked) return false
    dismissSheet()
    return true
}

fun AppStore.path(tab: Tab): List<Route> = s.paths[tab] ?: emptyList()

/** The dock STAYS on a collection, a title, a person and their seguidores; it hides on the other
 *  pushes (ajustes, recap, avisos…) and while Descubrir is searching. */
fun AppStore.dockVisible(tab: Tab): Boolean {
    val top = path(tab).lastOrNull() ?: return !(dockHidden && tab == Tab.Discover)
    return top.keepsDock
}

fun AppStore.push(route: Route) {
    s.paths = s.paths + (tab to path(tab) + route)
}

fun AppStore.pop() {
    s.paths = s.paths + (tab to path(tab).dropLast(1))
}

/** The dock: tapping the active tab pops to root and closes a hero open over it. */
fun AppStore.select(newTab: Tab) {
    if (newTab == tab) {
        s.paths = s.paths + (newTab to emptyList())
        s.heroResets = s.heroResets + (newTab to (s.heroResets[newTab] ?: 0) + 1)
    }
    tab = newTab
}
