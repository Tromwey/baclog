package com.tromwey.kura.designsystem

import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

/** True when the system removed animations (see [KMotion.reduceMotion]). Provided by [KuraTheme]. */
val LocalReduceMotion = staticCompositionLocalOf { false }

/**
 * Kura's root theme — always dark, no Material look. Provides reduce-motion (re-read on every
 * resume, so toggling it in Ajustes del sistema applies when you come back), reads the
 * Vibraciones preference once and sets the text selection colors (no Material purple).
 */
@Composable
fun KuraTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    var reduce by remember { mutableStateOf(KMotion.reduceMotion(context)) }
    remember { KHaptic.init(context) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { reduce = KMotion.reduceMotion(context) }
    CompositionLocalProvider(
        LocalReduceMotion provides reduce,
        LocalTextSelectionColors provides TextSelectionColors(handleColor = KColor.text, backgroundColor = KColor.text.copy(alpha = 0.28f)),
        content = content,
    )
}

/** `KHaptic.play` bound to the current view: `val haptic = rememberKHaptic(); haptic(KHapticEvent.Tap)`. */
@Composable
fun rememberKHaptic(): (KHapticEvent?) -> Unit {
    val view = LocalView.current
    return remember(view) { { e -> KHaptic.play(view, e) } }
}
