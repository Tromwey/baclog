package com.tromwey.kura.features.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tromwey.kura.app.art
import com.tromwey.kura.app.loadCopy
import com.tromwey.kura.app.photo
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.designsystem.Glyph
import com.tromwey.kura.designsystem.GlyphIcon
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KSize
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.UiWeight
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.FollowButton
import com.tromwey.kura.designsystem.components.FollowState
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.LoadErrorBlock
import com.tromwey.kura.designsystem.components.Seal
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.LoadKey
import com.tromwey.kura.state.finishOnboarding
import com.tromwey.kura.state.isFollowing
import com.tromwey.kura.state.loadOnboardingPeople
import com.tromwey.kura.state.toggleFollow
import kotlinx.coroutines.launch

/**
 * 06 · 32b Tu gente: the three picks at 120 over their tint (fading into bg under the first rows),
 * "gente con tus obsesiones", 72 rows (seal 44, @handle, "Le obsesiona X" with the flame) with
 * Seguir ↔ Siguiendo, and "Entrar a kura" — following is optional.
 */
@Composable
fun PeopleScreen(store: AppStore) {
    val scope = rememberCoroutineScope()
    BackHandler { store.onboardingStep = OnboardingStep.Pick }
    LaunchedEffect(Unit) { store.loadOnboardingPeople() }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Hero(store)
            Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 150.dp)) {
                val error = store.loadError(LoadKey.OnboardingPeople)
                when {
                    !store.onboardingPeopleLoaded && error != null -> {
                        val (title, note) = error.loadCopy
                        LoadErrorBlock(title, note, onRetry = { scope.launch { store.loadOnboardingPeople(force = true) } },
                            modifier = Modifier.padding(vertical = 24.dp), titleSize = 24f)
                    }
                    !store.onboardingPeopleLoaded -> RowsSkeleton()
                    store.onboardingPeople.isEmpty() -> BasicText(
                        "Todavía no hay gente con tus obsesiones. Tu feed se llena cuando la encuentres en Descubrir.",
                        modifier = Modifier.padding(vertical = 24.dp),
                        style = KuraType.ui(15f).copy(color = KColor.text2),
                    )
                }
                store.onboardingPeople.forEach { p ->
                    PersonRow(store, store.person(p.id) ?: p, why = p.why.orEmpty())
                }
            }
        }

        BottomCta(Modifier.align(Alignment.BottomCenter)) {
            SolidButton("Entrar a kura", onClick = { store.finishOnboarding() })
        }
    }
}

@Composable
private fun Hero(store: AppStore) {
    val picked = store.onboardingPicks.mapNotNull { store.title(it) }
    val tint = Tint.header3(picked.map { it.palette })
    Column(
        Modifier
            .fillMaxWidth()
            // The tint runs 140 past the hero and fades out under the first rows (header3's diagonal
            // alone only reaches bg at the bottom-right: ending it at the hero cut a hard edge).
            .drawBehind {
                val h = size.height + 140.dp.toPx()
                drawRect(tint, size = Size(size.width, h))
                drawRect(
                    Brush.verticalGradient(0.55f to KColor.bg.copy(alpha = 0f), 1f to KColor.bg, startY = 0f, endY = h),
                    size = Size(size.width, h),
                )
            }
            .padding(start = 20.dp, end = 20.dp, top = 72.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MonoLabel("2 de 2")
            Spacer(Modifier.weight(1f))
            KuraTextButton("Volver", onClick = { store.onboardingStep = OnboardingStep.Pick }, color = KColor.text2)
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.Bottom,
        ) {
            picked.forEach { t -> Cover(t.art, height = 120.dp) }
        }
        BasicText("gente con tus obsesiones", modifier = Modifier.semantics { heading() }, style = KuraType.news(32f))
        BasicText("Síguela para llenar tu feed. Puedes hacerlo después.", style = KuraType.ui(15f).copy(color = KColor.text2))
    }
}

@Composable
private fun PersonRow(store: AppStore, p: Person, why: String) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = KSize.rowPeople),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Seal(p.initials, p.hexes, size = 44.dp, photo = p.photo)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            BasicText("@${p.handle}", style = KuraType.ui(16f, UiWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (why.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    GlyphIcon(Glyph.Flame, size = 12.dp)
                    BasicText(why, style = KuraType.ui(13f).copy(color = KColor.text2), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        FollowButton(
            if (store.isFollowing(p.id)) FollowState.Following else FollowState.Follow,
            onClick = { store.toggleFollow(p.id) },
            handle = p.handle,
        )
    }
}

@Composable
private fun RowsSkeleton() {
    Column(Modifier.clearAndSetSemantics { contentDescription = "Buscando gente con tus obsesiones" }) {
        repeat(3) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = KSize.rowPeople),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Skeleton(Modifier.size(44.dp), radius = 999.dp)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Skeleton(Modifier.width(130.dp).heightIn(min = 14.dp, max = 14.dp), radius = 6.dp)
                    Skeleton(Modifier.width(180.dp).heightIn(min = 10.dp, max = 10.dp), radius = 5.dp)
                }
            }
        }
    }
}
