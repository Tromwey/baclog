package com.tromwey.kura.data.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import java.time.Duration
import java.time.Instant
import java.util.UUID

// The feed (`FeedEvent`, its page) and the Descubrir and recap payloads — the twin of
// `ios/Kura/Models/Feed.swift`.

sealed interface FeedKind {
    data object Obsessed : FeedKind
    data class Completed(val mark: Mark?) : FeedKind
    data object Reviewed : FeedKind
    data class Added(val collection: String) : FeedKind
    /** A waiting add: "No puede esperar · sale el 17 jul". */
    data class WaitingAdd(val collection: String, val label: String) : FeedKind
    data class Burst(val collection: String, val titleIds: List<String>) : FeedKind
    data class Suggestion(val personId: String, val reason: String, val social: String, val titleIds: List<String>) : FeedKind
}

@Serializable(with = FeedEvent.Serializer::class)
data class FeedEvent(
    val id: String,
    val authorId: String,
    val kind: FeedKind,
    val titleId: String? = null,
    val ageHours: Double,
    val reviewId: String? = null,
    /** Wire timestamp; `ageHours` is derived from it against the store's clock. */
    val at: Instant? = null,
    /** `added` events for unreleased titles carry it (→ `WaitingAdd` in the store). */
    val releaseDate: Instant? = null,
    val embeddedTitle: Title? = null,
    val embeddedAuthor: Person? = null,
    val embeddedReview: Review? = null,
    /** `added` only: the collection's id — a burst joins by id (names aren't unique per user). */
    val collectionId: String? = null,
    /** `Burst` only: when its OLDEST add happened (`at` is the newest), for the sitting gap. */
    val oldestAt: Instant? = null,
) {
    enum class Tier { L, M, S }

    val tier: Tier get() = when (kind) {
        is FeedKind.Reviewed, is FeedKind.Suggestion -> Tier.L
        // Every cover card — add, burst, obsession, completion — is one size.
        else -> Tier.M
    }

    internal object Serializer : WireSerializer<FeedEvent>("FeedEvent") {
        override fun read(e: JsonElement): FeedEvent {
            val c = Obj.of(e)
            val author = c.decode("author", Person.serializer())
            val authorId = author?.handle ?: ""
            val title = c.decode("title", Title.serializer())
            val titleId = c.string("titleId") ?: title?.id
            val at = c.instant("at")
            val mark = Mark.lenient(c.string("mark"))
            val rid = c.string("reviewId")
            val body = c.string("reviewBody")
            val review = if (rid != null && body != null && titleId != null) {
                Review(id = rid, authorId = authorId, titleId = titleId, text = body, mark = mark,
                    spoiler = c.bool("hasSpoiler") ?: false, date = at ?: Instant.now())
            } else null
            var collectionId: String? = null
            val kind: FeedKind = when (val other = c.lenientString("kind") ?: "") {
                "obsessed" -> FeedKind.Obsessed
                "completed" -> FeedKind.Completed(if (mark == Mark.Completed) null else mark)
                "reviewed" -> FeedKind.Reviewed
                "added" -> {
                    collectionId = c.string("collectionId")
                    FeedKind.Added(c.string("collectionName") ?: "")
                }
                "suggest" -> {
                    val s = c.obj("suggest")
                    FeedKind.Suggestion(authorId, s?.string("reason") ?: "", s?.string("common") ?: "", s?.strings("titleIds") ?: emptyList())
                }
                // A kind this build doesn't know: the event is dropped by the list that reads it (`lossyList`),
                // never drawn as an "added" card with no collection.
                else -> throw WireException("kind de feed desconocido: ${other.take(40)}")
            }
            return FeedEvent(
                id = c.string("id") ?: UUID.randomUUID().toString(),
                authorId = authorId,
                kind = kind,
                titleId = titleId,
                ageHours = 0.0,
                reviewId = rid,
                at = at,
                releaseDate = c.instant("releaseDate"),
                embeddedTitle = title,
                embeddedAuthor = author,
                embeddedReview = review,
                collectionId = collectionId,
            )
        }
    }
}

/**
 * The app's half of the feed's card assembly — the same rule as the web's `groupIntoCards`
 * (src/modules/social/group.ts): consecutive adds by the same author to the SAME collection (by
 * id), each within `GAP` of the run's previous add, fold into one `Burst` from the second one on.
 * "No puede esperar" adds, and any other event, break the run.
 */
object FeedBursts {
    val GAP: Duration = Duration.ofHours(6)

    /** `events` (newest first, like the wire) appended to `feed`, folding as it goes. Works across
     *  pages: the next page's first add joins the burst the previous page ended with. */
    fun append(events: List<FeedEvent>, feed: List<FeedEvent>): List<FeedEvent> {
        val out = feed.toMutableList()
        for (e in events) {
            val joined = out.lastOrNull()?.let { join(it, e) }
            if (joined != null) out[out.size - 1] = joined else out.add(e)
        }
        return out
    }

    private fun within(newer: Instant, older: Instant) = Duration.between(older, newer) <= GAP

    private fun join(run: FeedEvent, e: FeedEvent): FeedEvent? {
        if (e.kind !is FeedKind.Added) return null
        val col = e.collectionId ?: return null
        val tid = e.titleId ?: return null
        val at = e.at ?: return null
        if (run.authorId != e.authorId || run.collectionId != col) return null
        return when (val k = run.kind) {
            is FeedKind.Added -> {
                val first = run.titleId ?: return null
                val runAt = run.at ?: return null
                if (!within(runAt, at)) return null
                run.copy(id = "burst:${run.id}", kind = FeedKind.Burst(k.collection, listOf(first, tid)), titleId = null, oldestAt = at)
            }
            is FeedKind.Burst -> {
                val oldest = run.oldestAt ?: return null
                if (!within(oldest, at) || k.titleIds.contains(tid)) return null
                run.copy(kind = FeedKind.Burst(k.collection, k.titleIds + tid), oldestAt = at)
            }
            else -> null
        }
    }
}

// MARK: Pages and payloads (§4)

@Serializable(with = FeedPage.Serializer::class)
data class FeedPage(val items: List<FeedEvent>, val nextCursor: String? = null) {
    internal object Serializer : WireSerializer<FeedPage>("FeedPage") {
        override fun read(e: JsonElement): FeedPage {
            val c = Obj.of(e)
            return FeedPage(c.list("items", FeedEvent.serializer(), strict = true) ?: emptyList(), c.string("nextCursor"))
        }
    }
}

/** `GET /discover`. */
@Serializable(with = DiscoverPayload.Serializer::class)
data class DiscoverPayload(
    val recommended: List<Recommended>,
    val trending: List<Trending>,
    val upcoming: List<Upcoming>,
    /** "próximos discos" on the Música page (≤ 12). Empty from an older server → `upcoming`'s albums. */
    val upcomingAlbums: List<Upcoming> = emptyList(),
    val collections: List<FollowedCollection> = emptyList(),
) {
    @Serializable(with = Recommended.Serializer::class)
    data class Recommended(
        val title: Title,
        val reason: String,
        val seedTitleId: String? = null,
        /** The obsession the card hangs from — its cover sits tilted behind the reco's. */
        val seed: Title? = null,
    ) {
        internal object Serializer : WireSerializer<Recommended>("Recommended") {
            override fun read(e: JsonElement): Recommended {
                val c = Obj.of(e)
                return Recommended(c.require("title", Title.serializer()), c.string("reason") ?: "",
                    c.string("seedTitleId"), c.decode("seed", Title.serializer()))
            }
        }
    }

    @Serializable(with = Trending.Serializer::class)
    data class Trending(
        val title: Title,
        val saves: Int,
        /** Android extra (API.md §4 `people: [handle]`; iOS ignores it). */
        val people: List<String> = emptyList(),
    ) {
        internal object Serializer : WireSerializer<Trending>("Trending") {
            override fun read(e: JsonElement): Trending {
                val c = Obj.of(e)
                return Trending(c.require("title", Title.serializer()), c.int("saves") ?: 0, c.strings("people") ?: emptyList())
            }
        }
    }

    /** "los más esperados": a title still ahead NOT in your library, ranked by how many Kura people
     *  saved it (≤ 20). The wire's `collection: null` is ignored. */
    @Serializable(with = Upcoming.Serializer::class)
    data class Upcoming(
        val title: Title,
        val releaseDate: Instant? = null,
        /** "N lo esperan". */
        val waiting: Int = 0,
    ) {
        internal object Serializer : WireSerializer<Upcoming>("Upcoming") {
            override fun read(e: JsonElement): Upcoming {
                val c = Obj.of(e)
                return Upcoming(c.require("title", Title.serializer()), c.instant("releaseDate"), c.int("waiting") ?: 0)
            }
        }
    }

    /** "colecciones para ti · de gente que sigues": a followed person's showcased collection. */
    @Serializable(with = FollowedCollection.Serializer::class)
    data class FollowedCollection(
        val id: String,
        val name: String,
        val owner: String,
        val handle: String,
        val avatarUrl: String?,
        val count: Int,
        val palette: List<String>,
        /** The fan, front first (≤ 3). */
        val covers: List<Title>,
        /** Android extra (API.md §4 sends it; iOS ignores it). */
        val format: String? = null,
    ) {
        internal object Serializer : WireSerializer<FollowedCollection>("FollowedCollection") {
            override fun read(e: JsonElement): FollowedCollection {
                val c = Obj.of(e)
                return FollowedCollection(
                    id = c.requireString("id"), name = c.requireString("name"), owner = c.requireString("owner"),
                    handle = c.requireString("handle"), avatarUrl = c.string("avatarUrl"), count = c.int("count") ?: Obj.missing("count"),
                    palette = c.strings("palette") ?: Obj.missing("palette"), covers = c.list("covers", Title.serializer()) ?: Obj.missing("covers"),
                    format = c.lenientString("format"),
                )
            }
        }
    }

    val allTitles: List<Title> get() =
        recommended.map { it.title } + recommended.mapNotNull { it.seed } + trending.map { it.title } +
            upcoming.map { it.title } + upcomingAlbums.map { it.title } + collections.flatMap { it.covers }

    internal object Serializer : WireSerializer<DiscoverPayload>("DiscoverPayload") {
        override fun read(e: JsonElement): DiscoverPayload {
            val c = Obj.of(e)
            return DiscoverPayload(
                recommended = c.list("recommended", Recommended.serializer()) ?: emptyList(),
                trending = c.list("trending", Trending.serializer()) ?: emptyList(),
                upcoming = c.list("upcoming", Upcoming.serializer()) ?: emptyList(),
                upcomingAlbums = c.list("upcomingAlbums", Upcoming.serializer()) ?: emptyList(),
                collections = c.list("collections", FollowedCollection.serializer()) ?: emptyList(),
            )
        }
    }
}

/** `GET /discover/creators` — "lo nuevo de tus favoritos". Slowish (external APIs server-side): its
 *  own request AFTER `/discover`, and it fails silently (no section). */
@Serializable(with = DiscoverCreatorsPayload.Serializer::class)
data class DiscoverCreatorsPayload(val items: List<Item> = emptyList()) {
    enum class Role(val rawValue: String) { Artist("artist"), Director("director"), Creator("creator") }

    data class Credit(val name: String, /** Unknown roles are null rather than failing the item. */ val role: Role?)

    @Serializable(with = Item.Serializer::class)
    data class Item(val title: Title, val releaseDate: Instant? = null, /** "de {name}". */ val creator: Credit) {
        val id: String get() = title.id

        internal object Serializer : WireSerializer<Item>("DiscoverCreatorsItem") {
            override fun read(e: JsonElement): Item {
                val c = Obj.of(e)
                val cr = c.obj("creator") ?: Obj.missing("creator")
                val role = cr.lenientString("role")?.let { r -> Role.entries.firstOrNull { it.rawValue == r } }
                return Item(c.require("title", Title.serializer()), c.instant("releaseDate"), Credit(cr.requireString("name"), role))
            }
        }
    }

    internal object Serializer : WireSerializer<DiscoverCreatorsPayload>("DiscoverCreatorsPayload") {
        override fun read(e: JsonElement) = DiscoverCreatorsPayload(Obj.of(e).list("items", Item.serializer()) ?: emptyList())
    }
}

/** `GET /discover/formats/{film|series|album}` — Descubrir por formato. The vocabularies come IN
 *  the payload; the genre mapping lives once, on the server. */
@Serializable(with = DiscoverFormatPayload.Serializer::class)
data class DiscoverFormatPayload(
    val format: MediaFormat,
    val time: Int? = null,
    val times: List<Choice> = emptyList(),
    val lenses: List<Choice> = emptyList(),
    val moods: List<Mood> = emptyList(),
    val titles: List<Item> = emptyList(),
    val kuradas: List<Kurada> = emptyList(),
    /** The shelf's provider failed but the Kuradas came (additive, absent normally): `titles` is NOT
     *  "an empty shelf" — the page offers Reintentar over the Kuradas and the store asks again. */
    val titlesUnavailable: Boolean = false,
) {
    /** "¿cuánto tiempo tienes?" (cine) / the marathon lenses (series, with `maxMinutes`). */
    data class Choice(val label: String, val sub: String, val maxMinutes: Int? = null)

    /** A humor (cine) or moment (música): its label and the two tones. */
    data class Mood(val label: String, val palette: List<String>)

    @Serializable(with = Item.Serializer::class)
    data class Item(
        val title: Title,
        /** Cine: minutes (null = unknown, no pill), "En cines", Spanish genre. */
        val runtimeMinutes: Int? = null,
        val inCinemas: Boolean = false,
        val genre: String? = null,
        /** Cine / música: indices into `moods`. */
        val moods: List<Int> = emptyList(),
        /** Series: the whole series' running time, episodes and network. */
        val minutes: Int? = null,
        val episodes: Int? = null,
        val network: String? = null,
    ) {
        val id: String get() = title.id

        internal object Serializer : WireSerializer<Item>("DiscoverFormatItem") {
            override fun read(e: JsonElement): Item {
                val c = Obj.of(e)
                return Item(
                    title = c.require("title", Title.serializer()), runtimeMinutes = c.int("runtimeMinutes"),
                    inCinemas = c.bool("inCinemas") ?: false, genre = c.string("genre"), moods = c.ints("moods") ?: emptyList(),
                    minutes = c.int("minutes"), episodes = c.int("episodes"), network = c.string("network"),
                )
            }
        }
    }

    /** Colecciones Kuradas: a team account's public collection, opened as a public collection. */
    data class Kurada(
        val id: String, val name: String, val curator: String, val handle: String, val count: Int,
        val palette: List<String>, /** The fan, front first (≤ 3). */ val covers: List<Title>,
    )

    val allTitles: List<Title> get() = titles.map { it.title } + kuradas.flatMap { it.covers }

    internal object Serializer : WireSerializer<DiscoverFormatPayload>("DiscoverFormatPayload") {
        private fun choice(e: JsonElement) = Obj.of(e).let { Choice(it.requireString("label"), it.requireString("sub"), it.int("maxMinutes")) }
        private fun mood(e: JsonElement) = Obj.of(e).let { Mood(it.requireString("label"), it.strings("palette") ?: Obj.missing("palette")) }
        private fun kurada(e: JsonElement) = Obj.of(e).let {
            Kurada(it.requireString("id"), it.requireString("name"), it.requireString("curator"), it.requireString("handle"),
                it.int("count") ?: Obj.missing("count"), it.strings("palette") ?: Obj.missing("palette"),
                it.list("covers", Title.serializer()) ?: Obj.missing("covers"))
        }

        override fun read(e: JsonElement): DiscoverFormatPayload {
            val c = Obj.of(e)
            val raw = c.requireString("format")
            return DiscoverFormatPayload(
                format = MediaFormat.from(raw) ?: throw WireException("format desconocido: ${raw.take(40)}"),
                time = c.int("time"),
                times = c.array("times")?.map(::choice) ?: emptyList(),
                lenses = c.array("lenses")?.map(::choice) ?: emptyList(),
                moods = c.array("moods")?.map(::mood) ?: emptyList(),
                titles = c.list("titles", Item.serializer()) ?: emptyList(),
                kuradas = c.array("kuradas")?.map(::kurada) ?: emptyList(),
                titlesUnavailable = c.bool("titlesUnavailable") ?: false,
            )
        }
    }
}

/** `GET /recap/months` item. */
@Serializable(with = RecapMonth.Serializer::class)
data class RecapMonth(val era: String, val label: String) {
    val id: String get() = era

    internal object Serializer : WireSerializer<RecapMonth>("RecapMonth") {
        override fun read(e: JsonElement): RecapMonth {
            val c = Obj.of(e)
            val era = c.requireString("era")
            return RecapMonth(era, c.string("label") ?: era)
        }
    }
}

/** `GET /recap/{era}`. */
@Serializable(with = RecapPayload.Serializer::class)
data class RecapPayload(
    /** "2026-08" — `LiveApi` fills it from the path when the body doesn't carry it. */
    val era: String,
    /** "agosto" */
    val month: String,
    val year: Int,
    val stats: Stats,
    val top: Title?,
    val also: List<Title>,
) {
    data class Stats(val completed: Int = 0, val obsessed: Int = 0, val reviews: Int = 0, val saved: Int = 0, val hours: Int? = null)

    /** This payload with `era` (and the month/year it implies) set. */
    fun adopting(era: String, label: String?): RecapPayload {
        val parts = era.split("-")
        val y = parts.firstOrNull()?.toIntOrNull() ?: year
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val month = label?.split(" ")?.firstOrNull()?.takeIf { it.isNotEmpty() }
            ?: if (m in 1..12) MONTH_NAMES[m - 1] else era
        return copy(era = era, year = y, month = month)
    }

    companion object {
        val MONTH_NAMES = listOf("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")
    }

    internal object Serializer : WireSerializer<RecapPayload>("RecapPayload") {
        override fun read(e: JsonElement): RecapPayload {
            val c = Obj.of(e)
            val s = c.obj("stats")
            val stats = s?.let {
                Stats(it.int("completed") ?: 0, it.int("obsessed") ?: it.int("obsessions") ?: 0, it.int("reviews") ?: 0,
                    it.int("saved") ?: 0, it.int("hours"))
            } ?: Stats()
            val base = RecapPayload("", "", 0, stats, c.decode("top", Title.serializer()), c.list("also", Title.serializer()) ?: emptyList())
            return c.string("era")?.let { base.adopting(it, c.string("label")) } ?: base
        }
    }
}
