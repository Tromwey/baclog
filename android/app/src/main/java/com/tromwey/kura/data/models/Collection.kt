package com.tromwey.kura.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.text.Normalizer
import java.time.Instant

// Collections: privacy, sort, layout, `KCollection` and its detail payload — the twin of
// `ios/Kura/Models/Collection.swift`.

/**
 * Who sees a collection. Wire (`visibility`): `private` | `link` | `profile`.
 * `Followers` is what the K1a/K1b frames ask for but the server doesn't have (API.md §7.4): never
 * offered in live (`options`) and, if it reached the wire, it's saved as `link` — anyone with the
 * link would see it, not "only who follows you".
 */
enum class Privacy {
    PublicAccess, Followers, OnlyMe, Link;

    val id: String get() = name

    /** "Todos" / "Quien tenga el link" / "Solo yo" — the row asks "quién la ve". */
    val label: String get() = when (this) {
        PublicAccess -> "Todos"
        Followers -> "Seguidores"
        OnlyMe -> "Solo yo"
        Link -> "Quien tenga el link"
    }

    val note: String get() = when (this) {
        PublicAccess -> "Aparece en tu perfil."
        Followers -> "Solo quien te sigue."
        OnlyMe -> "Nadie más la ve. Su link deja de abrir."
        Link -> "No aparece en tu perfil; se abre con su link."
    }

    /** The undo toast after a visibility change. */
    val changedToast: String get() = when (this) {
        PublicAccess -> "Ahora la ven todos."
        OnlyMe -> "Ahora solo tú la ves."
        Link, Followers -> "Ahora la ve quien tenga el link."
    }

    val wire: String get() = when (this) {
        PublicAccess -> "profile"
        OnlyMe -> "private"
        Link, Followers -> "link"
    }

    companion object {
        /** The choices the backend persists, in the one visibility vocabulary (founder, 2026-09-28). */
        val options: List<Privacy> = listOf(OnlyMe, Link, PublicAccess)

        fun fromWire(wire: String): Privacy = when (wire) {
            "profile", "public" -> PublicAccess
            "link" -> Link
            "followers" -> Followers
            else -> OnlyMe
        }
    }
}

@Serializable
enum class SortMode(val rawValue: String) {
    @SerialName("manual") Manual("manual"),
    @SerialName("recent") Recent("recent"),
    @SerialName("title") Title("title"),
    @SerialName("status") Status("status"),
    @SerialName("year") Year("year");

    val label: String get() = when (this) {
        Manual -> "Manual"; Recent -> "Recientes"; Title -> "Título"; Status -> "Estado"; Year -> "Año"
    }
    val note: String? get() = if (this == Manual) "arrastrar" else null
}

@Serializable
enum class CollectionLayout(val rawValue: String) {
    @SerialName("covers") Covers("covers"),
    @SerialName("list") List("list"),
}

@Serializable(with = KCollection.Serializer::class)
data class KCollection(
    val id: String,
    val name: String,
    /** The collection's line (Newsreader italic under its name). `null`/"" = none. */
    val vibe: String? = null,
    /** The owner's MANUAL order (`backlog_item.position`). */
    val titleIds: List<String>,
    val privacy: Privacy,
    /** One per account (`backlog.pinned_at`): pinning one unpins the rest. */
    val pinned: Boolean = false,
    /** The cover the owner CHOSE; null = automatic (the order's first). */
    val chosenCoverTitleId: String? = null,
    /** The server's fan (≤ 3, `fanTitleIds`): the chosen cover, then the order. */
    val fanTitleIds: List<String> = emptyList(),
    /** Device-local (API.md §3): how THIS phone sorts and lays it out. */
    val sort: SortMode = SortMode.Manual,
    val layout: CollectionLayout = CollectionLayout.Covers,
    val createdAt: Instant,
    val addedAt: Map<String, Instant> = emptyMap(),
    /** Titles embedded by the API (`GET /collections/{id}`), registered by the store. */
    val embeddedTitles: List<Title> = emptyList(),
    val embeddedStates: Map<String, UserTitleState> = emptyMap(),
) {
    val slug: String get() {
        val folded = Normalizer.normalize(name, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")
        return folded.lowercase(KCalendar.locale).split(Regex("[^\\p{L}\\p{N}]+")).filter { it.isNotEmpty() }.joinToString("-")
    }

    /** The line to draw (a blank one is none). */
    val shownVibe: String? get() = vibe?.trim()?.ifEmpty { null }

    /** Everything the curation contract added is read with a default (older server = not pinned,
     *  automatic cover, fan derived on the device). */
    internal object Serializer : WireSerializer<KCollection>("KCollection") {
        override fun read(e: JsonElement): KCollection = read(Obj.of(e))

        fun read(c: Obj): KCollection {
            val embeddedTitles = c.list("titles", Title.serializer()) ?: emptyList()
            val titleIds = c.strings("titleIds") ?: embeddedTitles.map { it.id }
            // `coverTitleId` is the fan's front. Without `fanTitleIds`: that front, then the order.
            val front = c.string("coverTitleId")
            val fan = c.strings("fanTitleIds")
            return KCollection(
                id = c.requireString("id"),
                name = c.string("name") ?: "",
                vibe = c.string("vibe"),
                titleIds = titleIds,
                privacy = c.string("visibility")?.let(Privacy::fromWire) ?: Privacy.OnlyMe,
                pinned = c.bool("pinned") ?: false,
                chosenCoverTitleId = c.string("chosenCoverTitleId"),
                fanTitleIds = fan?.take(3) ?: FanOrder.fan(titleIds, front),
                createdAt = c.instant("createdAt") ?: Instant.now(),
                addedAt = c.instants("addedAt") ?: emptyMap(),
                embeddedTitles = embeddedTitles,
                embeddedStates = c.map("states", UserTitleState.serializer()) ?: emptyMap(),
            )
        }
    }
}

/** "El abanico es la colección": up to three titles, the chosen cover first (when it's still a
 *  member), then the manual order. Twin of the web's `fanOf` (`src/modules/backlog/fan.ts`). */
object FanOrder {
    fun fan(ordered: List<String>, cover: String?): List<String> {
        val out = mutableListOf<String>()
        if (cover != null && ordered.contains(cover)) out.add(cover)
        for (id in ordered) {
            if (out.size >= 3) break
            if (id != cover) out.add(id)
        }
        return out
    }

    /** The Revamp's lima ADN fallback is not a Kura colour: it never tints. */
    fun kuraHexes(hexes: List<String>): List<String> = hexes.filter { it.lowercase() != "#d8ff3e" }
}

/** `GET /collections/{id}` — the collection with its titles and your states. */
@Serializable(with = CollectionDetail.Serializer::class)
data class CollectionDetail(
    val collection: KCollection,
    val titles: List<Title>,
    val states: Map<String, UserTitleState>,
) {
    internal object Serializer : WireSerializer<CollectionDetail>("CollectionDetail") {
        override fun read(e: JsonElement): CollectionDetail {
            val c = Obj.of(e)
            // Either `{ collection, titles, states }` or the collection fields at the root.
            val collection = (c.el("collection") as? JsonObject)?.let { KCollection.Serializer.read(Obj(it)) }
                ?: KCollection.Serializer.read(c)
            return CollectionDetail(
                collection = collection,
                titles = c.list("titles", Title.serializer()) ?: collection.embeddedTitles,
                states = c.map("states", UserTitleState.serializer()) ?: collection.embeddedStates,
            )
        }
    }
}
