package com.tromwey.kura.app

import com.tromwey.kura.data.models.Route

// The pure half of the live stack (MainTabs.kt): which entries of a tab's path are composed, which
// one is the page on screen, and where each one rests. No Compose here — it's unit-tested.

/** One entry of a tab's stack: `route` null = the tab's root. */
internal data class StackEntry(val depth: Int, val route: Route?) {
    val key: String get() = "$depth|$route"
}

/**
 * How many entries of a stack stay composed (the top ones). Deeper ones leave composition and come
 * back from their saved state (scroll, fields) when the stack unwinds to them — the memory cap.
 * 4 = the page on screen plus three "Volver" that are instant and exact.
 */
internal const val MAX_LIVE_ENTRIES = 4

/** Every entry of [path], root first. */
internal fun stackEntries(path: List<Route>): List<StackEntry> =
    (0..path.size).map { StackEntry(it, path.getOrNull(it - 1)) }

internal fun topEntry(path: List<Route>): StackEntry = StackEntry(path.size, path.lastOrNull())

/** The entries that stay alive: the top [max] of the stack. */
internal fun liveEntries(path: List<Route>, max: Int = MAX_LIVE_ENTRIES): List<StackEntry> =
    stackEntries(path).takeLast(max.coerceAtLeast(1))

/**
 * What is composed right now: the live window plus the [moving] entries of a running transition
 * (a popped page is no longer in the path but is still sliding out). Bottom first — that's the
 * drawing order: a deeper page is always above a shallower one, and between two pages of the same
 * depth (a replace) the one that is the top goes last.
 */
internal fun composedEntries(
    path: List<Route>,
    moving: Collection<StackEntry> = emptyList(),
    max: Int = MAX_LIVE_ENTRIES,
): List<StackEntry> {
    val top = topEntry(path)
    return (liveEntries(path, max) + moving)
        .distinctBy { it.key }
        .sortedWith(compareBy<StackEntry> { it.depth }.thenBy { it.key == top.key })
}

/** The page on screen: the top entry of the visible tab (`LocalEntryActive`). */
internal fun isEntryActive(tabVisible: Boolean, entry: StackEntry, top: StackEntry): Boolean =
    tabVisible && entry.key == top.key

/**
 * Where [entry] rests, in widths, when [top] is the top of the stack: 0 on screen, a quarter to the
 * left when it's covered, a whole width to the right when it's above the top (not pushed yet, or
 * popped). Reduce motion and a replace at the same depth don't move: they fade ([restingAlpha]).
 */
internal fun restingOffset(entry: StackEntry, top: StackEntry, reduce: Boolean): Float = when {
    reduce || entry.depth == top.depth -> 0f
    entry.depth < top.depth -> -0.25f
    else -> 1f
}

internal fun restingAlpha(entry: StackEntry, top: StackEntry, reduce: Boolean): Float = when {
    entry.key == top.key -> 1f
    reduce || entry.depth == top.depth -> 0f
    else -> 1f
}

/**
 * The predictive back gesture on top of the transition: [base] is the transition's offset,
 * [asTop] the gesture's progress when this is the page under the finger (it follows it to the
 * right), [asBelow] when it's the page being uncovered (it comes back from its quarter). Both 0 =
 * [base]. After the gesture commits its progress stays frozen while the pop's spring takes both
 * pages the rest of the way, so nothing jumps.
 */
internal fun draggedOffset(base: Float, asTop: Float, asBelow: Float): Float {
    val uncovered = base * (1f - asBelow)
    return 1f - (1f - asTop) * (1f - uncovered)
}
