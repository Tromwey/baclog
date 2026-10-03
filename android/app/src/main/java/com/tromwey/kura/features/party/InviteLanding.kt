package com.tromwey.kura.features.party

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.data.models.InvitePreview
import com.tromwey.kura.data.models.PartyCopy
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Wordmark
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.HoneyButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.VibeLine
import com.tromwey.kura.designsystem.components.animatedTintTail
import com.tromwey.kura.designsystem.components.kSkeletonPulse
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.closeInviteLanding
import com.tromwey.kura.state.invite
import com.tromwey.kura.state.inviteIsDead
import com.tromwey.kura.state.loadInvite
import com.tromwey.kura.state.openInvite
import com.tromwey.kura.state.partiesUnavailable
import com.tromwey.kura.state.signInForInvite
import kotlinx.coroutines.launch

// `get-kura.app/f/{token}` in the app (twin of ios/Kura/Features/Party/InviteLandingView.swift,
// design `landing` · `loading` · `revoked`), drawn by KuraRoot over every phase while
// `store.inviteLanding` holds a token (the links lane mounts it):
//  - signed out: the public preview (`GET /invites/{token}` without a bearer) — the fan, the name,
//    who's in, the songs — with "Entrar" up top and the honey "Entra a kura para poner tus 3
//    canciones". Both go to the entrance; the link waits in `store.pendingInvite` and, once the
//    account is ready, joins and opens the party with "ya estás dentro." (`signInForInvite`);
//  - a dead link (revoked, unknown, malformed — or a block with the host) → "este link ya no funciona.";
//  - the server without parties yet (503) → "las fiestas llegan muy pronto.".
// Signed in, a live link shows the same preview with "Entrar a la fiesta": the tap joins (`openInvite`),
// the link alone never does (founder, 2026-10-01).

@Composable
fun InviteLandingScreen(store: AppStore, token: String) {
    LaunchedEffect(token) { store.loadInvite(token) }
    BackHandler { store.closeInviteLanding() }
    val preview = store.invite(token)
    val error = store.loadError(LoadKey.Invite(token))
    val scope = rememberCoroutineScope()
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        when {
            preview != null -> InvitePreviewPage(store, preview, token)
            store.inviteIsDead(token) -> InviteMessage(store, PartyCopy.DEAD_TITLE, PartyCopy.DEAD_NOTE, token)
            store.partiesUnavailable -> InviteMessage(store, PartyCopy.UNAVAILABLE_TITLE, PartyCopy.UNAVAILABLE_NOTE, token)
            error != null -> {
                val (title, note) = error.loadCopy
                InviteMessage(store, title, note, token) { scope.launch { store.loadInvite(token, force = true) } }
            }
            else -> InviteLoading()
        }
    }
}

/** The top row: the wordmark, and "Entrar" (signed out) or a close (signed in). */
@Composable
private fun InviteTopBar(store: AppStore, token: String, dead: Boolean = false) {
    Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
        Wordmark(size = 34f)
        Spacer(Modifier.weight(1f))
        if (store.api.hasSession) {
            IconChip44(KIcon.Close, "Cerrar", { store.closeInviteLanding() }, iconSize = 14.dp)
        } else if (!dead) {
            GlassButton("Entrar", { store.signInForInvite(token) })
        }
    }
}

@Composable
private fun InviteLoading() {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().kSkeletonPulse().clearAndSetSemantics { contentDescription = "Cargando la invitación" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) { Wordmark(size = 34f) }
        FanView(emptyList(), 212.dp, Modifier.padding(top = 10.dp), ghost = true, plus = false)
        Box(Modifier.padding(top = 8.dp).size(140.dp, 10.dp).background(KColor.glassBg, CircleShape))
        Box(Modifier.size(230.dp, 32.dp).background(KColor.glassBg, RoundedCornerShape(10.dp)))
        Box(Modifier.size(170.dp, 12.dp).background(Color.White.copy(alpha = 0.05f), CircleShape))
        PartyRowsSkeleton(Modifier.padding(horizontal = 8.dp).padding(top = 26.dp))
    }
}

/** Dead link / no parties yet / a failed read (the design's `revoked` shape). */
@Composable
private fun InviteMessage(store: AppStore, title: String, note: String, token: String, retry: (() -> Unit)? = null) {
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        InviteTopBar(store, token, dead = true)
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 28.dp), verticalArrangement = Arrangement.Center) {
            Box(Modifier.padding(start = 10.dp).height(90.dp).fillMaxWidth().clearAndSetSemantics { }) {
                listOf(-9f to 8, 9f to 8, 0f to 0).forEachIndexed { i, (rot, y) ->
                    val x = listOf(0, 72, 36)[i]
                    Box(Modifier.offset(x.dp, y.dp).size(72.dp).rotate(rot).background(KColor.glassBg, RoundedCornerShape(8.dp)))
                }
            }
            BasicText(title, Modifier.padding(top = 18.dp).semantics { heading() }, style = KuraType.news(36f).copy(lineHeight = 40.sp))
            BasicText(note, Modifier.padding(top = 12.dp), style = KuraType.ui(16f).copy(color = KColor.text2, lineHeight = 22.sp))
        }
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (retry != null) HoneyButton("Reintentar", retry, height = 56.dp)
            val out = if (store.api.hasSession) "Volver a kura" else "Conocer kura"
            if (retry == null && !store.api.hasSession) HoneyButton(out, { store.closeInviteLanding() }, height = 56.dp)
            else PartyFlatButton(out, { store.closeInviteLanding() }, quiet = retry != null)
        }
    }
}

/** The public preview (design `landing`): read-only, the honey CTA at the bottom. */
@Composable
private fun InvitePreviewPage(store: AppStore, preview: InvitePreview, token: String) {
    val p = preview.party
    val tint = p.tint
    val tail = animatedTintTail(tint)
    val signedIn = store.api.hasSession
    BoxWithConstraints(Modifier.fillMaxSize().background(tail)) {
        val viewport = maxHeight
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Column(Modifier.fillMaxWidth().heightIn(min = viewport).kTint(tint, TintStyle.Feed(900.dp)).statusBarsPadding().padding(bottom = 170.dp)) {
                InviteTopBar(store, token)
                Column(
                    Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 26.dp).padding(horizontal = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    FanView(p.songs.take(3).map { it.cover }, 212.dp, ghost = p.songs.isEmpty(), plus = false, label = "Portadas de ${p.name}")
                    MonoLabel("colección de fiesta", Modifier.padding(top = 4.dp), size = 10f)
                    BasicText(p.name, Modifier.semantics { heading() }, style = KuraType.news(36f).copy(textAlign = TextAlign.Center, lineHeight = 40.sp))
                    VibeLine(PartyCopy.heroLine(p.perGuestLimit))
                    PartyCredits(p.contributors, p.host, isHost = false, songCount = p.songs.size)
                }
                if (p.songs.isEmpty()) {
                    PartyEmpty(isHost = false, limit = p.perGuestLimit, big = true)
                } else {
                    BasicText("las canciones", Modifier.padding(horizontal = 20.dp).padding(bottom = 14.dp).semantics { heading() }, style = KuraType.news(22f))
                    Column(Modifier.padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        p.songs.forEach { PartySongRow(it) }
                    }
                }
            }
        }
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Brush.verticalGradient(0f to tail.copy(alpha = 0f), 0.42f to tail, 1f to tail))
                .navigationBarsPadding()
                .padding(horizontal = 16.dp).padding(top = 56.dp, bottom = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            HoneyButton(if (signedIn) "Entrar a la fiesta" else ctaTitle(p.perGuestLimit), {
                // The store's scope: joining closes this landing (and its scope) before the welcome opens.
                if (signedIn) store.launch { store.openInvite(token) } else store.signInForInvite(token)
            }, height = 56.dp)
            if (!signedIn) MonoLabel(if (store.hasSocialSignIn) "Con correo o Google · 1 minuto" else "Con tu correo · 1 minuto", color = KColor.text3)
        }
    }
}

private fun ctaTitle(l: Int?): String = when (l) {
    null -> "Entra a kura para agregar tus canciones"
    0 -> "Entra a kura para ver la fiesta"
    1 -> "Entra a kura para agregar tu canción"
    else -> "Entra a kura para agregar tus $l canciones"
}
