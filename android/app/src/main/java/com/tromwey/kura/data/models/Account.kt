package com.tromwey.kura.data.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant

// Your account: `Me`, the entrance payloads, identities, merge, device sessions and push
// destinations — the twin of `ios/Kura/Models/Account.swift`.

/** The signed-in account (`GET /me`). Superset of `Person`: `handle` is null until claimed. */
@Serializable(with = Me.Serializer::class)
data class Me(
    val handle: String?,
    val name: String,
    val initials: String,
    val hexes: List<String>,
    val featuredTitleId: String?,
    val followers: Int,
    val followingCount: Int,
    val stats: PersonStats,
    val email: String?,
    val preferredService: String?,
    val notifyReleases: Boolean,
    /** The monthly recap email (`notify_recap`). Absent on an older server → on (its default). */
    val notifyRecap: Boolean,
    /** Push when someone new follows you (`notify_followers`). Absent → on. */
    val notifyFollowers: Boolean,
    val isPublic: Boolean,
    /** Who sees your followers / following lists. Absent (older server) → `Private`, its default. */
    val followListsVisibility: FollowListsVisibility = FollowListsVisibility.Private,
    val avatarUrl: String?,
    val isFounder: Boolean,
    /** `onboardingComplete` — `name` is set; the app skips the onboarding. Absent → `name` not empty. */
    val onboarded: Boolean,
) {
    val person: Person get() = Person(
        handle = handle ?: "", name = name, initials = initials, hexes = hexes, featuredTitleId = featuredTitleId,
        isPrivate = !isPublic, followers = followers, followingCount = followingCount, stats = stats, avatarUrl = avatarUrl,
    )

    companion object {
        fun from(
            p: Person, email: String? = null, preferredService: String? = null, notifyReleases: Boolean = true,
            notifyRecap: Boolean = true, notifyFollowers: Boolean = true, isPublic: Boolean = true, onboarded: Boolean = true,
        ) = Me(
            handle = p.handle.ifEmpty { null }, name = p.name, initials = p.initials, hexes = p.hexes,
            featuredTitleId = p.featuredTitleId, followers = p.followers, followingCount = p.followingCount, stats = p.stats,
            email = email, preferredService = preferredService, notifyReleases = notifyReleases, notifyRecap = notifyRecap,
            notifyFollowers = notifyFollowers, isPublic = isPublic, avatarUrl = p.avatarUrl, isFounder = false, onboarded = onboarded,
        )
    }

    internal object Serializer : WireSerializer<Me>("Me") {
        override fun read(e: JsonElement): Me {
            val c = Obj.of(e)
            val h = c.string("handle") ?: c.string("username")
            val handle = h?.ifEmpty { null }
            val n = c.string("name") ?: c.string("displayName") ?: ""
            return Me(
                handle = handle,
                name = n,
                initials = c.string("initials") ?: Person.initials(n.ifEmpty { handle ?: "k" }),
                hexes = c.strings("hexes") ?: emptyList(),
                featuredTitleId = c.string("featuredTitleId"),
                followers = c.int("followers") ?: c.int("followersCount") ?: 0,
                followingCount = c.int("followingCount") ?: 0,
                stats = c.decode("stats", PersonStats.serializer()) ?: PersonStats(),
                email = c.string("email"),
                preferredService = c.string("preferredService"),
                notifyReleases = c.bool("notifyReleases") ?: true,
                notifyRecap = c.bool("notifyRecap") ?: true,
                notifyFollowers = c.bool("notifyFollowers") ?: true,
                // Absent → PRIVATE: never tell someone their profile is public (and hand out links)
                // on a guess.
                isPublic = c.bool("isPublic") ?: false,
                followListsVisibility = FollowListsVisibility.from(c.lenientString("followListsVisibility"))
                    ?: FollowListsVisibility.Private,
                avatarUrl = KuraRuntime.resolve(c.string("avatarUrl")),
                isFounder = c.bool("isFounder") ?: false,
                onboarded = c.bool("onboardingComplete") ?: n.isNotEmpty(),
            )
        }
    }
}

enum class UsernameStatus(val rawValue: String) {
    Free("free"), Taken("taken"), Invalid("invalid");

    companion object {
        fun from(raw: String): UsernameStatus? = entries.firstOrNull { it.rawValue == raw }
    }
}

/** `POST auth/otp/verify` / `auth/refresh` / `auth/apple` / `auth/google` → `{ token, user }`. */
@Serializable(with = AuthSession.Serializer::class)
data class AuthSession(val token: String, val user: Me) {
    override fun toString() = "AuthSession(token=<redacted>, user=@${user.handle})"

    internal object Serializer : WireSerializer<AuthSession>("AuthSession") {
        override fun read(e: JsonElement): AuthSession {
            val c = Obj.of(e)
            return AuthSession(c.requireString("token"), c.require("user", Me.serializer()))
        }
    }
}

/** `GET /auth/providers` → `{ apple, google: { clientId, androidClientId } | null }`. The entrance
 *  paints ONLY the buttons that work; if the call fails the entrance is correo only (`EMAIL_ONLY`).
 *  Apple never exists on Android (BRIEF): the flag is read for parity, the UI ignores it. */
@Serializable(with = AuthProviders.Serializer::class)
data class AuthProviders(
    val apple: Boolean,
    /** `google.clientId` = the iOS OAuth client (iOS's `GIDConfiguration`). Useless on Android: kept
     *  for parity only — never gate an Android button on it. */
    val googleClientId: String?,
    /** `google.androidClientId` = the WEB OAuth client id: Android's `serverClientId` for
     *  `GetGoogleIdOption` (the id token's `aud`, which the server accepts). null = no Google on Android. */
    val googleAndroidClientId: String? = null,
) {
    companion object {
        val EMAIL_ONLY = AuthProviders(apple = false, googleClientId = null, googleAndroidClientId = null)
    }

    internal object Serializer : WireSerializer<AuthProviders>("AuthProviders") {
        override fun read(e: JsonElement): AuthProviders {
            val c = Obj.of(e)
            val google = c.obj("google")
            return AuthProviders(
                apple = c.bool("apple") ?: false,
                googleClientId = google?.string("clientId")?.trim()?.ifEmpty { null },
                googleAndroidClientId = google?.string("androidClientId")?.trim()?.ifEmpty { null },
            )
        }
    }
}

// MARK: Identities and merge (fase 4g)

/** A third-party sign-in that can be attached to the account. */
enum class IdentityProvider(val rawValue: String) {
    Apple("apple"), Google("google");

    val id: String get() = rawValue
    val label: String get() = if (this == Apple) "Apple" else "Google"

    companion object {
        fun from(raw: String): IdentityProvider? = entries.firstOrNull { it.rawValue == raw }
    }
}

/** `GET /me/identities` → `{ email, providers: [{ provider, linked }], emailIsRelay }`. Unknown providers are dropped. */
@Serializable(with = Identities.Serializer::class)
data class Identities(val email: String, val providers: List<Link>, val emailIsRelay: Boolean = false) {
    data class Link(val provider: IdentityProvider, val linked: Boolean)

    /** Disconnecting Apple would leave only a relay email (which the person may not be able to read). */
    val appleIsLastWayIn: Boolean
        get() = emailIsRelay && link(IdentityProvider.Apple)?.linked == true &&
            providers.none { it.provider != IdentityProvider.Apple && it.linked }

    fun link(p: IdentityProvider): Link? = providers.firstOrNull { it.provider == p }

    internal object Serializer : WireSerializer<Identities>("Identities") {
        override fun read(e: JsonElement): Identities {
            val c = Obj.of(e)
            val raw = c.array("providers") ?: emptyList()
            val links = raw.mapNotNull { r ->
                val o = Obj.of(r)
                IdentityProvider.from(o.requireString("provider"))?.let { Link(it, o.bool("linked") ?: false) }
            }
            return Identities(c.string("email") ?: "", links, c.bool("emailIsRelay") ?: false)
        }
    }
}

/** The OTHER account (the one that disappears) as the merge screens show it. */
@Serializable(with = MergeSource.Serializer::class)
data class MergeSource(
    val handle: String?,
    val name: String?,
    val email: String,
    val counts: Counts,
    /** Absent on an older server → assumed public (no warning the server didn't ask for). */
    val isPublic: Boolean = true,
) {
    data class Counts(val titles: Int, val collections: Int, val reviews: Int, val followers: Int, val following: Int)

    /** "@mariel.viejo", else the name, else the email. */
    val display: String get() = when {
        !handle.isNullOrEmpty() -> "@$handle"
        !name.isNullOrEmpty() -> name
        else -> email
    }

    internal object Serializer : WireSerializer<MergeSource>("MergeSource") {
        override fun read(e: JsonElement): MergeSource {
            val c = Obj.of(e)
            val n = c.obj("counts") ?: Obj.missing("counts")
            fun req(k: String) = n.int(k) ?: Obj.missing("counts.$k")
            return MergeSource(
                handle = c.string("handle"),
                name = c.string("name"),
                email = c.requireString("email"),
                counts = Counts(req("titles"), req("collections"), req("reviews"), req("followers"), req("following")),
                isPublic = c.bool("isPublic") ?: true,
            )
        }
    }
}

/** `{ mergeToken, source }`: proof that the other account is yours (10 min, one use). */
@Serializable(with = MergeProof.Serializer::class)
data class MergeProof(val mergeToken: String, val source: MergeSource) {
    override fun toString() = "MergeProof(mergeToken=<redacted>, source=${source.display})"

    internal object Serializer : WireSerializer<MergeProof>("MergeProof") {
        override fun read(e: JsonElement): MergeProof {
            val c = Obj.of(e)
            return MergeProof(c.requireString("mergeToken"), c.require("source", MergeSource.serializer()))
        }
    }
}

/** `POST /me/identities/{provider}`: attached, or it belongs to another Kura account (409
 *  `linked_elsewhere`), which comes with the proof to merge that one in. */
sealed interface LinkOutcome {
    data object Linked : LinkOutcome
    data class Mergeable(val proof: MergeProof) : LinkOutcome
}

/** One signed-in device (`GET /me/sessions` → `{ items }`). `current` = the bearer making the call. */
@Serializable(with = DeviceSession.Serializer::class)
data class DeviceSession(
    val id: String,
    val platform: String,
    val deviceName: String,
    val appVersion: String?,
    val createdAt: Instant?,
    val lastSeenAt: Instant?,
    val current: Boolean,
) {
    /** The row title: the device name, or the platform when the name is empty. */
    val title: String get() {
        if (deviceName.isNotEmpty()) return deviceName
        return when (platform.lowercase()) {
            "ios" -> "iPhone"
            "android" -> "Android"
            "web" -> "Navegador"
            else -> platform
        }
    }

    internal object Serializer : WireSerializer<DeviceSession>("DeviceSession") {
        override fun read(e: JsonElement): DeviceSession {
            val c = Obj.of(e)
            return DeviceSession(
                id = c.requireString("id"),
                platform = c.string("platform") ?: "ios",
                deviceName = c.string("deviceName")?.trim() ?: "",
                appVersion = c.string("appVersion"),
                createdAt = c.instant("createdAt"),
                lastSeenAt = c.instant("lastSeenAt"),
                current = c.bool("current") ?: false,
            )
        }
    }
}

/** `{ kura: { type: "release", titleId } }` / `{ kura: { type: "follower", handle } }` — what a
 *  notification opens when tapped (local release notices use the same payload). */
sealed interface PushDestination {
    data class TitleDestination(val titleId: String) : PushDestination
    data class PersonDestination(val handle: String) : PushDestination

    companion object {
        /** From the `kura` object of a payload. */
        fun from(kura: JsonObject?): PushDestination? {
            kura ?: return null
            fun s(k: String) = (kura[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.ifEmpty { null }
            return when (s("type")) {
                "release" -> s("titleId")?.let(::TitleDestination)
                "follower" -> s("handle")?.let(::PersonDestination)
                else -> null
            }
        }

        /** From flat extras (`type`, `titleId`, `handle`), as an Android notification intent carries them. */
        fun from(type: String?, titleId: String?, handle: String?): PushDestination? = when (type) {
            "release" -> titleId?.ifEmpty { null }?.let(::TitleDestination)
            "follower" -> handle?.ifEmpty { null }?.let(::PersonDestination)
            else -> null
        }
    }
}
