package com.tromwey.kura.data.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import java.net.URI
import java.time.Instant

// Colecciones de fiesta (contract `.claude/knowledge/state/fiesta-contract.md` §5): a party IS a
// collection with a `party` row, but on the wire it's its own family under `/api/v1/parties/**`
// and `/api/v1/invites/{token}` — never a `KCollection`, never a `Title`. The twin of
// `ios/Kura/Models/Party.swift`.

/** Someone in a party. `null` where the wire allows it = "alguien". User ids never travel. */
@Serializable(with = PartyPerson.Serializer::class)
data class PartyPerson(val handle: String, val name: String, val avatarUrl: String? = null) {
    /** "@ana" — or the name when there's no handle. */
    val at: String get() = if (handle.isEmpty()) name else "@$handle"

    internal object Serializer : WireSerializer<PartyPerson>("PartyPerson") {
        override fun read(e: JsonElement): PartyPerson {
            val c = Obj.of(e)
            return PartyPerson(c.string("handle") ?: "", c.string("name") ?: "", KuraRuntime.resolve(c.string("avatarUrl")))
        }
    }
}

/** "@ana" or "alguien". */
val PartyPerson?.atOrSomeone: String get() = this?.at ?: "alguien"

/** A song in the party (playlist order: first added first). */
@Serializable(with = PartySong.Serializer::class)
data class PartySong(
    val titleId: String,
    val title: String,
    val artist: String?,
    val album: String? = null,
    val artworkUrl: String? = null,
    val previewUrl: String? = null,
    val durationMs: Int? = null,
    val appleMusicUrl: String? = null,
    val palette: List<String> = emptyList(),
    val addedAt: Instant? = null,
    /** null → "Agregó alguien". */
    val addedBy: PartyPerson?,
    /** → "Agregaste". */
    val mine: Boolean,
    val byHost: Boolean = false,
    val canRemove: Boolean = false,
    val canBlockAuthor: Boolean = false,
    /** Android extra (the server sends it; iOS ignores it): Apple Music catalog id. */
    val appleMusicId: String? = null,
) {
    val id: String get() = titleId

    /** "Agregaste tú" · "Agregó @ana" · "Agregó alguien" (the list's line under the artist). */
    val byShort: String get() = if (mine) "Agregaste tú" else addedBy?.let { "Agregó ${it.at}" } ?: "Agregó alguien"
    /** "Agregaste" · "Agregó @ana" · "Agregó alguien" (the remove sheet). */
    val byLong: String get() = if (mine) "Agregaste" else addedBy?.let { "Agregó ${it.at}" } ?: "Agregó alguien"

    /** The song drawn with the shared cover components: a record, 1:1. Never registered as a title;
     *  the id carries a prefix so palette filling never sends it to `PUT /titles/{id}/palette`. */
    val art: Title get() = art(titleId, title, artist, artworkUrl, palette)

    companion object {
        const val ART_PREFIX = "party-song:"
        fun isArt(id: String) = id.startsWith(ART_PREFIX)
        fun art(id: String, name: String, artist: String?, url: String?, palette: List<String>) =
            Title(id = ART_PREFIX + id, name = name, format = MediaFormat.Album, creator = artist, palette = palette, coverUrl = url)
    }

    internal object Serializer : WireSerializer<PartySong>("PartySong") {
        override fun read(e: JsonElement): PartySong {
            val c = Obj.of(e)
            return PartySong(
                titleId = c.requireString("titleId"),
                title = c.string("title") ?: "",
                artist = c.string("artist")?.ifEmpty { null },
                album = c.string("album")?.ifEmpty { null },
                artworkUrl = c.string("artworkUrl"),
                previewUrl = c.string("previewUrl"),
                durationMs = c.int("durationMs"),
                appleMusicUrl = c.string("appleMusicUrl"),
                palette = c.strings("palette") ?: emptyList(),
                addedAt = c.instant("addedAt"),
                addedBy = c.decode("addedBy", PartyPerson.serializer()),
                mine = c.bool("mine") ?: false,
                byHost = c.bool("byHost") ?: false,
                canRemove = c.bool("canRemove") ?: false,
                canBlockAuthor = c.bool("canBlockAuthor") ?: false,
                appleMusicId = c.string("appleMusicId")?.ifEmpty { null },
            )
        }
    }
}

enum class PartyRole(val rawValue: String) {
    Host("host"), Guest("guest");

    companion object {
        fun from(raw: String?): PartyRole? = entries.firstOrNull { it.rawValue == raw }
    }
}

/** `viewer` of a `Party`: what YOU can do here. */
@Serializable(with = PartyViewer.Serializer::class)
data class PartyViewer(
    val role: PartyRole,
    val blocked: Boolean = false,
    val mineCount: Int = 0,
    /** null = no cap (the host, or unlimited). */
    val remaining: Int?,
    val canAdd: Boolean,
) {
    internal object Serializer : WireSerializer<PartyViewer>("PartyViewer") {
        override fun read(e: JsonElement): PartyViewer {
            val c = Obj.of(e)
            return PartyViewer(
                role = PartyRole.from(c.lenientString("role")) ?: PartyRole.Guest,
                blocked = c.bool("blocked") ?: false,
                mineCount = c.int("mineCount") ?: 0,
                remaining = c.int("remaining"),
                canAdd = c.bool("canAdd") ?: false,
            )
        }
    }
}

@Serializable(with = PartyContributor.Serializer::class)
data class PartyContributor(val person: PartyPerson?, val isYou: Boolean = false, val songCount: Int) {
    internal object Serializer : WireSerializer<PartyContributor>("PartyContributor") {
        override fun read(e: JsonElement): PartyContributor {
            val c = Obj.of(e)
            return PartyContributor(c.decode("person", PartyPerson.serializer()), c.bool("isYou") ?: false, c.int("songCount") ?: 0)
        }
    }
}

/** The party's link (host only). A revoked one keeps its token (it never works again). */
@Serializable(with = PartyInvite.Serializer::class)
data class PartyInvite(val active: Boolean, val token: String?, val url: String?, val createdAt: Instant?) {
    /** `get-kura.app/f/AbCd…` — the link as the sheets print it (no scheme). */
    val display: String get() {
        val u = url ?: return ""
        return try { URI(u).let { (it.host ?: "") + (it.rawPath ?: "") } } catch (_: java.net.URISyntaxException) { "" }
    }

    override fun toString() = "PartyInvite(active=$active, token=<redacted>)"

    internal object Serializer : WireSerializer<PartyInvite>("PartyInvite") {
        override fun read(e: JsonElement): PartyInvite {
            val c = Obj.of(e)
            return PartyInvite(c.bool("active") ?: false, c.string("token"), c.string("url"), c.instant("createdAt"))
        }
    }
}

@Serializable(with = PartyBlockedGuest.Serializer::class)
data class PartyBlockedGuest(val guestRef: String, val person: PartyPerson?, val blockedAt: Instant?) {
    internal object Serializer : WireSerializer<PartyBlockedGuest>("PartyBlockedGuest") {
        override fun read(e: JsonElement): PartyBlockedGuest {
            val c = Obj.of(e)
            return PartyBlockedGuest(c.requireString("guestRef"), c.decode("person", PartyPerson.serializer()), c.instant("blockedAt"))
        }
    }
}

/** `GET /parties/{id}` and every write's answer. */
@Serializable(with = Party.Serializer::class)
data class Party(
    val id: String,
    val name: String,
    /** 0 = solo ver · 1…5 · null = ilimitadas. */
    val perGuestLimit: Int?,
    val host: PartyPerson?,
    val viewer: PartyViewer,
    val songs: List<PartySong>,
    val contributors: List<PartyContributor> = emptyList(),
    val guestCount: Int = 0,
    val invite: PartyInvite? = null,
    val blockedGuests: List<PartyBlockedGuest> = emptyList(),
    val createdAt: Instant? = null,
) {
    val isHost: Boolean get() = viewer.role == PartyRole.Host
    val mySongs: List<PartySong> get() = songs.filter { it.mine }
    /** The palette the page is tinted with: the first song that has one. */
    val tint: List<String> get() = songs.firstOrNull { it.palette.isNotEmpty() }?.palette ?: emptyList()

    internal object Serializer : WireSerializer<Party>("Party") {
        override fun read(e: JsonElement): Party {
            val c = Obj.of(e)
            return Party(
                id = c.requireString("id"),
                name = c.string("name") ?: "",
                perGuestLimit = c.int("perGuestLimit"),
                host = c.decode("host", PartyPerson.serializer()),
                viewer = c.require("viewer", PartyViewer.serializer()),
                songs = c.list("songs", PartySong.serializer()) ?: emptyList(),
                contributors = c.list("contributors", PartyContributor.serializer()) ?: emptyList(),
                guestCount = c.int("guestCount") ?: 0,
                invite = c.decode("invite", PartyInvite.serializer()),
                blockedGuests = c.list("blockedGuests", PartyBlockedGuest.serializer()) ?: emptyList(),
                createdAt = c.instant("createdAt"),
            )
        }
    }
}

/** A row of `GET /parties` (host and guest, blocked included; newest first). */
@Serializable(with = PartyCard.Serializer::class)
data class PartyCard(
    val id: String,
    val name: String,
    val role: PartyRole,
    val perGuestLimit: Int?,
    val songCount: Int,
    val peopleCount: Int,
    val host: PartyPerson?,
    val artworkUrls: List<String?>,
    val palette: List<String>,
    val updatedAt: Instant? = null,
) {
    /** Up to three record covers for the fan (the card's palette on each while it loads). */
    val fan: List<Title> get() = artworkUrls.take(3).mapIndexed { i, url -> PartySong.art("$id-$i", name, null, url, palette) }

    /** "De fiesta · 8 canciones · 4 personas" (host) · "De fiesta · de @eric · colaboras" (guest). */
    val meta: String get() =
        if (role == PartyRole.Host) "De fiesta · ${PartyCopy.songs(songCount)} · ${PartyCopy.people(peopleCount)}"
        else "De fiesta · de ${host.atOrSomeone} · colaboras"

    internal object Serializer : WireSerializer<PartyCard>("PartyCard") {
        override fun read(e: JsonElement): PartyCard {
            val c = Obj.of(e)
            return PartyCard(
                id = c.requireString("id"),
                name = c.string("name") ?: "",
                role = PartyRole.from(c.lenientString("role")) ?: PartyRole.Guest,
                perGuestLimit = c.int("perGuestLimit"),
                songCount = c.int("songCount") ?: 0,
                peopleCount = c.int("peopleCount") ?: 0,
                host = c.decode("host", PartyPerson.serializer()),
                artworkUrls = c.optionalStrings("artworkUrls") ?: emptyList(),
                palette = c.strings("palette") ?: emptyList(),
                updatedAt = c.instant("updatedAt"),
            )
        }
    }
}

/** `GET /invites/{token}`: public preview (bearer optional → `viewer`). */
@Serializable(with = InvitePreview.Serializer::class)
data class InvitePreview(val token: String, val party: Summary, val viewer: Viewer?) {
    data class Summary(
        val id: String,
        val name: String,
        val perGuestLimit: Int?,
        val host: PartyPerson?,
        val songs: List<PartySong>,
        val contributors: List<PartyContributor> = emptyList(),
        val guestCount: Int = 0,
    ) {
        val tint: List<String> get() = songs.firstOrNull { it.palette.isNotEmpty() }?.palette ?: emptyList()
    }

    data class Viewer(val role: PartyRole?, val joined: Boolean, val blocked: Boolean)

    override fun toString() = "InvitePreview(token=<redacted>, party=${party.id})"

    internal object Serializer : WireSerializer<InvitePreview>("InvitePreview") {
        override fun read(e: JsonElement): InvitePreview {
            val c = Obj.of(e)
            val p = c.obj("party") ?: Obj.missing("party")
            val summary = Summary(
                id = p.requireString("id"),
                name = p.string("name") ?: "",
                perGuestLimit = p.int("perGuestLimit"),
                host = p.decode("host", PartyPerson.serializer()),
                songs = p.list("songs", PartySong.serializer()) ?: emptyList(),
                contributors = p.list("contributors", PartyContributor.serializer()) ?: emptyList(),
                guestCount = p.int("guestCount") ?: 0,
            )
            val viewer = c.obj("viewer")?.let { v ->
                Viewer(PartyRole.from(v.lenientString("role")), v.bool("joined") ?: false, v.bool("blocked") ?: false)
            }
            return InvitePreview(c.requireString("token"), summary, viewer)
        }
    }
}

/** `GET /parties/{id}/songs?q=` row. */
@Serializable(with = PartySongHit.Serializer::class)
data class PartySongHit(
    val titleId: String,
    val title: String,
    val artist: String?,
    val album: String?,
    val artworkUrl: String? = null,
    val palette: List<String> = emptyList(),
    /** null → "Agregar"; mine → "Ya la agregaste"; else → "Ya está · la puso @x". */
    val inParty: InParty? = null,
    /** Android extras (the server sends them; iOS ignores them). */
    val previewUrl: String? = null,
    val appleMusicUrl: String? = null,
    val durationMs: Int? = null,
) {
    data class InParty(val mine: Boolean, val addedBy: PartyPerson?)

    val id: String get() = titleId
    /** "Caifanes · El nervio del volcán" (the search row's second line). */
    val subtitle: String get() = listOfNotNull(artist, album).joinToString(" · ")
    /** The third line when it's already in. */
    val dupLine: String? get() = inParty?.let { if (it.mine) "Ya la agregaste" else "Ya está · la agregó ${it.addedBy.atOrSomeone}" }

    internal object Serializer : WireSerializer<PartySongHit>("PartySongHit") {
        override fun read(e: JsonElement): PartySongHit {
            val c = Obj.of(e)
            return PartySongHit(
                titleId = c.requireString("titleId"),
                title = c.string("title") ?: "",
                artist = c.string("artist")?.ifEmpty { null },
                album = c.string("album")?.ifEmpty { null },
                artworkUrl = c.string("artworkUrl"),
                palette = c.strings("palette") ?: emptyList(),
                inParty = c.obj("inParty")?.let { InParty(it.bool("mine") ?: false, it.decode("addedBy", PartyPerson.serializer())) },
                previewUrl = c.string("previewUrl"),
                appleMusicUrl = c.string("appleMusicUrl"),
                durationMs = c.int("durationMs"),
            )
        }
    }
}

/** `POST /invites/{token}/join`. */
@Serializable(with = PartyJoin.Serializer::class)
data class PartyJoin(val party: Party, val joined: Joined) {
    enum class Joined(val rawValue: String) { New("new"), Already("already"), Host("host") }

    internal object Serializer : WireSerializer<PartyJoin>("PartyJoin") {
        override fun read(e: JsonElement): PartyJoin {
            val c = Obj.of(e)
            val raw = c.requireString("joined")
            val joined = Joined.entries.firstOrNull { it.rawValue == raw }
                ?: throw kotlinx.serialization.SerializationException("joined desconocido: $raw")
            return PartyJoin(c.require("party", Party.serializer()), joined)
        }
    }
}

/** The copy the screens share (design `fiesta-app-v2`). */
object PartyCopy {
    fun songs(n: Int) = "$n ${if (n == 1) "canción" else "canciones"}"
    fun people(n: Int) = "$n ${if (n == 1) "persona" else "personas"}"

    /** The stepper's values in order: solo ver, 1…5, ilimitadas (null). */
    val limits: List<Int?> = listOf(0, 1, 2, 3, 4, 5, null)
    val defaultLimit: Int? = 3

    fun limitLabel(l: Int?): String = when (l) {
        null -> "ilimitadas"
        0 -> "solo podrán ver la colección"
        else -> l.toString()
    }

    /** "cada invitado pone 3 canciones" (the hero's italic line). */
    fun heroLine(l: Int?): String = when (l) {
        null -> "cada invitado agrega las canciones que quiera"
        0 -> "solo para ver y escuchar"
        else -> "cada invitado agrega ${songs(l)}"
    }

    /** "tus 3" / "tu canción" / "tus canciones". */
    fun yours(l: Int?): String = if (l == null || l <= 0) "tus canciones" else if (l == 1) "tu canción" else "tus $l"

    /** "sus 3" / "su canción" / "sus canciones" (the host's empty state). */
    fun theirs(l: Int?): String = if (l == null || l <= 0) "sus canciones" else if (l == 1) "su canción" else "sus $l"

    /** A server without parties yet (`503 unavailable`, `MIGRATION_0033_LIVE`). */
    const val UNAVAILABLE_TITLE = "las fiestas llegan muy pronto."
    const val UNAVAILABLE_NOTE = "Todavía no están listas en kura. Vuelve a abrir este link en unos días; sigue siendo el mismo."
    const val UNAVAILABLE = "Las fiestas llegan muy pronto."
    /** A party that answered 404 after we had it (deleted, you left, a block with the host). */
    const val GONE = "Esa fiesta ya no está disponible."
    /** 409 `too_many_parties` when the server sends no message of its own. */
    const val TOO_MANY_PARTIES = "Ya tienes 20 fiestas. Borra alguna para crear otra."
    /** 429 on "Crear link nuevo". */
    const val ROTATE_LIMITED = "Creaste varios links seguidos. Espera un momento para crear otro."
    const val LEFT = "Saliste de la fiesta."
    /** `POST /invites/{token}/join` failed with nothing of its own to say (a 5xx): it is not a save. */
    const val JOIN_FAILED = "No se pudo entrar a la fiesta. Vuelve a intentarlo."
    const val DEAD_TITLE = "este link ya no funciona."
    const val DEAD_NOTE = "Lo desactivaron o ya venció. Pide uno nuevo a quien te invitó y vuelve a abrirlo."
}
