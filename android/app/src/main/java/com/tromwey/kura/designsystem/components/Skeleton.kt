package com.tromwey.kura.designsystem.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import com.tromwey.kura.designsystem.KColor
import com.tromwey.kura.designsystem.KMotion
import com.tromwey.kura.designsystem.KRadius
import com.tromwey.kura.designsystem.LocalEntryActive
import com.tromwey.kura.designsystem.LocalReduceMotion

/**
 * The one pulse the system allows (loading): opacity 1 ↔ .45 over 1.6 s, ease-in-out, between
 * s1 and s2 as the shape sits on the page. Reduce motion: still, at .7. No shimmer, no spinner.
 */
fun Modifier.kSkeletonPulse(still: Float = 0.7f): Modifier = composed {
    // A covered page keeps no clock running: its skeleton holds still until it's back on screen.
    if (LocalReduceMotion.current || !LocalEntryActive.current) {
        graphicsLayer { alpha = still }
    } else {
        val t = rememberInfiniteTransition(label = "skeleton")
        val a by t.animateFloat(
            initialValue = 1f,
            targetValue = 0.45f,
            animationSpec = infiniteRepeatable(tween(KMotion.pulseLegMs, easing = KMotion.EaseInOut), RepeatMode.Reverse),
            label = "skeletonAlpha",
        )
        graphicsLayer { alpha = a }
    }
}

/**
 * A skeleton block in the exact shape of what's coming: s2 fill, [radius] (cover-l by default),
 * pulsing. Size it with [modifier]. Hidden from TalkBack (the screen says "Cargando").
 */
@Composable
fun Skeleton(modifier: Modifier = Modifier, radius: Dp = KRadius.coverL) {
    Box(modifier.clearAndSetSemantics { }.kSkeletonPulse().background(KColor.s2, RoundedCornerShape(radius)))
}

/** A plain s1 shape inside a silhouette that pulses as a whole ([kSkeletonPulse] on the parent). */
@Composable
fun SkeletonShape(modifier: Modifier = Modifier, radius: Dp = KRadius.coverL) {
    Box(modifier.background(KColor.s1, RoundedCornerShape(radius)))
}
