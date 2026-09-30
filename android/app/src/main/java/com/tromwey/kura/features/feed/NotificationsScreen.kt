package com.tromwey.kura.features.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.models.KNotification
import com.tromwey.kura.data.models.NotificationKind
import com.tromwey.kura.data.models.RequestState
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.KuraTopBar
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.kHeroCover
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.isFollowing
import com.tromwey.kura.state.markNotificationsRead
import com.tromwey.kura.state.setRequest
import com.tromwey.kura.state.toggleFollow

// 31a Notificaciones · 31b Sin notificaciones (iOS `NotificationsView`). Live has no
// `GET /me/notifications` yet: `store.notifications` is always empty there, so 31b is what people see.

/** Avisos (la campana). */
@Composable
fun NotificationsScreen(store: AppStore) {
    // Read on the way OUT (like iOS `.onDisappear`): the unread dots stay while you're looking.
    DisposableEffect(Unit) { onDispose { store.markNotificationsRead() } }
    val all = store.notifications
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        if (all.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = KSize.pushedTitleTop)) {
                BasicText("notificaciones", Modifier.semantics { heading() }, style = KuraType.screenTitle)
            }
            Column(
                Modifier.fillMaxWidth().padding(start = 32.dp, end = 32.dp, top = 340.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                BasicText("todo en calma.", style = KuraType.news(28f))
                BasicText(
                    "Aquí llegan tus seguidores, los estrenos que esperas y tu recap.",
                    style = KuraType.ui(15f).copy(color = KColor.text2, textAlign = TextAlign.Center),
                )
            }
        } else {
            val today = all.filter { !it.thisWeek }
            val week = all.filter { it.thisWeek }
            LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(top = KSize.pushedTitleTop, bottom = 56.dp)) {
                item(key = "title") {
                    BasicText("notificaciones", Modifier.padding(start = 24.dp, end = 24.dp, bottom = 6.dp).semantics { heading() }, style = KuraType.screenTitle)
                }
                if (today.isNotEmpty()) {
                    item(key = "hoy") { Section("hoy") }
                    items(today, key = { it.id }) { NotificationRow(store, it) }
                }
                if (week.isNotEmpty()) {
                    item(key = "semana") { Section("esta semana") }
                    items(week, key = { it.id }) { NotificationRow(store, it) }
                }
            }
        }
        TopVeil()
        KuraTopBar(onBack = { store.pop() })
    }
}

@Composable
private fun Section(t: String) {
    BasicText(t, Modifier.padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 4.dp).semantics { heading() }, style = KuraType.sheetTitle)
}

/** A 72 row: seal / cover / recap tile, the message with the names in semibold, the age in mono,
 *  and the row's action (approve/reject a request, follow back — the screen's one honey). */
@Composable
private fun NotificationRow(store: AppStore, n: KNotification) {
    Box {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = KSize.rowPeople)
                .kPressable(KPressFeel.Row(), onClickLabel = "Abrir") { open(store, n) }
                .padding(horizontal = 20.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Leading(store, n)
            Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                BasicText(message(store, n), style = KuraType.ui(15f).copy(color = KColor.text2, lineHeight = 20.sp))
                MonoLabel(n.age)
            }
            Trailing(store, n)
        }
        if (n.unread) {
            Box(
                Modifier.align(Alignment.CenterStart).padding(start = 8.dp).size(6.dp).background(KColor.text, CircleShape)
                    .semantics { contentDescription = "Nueva" },
            )
        }
    }
}

private fun open(store: AppStore, n: KNotification) {
    when (val k = n.kind) {
        is NotificationKind.FollowRequest -> store.push(Route.PersonRoute(k.personId))
        is NotificationKind.NewFollower -> store.push(Route.PersonRoute(k.personId))
        is NotificationKind.Release -> store.push(Route.TitleRoute(k.titleId))
        is NotificationKind.Recap -> store.push(Route.Recap())
        is NotificationKind.Followers -> store.push(Route.Followers(store.me.id, showFollowing = false))
    }
}

@Composable
private fun Leading(store: AppStore, n: KNotification) {
    when (val k = n.kind) {
        is NotificationKind.FollowRequest -> store.person(k.personId)?.let { Seal(it.initials, it.hexes, size = 44.dp, photo = it.photo) }
        is NotificationKind.NewFollower -> store.person(k.personId)?.let { Seal(it.initials, it.hexes, size = 44.dp, photo = it.photo) }
        is NotificationKind.Release -> store.title(k.titleId)?.let { t ->
            Box {
                Cover(t.art, Modifier.kHeroCover("cover-${t.id}"), width = 44.dp, height = 66.dp, radius = KRadius.coverS)
                Box(
                    Modifier.align(Alignment.BottomEnd).offset(x = 6.dp, y = 6.dp).size(24.dp).background(KColor.bg, CircleShape),
                    contentAlignment = Alignment.Center,
                ) { GlyphIcon(Glyph.Clock, size = 14.dp) }
            }
        }
        is NotificationKind.Recap -> Box(
            Modifier.width(44.dp).heightIn(min = 66.dp, max = 66.dp)
                .background(Brush.verticalGradient(KColor.recapTile), RoundedCornerShape(KRadius.coverS))
                .clearAndSetSemantics { },
            contentAlignment = Alignment.Center,
        ) {
            BasicText("蔵", style = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.SemiBold, fontSize = KuraType.fixed(20f), color = KColor.text))
        }
        is NotificationKind.Followers -> Box(Modifier.size(44.dp)) {
            k.ids.firstOrNull()?.let { store.person(it) }?.let { Seal(it.initials, it.hexes, size = 34.dp, photo = it.photo) }
            k.ids.getOrNull(1)?.let { store.person(it) }?.let {
                Box(Modifier.offset(x = 12.dp, y = 12.dp).size(34.dp).background(KColor.bg, CircleShape), contentAlignment = Alignment.Center) {
                    Seal(it.initials, it.hexes, size = 30.dp, photo = it.photo)
                }
            }
        }
    }
}

private fun message(store: AppStore, n: KNotification): AnnotatedString = buildAnnotatedString {
    fun b(s: String) = withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = KColor.text)) { append(s) }
    when (val k = n.kind) {
        is NotificationKind.FollowRequest -> { b("@${k.personId}"); append(" quiere seguirte.") }
        is NotificationKind.NewFollower -> { b("@${k.personId}"); append(" empezó a seguirte.") }
        is NotificationKind.Release -> { b(store.title(k.titleId)?.name ?: ""); append(" ${k.text}") }
        is NotificationKind.Recap -> { append("Tu "); b("recap de agosto"); append(" ${k.text}") }
        is NotificationKind.Followers -> {
            k.ids.firstOrNull()?.let { b("@$it") }
            k.ids.getOrNull(1)?.let { append(", "); b("@$it") }
            append(" y ${k.more} más empezaron a seguirte.")
        }
    }
}

@Composable
private fun Trailing(store: AppStore, n: KNotification) {
    when (val k = n.kind) {
        is NotificationKind.FollowRequest -> when (store.requestStates[n.id] ?: RequestState.Pending) {
            RequestState.Pending -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                GlassButton("Aprobar", onClick = { store.setRequest(n.id, RequestState.Approved) }, height = 36.dp, fontSize = 14f)
                IconChip44(KIcon.Close, "Rechazar", onClick = { store.setRequest(n.id, RequestState.Rejected) }, size = 36.dp, iconSize = 12.dp)
            }
            RequestState.Approved -> MonoLabel("Aprobada")
            RequestState.Rejected -> MonoLabel("Rechazada")
        }
        // Honey: the one "Seguir" on this screen.
        is NotificationKind.NewFollower -> FollowButton(
            if (store.isFollowing(k.personId)) FollowState.Following else FollowState.Follow,
            onClick = { store.toggleFollow(k.personId) },
            honey = true,
            handle = k.personId,
        )
        else -> Spacer(Modifier.size(0.dp))
    }
}
