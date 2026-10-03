package com.tromwey.kura.state

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.tromwey.kura.data.api.Change
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.InvitePreview
import com.tromwey.kura.data.models.MusicServices
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyCard
import com.tromwey.kura.data.models.PartyCopy
import com.tromwey.kura.data.models.PartyExportFlow
import com.tromwey.kura.data.models.PartyJoin
import com.tromwey.kura.data.models.PartySong
import com.tromwey.kura.data.models.PartySongHit
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.data.models.atOrSomeone
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.time.Duration.Companion.milliseconds

// Colecciones de fiesta — twin of `ios/Kura/State/AppStore+Parties.swift`
// (`.claude/knowledge/state/fiesta-contract.md`, design `fiesta-app-v2`).
//
// A party is NOT a `KCollection`: it lives in its own per-account maps (`SessionData.party`) and its
// writes are AWAITED, not optimistic — the server decides every rule (tope, duplicado, bloqueo, solo
// ver) and answers with the whole `Party`, which replaces ours. That keeps "Pusiste 2 de 3" honest
// when two guests add at the same time.
//
// The server answers `503 unavailable` to all of it while `MIGRATION_0033_LIVE` is off: reads
// remember it (`partiesUnavailable`: the list shows none, a party page and a link say "las fiestas
// llegan muy pronto."), writes say it in a toast. Nothing crashes, nothing retries in a loop.

/** The per-account party + export state (lives in `SessionData`, so every way out of a session drops it). */
internal class PartySession {
    var parties by mutableStateOf<Map<String, Party>>(emptyMap())
    /** `GET /parties`; null = not asked yet. */
    var cards by mutableStateOf<List<PartyCard>?>(null)
    var unavailable by mutableStateOf(false)
    var missing by mutableStateOf<Set<String>>(emptySet())
    var invites by mutableStateOf<Map<String, InvitePreview>>(emptyMap())
    var deadInvites by mutableStateOf<Set<String>>(emptySet())

    // "Llévala a otra app" (AppStoreMusicExport.kt)
    var musicServices by mutableStateOf<MusicServices?>(null)
    var musicServicesError by mutableStateOf<KuraApiError?>(null)
    var export by mutableStateOf<PartyExportFlow?>(null)
    /** The export's running steps (TIDAL's loop) or the connect call. */
    var exportJob: Job? = null
    /** A TIDAL consent is out in the browser (Auth Tab / Custom Tab): the one moment a
     *  `kura://music/tidal/…` callback is accepted. */
    var tidalInFlight = false
}

private const val TAG = "KuraParty"

// MARK: Lookups

fun AppStore.party(id: String): Party? = s.party.parties[id]
val AppStore.partyCards: List<PartyCard> get() = s.party.cards ?: emptyList()
/** `GET /parties` answered at least once (the carousel doesn't guess "no parties" before). */
val AppStore.partiesLoaded: Boolean get() = s.party.cards != null
val AppStore.partiesUnavailable: Boolean get() = s.party.unavailable
fun AppStore.invite(token: String): InvitePreview? = s.party.invites[token]
fun AppStore.inviteIsDead(token: String): Boolean = token in s.party.deadInvites
fun AppStore.partyIsMissing(id: String): Boolean = id in s.party.missing

/** The party a party sheet is about (null for every other sheet). */
val SheetRoute.partyId: String?
    get() = when (this) {
        is SheetRoute.PartyWelcome -> id
        is SheetRoute.PartyCap -> id
        is SheetRoute.PartySong -> partyId
        is SheetRoute.PartyShare -> id
        is SheetRoute.PartyOptions -> id
        is SheetRoute.PartyLink -> id
        is SheetRoute.PartyExport -> id
        is SheetRoute.PartyExportLeave -> id
        is SheetRoute.PartyEdit -> id
        is SheetRoute.PartyBlocked -> id
        is SheetRoute.PartyDelete -> id
        is SheetRoute.PartyLeave -> id
        else -> null
    }

// MARK: Reads

/**
 * `GET /parties` — the parties in Tus colecciones. A 503 is the feature not being there yet: silent,
 * no parties. Anything else is a real failure: `loadError(Parties)` puts a Reintentar strip on the
 * carousel (the parties already listed stay), and it's logged — a contract change must not look like
 * "you have no parties".
 */
suspend fun AppStore.loadParties(force: Boolean = false) {
    if (!force && s.party.cards != null) return
    val session = s
    try {
        val cards = api.parties()
        check(session)
        loaded(LoadKey.Parties)
        s.party.unavailable = false
        s.party.cards = cards
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session || err is AppStore.StaleSession) return
        when (val e = fail(LoadKey.Parties, err)) {
            KuraApiError.Unavailable -> {
                setLoadError(LoadKey.Parties, null)
                s.party.unavailable = true
                s.party.cards = emptyList()
            }
            null, KuraApiError.Unauthorized -> Unit
            else -> logError("GET /parties failed: $e")
        }
    }
}

suspend fun AppStore.loadParty(id: String, force: Boolean = false) {
    if (!force && s.party.parties[id] != null) return
    val session = s
    try {
        val p = api.party(id)
        check(session)
        loaded(LoadKey.PartyKey(id))
        s.party.unavailable = false
        s.party.missing = s.party.missing - id
        applyParty(p)
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session || err is AppStore.StaleSession) return
        when (fail(LoadKey.PartyKey(id), err)) {
            KuraApiError.NotFound -> {
                // Deleted, you left, or a block with the host (the server never says which). One we
                // had on screen or in the list: out of every tab + "Esa fiesta ya no está disponible." and the
                // list re-read. One we never had (a link to someone else's): the page says so.
                val known = s.party.parties[id] != null || s.party.cards?.any { it.id == id } == true
                s.party.missing = s.party.missing + id
                if (known) partyGone(id)
            }
            KuraApiError.Unavailable -> s.party.unavailable = true
            else -> Unit
        }
    }
}

/** A party that isn't there for you any more: off the maps, the list and every tab, and `GET /parties` again. */
private fun AppStore.partyGone(id: String, toast: String? = PartyCopy.GONE) {
    dropParty(id)
    toast?.let { showToast(ToastModel(it, ToastModel.Kind.Info)) }
    scope.launch { loadParties(force = true) }
}

/** Forget a party locally (deleted, left, gone) and pop it from every tab. */
internal fun AppStore.dropParty(id: String) {
    s.party.parties = s.party.parties - id
    s.party.cards = s.party.cards?.filterNot { it.id == id }
    if (sheet?.partyId == id) dismissSheet()
    if (s.party.export?.partyId == id) closePartyExport(force = true)
    paths = paths.mapValues { (_, list) -> list.filterNot { it == Route.PartyRoute(id) || it == Route.PartySearch(id) } }
}

/** `GET /invites/{token}` (the landing, signed in or out). */
suspend fun AppStore.loadInvite(token: String, force: Boolean = false) {
    if (!force && (s.party.invites[token] != null || token in s.party.deadInvites)) return
    val session = s
    try {
        val p = api.invitePreview(token)
        check(session)
        loaded(LoadKey.Invite(token))
        s.party.unavailable = false
        s.party.deadInvites = s.party.deadInvites - token
        s.party.invites = s.party.invites + (token to p)
        fillSongPalettes(p.party.id, p.party.songs, member = false)
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session || err is AppStore.StaleSession) return
        when (fail(LoadKey.Invite(token), err)) {
            KuraApiError.NotFound -> {
                s.party.deadInvites = s.party.deadInvites + token
                s.party.invites = s.party.invites - token
            }
            // 503 = the server has no parties yet: "las fiestas llegan muy pronto.", and the token is
            // NOT dead — the same link works once they're on.
            KuraApiError.Unavailable -> {
                setLoadError(LoadKey.Invite(token), null)
                s.party.unavailable = true
                s.party.deadInvites = s.party.deadInvites - token
            }
            else -> Unit
        }
    }
}

/** The server's `Party` replaces ours; the list card follows (count, covers, palette). */
fun AppStore.applyParty(p: Party) {
    s.party.parties = s.party.parties + (p.id to p)
    val people = p.songs.mapNotNull { it.addedBy?.handle }.toSet().size + (if (p.songs.any { it.addedBy == null }) 1 else 0)
    val card = PartyCard(
        id = p.id, name = p.name, role = p.viewer.role, perGuestLimit = p.perGuestLimit,
        songCount = p.songs.size, peopleCount = people, host = p.host,
        artworkUrls = p.songs.take(3).map { it.artworkUrl }, palette = p.tint, updatedAt = now,
    )
    val cards = s.party.cards.orEmpty()
    val i = cards.indexOfFirst { it.id == p.id }
    s.party.cards = if (i >= 0) cards.toMutableList().also { it[i] = card } else listOf(card) + cards
    fillSongPalettes(p.id, p.songs, member = true)
}

// MARK: Palettes (the page tint needs the first covers' colours)

/**
 * The first covers without a palette are extracted on-device (`CoverPalette`, the same algorithm as
 * iOS/web) and sent to `PUT /parties/{id}/songs/{titleId}/palette` — a song has no
 * `/titles/{id}/palette`. Only the first three matter to the tint and the fan; the rest wait for
 * whoever draws them first. The preview (anonymous-capable) extracts but never writes.
 */
private fun AppStore.fillSongPalettes(partyId: String, songs: List<PartySong>, member: Boolean) {
    for (song in songs.take(3)) {
        if (song.palette.isNotEmpty()) continue
        val url = song.artworkUrl ?: continue
        if (!paletteAttempts.add(PartySong.ART_PREFIX + song.titleId)) continue
        val session = s
        scope.launch {
            val hexes = try {
                platform.extractPalette(url)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                emptyList()
            }
            if (hexes.isEmpty() || s !== session) return@launch
            setSongPalette(song.titleId, hexes)
            if (!member) return@launch
            try {
                api.fillPartySongPalette(partyId, song.titleId, hexes)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                // Only costs the next viewer an extraction; logged, never shown.
                logError("song palette PUT failed: ${e.javaClass.simpleName}")
            }
        }
    }
}

private fun AppStore.setSongPalette(titleId: String, hexes: List<String>) {
    val parties = s.party.parties.mapValues { (_, p) ->
        if (p.songs.none { it.titleId == titleId && it.palette.isEmpty() }) p
        else p.copy(songs = p.songs.map { if (it.titleId == titleId && it.palette.isEmpty()) it.copy(palette = hexes) else it })
    }
    s.party.parties = parties
    s.party.cards = s.party.cards?.map { c -> if (c.palette.isEmpty()) parties[c.id]?.let { c.copy(palette = it.tint) } ?: c else c }
    s.party.invites = s.party.invites.mapValues { (_, v) ->
        if (v.party.songs.none { it.titleId == titleId && it.palette.isEmpty() }) v
        else v.copy(party = v.party.copy(songs = v.party.songs.map { if (it.titleId == titleId && it.palette.isEmpty()) it.copy(palette = hexes) else it }))
    }
}

// MARK: Writes

/** The toast for a party write that failed (the server's `message` when it wrote the copy). */
fun partyText(e: KuraApiError, fallback: String = e.toast): String = when {
    e == KuraApiError.Unavailable -> PartyCopy.UNAVAILABLE
    // The server writes the copy of every 409 (`duplicate_*`, `too_many_parties`, `conflict`…).
    e is KuraApiError.Conflict && e.message.isNotEmpty() -> e.message
    e is KuraApiError.Conflict && e.code == "too_many_parties" -> PartyCopy.TOO_MANY_PARTIES
    e is KuraApiError.RateLimited -> PartyCopy.ROTATE_LIMITED
    e is KuraApiError.Forbidden -> when (e.code) {
        "blocked" -> "Ya no puedes agregar canciones a esta fiesta."
        "view_only" -> "En esta fiesta solo se puede ver la colección."
        "not_yours" -> "Solo puedes quitar las canciones que agregaste tú."
        else -> "No tienes permiso para hacer eso."
    }
    e == KuraApiError.NotFound -> "No encontramos esa fiesta. Puede que ya no exista o que no seas parte de ella."
    // A code this build doesn't know: the server's own `message` (never "HTTP 500").
    e is KuraApiError.Server && e.detail.isNotEmpty() && !e.detail.startsWith("HTTP ") && !e.detail.contains("Exception") -> e.detail
    // What this write was, when the error has no words of its own (the network's keep theirs).
    else -> e.toast(fallback)
}

private fun AppStore.partyToast(e: KuraApiError, fallback: String = e.toast) {
    if (e == KuraApiError.Unauthorized) return
    // Crear / renombrar con la cuenta a medias: the one handler (toast + `GET /me` + `route`).
    if (onboardingRequired(e)) return
    showToast(ToastModel(partyText(e, fallback), ToastModel.Kind.Info))
}

/**
 * A party write that failed. A 404 is "not there for you": re-read the party, which pops it (with
 * "Esa fiesta ya no está disponible.") when it's really gone; when the party is still there the 404 was about
 * the song, and [stale] says so. Everything else is the toast.
 */
private suspend fun AppStore.partyWriteFailed(partyId: String, e: KuraApiError, stale: String = "Eso ya no está en la fiesta. La actualizamos.") {
    if (e != KuraApiError.NotFound) {
        partyToast(e)
        return
    }
    loadParty(partyId, force = true)
    if (s.party.parties[partyId] != null) showToast(ToastModel(stale, ToastModel.Kind.Info))
}

/**
 * "Crear fiesta": `POST /parties`, then the party opens with the share sheet up (design `createColl`).
 * False = it wasn't created (the toast said why).
 */
suspend fun AppStore.createParty(name: String, perGuestLimit: Int?): Boolean {
    val n = name.trim()
    if (n.isEmpty()) return false
    return when (val r = boundWrite { api.createParty(n.take(60), perGuestLimit) }) {
        is BoundWrite.Ok -> {
            s.party.unavailable = false
            applyParty(r.value)
            if (sheet != null) dismissSheet()
            push(Route.PartyRoute(r.value.id))
            delay(350.milliseconds)
            present(SheetRoute.PartyShare(r.value.id))
            true
        }
        is BoundWrite.Failed -> {
            val e = r.error
            when {
                onboardingRequired(e) -> Unit
                e is KuraApiError.Invalid ->
                    showToast(ToastModel(e.fields["name"] ?: e.message.ifEmpty { "Revisa el nombre." }, ToastModel.Kind.Info))
                e == KuraApiError.Unavailable -> {
                    s.party.unavailable = true
                    partyToast(e)
                }
                else -> partyToast(e)
            }
            false
        }
        BoundWrite.Stale -> false
    }
}

/** Editar: `perGuestLimit` null = unchanged; `Change(null)` = ilimitadas. */
suspend fun AppStore.updateParty(id: String, name: String?, perGuestLimit: Change<Int?>?): Boolean =
    when (val r = boundWrite { api.updateParty(id, name, perGuestLimit) }) {
        is BoundWrite.Ok -> { applyParty(r.value); true }
        is BoundWrite.Failed -> { partyWriteFailed(id, r.error); false }
        BoundWrite.Stale -> false
    }

suspend fun AppStore.deleteParty(id: String): Boolean =
    when (val r = boundWrite { api.deleteParty(id) }) {
        is BoundWrite.Ok -> {
            dismissSheet()
            dropParty(id)
            showToast(ToastModel("Borraste la fiesta.", ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> { partyWriteFailed(id, r.error); false }
        BoundWrite.Stale -> false
    }

/** "Salir de la fiesta" (a guest, `POST /parties/{id}/leave`): out of the list and every tab, back
 *  to Colecciones. Their songs stay in the party. True = left. */
suspend fun AppStore.leaveParty(id: String): Boolean =
    when (val r = boundWrite { api.leaveParty(id) }) {
        is BoundWrite.Ok -> {
            dismissSheet()
            dropParty(id)
            if (tab != Tab.Collections) tab = Tab.Collections
            showToast(ToastModel(PartyCopy.LEFT, ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> { partyWriteFailed(id, r.error); false }
        BoundWrite.Stale -> false
    }

/** "Crear link nuevo": the old one dies at once. */
suspend fun AppStore.rotatePartyInvite(id: String): Boolean =
    when (val r = boundWrite { api.rotatePartyInvite(id) }) {
        is BoundWrite.Ok -> {
            applyParty(r.value)
            dismissSheet()
            showToast(ToastModel("Link nuevo listo. El anterior ya no funciona.", ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> { partyWriteFailed(id, r.error); false }
        BoundWrite.Stale -> false
    }

/** "Desactivar link": nobody else gets in; who's in stays. */
suspend fun AppStore.revokePartyInvite(id: String): Boolean =
    when (val r = boundWrite { api.revokePartyInvite(id) }) {
        is BoundWrite.Ok -> { applyParty(r.value); true }
        is BoundWrite.Failed -> { partyWriteFailed(id, r.error); false }
        BoundWrite.Stale -> false
    }

sealed interface SongSearch {
    data class Results(val hits: List<PartySongHit>) : SongSearch
    data class Failed(val error: KuraApiError) : SongSearch
    /** The session changed (or the search was cancelled): nothing to show. */
    data object Dropped : SongSearch
}

/** `GET /parties/{id}/songs?q=` (≤ 100 chars). */
suspend fun AppStore.searchPartySongs(id: String, query: String): SongSearch {
    val session = s
    return try {
        val hits = api.searchPartySongs(id, query.take(100))
        if (s !== session) SongSearch.Dropped else {
            online()
            SongSearch.Results(hits)
        }
    } catch (err: Exception) {
        if (err is CancellationException) throw err
        if (s !== session) SongSearch.Dropped else noteError(err)?.let { SongSearch.Failed(it) } ?: SongSearch.Dropped
    }
}

enum class SongAdd { Added, CapReached, Failed }

/**
 * Agregar. "Pusiste X." — or, when that was the last one you had, straight to "ya pusiste tus 3."
 * (the cap sheet). A duplicate says who put it (the server's copy); a full cap opens the sheet.
 */
suspend fun AppStore.addPartySong(partyId: String, hit: PartySongHit): SongAdd {
    val known = party(partyId)
    if (known != null && !known.isHost && known.viewer.remaining == 0) {
        present(SheetRoute.PartyCap(partyId))
        return SongAdd.CapReached
    }
    val palette = hit.palette.ifEmpty { null }
    return when (val r = boundWrite { api.addPartySong(partyId, hit.titleId, palette) }) {
        is BoundWrite.Ok -> {
            val p = r.value
            applyParty(p)
            haptic(StoreHaptic.Success)
            if (!p.isHost && p.viewer.remaining == 0 && (p.perGuestLimit ?: 0) > 0) {
                dismissToast()
                present(SheetRoute.PartyCap(partyId))
            } else {
                showToast(ToastModel("Agregaste ${hit.title}.", ToastModel.Kind.Info))
            }
            SongAdd.Added
        }
        is BoundWrite.Failed -> {
            val e = r.error
            when {
                e is KuraApiError.Conflict && e.code == "cap_reached" -> {
                    loadParty(partyId, force = true)
                    present(SheetRoute.PartyCap(partyId))
                    SongAdd.CapReached
                }
                e == KuraApiError.NotFound -> {
                    partyWriteFailed(partyId, e, stale = "Esa canción ya no está disponible.")
                    SongAdd.Failed
                }
                else -> {
                    partyToast(e)
                    if (e is KuraApiError.Forbidden) loadParty(partyId, force = true)
                    SongAdd.Failed
                }
            }
        }
        BoundWrite.Stale -> SongAdd.Failed
    }
}

/** Quitar (the host: any song, "sale de la colección para todos"; a guest — blocked too, C4 — their
 *  own). True = it's out; the sheets only close / move on then. */
suspend fun AppStore.removePartySong(partyId: String, song: PartySong): Boolean =
    when (val r = boundWrite { api.removePartySong(partyId, song.titleId) }) {
        is BoundWrite.Ok -> {
            applyParty(r.value)
            showToast(ToastModel("Quitaste ${song.title}.", ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> {
            partyWriteFailed(partyId, r.error)
            if (r.error is KuraApiError.Forbidden) loadParty(partyId, force = true)
            false
        }
        BoundWrite.Stale -> false
    }

/** "Quitar y bloquear a @x" (host, by the song). The guest gets no notice. True = done. */
suspend fun AppStore.removeAndBlockPartyGuest(partyId: String, song: PartySong): Boolean =
    when (val r = boundWrite { api.removeAndBlockPartyGuest(partyId, song.titleId) }) {
        is BoundWrite.Ok -> {
            applyParty(r.value)
            showToast(ToastModel("Quitaste ${song.title} y bloqueaste a ${song.addedBy.atOrSomeone}.", ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> {
            partyWriteFailed(partyId, r.error)
            if (r.error is KuraApiError.Conflict) loadParty(partyId, force = true)
            false
        }
        BoundWrite.Stale -> false
    }

suspend fun AppStore.unblockPartyGuest(partyId: String, guestRef: String): Boolean {
    val guest = party(partyId)?.blockedGuests?.firstOrNull { it.guestRef == guestRef }
    return when (val r = boundWrite { api.unblockPartyGuest(partyId, guestRef) }) {
        is BoundWrite.Ok -> {
            applyParty(r.value)
            showToast(ToastModel("Desbloqueaste a ${guest?.person.atOrSomeone}.", ToastModel.Kind.Info))
            true
        }
        is BoundWrite.Failed -> { partyWriteFailed(partyId, r.error, stale = "Esa persona ya no estaba bloqueada."); false }
        BoundWrite.Stale -> false
    }
}

// MARK: Invites (`get-kura.app/f/{token}`)

/** The tabs are up and the library read landed: a link can open now. */
private val AppStore.readyForLinks: Boolean
    get() = phase == AppPhase.Main && didBootstrap && loadState != LoadState.Loading

/**
 * "Entrar a la fiesta" on the landing (signed in) — the ONLY thing that joins (founder, 2026-10-01: a
 * link opens the landing, the tap joins; `openLink` never calls this). Idempotent: "ya estás dentro."
 * the first time (the "returning" variant when the account already existed), no sheet for the host or
 * a member coming back. A dead link leaves the landing in its dead shape. Called before the tabs are
 * up it waits in [AppStore.pendingInvite] (`openPendingInvite` runs it — reached only from that tap or
 * from the signed-out CTA, `signInForInvite`, which is the same consent).
 */
suspend fun AppStore.openInvite(token: String) {
    if (!readyForLinks) {
        pendingInvite = token
        return
    }
    if (sheet != null) dismissSheet()
    when (val r = boundWrite { api.joinParty(token) }) {
        is BoundWrite.Ok -> {
            val j = r.value
            s.party.unavailable = false
            applyParty(j.party)
            inviteLanding = null
            val route = Route.PartyRoute(j.party.id)
            if (path(tab).lastOrNull() != route) push(route)
            if (j.joined == PartyJoin.Joined.New) {
                val returning = !partyJustOnboarded
                partyJustOnboarded = false
                delay(450.milliseconds)
                present(SheetRoute.PartyWelcome(j.party.id, returning))
            }
        }
        is BoundWrite.Failed -> {
            val e = r.error
            if (e is KuraApiError.Forbidden && e.needsOnboarding) {
                // The link waits for the account to be ready: finishing O1b opens it again, which joins.
                pendingInvite = token
                onboardingRequired(e, "Termina tu registro para entrar a la fiesta.")
                return
            }
            when (e) {
                KuraApiError.NotFound -> s.party.deadInvites = s.party.deadInvites + token
                // Not a dead link: the server just doesn't have parties yet.
                KuraApiError.Unavailable -> {
                    s.party.unavailable = true
                    s.party.deadInvites = s.party.deadInvites - token
                }
                KuraApiError.Unauthorized -> return
                else -> {
                    // Offline, a 5xx, a rate limit: never lose the link. The landing shows it with the
                    // error and Reintentar (a preview that loads brings back "Entrar a la fiesta").
                    setLoadError(LoadKey.Invite(token), e)
                    // A plain 429 here is "too fast", not `partyText`'s "Creaste varios links".
                    if (e is KuraApiError.RateLimited) showToast(ToastModel(e.toast, ToastModel.Kind.Info))
                    else partyToast(e, fallback = PartyCopy.JOIN_FAILED)
                }
            }
            inviteLanding = token
        }
        BoundWrite.Stale -> Unit
    }
}

/** Once the tabs are up (the links lane's `openPendingLink`): the invite that waited for the account. */
suspend fun AppStore.openPendingInvite() {
    val token = pendingInvite ?: return
    if (!readyForLinks) return
    pendingInvite = null
    openInvite(token)
}

/**
 * The landing's "Entrar" / "Entra a kura para poner tus 3 canciones" (signed out): off to the
 * entrance, and the link waits in [AppStore.pendingInvite] — after the sign-in (and O1b for a new
 * account, which then skips the picks) `openPendingInvite` opens it, which joins.
 */
fun AppStore.signInForInvite(token: String) {
    pendingInvite = token
    inviteLanding = null
    if (phase != AppPhase.Main) {
        onboardingStep = com.tromwey.kura.data.models.OnboardingStep.Signup
        if (phase == AppPhase.Splash) phase = AppPhase.Onboarding
    }
}

/** The landing's close (a dead / unavailable link, or signed in). */
fun AppStore.closeInviteLanding() {
    inviteLanding = null
}

internal fun logError(msg: String) {
    try {
        Log.e(TAG, msg)
    } catch (_: RuntimeException) {
        // JVM tests: `android.util.Log` isn't mocked there.
    }
}
