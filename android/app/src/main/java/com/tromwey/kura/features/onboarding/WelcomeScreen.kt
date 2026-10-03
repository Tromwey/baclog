package com.tromwey.kura.features.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import com.tromwey.kura.app.art
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.Wordmark
import com.tromwey.kura.designsystem.WordmarkVariant
import com.tromwey.kura.designsystem.components.Cover
import com.tromwey.kura.designsystem.components.GlassButton
import com.tromwey.kura.state.AppStore

/** (title id, rotation°, x offset as a fraction of the fan's height) — back to front. */
private val welcomeFan = listOf(Triple("chihiro", -9f, -0.62f), Triple("odyssey", 9f, 0.62f), Triple("ma", 0f, 0f))

/**
 * 02 · Onboarding (13, bienvenida): §marca · C (蔵 kura — the first contact, before the account, is
 * brand material), three covers fanned out, "la bodega donde guardas lo que más vale." and Empezar in
 * glass. A first-launch screen: once passed (`welcomeSeen`) the entrance starts at "entra a kura.".
 */
@Composable
fun WelcomeScreen(store: AppStore) {
    Column(
        Modifier.fillMaxSize().navigationBarsPadding().padding(start = 28.dp, end = 28.dp, top = 72.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        Wordmark(variant = WordmarkVariant.C)

        BoxWithConstraints(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
            val h = min(maxHeight * 0.72f, maxWidth * 0.58f)
            Box(contentAlignment = Alignment.Center) {
                welcomeFan.forEach { (id, rotation, dx) ->
                    val t = store.decor(id) ?: return@forEach
                    Cover(
                        t.art,
                        Modifier.offset(x = h * dx).graphicsLayer { rotationZ = rotation },
                        height = h,
                    )
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            BasicText(
                "la bodega donde guardas lo que más vale.",
                modifier = Modifier.semantics { heading() },
                style = KuraType.news(36f).copy(lineHeight = 38.sp), // 1.05 (flujos-v2 13)
            )
            BasicText(
                "Películas, series y álbumes. Empieza por lo que no puedes dejar de recomendar.",
                style = KuraType.ui(15f).copy(color = KColor.text2, lineHeight = 22.sp),
            )
        }

        GlassButton(
            "Empezar",
            onClick = {
                store.welcomeSeen = true
                store.onboardingStep = OnboardingStep.Signup
            },
            height = 52.dp,
            fontSize = 16f,
            fullWidth = true,
        )
    }
}
