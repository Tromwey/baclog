package com.tromwey.kura.features.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.models.FanOrder
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.data.models.UsernameStatus
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KHapticEvent
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.rememberKHaptic
import com.tromwey.kura.designsystem.components.ArtCircle
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FanView
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.GroupedList
import com.tromwey.kura.designsystem.components.IconChip44
import com.tromwey.kura.designsystem.components.KuraLoadingIndicator
import com.tromwey.kura.designsystem.components.KuraSwitch
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.KuraTextField
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.SealSize
import com.tromwey.kura.designsystem.components.SectionTitle
import com.tromwey.kura.designsystem.components.SettingsRow
import com.tromwey.kura.designsystem.components.TopVeil
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.designsystem.components.kTint
import com.tromwey.kura.designsystem.components.TintStyle
import com.tromwey.kura.designsystem.components.animatedTintTail
import com.tromwey.kura.features.people.CollectionsShowcase
import com.tromwey.kura.features.people.CoverStrip
import com.tromwey.kura.features.people.FollowCounts
import com.tromwey.kura.features.people.ShowcaseItem
import com.tromwey.kura.features.people.StatRibbon
import com.tromwey.kura.features.people.StripCover
import com.tromwey.kura.features.people.TintedPage
import com.tromwey.kura.features.people.myObsessions
import com.tromwey.kura.features.people.myProfileHexes
import com.tromwey.kura.features.people.shareLink
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.AvatarEncoder
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.LoadState
import com.tromwey.kura.state.SheetRoute
import com.tromwey.kura.state.ToastModel
import com.tromwey.kura.state.bootstrap
import com.tromwey.kura.state.checkUsername
import com.tromwey.kura.state.count
import com.tromwey.kura.state.removeAvatar
import com.tromwey.kura.state.saveProfile
import com.tromwey.kura.state.uploadAvatar
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Tu perfil (20c · E2 vacío) and Editar perfil (20f) — twins of iOS `ProfileView` /
// `EmptyOwnProfile` / `EditProfileView`. The page wears your profile's gradient (the featured
// obsession, else the newest one, else your library's hexes — `myProfileHexes`), the same ground as
// your seguidores page and "así te ven".

/** Tab root · tu perfil. Its own header (no tab title bar): chips, seal 128, name 40, @, counts, ribbon. */
@Composable
fun ProfileScreen(store: AppStore) {
    val scope = rememberCoroutineScope()
    when {
        store.loadState == LoadState.Failed -> {
            // The launch read failed: nothing honest to draw yet (no name, no counts).
            Box(Modifier.fillMaxSize().background(KColor.bg)) {
                val (t, note) = (store.loadError(LoadKey.Library))?.loadCopy ?: ("no se pudo cargar." to "Vuelve a intentarlo.")
                LoadErrorBlock(t, note, onRetry = { scope.launch { store.bootstrap() } }, modifier = Modifier.padding(start = 28.dp, end = 28.dp, top = 140.dp))
                Row(Modifier.fillMaxWidth().padding(top = KSize.chromeTop, end = KSize.chromeSide)) {
                    Spacer(Modifier.weight(1f))
                    SettingsChip(store)
                }
            }
        }
        // E2 only when there's truly nothing: a title marked from its ficha without saving it lives in
        // your library with no collection, and the ribbon has to count it.
        store.collections.isEmpty() && store.libraryIds.isEmpty() && store.loadState == LoadState.Loaded -> EmptyOwnProfile(store)
        else -> FullProfile(store)
    }
}

@Composable
private fun SettingsChip(store: AppStore) {
    IconChip44(KIcon.Settings, "Ajustes", { store.push(Route.Settings) }, fill = KColor.glassBg)
}

@Composable
private fun FullProfile(store: AppStore) {
    val context = LocalContext.current
    val me = store.me
    val tint = store.myProfileHexes
    val obsessions = store.myObsessions
    val showcase = store.orderedCollections.map { c ->
        ShowcaseItem(
            id = c.id, name = c.name, vibe = c.shownVibe, count = c.titleIds.size, pinned = c.pinned,
            fan = store.fan(c),
            open = { store.push(Route.Collection(c.id)) },
            hold = { store.present(SheetRoute.CollectionQuick(c.id)) },
        )
    }
    TintedPage(tint) {
        Column(
            Modifier.fillMaxWidth().padding(top = KSize.chromeTop, start = 24.dp, end = 24.dp, bottom = 34.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Spacer(Modifier.weight(1f))
                // Private profile: its link would 404, so say why instead of sharing it.
                IconChip44(KIcon.Share, "Compartir perfil", {
                    val link = store.myProfileLink
                    if (link == null) {
                        store.showToast(ToastModel(AppStore.PRIVATE_PROFILE_SHARE_NOTE, ToastModel.Kind.Info))
                    } else {
                        shareLink(context, link, "@${me.handle}")
                    }
                }, fill = KColor.glassBg)
                SettingsChip(store)
            }
            Box(
                Modifier.kPressable(onClickLabel = "Editar perfil") { store.push(Route.EditProfile) }
                    .semantics { contentDescription = "Editar perfil" },
            ) {
                Seal(me.initials, me.hexes, size = SealSize.profile, photo = me.photo)
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                BasicText(me.name, Modifier.semantics { heading() }, style = KuraType.profile)
                BasicText("@${me.handle}", style = KuraType.mono(12f).copy(color = KColor.text2))
                FollowCounts(
                    me.followers, maxOf(me.followingCount, store.following.size),
                    onFollowers = { store.push(Route.Followers(me.id, showFollowing = false)) },
                    onFollowing = { store.push(Route.Followers(me.id, showFollowing = true)) },
                )
            }
            val obsessed = store.count(Mark.Obsessed)
            val liked = store.count(Mark.Liked)
            StatRibbon(obsessed, store.count(Mark.Completed) + liked + obsessed, liked, store.reviewCount)
        }
        Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(30.dp)) {
            if (obsessions.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    SectionTitle("me obsesiona", Modifier.padding(horizontal = 20.dp))
                    if (obsessions.size == 1) {
                        // A shelf of one left most of the row empty: the cover grows to the pinned fan's
                        // 186 and the rest of the row says what fills it.
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            val t = obsessions.first()
                            StripCover(t, 186.dp) { store.push(Route.TitleRoute(t.id)) }
                            BasicText(
                                "Lo que te obsesione se va juntando aquí.",
                                Modifier.weight(1f).padding(bottom = 4.dp),
                                style = KuraType.ui(14f).copy(color = KColor.text2),
                            )
                        }
                    } else {
                        CoverStrip(obsessions, 150.dp, onOpen = { store.push(Route.TitleRoute(it.id)) })
                    }
                }
            }
            CollectionsShowcase(
                "tus colecciones",
                showcase,
                onSeeAll = { store.select(Tab.Collections) },
            ) {
                FanView(
                    emptyList(), 186.dp,
                    Modifier.kPressable(onClickLabel = "Tu primera colección") { store.present(SheetRoute.NewCollection(null)) },
                    ghost = true,
                    label = "Tu primera colección",
                )
            }
        }
        Spacer(Modifier.heightIn(min = 150.dp))
    }
}

/** E2 · Perfil propio vacío: the seal at 112, zero counts, three empty slots for "me obsesiona" (the
 *  first one goes to Descubrir) and the ghost fan as the way to a first collection. */
@Composable
private fun EmptyOwnProfile(store: AppStore) {
    val me = store.me
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = KSize.chromeTop, bottom = 110.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(Modifier.fillMaxWidth().padding(horizontal = KSize.chromeSide)) {
                Spacer(Modifier.weight(1f))
                SettingsChip(store)
            }
            Box(Modifier.kPressable(onClickLabel = "Editar perfil") { store.push(Route.EditProfile) }) {
                Seal(me.initials, me.hexes, size = 112.dp, photo = me.photo)
            }
            BasicText(me.name, Modifier.padding(top = 6.dp).semantics { heading() }, style = KuraType.news(30f))
            MonoLabel("@${me.handle}")
            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                MonoLabel("${me.followers} ${if (me.followers == 1) "seguidor" else "seguidores"}")
                MonoLabel("${maxOf(me.followingCount, store.following.size)} siguiendo")
            }
            Column(Modifier.fillMaxWidth().padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SectionTitle("me obsesiona", Modifier.padding(horizontal = 20.dp))
                    Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(
                            Modifier.size(100.dp, 150.dp).background(KColor.s1, RoundedCornerShape(KRadius.coverL))
                                .kPressable(onClickLabel = "Buscar algo que te obsesione") { store.select(Tab.Discover) }
                                .semantics { contentDescription = "Buscar algo que te obsesione" },
                            contentAlignment = Alignment.Center,
                        ) { KIconView(KIcon.Plus, size = 17.dp, color = KColor.text2) }
                        repeat(2) {
                            Box(Modifier.size(100.dp, 150.dp).background(KColor.s1, RoundedCornerShape(KRadius.coverL)).clearAndSetSemantics { })
                        }
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SectionTitle("tus colecciones", Modifier.padding(horizontal = 20.dp))
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        FanView(
                            emptyList(), 186.dp,
                            Modifier.kPressable(onClickLabel = "Nueva colección") { store.present(SheetRoute.NewCollection(null)) },
                            ghost = true,
                            label = "Nueva colección",
                        )
                    }
                }
            }
        }
        TopVeil(solid = 46.dp, end = 64.dp)
    }
}

// MARK: - 20f Editar perfil

/**
 * 20f · Editar perfil: Cancelar / Guardar, the seal as it will look (photo on top, uploading dims
 * it), Cambiar/Poner foto (the system photo picker → cropped and shrunk ON the device →
 * `uploadAvatar`) and Quitar foto, Nombre and @usuario (checked as you type), the featured obsession
 * (it tints your profile; tap one to try it) and the two privacy switches. Guardar writes it all.
 */
@Composable
fun EditProfileScreen(store: AppStore) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptic = rememberKHaptic()
    val me = store.me
    // Only what you marked "Me obsesiona" — never "Me gusta".
    val candidates = store.userTitles.filter { it.value.mark == Mark.Obsessed }.keys.sorted().mapNotNull { store.title(it) }
    val ids = candidates.map { it.id }
    var name by rememberSaveable { mutableStateOf(me.name) }
    // The field keeps exactly what was typed (with its "@"): rewriting it on every key moves the cursor.
    var handleText by rememberSaveable { mutableStateOf("@${me.handle}") }
    var featured by rememberSaveable { mutableStateOf(me.featuredTitleId?.takeIf { it in ids } ?: ids.firstOrNull()) }
    var isPrivate by rememberSaveable { mutableStateOf(store.profilePrivate) }
    var showCommon by rememberSaveable { mutableStateOf(store.showCommon) }
    var status by remember { mutableStateOf<UsernameStatus?>(null) }

    val clean = handleText.lowercase().filter { it.isLetterOrDigit() || it == '.' || it == '_' }
    val handleChanged = clean != me.handle
    LaunchedEffect(clean) {
        status = null
        if (!handleChanged || clean.length < 3) return@LaunchedEffect
        delay(350)
        status = store.checkUsername(clean)
    }
    val handleError = when {
        !handleChanged -> null
        clean.length < 3 -> "Mínimo 3 caracteres."
        status == UsernameStatus.Taken -> "@$clean ya está tomado."
        status == UsernameStatus.Invalid -> "Usa de 3 a 30 letras sin acento, números, punto o guion bajo."
        else -> null
    }
    val canSave = name.isNotBlank() && handleError == null && (!handleChanged || status == UsernameStatus.Free || status == null)

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { store.uploadAvatar(AvatarEncoder.encode(context, uri)) }
    }

    val palette = featured?.let { store.title(it)?.palette } ?: emptyList()
    val preview = Person(
        handle = clean, name = name, initials = Person.initials(name),
        hexes = FanOrder.kuraHexes(palette).ifEmpty { me.hexes }, avatarUrl = me.avatarUrl,
    )
    val tail = animatedTintTail(palette)

    Box(Modifier.fillMaxSize().background(tail)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()) {
            Column(Modifier.fillMaxWidth().kTint(palette, TintStyle.Feed(900.dp))) {
                Column(
                    Modifier.fillMaxWidth().padding(top = KSize.chromeTop, start = 20.dp, end = 20.dp, bottom = 30.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconChip44(KIcon.Close, "Cancelar", { store.pop() }, iconSize = 15.dp, fill = KColor.glassBg)
                        Spacer(Modifier.weight(1f))
                        GlassButton(
                            "Guardar",
                            onClick = {
                                store.saveProfile(name, clean, featured, isPrivate, showCommon)
                                store.pop()
                            },
                            fill = KColor.glassBg,
                            enabled = canSave,
                        )
                    }
                    Box(contentAlignment = Alignment.Center) {
                        Seal(preview.initials, preview.hexes, Modifier.alpha(if (store.avatarBusy) 0.5f else 1f), size = 104.dp, photo = preview.photo)
                        if (store.avatarBusy) KuraLoadingIndicator(size = 40.dp)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        KuraTextButton(
                            if (store.avatarBusy) "Subiendo…" else if (me.avatarUrl == null) "Poner foto" else "Cambiar foto",
                            onClick = {
                                if (!store.avatarBusy) picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                        )
                        if (me.avatarUrl != null && !store.avatarBusy) {
                            KuraTextButton("Quitar foto", { scope.launch { store.removeAvatar() } }, color = KColor.text2)
                        }
                    }
                }
                Column(
                    Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 60.dp),
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        KuraTextField(name, { name = it }, placeholder = "tu nombre", label = "Nombre", imeAction = ImeAction.Next)
                        KuraTextField(
                            handleText,
                            { handleText = it },
                            placeholder = "@usuario",
                            label = "Usuario",
                            error = handleError,
                        )
                    }
                    if (candidates.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                MonoLabel("Obsesión destacada", tracking = 0.1f)
                                BasicText("Tiñe la cabecera de tu perfil. Toca una para probar.", style = KuraType.note)
                            }
                            Row(
                                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp).padding(bottom = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.Bottom,
                            ) {
                                candidates.forEach { t ->
                                    val on = t.id == featured
                                    Box(
                                        Modifier.alpha(if (on) 1f else 0.7f)
                                            .kPressable(onClickLabel = t.name) {
                                                featured = t.id
                                                haptic(KHapticEvent.Selection)
                                            }
                                            .semantics { selected = on },
                                    ) {
                                        Cover(t.art, height = 96.dp, radius = KRadius.coverS)
                                        if (on) {
                                            ArtCircle(Modifier.padding(6.dp), size = 22.dp) { KIconView(KIcon.CheckBold, size = 10.dp) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    GroupedList {
                        SettingsRow("Perfil privado", note = "Nadie más ve tu perfil ni tus colecciones.") {
                            KuraSwitch(isPrivate, { isPrivate = it }, label = "Perfil privado")
                        }
                        SettingsRow("Mostrar En común contigo", note = "En tu perfil, a quien te visita.") {
                            KuraSwitch(showCommon, { showCommon = it }, label = "Mostrar En común contigo")
                        }
                    }
                }
            }
        }
    }
}
