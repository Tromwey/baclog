package com.tromwey.kura.designsystem

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.CoroutineScope

// Live stack entries (app/MainTabs.kt): a page stays COMPOSED while it's in its tab's stack, and a
// visited tab stays composed while another one shows — like iOS's NavigationStack / TabView. So
// "this composable entered composition" no longer means "this page is on screen". This file is the
// signal a page uses instead.

/**
 * True when this page is the one on screen: the top entry of the visible tab. False while it's
 * covered by a push or its tab is hidden (it is still composed, just not drawn). Outside the tabs
 * (sheets, onboarding, the gallery) it is always true.
 */
val LocalEntryActive = compositionLocalOf { true }

/**
 * iOS `.task`: runs [block] when the page APPEARS — the first time, and every time it comes back
 * to the front (a pop, its tab selected again) — and cancels it while it's covered. Use it for the
 * page's reads and for anything that should pause while covered (collectors, timers).
 * A plain `LaunchedEffect` in a page runs once for as long as the page stays in the stack.
 */
@Composable
fun ActiveEffect(vararg keys: Any?, block: suspend CoroutineScope.() -> Unit) {
    val active = LocalEntryActive.current
    LaunchedEffect(active, *keys) { if (active) block() }
}

/** iOS `.onDisappear`: [block] runs when the page stops being the one on screen (covered, tab hidden, or popped). */
@Composable
fun OnEntryCovered(block: () -> Unit) {
    val active = LocalEntryActive.current
    val latest by rememberUpdatedState(block)
    DisposableEffect(active) { onDispose { if (active) latest() } }
}

/**
 * Hosts one stack entry: provides [LocalEntryActive] and a `LifecycleOwner` that is as far along as
 * the activity while [active] and stays at CREATED while covered. That lifecycle is what turns a
 * covered page's `BackHandler`s off (activity-compose registers them from ON_START to ON_STOP) and
 * re-registers them — last, so first in line — when the page comes back; `LifecycleEventEffect`
 * (ON_RESUME) in a page also fires on the way back.
 */
@Composable
fun EntryHost(active: Boolean, content: @Composable () -> Unit) {
    val parent = LocalLifecycleOwner.current
    val owner = remember(parent) { EntryLifecycleOwner(parent) }
    DisposableEffect(owner) {
        owner.attach()
        onDispose { owner.detach() }
    }
    DisposableEffect(owner, active) {
        owner.setActive(active)
        onDispose { }
    }
    CompositionLocalProvider(LocalEntryActive provides active, LocalLifecycleOwner provides owner, content = content)
}

private class EntryLifecycleOwner(private val parent: LifecycleOwner) : LifecycleOwner {
    private val registry = LifecycleRegistry(this)
    private var active = false
    private var attached = false
    private val observer = LifecycleEventObserver { _, _ -> sync() }

    override val lifecycle: Lifecycle get() = registry

    fun attach() {
        attached = true
        parent.lifecycle.addObserver(observer)
        sync()
    }

    fun detach() {
        attached = false
        parent.lifecycle.removeObserver(observer)
        destroy()
    }

    fun setActive(value: Boolean) {
        active = value
        sync()
    }

    private fun sync() {
        if (!attached) return
        val p = parent.lifecycle.currentState
        when {
            p == Lifecycle.State.DESTROYED -> destroy()
            p == Lifecycle.State.INITIALIZED -> Unit
            active -> registry.currentState = p
            else -> registry.currentState = Lifecycle.State.CREATED
        }
    }

    private fun destroy() {
        // A registry that never got past INITIALIZED can't be destroyed (it throws).
        if (registry.currentState.isAtLeast(Lifecycle.State.CREATED)) registry.currentState = Lifecycle.State.DESTROYED
    }
}
