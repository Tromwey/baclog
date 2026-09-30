package com.tromwey.kura.state

import com.tromwey.kura.data.models.Release
import com.tromwey.kura.data.models.Releases
import com.tromwey.kura.data.models.Title
import java.time.Instant

// "No puedo esperar": release labels and sentences, and the derived waiting list — twin of
// `AppStore+Releases.swift`. The pure logic lives in `data/models/Releases.kt` (it takes `now`
// explicitly); these are the store's `now`-bound forwards, same names as iOS.

/** True while the title (or, for a series, its announced season) is not out. */
fun AppStore.isUnreleased(t: Title): Boolean = Releases.isUnreleased(t, now)

fun AppStore.isUnreleased(r: Release): Boolean = Releases.isUnreleased(r, now)

/** Release day on the Mexico City calendar ("hoy"): a mark still needs `preview: true` for a few hours. */
fun AppStore.isReleaseDay(t: Title): Boolean = Releases.isReleaseDay(t, now)

/** The DS countdown: "14 h", "3 d", "16 oct", "oct 2026", "2027", "sin fecha", "hoy", "ya salió". */
fun AppStore.label(r: Release): String = Releases.label(r, now)

fun AppStore.releaseLabel(t: Title, withSeason: Boolean = false): String? = Releases.releaseLabel(t, now, withSeason)

/** Long form for sentences: "sale el 16 oct". */
fun AppStore.sentence(r: Release): String = Releases.sentence(r, now)

fun AppStore.releaseStart(r: Release): Instant? = Releases.releaseStart(r)

fun AppStore.releaseSentence(t: Title): String? = Releases.releaseSentence(t, now)

/**
 * The automatic collection: announced titles you saved, until you complete them. DERIVED on every
 * change of titles, states, collections or the clock — never persisted, never a server collection.
 */
val AppStore.waitingTitles: List<Title>
    get() {
        val titles = s.titles
        val states = s.userTitles
        val cols = s.collections
        val at = now // observed: the clock moves "ya salió" / the order
        return s.waitingMemo.get(titles, states, cols, at) {
            Releases.waitingTitles(
                library = libraryIds.mapNotNull { titles[it] },
                now = at,
                markOf = { states[it]?.mark },
                savedAtOf = { states[it]?.savedAt },
            )
        }
    }
