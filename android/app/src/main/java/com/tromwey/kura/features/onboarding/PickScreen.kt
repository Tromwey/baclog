package com.tromwey.kura.features.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.data.api.KuraApiError
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.MonoLabel
import com.tromwey.kura.designsystem.Tint
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.designsystem.components.SearchPill
import com.tromwey.kura.designsystem.components.KuraTextButton
import com.tromwey.kura.designsystem.components.PickGrid
import com.tromwey.kura.designsystem.components.Skeleton
import com.tromwey.kura.designsystem.components.SolidButton
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.clearSearch
import com.tromwey.kura.state.finishOnboarding
import com.tromwey.kura.state.loadOnboardingGrid
import com.tromwey.kura.state.runSearch
import com.tromwey.kura.state.submitPicks
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 05 · 32a Elige 3: the catalog pool in three columns, numbered picks, search on top; the CTA counts
 * down ("Elige 3" → "Elige 2 más" → "Elige 1 más" → "Continuar") and the background tints with the
 * picks (240 ms). `POST /me/onboarding/picks` → 32b.
 */
@Composable
fun PickScreen(store: AppStore) {
    var query by rememberSaveable { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val picks = store.onboardingPicks
    val q = query.trim()
    val grid = if (q.isEmpty()) store.onboardingGrid else store.searchResults.map { it.title }

    val back = { if (store.account?.onboarded == true) store.finishOnboarding() else store.onboardingStep = OnboardingStep.Username }
    BackHandler(onBack = back)

    LaunchedEffect(Unit) { store.loadOnboardingGrid() }
    LaunchedEffect(q) {
        if (q.isEmpty()) {
            store.clearSearch()
            return@LaunchedEffect
        }
        delay(350)
        store.runSearch(q)
    }

    Box(Modifier.fillMaxSize()) {
        val palettes = picks.mapNotNull { store.title(it)?.palette?.ifEmpty { null } }
        Crossfade(palettes, animationSpec = KMotion.tint(), label = "pickTint") { p ->
            Box(Modifier.fillMaxSize().then(if (p.isEmpty()) Modifier.background(KColor.bg) else Modifier.background(Tint.header3(p))))
        }

        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 72.dp, bottom = 150.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MonoLabel("1 de 2")
                Spacer(Modifier.weight(1f))
                KuraTextButton("Volver", onClick = back, color = KColor.text2)
            }
            BasicText("elige 3 que te obsesionan.", modifier = Modifier.semantics { heading() }, style = KuraType.news(32f))
            BasicText(
                "Las tres tiñen tu perfil. Con las tres encontramos a tu gente.",
                style = KuraType.ui(15f).copy(color = KColor.text2, lineHeight = 22.sp),
            )
            SearchPill(query, { query = it }, "Buscar películas, series o música")
            val gridError = store.onboardingGridError
            val searchError = store.searchError
            when {
                grid.isNotEmpty() -> PickGrid(
                    titles = grid.map { it.art },
                    picks = picks,
                    onToggle = { t ->
                        store.onboardingPicks = if (t.id in picks) picks - t.id else picks + t.id
                    },
                    modifier = Modifier.padding(top = 4.dp),
                )
                q.isEmpty() && gridError != null -> Unavailable(gridError, note = "Inténtalo de nuevo en un momento; también puedes buscar arriba.") {
                    scope.launch { store.loadOnboardingGrid() }
                }
                q.isNotEmpty() && (searchError == KuraApiError.Unavailable || searchError == KuraApiError.Offline) ->
                    Unavailable(searchError, note = null) { scope.launch { store.runSearch(q) } }
                store.searchLoading || (q.isEmpty() && store.onboardingGrid.isEmpty()) -> PickSkeleton(Modifier.padding(top = 4.dp))
                q.isNotEmpty() -> BasicText("nada con “$q”.", modifier = Modifier.padding(top = 12.dp), style = KuraType.news(24f))
            }
            InlineError(store.authError)
        }

        BottomCta(Modifier.align(Alignment.BottomCenter)) {
            SolidButton(
                if (store.authBusy) "Un momento…" else when (picks.size) {
                    3 -> "Continuar"
                    2 -> "Elige 1 más"
                    1 -> "Elige 2 más"
                    else -> "Elige 3"
                },
                onClick = { scope.launch { store.submitPicks() } },
                enabled = picks.size == 3 && !store.authBusy,
            )
        }
    }
}

/** The pool or the search is down: what happened and Reintentar (no wink). */
@Composable
private fun Unavailable(error: KuraApiError, note: String?, onRetry: () -> Unit) {
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        BasicText(if (error == KuraApiError.Offline) "sin conexión." else "el catálogo no responde.", style = KuraType.news(24f))
        if (note != null) BasicText(note, style = KuraType.ui(14f).copy(color = KColor.text2))
        GlassButton("Reintentar", onClick = onRetry, icon = KIcon.Retry)
    }
}

/** Three columns of covers in the grid's real shapes, pulsing as one. */
@Composable
private fun PickSkeleton(modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "Cargando" },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(3) { col ->
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                repeat(3) { row ->
                    Skeleton(Modifier.fillMaxWidth().aspectRatio(if ((col + row) % 3 == 1) 1f else 2f / 3f), radius = KRadius.coverS)
                }
            }
        }
    }
}
