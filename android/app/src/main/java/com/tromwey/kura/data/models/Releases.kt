package com.tromwey.kura.data.models

import java.time.Duration
import java.time.Instant
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlin.math.ceil
import kotlin.math.max

/**
 * "No puedo esperar": release labels and sentences, and the derived waiting list — the pure half
 * of `ios/Kura/State/AppStore+Releases.swift` (iOS keeps it on the store; here it takes the clock
 * `now` explicitly so the store AND the tests call the same code). Release days are read on
 * Mexico City's calendar (`KCalendar`).
 */
object Releases {
    private val MONTHS = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

    /** True while the title (or, for a series, its announced season) is not out. */
    fun isUnreleased(t: Title, now: Instant): Boolean {
        val r = t.release ?: return false
        if (t.upcomingSeason != null) return false // the show itself is out; the season waits
        return isUnreleased(r, now)
    }

    fun isUnreleased(r: Release, now: Instant): Boolean = when (r) {
        is Release.Day -> KCalendar.date(r.date) > KCalendar.date(now)
        is Release.Month -> YearMonth.of(r.year, r.month) > YearMonth.from(KCalendar.date(now))
        is Release.Year -> r.year > KCalendar.date(now).year
        Release.Unknown -> true
    }

    /** Release day on the Mexico City calendar ("hoy"): the server compares the stored instant, so
     *  for a few hours it still says "upcoming" and a mark needs `preview: true`. */
    fun isReleaseDay(t: Title, now: Instant): Boolean {
        val r = t.release as? Release.Day ?: return false
        return KCalendar.date(r.date) == KCalendar.date(now)
    }

    /** The DS countdown: "14 h", "3 d", "16 oct", "oct 2026", "2027", "sin fecha", "hoy", "ya salió". */
    fun label(r: Release, now: Instant): String = when (r) {
        is Release.Day -> {
            val today = KCalendar.date(now)
            val day = KCalendar.date(r.date)
            when {
                day < today -> "ya salió"
                day == today -> "hoy"
                else -> {
                    val days = ChronoUnit.DAYS.between(today, day)
                    val hours = ceil(Duration.between(now, r.date).toMillis() / 3_600_000.0).toInt()
                    when {
                        days <= 1 && hours <= 24 -> "${max(hours, 1)} h"
                        days <= 7 -> "$days d"
                        else -> {
                            val s = "${day.dayOfMonth} ${MONTHS[day.monthValue - 1]}"
                            if (day.year != today.year) "$s ${day.year}" else s
                        }
                    }
                }
            }
        }
        is Release.Month -> "${MONTHS[r.month - 1]} ${r.year}"
        is Release.Year -> "${r.year}"
        Release.Unknown -> "sin fecha"
    }

    fun releaseLabel(t: Title, now: Instant, withSeason: Boolean = false): String? {
        val r = t.release ?: return null
        val base = label(r, now)
        val s = t.upcomingSeason
        return if (withSeason && s != null) "T$s · $base" else base
    }

    /** Long form for sentences: "sale el 16 oct". */
    fun sentence(r: Release, now: Instant): String {
        val text = label(r, now)
        return when (text) {
            "ya salió", "hoy", "sin fecha" -> text
            else -> when {
                text.endsWith(" h") || text.endsWith(" d") -> "sale en $text"
                r is Release.Day -> "sale el $text"
                else -> "sale en $text" // "sale en oct 2026" / "sale en 2027"
            }
        }
    }

    fun releaseSentence(t: Title, now: Instant): String? = t.release?.let { sentence(it, now) }

    /** The first moment of the release period, on the Mexico City calendar (null = no date). */
    fun releaseStart(r: Release): Instant? = when (r) {
        is Release.Day -> KCalendar.startOfDay(r.date)
        is Release.Month -> KCalendar.startOfDay(YearMonth.of(r.year, r.month).atDay(1))
        is Release.Year -> KCalendar.startOfDay(YearMonth.of(r.year, 1).atDay(1))
        Release.Unknown -> null
    }

    /**
     * The automatic collection: announced titles you saved, until you complete them (any mark).
     * Once out, a title stays ("ya salió") only if you saved it while it was still announced (or
     * while we don't know yet when you saved it — `savedAt` null). Order: dated days, months,
     * years, "sin fecha", and "ya salió" LAST (the list leads with what's still coming).
     *
     * @param library your library's titles (the store's `libraryIDs` resolved), any order.
     * @param markOf your mark per title id (null = saved without a state).
     * @param savedAtOf when you saved it (null = your library state hasn't arrived yet).
     */
    fun waitingTitles(
        library: List<Title>,
        now: Instant,
        markOf: (String) -> Mark?,
        savedAtOf: (String) -> Instant?,
    ): List<Title> {
        val list = library.filter { t ->
            val r = t.release ?: return@filter false
            if (markOf(t.id) != null) return@filter false
            if (isUnreleased(t, now) || t.upcomingSeason != null) return@filter true
            val out = releaseStart(r) ?: return@filter false
            val savedAt = savedAtOf(t.id) ?: return@filter true
            savedAt < out
        }
        fun key(t: Title): Pair<Int, Instant> {
            val r = t.release ?: return 9 to Instant.MAX
            if (!isUnreleased(t, now) && t.upcomingSeason == null) return 5 to Instant.MIN
            return when (r) {
                is Release.Day -> 1 to r.date
                is Release.Month -> 2 to KCalendar.startOfDay(YearMonth.of(r.year, r.month).atDay(1))
                is Release.Year -> 3 to KCalendar.startOfDay(YearMonth.of(r.year, 1).atDay(1))
                Release.Unknown -> 4 to Instant.MAX
            }
        }
        return list.sortedWith(compareBy<Title> { key(it).first }.thenBy { key(it).second })
    }
}
