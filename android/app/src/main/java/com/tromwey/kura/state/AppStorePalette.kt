package com.tromwey.kura.state

import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.api.KuraLog
import com.tromwey.kura.data.models.ExternalRef
import com.tromwey.kura.data.models.PartySong
import com.tromwey.kura.data.models.Title
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Cover palettes filled on this device — twin of `AppStore+Palette.swift`. `catalog_item.paletteHex` is
// extracted on-device, once, by whoever shows the title first. A title only the app has shown arrives
// with `palette: []`: the first `Cover` that draws it calls `fillPaletteIfNeeded`, the store uses the
// hexes at once, and they go to the server by the channel that fits:
// - a catalog title → `PUT /titles/{id}/palette`;
// - an `ext:` search result has no catalog id yet → `unsentPalettes`, riding its membership PUT.

fun AppStore.fillPaletteIfNeeded(t: Title) {
    // A party song drawn through `Cover` is not a catalog title (its palette goes through `+Parties`).
    if (PartySong.isArt(t.id) || t.palette.isNotEmpty()) return
    if (s.titles[t.id]?.palette?.isEmpty() == false) return
    val url = t.coverUrl ?: return
    if (!paletteAttempts.add(t.id)) return
    val session = s
    scope.launch {
        val hexes = try {
            platform.extractPalette(url)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            emptyList()
        }
        if (hexes.isEmpty()) {
            // The cover didn't load (Coil's ErrorResult, offline) or couldn't be read: not a verdict
            // on the title — the next time it's drawn it tries again.
            paletteAttempts.remove(t.id)
            return@launch
        }
        if (s !== session) return@launch
        applyLocalPalette(hexes, t)
        enqueuePaletteSend(hexes, t, session)
    }
}

private fun AppStore.enqueuePaletteSend(hexes: List<String>, t: Title, session: SessionData) {
    val previous = paletteSendQueue
    val job = scope.launch(start = CoroutineStart.LAZY) {
        previous?.join()
        if (s !== session || unsentPalettes[t.id] == null) return@launch
        if (!sendPalette(hexes, t, session)) return@launch
        delay(AppStore.PALETTE_SEND_GAP)
    }
    paletteSendQueue = job
    job.start()
}

private fun AppStore.applyLocalPalette(hexes: List<String>, t: Title) {
    val known = s.titles[t.id]
    when {
        // Shown straight from a payload the store hasn't registered (a search row): register it.
        known == null -> registerPartial(t.copy(palette = hexes))
        known.palette.isEmpty() -> s.titles = s.titles + (t.id to known.copy(palette = hexes))
        else -> return // a payload brought the server's palette meanwhile
    }
    unsentPalettes[t.id] = hexes
}

/** Whether a request went out (only then the queue waits the gap). */
private suspend fun AppStore.sendPalette(hexes: List<String>, t: Title, session: SessionData): Boolean {
    // `ext:` → no catalog id: its membership PUT carries the palette. Signed out → nothing to send with.
    if (t.isExternal || ExternalRef.parse(t.id) != null || !api.hasSession) return false
    try {
        val fresh = api.fillPalette(t.id, hexes)
        unsentPalettes.remove(t.id)
        // Someone else's extraction won the race: everyone reads theirs, so do we.
        val known = s.titles[t.id]
        if (s === session && fresh.palette.isNotEmpty() && known != null && known.palette != fresh.palette) {
            s.titles = s.titles + (t.id to known.copy(palette = fresh.palette))
        }
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        // A cosmetic cache fill: nothing to show the person. The palette stays local (and in
        // `unsentPalettes`) — but a refusal leaves a trace (429 = the write budget; 4xx = contract).
        val why = when (e) {
            is KuraApiError.RateLimited -> "429 (retryAfter=${e.retryAfter ?: "-"})"
            is KuraApiError -> e.javaClass.simpleName
            else -> "bug ${e.javaClass.simpleName}"
        }
        KuraLog.w("KuraPalette", "PUT titles/:id/palette falló: $why")
    }
    return true
}
