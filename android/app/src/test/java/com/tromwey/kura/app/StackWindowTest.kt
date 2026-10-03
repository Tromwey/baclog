package com.tromwey.kura.app

import com.tromwey.kura.data.models.Route
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StackWindowTest {
    private val c = Route.Collection("c1")
    private val t = Route.TitleRoute("t1")
    private val p = Route.PersonRoute("ana")
    private val deep: List<Route> = listOf(c, t, p, Route.TitleRoute("t2"), Route.Collection("c2"), Route.TitleRoute("t3"))

    @Test fun `a root-only stack has one live entry, the root`() {
        assertEquals(listOf(StackEntry(0, null)), liveEntries(emptyList()))
        assertEquals(StackEntry(0, null), topEntry(emptyList()))
    }

    @Test fun `a stack within the window keeps every entry alive`() {
        assertEquals(listOf(0, 1, 2, 3), liveEntries(listOf(c, t, p)).map { it.depth })
    }

    @Test fun `only the top N entries of a deep stack stay alive`() {
        val live = liveEntries(deep)
        assertEquals(MAX_LIVE_ENTRIES, live.size)
        assertEquals(listOf(3, 4, 5, 6), live.map { it.depth })
        assertEquals(topEntry(deep), live.last())
    }

    @Test fun `popping slides the window down so the next page below is alive before it shows`() {
        assertEquals(listOf(2, 3, 4, 5), liveEntries(deep.dropLast(1)).map { it.depth })
    }

    @Test fun `a window of zero still keeps the top`() {
        assertEquals(listOf(topEntry(deep)), liveEntries(deep, max = 0))
    }

    @Test fun `the popped page stays composed, above the top, while it moves`() {
        val popped = StackEntry(2, t)
        val composed = composedEntries(listOf(c), moving = listOf(popped, topEntry(listOf(c))))
        assertEquals(listOf(0, 1, 2), composed.map { it.depth })
        assertEquals(popped, composed.last())
    }

    @Test fun `a moving entry already in the window is not composed twice`() {
        val path = listOf(c, t)
        assertEquals(3, composedEntries(path, moving = listOf(StackEntry(1, c), topEntry(path))).size)
    }

    @Test fun `a replace at the same depth draws the new top over the old one`() {
        val old = StackEntry(1, c)
        val path = listOf<Route>(t)
        assertEquals(listOf(StackEntry(0, null), old, topEntry(path)), composedEntries(path, moving = listOf(old)))
    }

    @Test fun `only the top entry of the visible tab is active`() {
        val path = listOf(c, t)
        val top = topEntry(path)
        assertTrue(isEntryActive(tabVisible = true, entry = top, top = top))
        assertFalse(isEntryActive(tabVisible = false, entry = top, top = top))
        assertFalse(isEntryActive(tabVisible = true, entry = StackEntry(1, c), top = top))
        assertEquals(1, stackEntries(path).count { isEntryActive(true, it, top) })
    }

    @Test fun `resting places - on screen, a quarter left when covered, a width right when popped`() {
        val top = StackEntry(2, t)
        assertEquals(0f, restingOffset(top, top, reduce = false))
        assertEquals(-0.25f, restingOffset(StackEntry(1, c), top, reduce = false))
        assertEquals(1f, restingOffset(StackEntry(3, p), top, reduce = false))
        assertEquals(1f, restingAlpha(StackEntry(1, c), top, reduce = false))
    }

    @Test fun `reduce motion and a replace fade instead of moving`() {
        val top = StackEntry(2, t)
        assertEquals(0f, restingOffset(StackEntry(1, c), top, reduce = true))
        assertEquals(0f, restingAlpha(StackEntry(1, c), top, reduce = true))
        assertEquals(0f, restingOffset(StackEntry(2, p), top, reduce = false))
        assertEquals(0f, restingAlpha(StackEntry(2, p), top, reduce = false))
        assertEquals(1f, restingAlpha(top, top, reduce = true))
    }

    @Test fun `the back gesture moves both pages and hands over to the pop without a jump`() {
        // No gesture: the transition's own offset.
        assertEquals(-0.25f, draggedOffset(-0.25f, asTop = 0f, asBelow = 0f))
        // Mid-gesture: the top follows the finger, the page below comes back from its quarter.
        assertEquals(0.4f, draggedOffset(0f, asTop = 0.4f, asBelow = 0f), 1e-6f)
        assertEquals(-0.15f, draggedOffset(-0.25f, asTop = 0f, asBelow = 0.4f), 1e-6f)
        // Committed at 0.4: the pop's spring (base 0→1 / −¼→0) finishes from there.
        assertEquals(0.7f, draggedOffset(0.5f, asTop = 0.4f, asBelow = 0f), 1e-6f)
        assertEquals(1f, draggedOffset(1f, asTop = 0.4f, asBelow = 0f), 1e-6f)
        assertEquals(0f, draggedOffset(0f, asTop = 0f, asBelow = 0.4f), 1e-6f)
    }
}
