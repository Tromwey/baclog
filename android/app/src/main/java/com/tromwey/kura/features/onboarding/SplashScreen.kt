package com.tromwey.kura.features.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.Wordmark
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.finishSplash
import kotlin.time.Duration.Companion.milliseconds

/**
 * 01 · Splash: the brand on its own (§marca · A at 76, never the kanji) on bg — the system splash
 * before it is only the bg color, so there are never two marks in a row. A stored token skips the
 * entrance (refreshed if it's about to expire); the refresh runs at once and the wordmark only holds
 * a 400 ms beat when it's faster. [hold] (DEBUG `kuraScreen splash`) keeps it on screen.
 */
@Composable
fun SplashScreen(store: AppStore, hold: Boolean = false) {
    Box(Modifier.fillMaxSize().background(KColor.bg), contentAlignment = Alignment.Center) {
        Wordmark(size = 76f)
    }
    LaunchedEffect(hold) {
        if (!hold) store.finishSplash(minimumHold = 400.milliseconds)
    }
}
