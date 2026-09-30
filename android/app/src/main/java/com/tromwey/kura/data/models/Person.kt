package com.tromwey.kura.data.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

// People: `Person`, their collections and marks, notifications, reportar/bloquear and the people
// pages — the twin of `ios/Kura/Models/Person.swift`.

@Serializable(with = Person.Serializer::class)
data class Person(
    val handle: String,
    val name: String,
    val initials: String,
    /** Featured obsession tones [oscuro, claro]. Empty → no obsession yet. */
    val hexes: List<String>,
    val featuredTitleId: String? = null,
    /** Only on `GET /me/following|followers`: a followed profile that went private (dimmed card). */
    val isPrivate: Boolean = false,
    val followers: Int = 0,
    val followingCount: Int = 0,
    val stats: PersonStats = PersonStats(),
    /** Titles they're obsessed with (profile strip). */
    val obsessions: List<String> = emptyList(),
    /** Titles in common with you. */
    val common: List<String> = emptyList(),
    val collections: List<PersonCollection> = emptyList(),
    /** Discovery line ("le obsesiona El viaje de Chihiro"). */
    val why: String? = null,
    val avatarUrl: String? = null,
    /** Whether you follow them (from `GET /people/{handle}`); null when unknown. */
    val isFollowing: Boolean? = null,
    /** `GET /people/{handle}` only: you blocked them (the profile still opens, to unblock). */
    val isBlocked: Boolean = false,
    /** `GET /people/{handle}` only: the owner's setting for who sees their lists, and whether YOU
     *  can open them right now (false whenever there's a block). null = unknown. */
    val followListsVisibility: FollowListsVisibility? = null,
    val canSeeFollowLists: Boolean? = null,
    /** Titles embedded in the payload (obsessions / common), registered by the store. */
    val embeddedTitles: List<Title> = emptyList(),
) {
    val id: String get() = handle

    companion object {
        fun initials(of: String): String {
            val chars = of.split(" ").filter { it.isNotEmpty() }.take(2).map { it.first() }
            return if (chars.isEmpty()) "k" else chars.joinToString("").lowercase()
        }
    }

    internal object Serializer : WireSerializer<Person>("Person") {
        /** Lists of titles come either as ids or as embedded `Title` objects. */
        private fun idsOrTitles(c: Obj, k: String): List<Pair<String, Title?>> = c.array(k)?.map { e ->
            if (e is JsonPrimitive && e.isString) e.content to null
            else KuraJson.json.decodeFromJsonElement(Title.serializer(), e).let { it.id to it }
        } ?: emptyList()

        override fun read(e: JsonElement): Person {
            val c = Obj.of(e)
            val handle = c.string("handle") ?: c.string("username") ?: ""
            val n = c.string("name") ?: c.string("displayName") ?: handle
            val obs = idsOrTitles(c, "obsessions")
            val com = idsOrTitles(c, "common")
            return Person(
                handle = handle,
                name = n,
                initials = c.string("initials") ?: initials(n),
                hexes = c.strings("hexes") ?: emptyList(),
                featuredTitleId = c.string("featuredTitleId"),
                isPrivate = c.bool("isPrivate") ?: false,
                followers = c.int("followers") ?: c.int("followersCount") ?: 0,
                followingCount = c.int("followingCount") ?: c.int("following") ?: 0,
                stats = c.decode("stats", PersonStats.serializer()) ?: PersonStats(),
                obsessions = obs.map { it.first },
                common = com.map { it.first },
                collections = c.list("collections", PersonCollection.serializer()) ?: emptyList(),
                why = c.string("why") ?: c.string("reason"),
                avatarUrl = KuraRuntime.resolve(c.string("avatarUrl")),
                isFollowing = c.bool("isFollowing"),
                isBlocked = c.bool("isBlocked") ?: false,
                // An unknown value from a newer server reads as "unknown", never as a failure.
                followListsVisibility = FollowListsVisibility.from(c.lenientString("followListsVisibility")),
                canSeeFollowLists = c.bool("canSeeFollowLists"),
                embeddedTitles = (obs + com).mapNotNull { it.second },
            )
        }
    }
}

/** Who sees your followers / following lists (`followListsVisibility`, `PATCH /me`). The server's default is `private`. */
enum class FollowListsVisibility(val rawValue: String) {
    Public("public"), Mutuals("mutuals"), Private("private");

    /** Ajustes › privacidad (same words as the web). */
    val label: String get() = when (this) { Public -> "Todos"; Mutuals -> "Seguidores mutuos"; Private -> "Solo yo" }

    /** What someone who can't see the list reads — the server's 403 copy (`people/_lib/follow-lists.ts`). */
    val deniedNote: String get() = when (this) {
        Mutuals -> "Solo sus seguidores mutuos pueden ver esta lista."
        Public, Private -> "Esta persona mantiene privada esta lista."
    }

    companion object {
        fun from(raw: String?): FollowListsVisibility? = entries.firstOrNull { it.rawValue == raw }
    }
}

@Serializable(with = PersonStats.Serializer::class)
data class PersonStats(val obsessed: Int = 0, val completed: Int = 0, val liked: Int = 0, val reviews: Int = 0) {
    internal object Serializer : WireSerializer<PersonStats>("PersonStats") {
        override fun read(e: JsonElement): PersonStats {
            val c = Obj.of(e)
            return PersonStats(c.int("obsessed") ?: 0, c.int("completed") ?: 0, c.int("liked") ?: 0, c.int("reviews") ?: 0)
        }
    }
}

@Serializable(with = PersonCollection.Serializer::class)
data class PersonCollection(
    val name: String,
    val titleIds: List<String>,
    val privacy: Privacy = Privacy.PublicAccess,
    /** The backend id (for `GET /people/{handle}/collections/{id}`). */
    val remoteId: String? = null,
    /** The fan's front (`coverTitleId`). */
    val coverTitleId: String? = null,
    val vibe: String? = null,
    val pinned: Boolean = false,
    /** Up to three (`fanTitleIds`); without it, the front then the order (`FanOrder.fan`). */
    val fanTitleIds: List<String> = FanOrder.fan(titleIds, coverTitleId),
) {
    val id: String get() = name
    /** The id its public page answers to (the mock's people have no backend id: their name). */
    val routeId: String get() = remoteId ?: name
    val shownVibe: String? get() = vibe?.trim()?.ifEmpty { null }

    internal object Serializer : WireSerializer<PersonCollection>("PersonCollection") {
        override fun read(e: JsonElement): PersonCollection {
            val c = Obj.of(e)
            val titleIds = c.strings("titleIds") ?: emptyList()
            val cover = c.string("coverTitleId")
            return PersonCollection(
                name = c.string("name") ?: "",
                titleIds = titleIds,
                privacy = c.string("visibility")?.let(Privacy::fromWire) ?: Privacy.PublicAccess,
                remoteId = c.string("id"),
                coverTitleId = cover,
                vibe = c.string("vibe"),
                pinned = c.bool("pinned") ?: false,
                fanTitleIds = c.strings("fanTitleIds")?.take(3) ?: FanOrder.fan(titleIds, cover),
            )
        }
    }
}

/** What someone you follow did with a title ("gente que sigues"). Wire: `{ handle, mark }`. */
@Serializable(with = PeopleMark.Serializer::class)
data class PeopleMark(
    val personId: String,
    /** null → waiting ("No puede esperar"). */
    val mark: Mark?,
    val suffix: String? = null,
    /** The person, when the payload embeds it. */
    val person: Person? = null,
) {
    internal object Serializer : WireSerializer<PeopleMark>("PeopleMark") {
        override fun read(e: JsonElement): PeopleMark {
            val c = Obj.of(e)
            val p = c.decode("person", Person.serializer())
            return PeopleMark(
                personId = c.string("handle") ?: p?.handle ?: "",
                mark = Mark.lenient(c.string("mark")),
                suffix = c.string("suffix"),
                person = p,
            )
        }
    }
}

/** A creator (director, artist) — O7 ficha de persona. */
data class Creator(val name: String, val role: String, val works: Int) {
    val id: String get() = name
    val initials: String get() = name.split(" ").filter { it.isNotEmpty() }.take(2).map { it.first() }.joinToString("").lowercase()
}

// MARK: Notifications (31a) — local only until the API has a model (§4, 501).
// ⚠️ Mock only / no-op in live: nothing fills them (there's no `GET /me/notifications`).

sealed interface NotificationKind {
    data class FollowRequest(val personId: String) : NotificationKind
    data class Release(val titleId: String, val text: String) : NotificationKind
    data class NewFollower(val personId: String) : NotificationKind
    data class Recap(val text: String) : NotificationKind
    data class Followers(val ids: List<String>, val more: Int) : NotificationKind
}

enum class RequestState { Pending, Approved, Rejected }

data class KNotification(val id: String, val kind: NotificationKind, val age: String, val unread: Boolean, val thisWeek: Boolean)

// MARK: Safety (reportar · bloquear, App Review 1.2)

/** What a report points at. A review carries its title so the sheet can drop "Spoiler sin marcar" on albums. */
sealed interface ReportTarget {
    data class PersonTarget(val handle: String) : ReportTarget
    data class ReviewTarget(val id: String, val authorHandle: String, val titleId: String) : ReportTarget

    val isReview: Boolean get() = this is ReviewTarget
}

/** One reason in the report sheet: `id` is the wire value, `label` the copy (same as the web). */
data class ReportReason(val id: String, val label: String) {
    companion object {
        /** `POST /people/{handle}/report`. */
        val profile = listOf(
            ReportReason("spam", "Spam"),
            ReportReason("impersonation", "Se hace pasar por otra persona"),
            ReportReason("harassment", "Acoso"),
            ReportReason("illegal_content", "Contenido ilegal"),
            ReportReason("other", "Otro"),
        )

        /** `POST /reviews/{id}/report`. */
        val review = listOf(
            ReportReason("unmarked_spoiler", "Spoiler sin marcar"),
            ReportReason("spam", "Spam"),
            ReportReason("harassment", "Acoso"),
            ReportReason("hate", "Odio o discriminación"),
            ReportReason("illegal_content", "Contenido ilegal"),
            ReportReason("off_topic", "No habla de la obra"),
            ReportReason("other", "Otro"),
        )

        /** `details` on a profile report: at most 500 characters (server-checked too). */
        const val DETAILS_LIMIT = 500
    }
}

/** A row of `GET /me/blocks`. `handle`/`avatarUrl` are null once the blocked account is no longer
 *  public (`name: "Perfil privado"`), so unblocking goes by `id`. */
@Serializable(with = BlockedAccount.Serializer::class)
data class BlockedAccount(val id: String, val handle: String?, val name: String, val avatarUrl: String? = null) {
    /** What `DELETE /me/blocks/{…}` takes. */
    val key: String get() = handle ?: id

    /** For the seal (initials / photo): never registered in the store. */
    val person: Person get() = Person(handle = handle ?: "", name = name, initials = Person.initials(name), hexes = emptyList(), avatarUrl = avatarUrl)

    internal object Serializer : WireSerializer<BlockedAccount>("BlockedAccount") {
        override fun read(e: JsonElement): BlockedAccount {
            val c = Obj.of(e)
            val h = c.string("handle")
            return BlockedAccount(
                id = c.requireString("id"),
                handle = h?.ifEmpty { null },
                name = c.string("name") ?: h ?: "",
                avatarUrl = KuraRuntime.resolve(c.string("avatarUrl")),
            )
        }
    }
}

@Serializable(with = PeoplePage.Serializer::class)
data class PeoplePage(
    val items: List<Person>,
    val nextCursor: String? = null,
    /** `GET /people/{handle}/followers|following`: the rest of the list as a number (page 1 only). */
    val anonymousCount: Int = 0,
    /** Android extra — `GET /me/following|followers` send it (API.md §1; iOS ignores it): the
     *  followers/followees without a public handle, as one anonymous number (page 1 only). */
    val privateCount: Int = 0,
) {
    internal object Serializer : WireSerializer<PeoplePage>("PeoplePage") {
        override fun read(e: JsonElement): PeoplePage {
            // `{ items, nextCursor }`, or a bare array from an older server.
            if (e is JsonArray) return PeoplePage(e.map { KuraJson.json.decodeFromJsonElement(Person.serializer(), it) })
            val c = Obj.of(e)
            return PeoplePage(
                items = c.list("items", Person.serializer()) ?: emptyList(),
                nextCursor = c.string("nextCursor"),
                anonymousCount = c.int("anonymousCount") ?: 0,
                privateCount = c.int("privateCount") ?: 0,
            )
        }
    }
}

sealed interface PeopleKind {
    /** YOUR lists (`GET /me/following|followers`), whole. */
    data object Following : PeopleKind
    data object Followers : PeopleKind
    data object Suggestions : PeopleKind
    data class Search(val query: String) : PeopleKind
    /** Someone else's lists (`GET /people/{handle}/followers|following`), by their setting. */
    data class FollowersOf(val handle: String) : PeopleKind
    data class FollowingOf(val handle: String) : PeopleKind
}
