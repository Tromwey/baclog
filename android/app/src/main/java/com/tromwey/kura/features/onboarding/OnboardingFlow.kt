package com.tromwey.kura.features.onboarding

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.tromwey.kura.data.models.OnboardingStep
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KIcon
import com.tromwey.kura.designsystem.KIconView
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KuraType
import com.tromwey.kura.designsystem.components.KPressFeel
import com.tromwey.kura.designsystem.components.kPressable
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.loadAuthProviders

// Flow 01 · the entrance and the onboarding — twin of ios/Kura/Features/Onboarding/OnboardingViews.swift.
// One door (f31effe): "entra a kura." takes new and returning people alike; the server tells them
// apart after the code (`route(m)` sends an account without a handle to O1b).

/** The entrance's container: one screen per `store.onboardingStep`, cross-faded. */
@Composable
fun OnboardingFlow(store: AppStore) {
    // Which sign-in buttons exist (a no-op when the splash already asked).
    LaunchedEffect(Unit) { store.loadAuthProviders() }
    Box(Modifier.fillMaxSize().background(KColor.bg)) {
        AnimatedContent(
            targetState = store.onboardingStep,
            transitionSpec = { fadeIn(KMotion.fade()) togetherWith fadeOut(KMotion.fade()) },
            label = "onboarding",
        ) { step ->
            when (step) {
                OnboardingStep.Welcome -> WelcomeScreen(store)
                OnboardingStep.Signup -> SignupScreen(store)
                OnboardingStep.Username -> UsernameScreen(store)
                OnboardingStep.Pick -> PickScreen(store)
                OnboardingStep.People -> PeopleScreen(store)
                OnboardingStep.Code -> CodeScreen(store)
                OnboardingStep.Underage -> UnderageScreen(store)
            }
        }
    }
}

/** Inline error under a field, in the Kura voice (text, not red — there is no red in Kura). */
@Composable
internal fun InlineError(text: String?, modifier: Modifier = Modifier) {
    AnimatedVisibility(text != null, modifier, enter = fadeIn(KMotion.fade()), exit = fadeOut(KMotion.fade())) {
        BasicText(
            text.orEmpty(),
            modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
            style = KuraType.ui(13f),
        )
    }
}

/** Bottom CTA over a fade to bg (padding 18 20 · 10 above the navigation bar and the keyboard). */
@Composable
internal fun BottomCta(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(0f to KColor.bg.copy(alpha = 0f), 0.4f to KColor.bg.copy(alpha = 0.92f)))
            .navigationBarsPadding()
            .imePadding()
            .padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 10.dp),
        content = content,
    )
}

/** Search field, capsule, 48 high (iOS `SearchPill`): lupa, the field, and "x" when there's text. */
@Composable
fun SearchPill(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    onSearch: () -> Unit = {},
) {
    val style = KuraType.ui(16f)
    Row(
        modifier.fillMaxWidth().height(48.dp).background(KColor.glassBg, CircleShape).padding(start = 16.dp, end = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        KIconView(KIcon.Search, size = 17.dp, color = KColor.text2)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            textStyle = style,
            singleLine = true,
            cursorBrush = SolidColor(KColor.accent),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) BasicText(placeholder, style = style.copy(color = KColor.text2), maxLines = 1)
                    inner()
                }
            },
        )
        if (value.isNotEmpty()) {
            Box(
                Modifier.size(40.dp).kPressable(feel = KPressFeel.Dim, onClickLabel = "Borrar búsqueda") { onValueChange("") },
                contentAlignment = Alignment.Center,
            ) { KIconView(KIcon.Close, size = 14.dp, color = KColor.text3) }
        }
    }
}
