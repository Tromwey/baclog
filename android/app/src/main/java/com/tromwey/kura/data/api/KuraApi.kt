package com.tromwey.kura.data.api

import com.tromwey.kura.data.models.AppleMusicReport
import com.tromwey.kura.data.models.AuthProviders
import com.tromwey.kura.data.models.BlockedAccount
import com.tromwey.kura.data.models.CollectionDetail
import com.tromwey.kura.data.models.DeviceSession
import com.tromwey.kura.data.models.DiscoverCreatorsPayload
import com.tromwey.kura.data.models.DiscoverFormatPayload
import com.tromwey.kura.data.models.DiscoverPayload
import com.tromwey.kura.data.models.ExportState
import com.tromwey.kura.data.models.FeedEvent
import com.tromwey.kura.data.models.FeedPage
import com.tromwey.kura.data.models.Identities
import com.tromwey.kura.data.models.IdentityProvider
import com.tromwey.kura.data.models.InvitePreview
import com.tromwey.kura.data.models.KCollection
import com.tromwey.kura.data.models.LinkOutcome
import com.tromwey.kura.data.models.Mark
import com.tromwey.kura.data.models.Me
import com.tromwey.kura.data.models.MediaFormat
import com.tromwey.kura.data.models.MembershipResult
import com.tromwey.kura.data.models.MergeProof
import com.tromwey.kura.data.models.MusicProvider
import com.tromwey.kura.data.models.MusicServices
import com.tromwey.kura.data.models.Party
import com.tromwey.kura.data.models.PartyCard
import com.tromwey.kura.data.models.PartyJoin
import com.tromwey.kura.data.models.PartySongHit
import com.tromwey.kura.data.models.PeopleKind
import com.tromwey.kura.data.models.PeoplePage
import com.tromwey.kura.data.models.Person
import com.tromwey.kura.data.models.Privacy
import com.tromwey.kura.data.models.RecapMonth
import com.tromwey.kura.data.models.RecapPayload
import com.tromwey.kura.data.models.Review
import com.tromwey.kura.data.models.ReviewPage
import com.tromwey.kura.data.models.SearchResult
import com.tromwey.kura.data.models.Title
import com.tromwey.kura.data.models.TitleDetail
import com.tromwey.kura.data.models.TitleRef
import com.tromwey.kura.data.models.UserTitleState
import com.tromwey.kura.data.models.UsernameStatus
import kotlinx.serialization.Serializable

/**
 * The seam between the app and the backend (API.md §4/§5) — the Kotlin twin of iOS `KuraAPI`, same
 * names and parameters. The UI never talks to this directly: the store applies every change
 * optimistically and then calls the API; a failure surfaces as "No se pudo guardar · Reintentar".
 * Reads are per resource. Every call throws `KuraApiError` (or propagates cancellation).
 *
 * `LiveApi` speaks HTTP to `/api/v1`; `MockApi` (`src/debug/`) serves the mock.
 */
interface KuraApi {
    // MARK: Session (§2)
    /** True when a bearer token is stored (the app can skip the entrance). */
    val hasSession: Boolean
    /** True when the token expires in < 7 days (the app refreshes on launch). */
    val needsRefresh: Boolean
    suspend fun requestCode(email: String)
    suspend fun signIn(email: String, code: String): Me
    suspend fun refresh(): Me
    /** `POST auth/logout` — "en todos tus dispositivos". Forgets the stored token FIRST and sends the
     *  old one explicitly. Throws when the server did not confirm (offline, 5xx, 429): the local
     *  session is gone anyway, but other devices may still be signed in. A 401 is not an error here. */
    suspend fun logout()
    /** Forgets the stored token without telling the server (never touches other devices). */
    fun forgetSession()
    /** `POST auth/web-session` → a one-shot (60 s) URL that opens the web signed in, landing on `to`
     *  (server allow-list: `/recap/tarjeta`, `/recap`). Open it in a Custom Tab, never share it. */
    suspend fun webSession(to: String): String
    /** `GET /auth/providers` (no bearer) — which third-party sign-ins the server can honor. */
    suspend fun authProviders(): AuthProviders
    /** `POST /auth/apple` — iOS only in practice (Android has no Apple button); kept for parity. */
    suspend fun signInWithApple(credential: AppleCredential): Me
    /** `POST /auth/google` `{ idToken, nonce?, device }` → `{ token, user }`. `nonce` is looked up in `GoogleNonce`. */
    suspend fun signInWithGoogle(idToken: String): Me

    // MARK: Devices (sessions + push)
    /** `GET /me/sessions`: every device signed in to this account. */
    suspend fun sessions(): List<DeviceSession>
    /** `DELETE /me/sessions/{id}` → 204. Signs out THAT device only. */
    suspend fun revokeSession(id: String)
    /** `DELETE /me/sessions/{sid}` for THIS install's own session, sent with `bearer` (captured before
     *  the session is forgotten, or queued from an earlier sign-out). A 401/404 = already dead: done.
     *  Never broadcasts "session expired". The default (fakes) goes through `revokeSession`. */
    suspend fun revokeOwnSession(sid: String, bearer: String) = revokeSession(sid)
    /** `POST auth/logout` with an explicit `bearer` (a global sign-out that didn't reach the server,
     *  retried). A 401 = already revoked: done. The default (fakes) goes through `logout`. */
    suspend fun logoutBearer(bearer: String) = logout()
    /** `PUT /me/devices/{token}` `{ environment?, provider }` → 204. iOS: `apns` + `environment`
     *  (sandbox | production). Android: `provider = "fcm"`, the FCM token as-is, `environment` null
     *  (the server ignores it for FCM). */
    suspend fun registerDevice(pushToken: String, environment: String?, provider: String = "apns")
    /** `DELETE /me/devices/{token}` → 204, idempotent, no body (the token's shape tells the server APNs
     *  or FCM). `bearer` = one captured BEFORE the session was forgotten (null = the current session).
     *  Never broadcasts "session expired": a 401 here only means that bearer can't remove it anymore. */
    suspend fun unregisterDevice(pushToken: String, bearer: String? = null)

    // MARK: Identities and merge (fase 4g)
    suspend fun identities(): Identities
    /** A 409 `linked_elsewhere` comes back as `Mergeable` (not thrown); a rejected token is `Forbidden("proof_rejected")`. */
    suspend fun linkApple(credential: AppleCredential): LinkOutcome
    suspend fun linkGoogle(idToken: String): LinkOutcome
    /** `DELETE /me/identities/{provider}` → 204. 409 `last_way_in` for Apple on a relay email. */
    suspend fun unlinkIdentity(provider: IdentityProvider)
    /** `POST /me/merge/otp/request { email }` → 204 always; 429 on the cooldown / hourly cap. */
    suspend fun requestMergeCode(email: String)
    /** `POST /me/merge/otp/verify { email, code }` → `{ mergeToken, source }`; bad code = `Forbidden("proof_rejected")`. */
    suspend fun verifyMergeCode(email: String, code: String): MergeProof
    /** `POST /me/merge { mergeToken }` → this account with the other folded in. 409 `merge_token_invalid`, 403 `underage`. */
    suspend fun merge(token: String): Me

    // MARK: Account
    suspend fun me(): Me
    suspend fun updateMe(patch: MePatch): Me
    suspend fun checkUsername(username: String): UsernameStatus
    suspend fun claimUsername(username: String): Me
    suspend fun completeOnboarding(name: String, birthYear: Int): Me
    /** Titles offered on "elige 3" before typing (`GET /onboarding/pool?page=1`). */
    suspend fun onboardingGrid(): List<Title>
    suspend fun onboardingPicks(refs: List<TitleRef>): KCollection
    suspend fun onboardingPeople(): List<Person>
    /** `PUT /me/avatar` — the photo already cropped and reduced on the device (≤ 400 KB). */
    suspend fun uploadAvatar(data: ByteArray, contentType: String): Me
    suspend fun deleteAvatar(): Me
    suspend fun deleteAccount()

    // MARK: Collections
    suspend fun collections(): List<KCollection>
    suspend fun collection(id: String): CollectionDetail
    suspend fun createCollection(name: String, privacy: Privacy): KCollection
    /** `PATCH /collections/{id}` — each field null = untouched; `vibe = ""` clears the frase. */
    suspend fun updateCollection(id: String, name: String?, vibe: String?, privacy: Privacy?): KCollection
    suspend fun deleteCollection(id: String)
    /** One pinned per account: the server unpins the rest. */
    suspend fun setCollectionPinned(id: String, pinned: Boolean): KCollection
    /** `titleId = null` is sent as `null` = the automatic cover; a non-member is `400 fields.coverTitleId`. */
    suspend fun setCollectionCover(id: String, titleId: String?): KCollection
    /** `PUT /collections/{id}/order` — the whole manual order at once. */
    suspend fun reorderCollection(id: String, titleIds: List<String>): KCollection
    /** `paletteHex`: a palette extracted on this device the server hasn't confirmed (the only channel for an `ext:` result). */
    suspend fun createTitleMembership(collectionId: String, ref: TitleRef, paletteHex: List<String>?): MembershipResult
    suspend fun removeTitleMembership(collectionId: String, titleId: String)

    // MARK: Titles and your state (keyed on the title, identical across collections)
    suspend fun title(id: String): TitleDetail
    /** "Más reseñas": `GET /titles/{id}/reviews?cursor=`. */
    suspend fun moreReviews(titleId: String, cursor: String): ReviewPage
    /** `GET /titles?ids=` in chunks of 50 (≤ 4 in flight), in order. */
    suspend fun titles(ids: List<String>): List<Title>
    /** `PUT /titles/{id}/palette { paletteHex }` → the title re-read (first writer wins). */
    suspend fun fillPalette(titleId: String, hexes: List<String>): Title
    suspend fun myTitles(): Map<String, UserTitleState>
    /** `PUT /me/titles/{id}/mark`. Creates your state on an unsaved catalog title; `409 not_released` without `preview`. */
    suspend fun setMark(titleId: String, mark: Mark?, preview: Boolean): UserTitleState
    suspend fun saveReview(titleId: String, body: String, hasSpoiler: Boolean): Review
    suspend fun deleteReview(titleId: String)
    suspend fun removeFromLibrary(titleId: String)

    // MARK: Discover
    suspend fun search(query: String, kind: MediaFormat?): List<SearchResult>
    suspend fun discover(): DiscoverPayload
    /** "lo nuevo de tus favoritos" — slowish; asked after `discover()`. */
    suspend fun discoverCreators(): DiscoverCreatorsPayload
    /** `time` = cine's runtime window 0…2 (null = the server's default). */
    suspend fun discoverFormat(format: MediaFormat, time: Int?): DiscoverFormatPayload

    // MARK: People and feed
    suspend fun person(handle: String): Person
    /** Someone's public collection; `states` are the OWNER's (read-only). */
    suspend fun personCollection(handle: String, id: String): CollectionDetail
    /** Someone else's lists: 404 = private/nonexistent/block; 403 `lists_private` = their setting. */
    suspend fun people(kind: PeopleKind, cursor: String?): PeoplePage
    suspend fun setFollowing(handle: String, following: Boolean)
    suspend fun feed(cursor: String?): FeedPage
    suspend fun feedSuggestion(): FeedEvent?

    // MARK: Safety (App Review 1.2)
    /** `POST /people/{handle}/report` `{ reason, details? }` → 204 always. */
    suspend fun reportPerson(handle: String, reason: String, details: String?)
    /** `POST /reviews/{id}/report` `{ reason }` → 204. */
    suspend fun reportReview(id: String, reason: String)
    /** `PUT /me/blocks/{handle}` → 204 (drops the follows both ways). */
    suspend fun block(handle: String)
    /** `DELETE /me/blocks/{handleOrId}` → 204. */
    suspend fun unblock(handleOrId: String)
    suspend fun blocks(): List<BlockedAccount>

    // MARK: Recap
    suspend fun recapMonths(): List<RecapMonth>
    suspend fun recap(era: String): RecapPayload

    // MARK: Parties — `503 unavailable` while `MIGRATION_0033_LIVE` is off.
    /** `GET /parties`: host and guest, blocked included, newest first. */
    suspend fun parties(): List<PartyCard>
    /** `perGuestLimit` null = ilimitadas (sent as `null`). */
    suspend fun createParty(name: String, perGuestLimit: Int?): Party
    suspend fun party(id: String): Party
    /** Host only. `perGuestLimit`: null = untouched, `Change(null)` = ilimitadas. */
    suspend fun updateParty(id: String, name: String?, perGuestLimit: Change<Int?>?): Party
    suspend fun deleteParty(id: String)
    /** A new link; the old one dies. */
    suspend fun rotatePartyInvite(id: String): Party
    /** Nobody else gets in; members stay. */
    suspend fun revokePartyInvite(id: String): Party
    /** `GET /parties/{id}/songs?q=` (1…100 chars). */
    suspend fun searchPartySongs(id: String, query: String): List<PartySongHit>
    /** 403 `blocked`/`view_only`, 409 `duplicate_mine`/`duplicate_other`/`cap_reached` (their `message` is final copy). */
    suspend fun addPartySong(id: String, titleId: String, paletteHex: List<String>?): Party
    /** Idempotent. 403 `not_yours`. */
    suspend fun removePartySong(id: String, titleId: String): Party
    /** "Quitar y bloquear a @x". 409 `not_blockable`. */
    suspend fun removeAndBlockPartyGuest(id: String, titleId: String): Party
    /** `PUT /parties/{id}/songs/{titleId}/palette` → 204 (first writer wins). */
    suspend fun fillPartySongPalette(id: String, titleId: String, hexes: List<String>)
    suspend fun unblockPartyGuest(id: String, guestRef: String): Party
    /** A guest leaves (their songs stay). 404 if you're not a guest. */
    suspend fun leaveParty(id: String)
    /** Public; the bearer (if any) fills `viewer`. 404 = "ya no funciona". */
    suspend fun invitePreview(token: String): InvitePreview
    /** 404 dead link · 403 `onboarding_required`. */
    suspend fun joinParty(token: String): PartyJoin

    // MARK: Music export — `503 unavailable` while `MIGRATION_0034_LIVE` is off.
    suspend fun musicServices(): MusicServices
    /** `POST /music/tidal/start` → TIDAL's https consent page (validated). */
    suspend fun startTidalAuth(): String
    /** `POST /music/tidal/complete` `{ ref, claim }`. 409 `auth_expired` = start again. */
    suspend fun completeTidalAuth(ref: String, claim: String): MusicServices
    suspend fun disconnectTidal()
    /** `idle` if never started. */
    suspend fun partyExport(id: String, provider: MusicProvider): ExportState
    /** Creates or resumes; re-queues the `missing`. */
    suspend fun startPartyExport(id: String, provider: MusicProvider): ExportState
    /** One batch (≤ 10 songs) on the server. */
    suspend fun stepTidalExport(id: String): ExportState
    /** What MusicKit did (iOS). 409 `playlist_exists`. */
    suspend fun reportAppleMusicExport(id: String, report: AppleMusicReport): ExportState
}

/** Swift's `T??`: `null` = untouched, `Change(value)` = set it (possibly to `null`). */
data class Change<out T>(val value: T)

/** `PATCH /me` body — only the fields you set are sent. */
@Serializable
data class MePatch(
    val name: String? = null,
    val preferredService: String? = null,
    val notifyReleases: Boolean? = null,
    /** The monthly recap email on/off. */
    val notifyRecap: Boolean? = null,
    /** Push when someone new follows you. */
    val notifyFollowers: Boolean? = null,
    val isPublic: Boolean? = null,
    /** Who sees your followers / following lists: `public` | `mutuals` | `private`. */
    val followListsVisibility: String? = null,
)

/** What Sign in with Apple hands over, ready for `POST /auth/apple` (parity with iOS). */
data class AppleCredential(
    val identityToken: String,
    val rawNonce: String,
    val authorizationCode: String? = null,
    val givenName: String? = null,
    val familyName: String? = null,
) {
    override fun toString() = "AppleCredential(<redacted>)"
}
