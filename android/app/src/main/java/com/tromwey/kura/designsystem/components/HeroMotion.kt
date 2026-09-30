package com.tromwey.kura.designsystem.components

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.LocalReduceMotion

// The minimum of ios/…/HeroMotion.swift a screen needs: the shared cover card → ficha /
// colección (DS "Portada compartida · 320 ms · spring suave"; Volver plays it backwards).
// Wiring: `KuraHeroLayout` once around the NavHost; inside each destination
// `HeroDestination(this) { … }` (NavHost's composable{} lambda IS an AnimatedVisibilityScope);
// then the same `Modifier.kHeroCover("cover-<titleId>")` on the card's cover and the ficha's.

/** The shared-transition scope of the app's hero layout (null outside [KuraHeroLayout]). */
val LocalSharedTransitionScope = compositionLocalOf<SharedTransitionScope?> { null }

/** The AnimatedVisibility scope of the destination currently composing (null outside [HeroDestination]). */
val LocalHeroVisibilityScope = compositionLocalOf<AnimatedVisibilityScope?> { null }

/** Wrap the navigation host once: covers with the same hero key morph between destinations. */
@Composable
fun KuraHeroLayout(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    SharedTransitionLayout(modifier) {
        CompositionLocalProvider(LocalSharedTransitionScope provides this, content = content)
    }
}

/** Marks a destination's content (pass the `AnimatedContentScope` NavHost gives each route). */
@Composable
fun HeroDestination(scope: AnimatedVisibilityScope, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalHeroVisibilityScope provides scope, content = content)
}

/** The cover's bounds move with `KMotion.spring` (320 ms, barely damped past critical). */
val KHeroBounds = BoundsTransform { _, _ -> KMotion.spring<Rect>() }

/**
 * The shared cover: put it on BOTH ends (card and ficha) with the same [key]. Identity when there
 * is no hero layout/destination around it, and under reduce motion (the screen change fades, the
 * cover doesn't fly). Place it before the cover's size/clip so the whole shape travels.
 */
@Composable
fun Modifier.kHeroCover(key: Any): Modifier {
    val shared = LocalSharedTransitionScope.current ?: return this
    val visibility = LocalHeroVisibilityScope.current ?: return this
    if (LocalReduceMotion.current) return this
    return with(shared) {
        this@kHeroCover.sharedElement(
            sharedContentState = rememberSharedContentState(key),
            animatedVisibilityScope = visibility,
            boundsTransform = KHeroBounds,
        )
    }
}
