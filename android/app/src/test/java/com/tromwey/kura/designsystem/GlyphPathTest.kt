package com.tromwey.kura.designsystem

import androidx.compose.ui.graphics.vector.PathNode
import androidx.compose.ui.graphics.vector.VectorGroup
import androidx.compose.ui.graphics.vector.VectorPath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The DS glyph paths compact arc flags ("0 100 20"); Compose's parser needs them split. */
class GlyphPathTest {

    @Test
    fun compactArcFlagsAreSplit() {
        // The clock's outer circle: rx 10, ry 10, rotation 0, large-arc 1, sweep 0, dx 0, dy 20.
        assertEquals("M 12 2 a 10 10 0 1 0 0 20 z", expandArcFlags("M12 2a10 10 0 100 20z"))
    }

    @Test
    fun flagsGluedToASignedNumber() {
        // "0 00-1.071-.136": rotation 0, flags 0 0, then dx -1.071, dy -.136.
        assertEquals("a .75 .75 0 0 0 -1.071 -.136", expandArcFlags("a.75.75 0 00-1.071-.136"))
    }

    @Test
    fun repeatedArcsKeepCountingFlags() {
        assertEquals("a 3.6 3.6 0 1 0 0 -7.2 3.6 3.6 0 0 0 0 7.2", expandArcFlags("a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2"))
    }

    @Test
    fun otherCommandsAreUntouched() {
        assertEquals("M 7.5 10.5 v 9.5 H 4.2 l .7 -3.3", expandArcFlags("M7.5 10.5v9.5H4.2l.7-3.3"))
    }

    // Every interface icon (and every DS glyph) builds, has path data that starts with a move, and
    // keeps every endpoint inside its 24×24 viewport (a half-drawn arc or a glued flag lands outside).
    @Test
    fun everyKIconBuildsInsideItsViewport() {
        assertEquals(42, KIcon.entries.size)
        KIcon.entries.forEach { icon -> checkVector(icon.name, icon.vector.root) }
    }

    @Test
    fun everyGlyphBuildsInsideItsViewport() {
        Glyph.entries.forEach { g -> checkVector(g.name, g.vector.root) }
        KuraTab.entries.forEach { t -> checkVector(t.name, t.icon.root) }
    }

    private fun checkVector(name: String, group: VectorGroup) {
        val paths = group.filterIsInstance<VectorPath>()
        assertTrue("$name has no path", paths.isNotEmpty())
        paths.forEach { p -> checkNodes(name, p.pathData) }
    }

    private fun checkNodes(name: String, nodes: List<PathNode>) {
        assertTrue("$name: empty path", nodes.isNotEmpty())
        assertTrue("$name: path must start with a move", nodes.first() is PathNode.MoveTo || nodes.first() is PathNode.RelativeMoveTo)
        var x = 0f
        var y = 0f
        var sx = 0f
        var sy = 0f
        for (n in nodes) {
            when (n) {
                is PathNode.MoveTo -> { x = n.x; y = n.y; sx = x; sy = y }
                is PathNode.RelativeMoveTo -> { x += n.dx; y += n.dy; sx = x; sy = y }
                is PathNode.LineTo -> { x = n.x; y = n.y }
                is PathNode.RelativeLineTo -> { x += n.dx; y += n.dy }
                is PathNode.HorizontalTo -> x = n.x
                is PathNode.RelativeHorizontalTo -> x += n.dx
                is PathNode.VerticalTo -> y = n.y
                is PathNode.RelativeVerticalTo -> y += n.dy
                is PathNode.CurveTo -> { x = n.x3; y = n.y3 }
                is PathNode.RelativeCurveTo -> { x += n.dx3; y += n.dy3 }
                is PathNode.ReflectiveCurveTo -> { x = n.x2; y = n.y2 }
                is PathNode.RelativeReflectiveCurveTo -> { x += n.dx2; y += n.dy2 }
                is PathNode.QuadTo -> { x = n.x2; y = n.y2 }
                is PathNode.RelativeQuadTo -> { x += n.dx2; y += n.dy2 }
                is PathNode.ReflectiveQuadTo -> { x = n.x; y = n.y }
                is PathNode.RelativeReflectiveQuadTo -> { x += n.dx; y += n.dy }
                is PathNode.ArcTo -> { x = n.arcStartX; y = n.arcStartY }
                is PathNode.RelativeArcTo -> { x += n.arcStartDx; y += n.arcStartDy }
                PathNode.Close -> { x = sx; y = sy }
            }
            assertTrue("$name: point ($x, $y) outside 0…24 after $n", x in -0.01f..24.01f && y in -0.01f..24.01f)
        }
    }
}
