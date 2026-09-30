package com.tromwey.kura.designsystem

import org.junit.Assert.assertEquals
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
}
