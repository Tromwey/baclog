package com.tromwey.kura.features.party

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyCard
import com.tromwey.kura.data.models.PartyCopy
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.RetryStrip
import com.tromwey.kura.designsystem.components.VibeLine
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.loadParty
import com.tromwey.kura.state.party
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.time.Duration.Companion.milliseconds

/**
 * A party centred in Tus colecciones (twin of ios/Kura/Features/Party/PartyCarouselBody.swift;
 * founder 2026-09-29: "como las demás colecciones, solo que en formato de lista"). Under the
 * carousel's names: the line + the contributors' seals (the card's mono meta while it loads), the
 * page's actions as flat tonal buttons (never honey: the carousel has no accent action), and EVERY
 * song as the page's rows — one you can act on opens its sheet, any other opens the party.
 *
 * Loads ONLY the party in the centre, after a short debounce so a flick across several doesn't
 * read each; re-read when `GET /parties` says the count moved.
 */
@Composable
fun PartyCarouselBody(store: AppStore, card: PartyCard) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(card.id, card.songCount) {
        val cached = store.party(card.id)
        if (cached != null && cached.songs.size == card.songCount) return@LaunchedEffect
        delay(250.milliseconds)
        store.loadParty(card.id, force = cached != null)
    }
    val p = store.party(card.id)
    val error = store.loadError(LoadKey.PartyKey(card.id))
    Column {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(top = 4.dp, bottom = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            VibeLine(PartyCopy.heroLine(p?.perGuestLimit ?: card.perGuestLimit))
            if (p != null) {
                PartyCredits(p.contributors, p.host, p.isHost, p.songs.size, Modifier.padding(top = 2.dp))
            } else {
                MonoLabel(card.meta, Modifier.padding(top = 2.dp))
            }
        }
        when {
            p != null -> {
                CarouselActions(store, p)
                if (p.songs.isEmpty()) PartyEmpty(p.isHost, p.perGuestLimit, big = false) else PartySongs(store, p, heading = false, openParty = true)
            }
            error != null -> RetryStrip(
                if (error == KuraApiError.Offline) "Sin conexión." else "No se cargaron las canciones.",
                { scope.launch { store.loadParty(card.id, force = true) } },
                Modifier.padding(horizontal = 12.dp),
                offline = error == KuraApiError.Offline,
            )
            else -> PartyRowsSkeleton(Modifier.padding(horizontal = 8.dp), trailing = 0.dp)
        }
    }
}

@Composable
private fun CarouselActions(store: AppStore, p: Party) {
    val a = partyAction(p) ?: return
    val search = { store.push(Route.PartySearch(p.id)) }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 18.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        when (a) {
            PartyBarAction.Host -> {
                GlassButton("Invitar", { store.present(SheetRoute.PartyShare(p.id)) }, icon = KIcon.Plus)
                GlassButton("Buscar canción", search, icon = KIcon.Search)
            }
            PartyBarAction.Search -> GlassButton(if (p.mySongs.isEmpty()) "Buscar canción" else "Buscar otra canción", search, icon = KIcon.Search)
            PartyBarAction.Change -> GlassButton("Cambiar una canción", { store.present(SheetRoute.PartyCap(p.id)) }, icon = KIcon.Retry)
        }
    }
}
