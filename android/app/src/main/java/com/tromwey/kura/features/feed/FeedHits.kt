package com.tromwey.kura.features.feed

import android.os.SystemClock
import com.tromwey.kura.designsystem.KHapticEvent

/**
 * "La card golpea la parte superior" (founder, 2026-09-27; iOS `FeedHits` in FeedView.swift, see
 * `.claude/knowledge/state/frontend.md` § "iOS · golpe háptico del feed"): a tap the instant a card's
 * top reaches the line it pins at (under the header, `hdr`), and "el tirón" — scrolling back up, the
 * card above settling onto that same line. A plain class (never Compose state): a scroll frame
 * never recomposes through it. All lengths in px; [density] turns the iOS points into them.
 *
 * - Only under the finger or its momentum ([userDriven]: set when a finger touches the stack, cleared
 *   once the scroll has stayed stopped with no finger down): the first load, a new page and a
 *   programmatic jump are silent.
 * - Once per crossing, re-armed [REARM] past the mark; one tap per burst ([GAP]); strength follows the
 *   speed over the last [WINDOW] ms (the snap's slow landing = the floor, a fling = the cap).
 */
internal class FeedHits(private val density: Float, private val play: (KHapticEvent) -> Unit) {
    private var marks: List<Float> = emptyList()
    private var passed = 0
    private var pullMarks: List<Float> = listOf(0f)
    private var above = 0
    private var offset = 0f
    private var samples = ArrayDeque<Pair<Long, Float>>()
    private var lastHit = -1L

    /** A finger (or its fling / snap) is moving the stack. */
    var userDriven = false

    /** A finger is on the stack right now. */
    var fingerDown = false

    private val tolerance get() = TOLERANCE * density
    private val rearm get() = REARM * density

    /** Offsets at which card 1, 2, … pins (ascending). New data re-seats silently. */
    fun setMarks(m: List<Float>) {
        if (m == marks) return
        marks = m
        pullMarks = listOf(0f) + m
        passed = m.takeWhile { it - tolerance <= offset }.size
        val y = maxOf(offset, 0f)
        above = pullMarks.takeWhile { y > it + tolerance }.size
    }

    fun stopped() {
        userDriven = false
        samples.clear()
    }

    fun scrolled(y: Float) {
        val previous = offset
        offset = y
        val now = SystemClock.uptimeMillis()
        samples.addLast(now to y)
        while (samples.isNotEmpty() && now - samples.first().first > WINDOW) samples.removeFirst()

        // Hit: a card rises into the header line.
        var crossed = 0
        while (passed < marks.size && y >= marks[passed] - tolerance) { passed += 1; crossed += 1 }
        while (passed > 0 && y < marks[passed - 1] - tolerance - rearm) passed -= 1

        // Pull: back up, the card above drops onto the line. The top's overscroll is clamped to 0.
        val p = maxOf(y, 0f)
        var pulled = 0
        while (above < pullMarks.size && p > pullMarks[above] + tolerance + rearm) above += 1
        while (above > 0 && p <= pullMarks[above - 1] + tolerance) { above -= 1; pulled += 1 }

        if (crossed > 0 && y > previous) fire(pull = false, y = y, now = now)
        if (pulled > 0 && y < previous) fire(pull = true, y = y, now = now)
    }

    private fun fire(pull: Boolean, y: Float, now: Long) {
        if (!userDriven) return
        if (lastHit >= 0 && now - lastHit < GAP) return
        val first = samples.firstOrNull() ?: (now to y)
        val dt = (now - first.first) / 1000f
        val travel = (if (pull) first.second - y else y - first.second) / density
        val speed = if (dt > 0.008f) maxOf(0f, travel / dt) else 0f
        val (lo, hi) = if (pull) PULL_FLOOR to PULL_CAP else FLOOR to CAP
        val intensity = minOf(hi, lo + (hi - lo) * speed / FULL_SPEED)
        play(if (pull) KHapticEvent.Pull(intensity) else KHapticEvent.Hit(intensity))
        lastHit = now
    }

    private companion object {
        /** dp: how close counts as touching (the snap crawls its last points). */
        const val TOLERANCE = 4f
        const val REARM = 8f
        const val GAP = 60L
        const val WINDOW = 100L
        const val FLOOR = 0.4f
        const val CAP = 0.9f
        const val PULL_FLOOR = 0.5f
        const val PULL_CAP = 0.85f
        /** dp/s at which the tap reaches the cap. */
        const val FULL_SPEED = 2400f
    }
}
