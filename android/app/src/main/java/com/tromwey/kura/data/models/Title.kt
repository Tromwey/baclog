package com.tromwey.kura.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import com.tromwey.kura.data.api.KuraLog
import java.time.Instant

// Titles: formats, marks, releases, the title and its parts, your state per title, reviews and
// the ficha payloads — the twin of `ios/Kura/Models/Title.swift`.

// MARK: Formats

@Serializable
enum class MediaFormat(val rawValue: String) {
    @SerialName("film") Film("film"),
    @SerialName("series") Series("series"),
    @SerialName("album") Album("album");

    /** Segmented / chip label ("Películas"). */
    val label: String get() = when (this) { Film -> "Películas"; Series -> "Series"; Album -> "Álbumes" }

    /** Section name inside a collection (Newsreader, lowercase). */
    val sectionName: String get() = when (this) { Film -> "películas"; Series -> "series"; Album -> "álbumes" }

    /** Singular for meta lines ("Película · 2001"). */
    val metaLabel: String get() = when (this) { Film -> "Película"; Series -> "Serie"; Album -> "Álbum" }

    /** width / height — póster 2:3, disco 1:1. */
    val aspect: Float get() = if (this == Album) 1f else 2f / 3f

    companion object {
        fun from(raw: String?): MediaFormat? = entries.firstOrNull { it.rawValue == raw }
    }
}

// MARK: Marks (your reaction / state)

/** The per-title state. `Liked`/`Obsessed` imply completed; `Completed` is "Solo completo". `null` = saved without a state.
 *  (The glyph lives in the design system: thumb / flame / check.) */
enum class Mark(val rawValue: String) {
    Liked("liked"), Obsessed("obsessed"), Completed("completed");

    /** First person — for what's yours. */
    val myLabel: String get() = when (this) { Liked -> "Me gusta"; Obsessed -> "Me obsesiona"; Completed -> "Completo" }

    /** Third person — for others. */
    val theirLabel: String get() = when (this) { Liked -> "Le gusta"; Obsessed -> "Le obsesiona"; Completed -> "Completo" }

    /** Order used by "Ordenar · Estado". */
    val rank: Int get() = when (this) { Obsessed -> 0; Liked -> 1; Completed -> 2 }

    companion object {
        /** `PublicMark` adds `disliked`, which Kura has no glyph for: it reads as completed. Unknown → null. */
        fun lenient(raw: String?): Mark? {
            if (raw == null) return null
            if (raw == "disliked") return Completed
            return entries.firstOrNull { it.rawValue == raw }
        }
    }
}

// MARK: Release ("no puedo esperar")

/** Only for announced titles. Drives the automatic "no puedo esperar" collection.
 *  Wire: `{ kind: "day"|"month"|"year"|"unknown", date? }`. Day = the UTC date at 12:00 UTC. */
sealed interface Release {
    data class Day(val date: Instant) : Release
    data class Month(val year: Int, val month: Int) : Release
    data class Year(val year: Int) : Release
    data object Unknown : Release

    companion object {
        internal fun read(o: Obj): Release {
            val date = o.instant("date")
            val utc = date?.let { KuraJson.utcDate(it) }
            // A shape this client doesn't know still reads as "sin fecha" (the title stays usable),
            // but it's contract drift: it leaves a trace (the kind only, never the payload).
            fun drift(what: String): Release {
                KuraLog.w("KuraModels", "release: $what → Unknown")
                return Unknown
            }
            return when (val kind = o.string("kind") ?: "unknown") {
                "day" -> date?.let { Day(KuraJson.dayAtNoon(it)) } ?: drift("kind=day sin date")
                "month" -> utc?.let { Month(it.year, it.monthValue) } ?: drift("kind=month sin date")
                "year" -> utc?.let { Year(it.year) } ?: drift("kind=year sin date")
                "unknown" -> Unknown
                else -> drift("kind desconocido ($kind)")
            }
        }
    }
}

// MARK: Title parts

@Serializable(with = Track.Serializer::class)
data class Track(
    val number: Int,
    val name: String,
    val isNew: Boolean = false,
    val available: Boolean = true,
    /** Android extra: the server sends it (iOS ignores it). */
    val durationMs: Int? = null,
) {
    val id: Int get() = number

    internal object Serializer : WireSerializer<Track>("Track") {
        override fun read(e: JsonElement): Track {
            val c = Obj.of(e)
            return Track(
                number = c.int("number") ?: 0,
                name = c.string("name") ?: c.string("title") ?: "",
                isNew = c.bool("isNew") ?: false,
                available = c.bool("available") ?: true,
                durationMs = c.int("durationMs"),
            )
        }
    }
}

/** Episode list — mock only (the wire has no episodes, §4 → 501). */
@Serializable(with = Season.Serializer::class)
data class Season(val number: Int, val episodes: List<String>) {
    val id: Int get() = number

    internal object Serializer : WireSerializer<Season>("Season") {
        override fun read(e: JsonElement): Season {
            val c = Obj.of(e)
            return Season(c.int("number") ?: Obj.missing("number"), c.strings("episodes") ?: Obj.missing("episodes"))
        }
    }
}

/** Wire `seriesStatus { kind: ended|airing, seasons }`. */
@Serializable(with = SeriesStatus.Serializer::class)
data class SeriesStatus(val kind: String, val seasons: Int) {
    internal object Serializer : WireSerializer<SeriesStatus>("SeriesStatus") {
        override fun read(e: JsonElement): SeriesStatus {
            val c = Obj.of(e)
            return SeriesStatus(c.string("kind") ?: "ended", c.int("seasons") ?: 0)
        }
    }
}

@Serializable(with = WatchOption.Serializer::class)
data class WatchOption(
    val short: String,
    val name: String,
    val kind: String,
    /** Deep link from JustWatch / the preferred music service, when the API has one. */
    val url: String? = null,
) {
    val id: String get() = name
    /** Theatrical row ("En cines"): its label is computed from the release date. */
    val isCinema: Boolean get() = short == "cine"

    internal object Serializer : WireSerializer<WatchOption>("WatchOption") {
        override fun read(e: JsonElement): WatchOption {
            val c = Obj.of(e)
            val n = c.string("name") ?: c.string("provider") ?: ""
            return WatchOption(
                short = c.string("short") ?: n.lowercase().take(3),
                name = n,
                kind = c.string("kind") ?: "",
                url = c.string("url"),
            )
        }
    }
}

/** Ribbon counts. Strings because the frames show "12,4 k"; what the API doesn't have is "—" / null. */
@Serializable(with = TitleCounts.Serializer::class)
data class TitleCounts(
    val obsessed: String,
    val liked: String,
    val completed: String,
    val waiting: String? = null,
    val saved: String,
) {
    internal object Serializer : WireSerializer<TitleCounts>("TitleCounts") {
        override fun read(e: JsonElement): TitleCounts {
            val c = Obj.of(e)
            fun s(k: String) = c.int(k)?.let(KuraJson::count)
            return TitleCounts(
                obsessed = s("obsessed") ?: "—",
                liked = s("liked") ?: "—",
                completed = s("completed") ?: "—",
                waiting = s("waiting"),
                saved = s("saved") ?: "—",
            )
        }
    }
}

// MARK: Title

@Serializable(with = Title.Serializer::class)
data class Title(
    val id: String,
    val name: String,
    val format: MediaFormat,
    val year: Int? = null,
    /** `byline` on the wire: studio/network on video (often null), artist on music. Never "". */
    val creator: String?,
    /** "125 min", "2 temporadas", "18 canciones". */
    val detail: String? = null,
    val palette: List<String>,
    val coverUrl: String? = null,
    val synopsis: String? = null,
    /** Set for announced titles (saved before release). */
    val release: Release? = null,
    /** Series: announced next season number. */
    val upcomingSeason: Int? = null,
    val tracks: List<Track> = emptyList(),
    val trackCount: Int? = null,
    val seasons: List<Season> = emptyList(),
    val counts: TitleCounts? = null,
    val watch: List<WatchOption> = emptyList(),
    val musicLink: String? = null,
    /** Line under "dónde ver" (e.g. "Todavía no está en streaming en México."). */
    val watchNote: String? = null,
    /** E4 · not available here: where it is instead. */
    val watchElsewhere: String? = null,
    /** Search results not yet cached by the backend carry this instead of a real id. */
    val externalRef: ExternalRef? = null,
    val genre: String? = null,
    val seriesStatus: SeriesStatus? = null,
) {
    val lowerCreator: String? get() = creator?.lowercase()
    /** The creator's last word ("Miyazaki") for tight meta lines. */
    val creatorShort: String? get() = creator?.split(" ")?.lastOrNull { it.isNotEmpty() }
    val isExternal: Boolean get() = externalRef != null
    /** `GET /titles/{id}` filled the detail fields (summary payloads don't). */
    val isDetailed: Boolean get() = synopsis != null || counts != null || watch.isNotEmpty() || tracks.isNotEmpty()

    internal object Serializer : WireSerializer<Title>("Title") {
        override fun read(e: JsonElement): Title = read(Obj.of(e))

        fun read(c: Obj): Title {
            val externalRef = c.decode("externalRef", ExternalRef.serializer())
            val byline = c.string("creator") ?: c.string("byline")
            val seriesStatus = c.decode("seriesStatus", SeriesStatus.serializer())
            val formatRaw = c.string("format")
            // `watch` is "one JustWatch option" — a single object or an array.
            val watch = when (val w = c.el("watch")) {
                null -> emptyList()
                is JsonObject -> listOf(KuraJson.json.decodeFromJsonElement(WatchOption.serializer(), w))
                is JsonArray -> c.list("watch", WatchOption.serializer()) ?: emptyList()
                else -> Obj.mismatch("watch", "WatchOption")
            }
            var detail = c.string("detail")
            if (detail == null && seriesStatus != null && seriesStatus.seasons > 0) {
                detail = if (seriesStatus.seasons == 1) "1 temporada" else "${seriesStatus.seasons} temporadas"
            }
            return Title(
                // Never an invented id: a random one would be a title nobody can save, open or match.
                id = c.string("id") ?: externalRef?.localId ?: Obj.missing("id"),
                name = c.string("name") ?: c.string("title") ?: "",
                // Never a guessed format: a song drawn as a film is a wrong cover shape and a wrong verb.
                format = formatRaw?.let { MediaFormat.from(it) ?: throw WireException("format desconocido: ${it.take(40)}") }
                    ?: Obj.missing("format"),
                year = c.int("year"),
                creator = byline?.takeUnless { it.isBlank() },
                detail = detail,
                palette = c.strings("palette") ?: emptyList(),
                coverUrl = c.string("coverUrl"),
                synopsis = c.string("synopsis") ?: c.string("overview"),
                release = c.obj("release")?.let(Release::read),
                upcomingSeason = c.int("upcomingSeason"),
                tracks = c.list("tracks", Track.serializer()) ?: emptyList(),
                trackCount = c.int("trackCount"),
                seasons = c.list("seasons", Season.serializer()) ?: emptyList(),
                counts = c.decode("counts", TitleCounts.serializer()),
                watch = watch,
                musicLink = c.string("musicLink"),
                watchNote = c.string("watchNote"),
                watchElsewhere = c.string("watchElsewhere"),
                externalRef = externalRef,
                genre = c.string("genre"),
                seriesStatus = seriesStatus,
            )
        }
    }
}

/** `{ source: "tmdb"|"itunes", externalId }` — a catalog item the backend hasn't cached yet. */
@Serializable
data class ExternalRef(val source: String, val externalId: String) {
    /** Stable local id until the backend gives us a real one. */
    val localId: String get() = "ext:$source:$externalId"

    companion object {
        fun parse(localId: String): ExternalRef? {
            val parts = localId.split(":", limit = 3)
            if (parts.size != 3 || parts[0] != "ext") return null
            return ExternalRef(parts[1], parts[2])
        }
    }
}

/** How a title is named when writing: by id, or by external ref (§4 PUT membership). */
sealed interface TitleRef {
    data class Id(val id: String) : TitleRef
    data class External(val source: String, val externalId: String) : TitleRef

    val isExternal: Boolean get() = this is External

    /** `{ id }` or `{ externalRef: { source, externalId } }`. */
    fun toJson(): JsonObject = when (this) {
        is Id -> buildJsonObject { put("id", id) }
        is External -> buildJsonObject {
            put("externalRef", buildJsonObject { put("source", source); put("externalId", externalId) })
        }
    }

    companion object {
        /** The local id → the right ref (external ids are prefixed `ext:`). */
        fun from(localId: String): TitleRef =
            ExternalRef.parse(localId)?.let { External(it.source, it.externalId) } ?: Id(localId)
    }
}

/** `GET /search` item: a partial `Title` plus, for uncached items, `externalRef`. */
@Serializable(with = SearchResult.Serializer::class)
data class SearchResult(val title: Title) {
    val id: String get() = title.id
    val ref: TitleRef get() = TitleRef.from(title.id)

    internal object Serializer : WireSerializer<SearchResult>("SearchResult") {
        override fun read(e: JsonElement) = SearchResult(Title.Serializer.read(e))
    }
}

// MARK: Reviews

@Serializable(with = Review.Serializer::class)
data class Review(
    val id: String,
    val authorId: String,
    val titleId: String,
    val text: String,
    val mark: Mark?,
    val spoiler: Boolean,
    val date: Instant,
    /** The author, when embedded. */
    val author: Person? = null,
    /** Own review only: moderation hid it (edits don't un-hide). */
    val hidden: Boolean = false,
) {
    internal object Serializer : WireSerializer<Review>("Review") {
        override fun read(e: JsonElement): Review {
            val c = Obj.of(e)
            val a = c.decode("author", Person.serializer())
            return Review(
                // An invented id would be a review nobody can report, edit or delete.
                id = c.string("id") ?: Obj.missing("id"),
                authorId = c.string("authorHandle") ?: a?.handle ?: "",
                titleId = c.string("titleId") ?: c.string("catalogItemId") ?: "",
                text = c.string("body") ?: c.string("text") ?: "",
                mark = Mark.lenient(c.string("mark")),
                spoiler = c.bool("hasSpoiler") ?: c.bool("spoiler") ?: false,
                date = c.instant("createdAt") ?: Instant.now(),
                author = a,
                hidden = c.bool("hidden") ?: false,
            )
        }
    }
}

// MARK: Per-user title state

@Serializable(with = UserTitleState.Serializer::class)
data class UserTitleState(
    val mark: Mark? = null,
    val savedAt: Instant,
    val reviewId: String? = null,
    /** Series progress: "T2E3" keys. Local only (§4: episodes → 501). */
    val watchedEpisodes: Set<String> = emptySet(),
) {
    internal object Serializer : WireSerializer<UserTitleState>("UserTitleState") {
        override fun read(e: JsonElement): UserTitleState {
            val c = Obj.of(e)
            return UserTitleState(
                mark = Mark.lenient(c.string("mark")),
                savedAt = c.instant("savedAt") ?: Instant.now(),
                reviewId = c.string("reviewId"),
            )
        }
    }
}

/** `{ items: [Review], nextCursor }` — the reviews block of `GET /titles/{id}` and "más reseñas". */
@Serializable(with = ReviewPage.Serializer::class)
data class ReviewPage(val items: List<Review>, val nextCursor: String? = null) {
    internal object Serializer : WireSerializer<ReviewPage>("ReviewPage") {
        override fun read(e: JsonElement): ReviewPage {
            if (e is JsonArray) return ReviewPage(lossyList(e, Review.serializer(), strict = true))
            val c = Obj.of(e)
            return ReviewPage(c.list("items", Review.serializer(), strict = true) ?: Obj.missing("items"), c.string("nextCursor"))
        }
    }
}

/** `GET /titles/{id}`. */
@Serializable(with = TitleDetail.Serializer::class)
data class TitleDetail(
    val title: Title,
    val state: UserTitleState?,
    val following: List<PeopleMark>,
    val reviews: List<Review>,
    val reviewsCursor: String? = null,
    val collections: List<String>,
) {
    internal object Serializer : WireSerializer<TitleDetail>("TitleDetail") {
        override fun read(e: JsonElement): TitleDetail {
            val c = Obj.of(e)
            val page = c.decode("reviews", ReviewPage.serializer())
            return TitleDetail(
                // Either `{ title, state, … }` or the title's fields at the root (where `title` is a name).
                title = (c.el("title") as? JsonObject)?.let { KuraJson.json.decodeFromJsonElement(Title.serializer(), it) }
                    ?: Title.Serializer.read(c),
                state = c.decode("state", UserTitleState.serializer()),
                following = c.list("following", PeopleMark.serializer()) ?: emptyList(),
                reviews = page?.items ?: emptyList(),
                reviewsCursor = page?.nextCursor,
                collections = c.strings("collections") ?: emptyList(),
            )
        }
    }
}

/** `PUT /collections/{id}/titles/{titleId}` → `{ title, state }`. */
@Serializable(with = MembershipResult.Serializer::class)
data class MembershipResult(val title: Title, val state: UserTitleState?) {
    internal object Serializer : WireSerializer<MembershipResult>("MembershipResult") {
        override fun read(e: JsonElement): MembershipResult {
            val c = Obj.of(e)
            return MembershipResult(c.require("title", Title.serializer()), c.decode("state", UserTitleState.serializer()))
        }
    }
}
