import { z } from "zod";
import {
  profileReportBodySchema,
  reviewReportBodySchema,
} from "@/modules/reports/types";

// Every zod message the API emits (`fields` on a 400 `invalid`) is Spanish:
// configured ONCE here, the module every handler and the smoke import.
// `_lib/http.ts` imports this file for the side effect, so a route that
// parses input without touching a wire schema still gets the locale.
z.config(z.locales.es());

/**
 * /api/v1 wire contract (ios/API.md §3) — THE source of truth for what goes
 * over the wire to the Kura iOS app. Every handler serializes INTO one of
 * these; the smoke test (`scripts/api-smoke.ts`) validates responses AGAINST
 * them; the Swift `Codable`s mirror them key for key.
 *
 * Rules:
 *  - camelCase keys, ids as strings, dates as ISO 8601 UTC strings WITHOUT
 *    fractional seconds (`2026-09-24T15:00:00Z`) — Swift's stock
 *    `JSONDecoder.dateDecodingStrategy = .iso8601` rejects `.000Z`. Use
 *    `isoDate()` below to emit them.
 *  - No `birthYear`, ever (F2.2). `email` appears ONLY in `Me` (the caller's
 *    own account). Nothing here carries another user's id: people are keyed
 *    by `handle`.
 *  - Nullable = the backend may not know it. Optional (`.optional()`) = the
 *    field exists only on some payloads (e.g. a `Title` inside a feed event
 *    is a summary; the same `Title` from `GET /titles/{id}` is full). The
 *    Swift side must `decodeIfPresent` optionals and tolerate unknown keys.
 *
 * NO "server-only" here: the smoke script imports this file under tsx.
 */

// ---------- primitives ----------

/** `YYYY-MM-DDTHH:mm:ssZ` — what `isoDate()` emits. */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "ISO 8601 UTC sin fracción");
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Emit a Date the way the contract wants it (see `IsoDateSchema`). */
export function isoDate(d: Date | string | number): IsoDate {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export const HexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const MediaFormatSchema = z.enum(["film", "series", "album"]);
export type MediaFormat = z.infer<typeof MediaFormatSchema>;

/** The user's reaction to a title. `null` = saved, nothing else. Precedence
 *  obsessed → liked → completed (`markOf` in modules/reviews/queries.ts). */
export const MarkSchema = z.enum(["obsessed", "liked", "completed"]);
export type Mark = z.infer<typeof MarkSchema>;

/** A person's reaction as SEEN BY OTHERS (feed, reviews, "gente que sigues"):
 *  adds `disliked`, which the app renders only in someone's own review. */
export const PublicMarkSchema = z.enum(["obsessed", "liked", "disliked", "completed"]);
export type PublicMark = z.infer<typeof PublicMarkSchema>;

export const PreferredServiceSchema = z.enum([
  "spotify",
  "apple_music",
  "youtube_music",
  "tidal",
]);
export type PreferredService = z.infer<typeof PreferredServiceSchema>;

export const VisibilitySchema = z.enum(["private", "link", "profile"]);
export type Visibility = z.infer<typeof VisibilitySchema>;

/** `{ source, externalId }` — a catalog title not yet cached locally. */
export const ExternalRefSchema = z.object({
  source: z.enum(["tmdb", "itunes"]),
  externalId: z.string().min(1),
});
export type ExternalRef = z.infer<typeof ExternalRefSchema>;

// ---------- errors (§1) ----------

export const ErrorCodeSchema = z.enum([
  "unauthorized",
  "forbidden",
  "not_found",
  "invalid",
  "conflict",
  "rate_limited",
  "unsupported",
  "unavailable",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    /** Final Spanish copy — show as is. */
    message: z.string().min(1),
    /** Sub-code the app branches on — `forbidden`: "underage" · `conflict`:
     *  "not_released", "reaction_required", "taken", "linked_elsewhere",
     *  "provider_already_linked", "merge_token_invalid", "last_way_in" · `invalid` (HTTP
     *  422, phase 4g): "invalid_proof" = a rejected provider token / merge
     *  code on an authenticated route (the ONLY `invalid` that isn't 400). */
    reason: z.string().optional(),
    /** `invalid` only: field → message. */
    fields: z.record(z.string(), z.string()).optional(),
    /** `rate_limited` only. */
    retryAfterSeconds: z.number().int().positive().optional(),
    /** `conflict` + reason `linked_elsewhere` only (phase 4g,
     *  `POST /me/identities/{provider}`): the proof to merge that account. */
    mergeToken: z.string().min(1).optional(),
    source: z.lazy(() => MergeSourceSchema).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

// ---------- pagination (§1) ----------

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    /** Opaque; pass back as `?cursor=`. Null = no more pages. */
    nextCursor: z.string().nullable(),
  });
}
export type Paginated<T> = { items: T[]; nextCursor: string | null };

// ---------- Release ----------

/** Derived from `catalog_item.releaseDate` (day) or `year` (year). `month`
 *  is reserved for a provider that only knows the month; unused today. */
export const ReleaseSchema = z.object({
  kind: z.enum(["day", "month", "year", "unknown"]),
  /** `day`: the exact instant. `month`/`year`: the first of that period. */
  date: IsoDateSchema.optional(),
});
export type Release = z.infer<typeof ReleaseSchema>;

// ---------- Title ----------

export const TrackSchema = z.object({
  number: z.number().int().positive(),
  name: z.string(),
  /** False for a track the provider lists but hasn't shipped (pre-order). */
  available: z.boolean(),
  /** Milliseconds; null when the provider omits it. */
  durationMs: z.number().int().nonnegative().nullable(),
});
export type Track = z.infer<typeof TrackSchema>;

export const SeriesStatusSchema = z.object({
  kind: z.enum(["ended", "airing"]),
  seasons: z.number().int().nonnegative(),
});
export type SeriesStatus = z.infer<typeof SeriesStatusSchema>;

/** Aggregate over ALL users (modules/backlog/title-stats.ts) — counts only,
 *  never identities. `liked`/`saved`/`waiting` do not exist server-side. */
export const TitleCountsSchema = z.object({
  obsessed: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});
export type TitleCounts = z.infer<typeof TitleCountsSchema>;

/** One place to watch/listen. `url` is the link-out (JustWatch resolution or
 *  the preferred music service); `short`/`name`/`kind` are display labels. */
export const WatchOptionSchema = z.object({
  short: z.string(),
  name: z.string(),
  kind: z.string(),
  url: z.string().url(),
});
export type WatchOption = z.infer<typeof WatchOptionSchema>;

/**
 * A catalog title. The SUMMARY fields (id…coverUrl, plus `release`) are always
 * present — inside collections, feed events and rails (search answers its own
 * `SearchResult`). The DETAIL fields are optional and only `GET /titles/{id}`
 * fills them.
 */
export const TitleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  format: MediaFormatSchema,
  year: z.number().int().nullable(),
  /** `catalog_item.byline`: studio/network for video, artist for music. */
  creator: z.string().nullable(),
  /** `catalog_item.paletteHex` — empty until someone extracted the cover. */
  palette: z.array(HexSchema),
  /** Hotlinked TMDB / mzstatic URL (ADR-007), never proxied. */
  coverUrl: z.string().url().nullable(),
  /** Summary since 2026-09-24 (`toTitleSummary` → `releaseOf`): `day` when the
   *  catalog knows the date, `year` from `year` alone, null with neither. The
   *  detail read may refine it with the provider's fresher date. */
  release: ReleaseSchema.nullable(),
  genre: z.string().nullable().optional(),
  synopsis: z.string().nullable().optional(),
  /** "125 min" · "2 temporadas" · "18 canciones" — server-formatted meta. */
  detail: z.string().nullable().optional(),
  tracks: z.array(TrackSchema).optional(),
  /** Album: full song count, may exceed `tracks.length` before release. */
  trackCount: z.number().int().nonnegative().nullable().optional(),
  seriesStatus: SeriesStatusSchema.nullable().optional(),
  counts: TitleCountsSchema.nullable().optional(),
  watch: z.array(WatchOptionSchema).optional(),
});
export type Title = z.infer<typeof TitleSchema>;

// ---------- Collection ----------

export const CollectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  vibe: z.string().nullable(),
  /** private = isPublic false · link = public, off the profile · profile = both. */
  visibility: VisibilitySchema,
  /** `addedAt desc` — the collection's order. */
  titleIds: z.array(z.string()),
  /** titleId → when it entered THIS collection. */
  addedAt: z.record(z.string(), IsoDateSchema),
  /** Derived: the most recent title with a cover. Never persisted. */
  coverTitleId: z.string().nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Collection = z.infer<typeof CollectionSchema>;

// ---------- TitleState (the caller's own per-title state) ----------

export const TitleStateSchema = z.object({
  titleId: z.string().min(1),
  mark: MarkSchema.nullable(),
  /** First membership — `user_item.addedAt`. */
  savedAt: IsoDateSchema,
  reviewId: z.string().nullable(),
});
export type TitleState = z.infer<typeof TitleStateSchema>;

// ---------- People ----------

export const PersonStatsSchema = z.object({
  obsessed: z.number().int().nonnegative(),
  liked: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  reviews: z.number().int().nonnegative(),
});
export type PersonStats = z.infer<typeof PersonStatsSchema>;

/** A public collection as shown on someone else's profile (always `profile`
 *  visibility — that's the only kind a profile lists). */
export const PersonCollectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  titleIds: z.array(z.string()),
  coverTitleId: z.string().nullable(),
});
export type PersonCollection = z.infer<typeof PersonCollectionSchema>;

/**
 * Someone else — ONLY ever a public profile (`users.isPublic AND username`).
 * A private or nonexistent handle is the same 404 on `GET /people/{handle}`.
 * Never carries an id or an email.
 *
 * LISTS (people search, suggestions, following, followers, onboarding
 * people) ship the LITE card: identity + what the list query knows. Counts
 * it does not know (`followers`, `followingCount`, the four `stats`) are 0,
 * and `obsessions` / `common` / `collections` are empty — only
 * `GET /people/{handle}` fills them. `isPrivate` appears ONLY in the
 * caller's own `GET /me/following` / `GET /me/followers`, on a row whose
 * account went private after the follow (the viewer's own edge stays listed
 * so it stays removable; photo, hexes and counts are stripped).
 *
 * `isBlocked` = the CALLER blocked them (`PUT /me/blocks/{handle}`). Blocks
 * are mutual in visibility, so it can only be true on `GET /people/{handle}`
 * — the one read that still serves the blocker the profile they blocked
 * (to unblock from there); every list leaves blocked people out, so it is
 * always false there.
 */
export const PersonSchema = z.object({
  handle: z.string().min(1),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  /** Featured obsession tones, dark → light; empty = no obsession yet. */
  hexes: z.array(HexSchema),
  featuredTitleId: z.string().nullable(),
  isFounder: z.boolean(),
  followers: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  stats: PersonStatsSchema,
  /** Title ids they're obsessed with, newest first. */
  obsessions: z.array(z.string()),
  /** Title ids in common with the caller (social/affinity.ts). */
  common: z.array(z.string()),
  collections: z.array(PersonCollectionSchema),
  /** Whether the CALLER follows them. */
  isFollowing: z.boolean(),
  /** Discovery line ("le obsesiona El viaje de Chihiro"), suggestions only. */
  why: z.string().nullable().optional(),
  /** Own following/followers lists only: they went private after the follow. */
  isPrivate: z.boolean().optional(),
  /** The caller blocked them (only ever true on `GET /people/{handle}`). */
  isBlocked: z.boolean(),
});
export type Person = z.infer<typeof PersonSchema>;

/** The caller's own account. The ONLY payload with `email`. */
export const MeSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  /** Null until claimed (`PUT /me/username`). */
  handle: z.string().nullable(),
  /** Null until onboarding completes (`POST /me/onboarding`). */
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isPublic: z.boolean(),
  preferredService: PreferredServiceSchema.nullable(),
  notifyReleases: z.boolean(),
  /** Phase 4b — the monthly recap email's opt-out (`PATCH /me`). Own
   *  preference: never on `Person`. */
  notifyRecap: z.boolean(),
  /** Phase 4e — the "@x te sigue" push opt-out (`PATCH /me`). Own
   *  preference: never on `Person`. `true` until migration 0029 is live. */
  notifyFollowers: z.boolean(),
  isFounder: z.boolean(),
  /** `name` is set — the app skips onboarding. */
  onboardingComplete: z.boolean(),
  hexes: z.array(HexSchema),
  featuredTitleId: z.string().nullable(),
  followers: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  stats: PersonStatsSchema,
  createdAt: IsoDateSchema,
});
export type Me = z.infer<typeof MeSchema>;

// ---------- Review ----------

export const ReviewSchema = z.object({
  id: z.string().min(1),
  /** `users.username` as is — null while the author has no handle (only
   *  ever the caller's OWN review: public reviews always have one). */
  authorHandle: z.string().min(1).nullable(),
  titleId: z.string().min(1),
  body: z.string(),
  hasSpoiler: z.boolean(),
  /** The author's reaction to the title at read time. */
  mark: PublicMarkSchema.nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  /** Own review only: moderation hid it (edits don't un-hide; see AGENTS.md). */
  hidden: z.boolean().optional(),
});
export type Review = z.infer<typeof ReviewSchema>;

// ---------- Trust & safety (App Store 1.2) ----------

/** `POST /people/{handle}/report` body. Same schema as the web sheet
 *  (`modules/reports/types.ts`). */
export const ProfileReportBodySchema = profileReportBodySchema;
export type ProfileReportBody = z.infer<typeof ProfileReportBodySchema>;

/** `POST /reviews/{reviewId}/report` body — reasons = `REVIEW_REPORT_REASONS`. */
export const ReviewReportBodySchema = reviewReportBodySchema;
export type ReviewReportBody = z.infer<typeof ReviewReportBodySchema>;

/**
 * One row of `GET /me/blocks` — the caller's own block list. The ONE place
 * the wire carries another user's `id`: it is opaque, only ever shown to the
 * blocker, and exists so a row whose `handle` is null (the blocked account
 * is no longer public, or has no handle) can still be unblocked with
 * `DELETE /me/blocks/{id}`. `handle`, a real `name` and `avatarUrl` travel
 * only while they are a public profile; otherwise `handle`/`avatarUrl` are
 * null and `name` is "Perfil privado".
 */
export const BlockedPersonSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1).nullable(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
export type BlockedPerson = z.infer<typeof BlockedPersonSchema>;

// ---------- Feed ----------

/** Who did it — public-safe author card (same fields as ReviewAuthor). */
export const FeedAuthorSchema = z.object({
  handle: z.string().min(1),
  avatarUrl: z.string().nullable(),
  /** Two ADN hexes for the orb. */
  hexes: z.tuple([HexSchema, HexSchema]),
});
export type FeedAuthor = z.infer<typeof FeedAuthorSchema>;

export const FeedKindSchema = z.enum([
  "added",
  "completed",
  "obsessed",
  "reviewed",
  "suggest",
]);
export type FeedKind = z.infer<typeof FeedKindSchema>;

/**
 * One feed event. "No puede esperar" is NOT a kind: it is an `added` whose
 * `releaseDate` is in the future (F3.8 rule) — the app derives the label.
 * Bursts are grouped by the app (same rule as feed-list.tsx). `suggest` is
 * the one "Quizá quieras seguir" card: `author` is the suggested person and
 * `suggest` carries the reason.
 */
export const FeedEventSchema = z.object({
  /** `${kind}:${sourceRowId}` — unique across kinds. */
  id: z.string().min(1),
  kind: FeedKindSchema,
  at: IsoDateSchema,
  author: FeedAuthorSchema,
  titleId: z.string().nullable(),
  /** Summary title (no detail fields) so the app needn't hydrate. */
  title: TitleSchema.nullable(),
  /** The author's mark on the title: `obsessed` events are always
   *  "obsessed"; `completed` events carry the verdict or "completed";
   *  `reviewed` carries the author's current mark (may be null); `added`
   *  and `suggest` are null. */
  mark: PublicMarkSchema.nullable(),
  /** `added` only. */
  collectionId: z.string().nullable(),
  collectionName: z.string().nullable(),
  /** `added` only: the title's release date, set ONLY while it is still
   *  ahead at read time (F3.8 "no puede esperar" — it expires by itself). */
  releaseDate: IsoDateSchema.nullable(),
  /** `reviewed` only. */
  reviewId: z.string().nullable(),
  reviewBody: z.string().nullable(),
  hasSpoiler: z.boolean(),
  /** `suggest` only. */
  suggest: z
    .object({
      reason: z.string(),
      /** "Sigue a @a y @b" — null when no overlap to name. */
      common: z.string().nullable(),
      titleIds: z.array(z.string()),
    })
    .nullable(),
});
export type FeedEvent = z.infer<typeof FeedEventSchema>;

// ---------- Search ----------

/** A search hit. `id` is the local catalog id when the title is cached;
 *  otherwise `externalRef` identifies it and the membership `PUT` caches it. */
export const SearchResultSchema = z.object({
  id: z.string().nullable(),
  externalRef: ExternalRefSchema.nullable(),
  name: z.string().min(1),
  format: MediaFormatSchema,
  year: z.number().int().nullable(),
  creator: z.string().nullable(),
  coverUrl: z.string().url().nullable(),
  palette: z.array(HexSchema),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// ---------- auth (§2.1) ----------

export const DeviceSchema = z.object({
  platform: z.enum(["ios"]),
  name: z.string().trim().min(1).max(120),
  appVersion: z.string().trim().min(1).max(40),
});
export type Device = z.infer<typeof DeviceSchema>;

export const OtpRequestBodySchema = z.object({
  email: z.string().trim().email("Escribe un correo válido.").max(254, "Ese correo es demasiado largo."),
});
export type OtpRequestBody = z.infer<typeof OtpRequestBodySchema>;

export const OtpVerifyBodySchema = z.object({
  email: z.string().trim().email("Escribe un correo válido.").max(254, "Ese correo es demasiado largo."),
  code: z.string().trim().regex(/^\d{6}$/, "Seis dígitos"),
  device: DeviceSchema,
});
export type OtpVerifyBody = z.infer<typeof OtpVerifyBodySchema>;

/** `POST auth/otp/verify` and `POST auth/refresh`. */
export const AuthSessionSchema = z.object({
  /** HS256 bearer, 30 days. Store in the Keychain. */
  token: z.string().min(1),
  user: MeSchema,
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

/** `POST auth/refresh` body (optional, phase 4d): the install's current
 *  device — updates its session's name/version, or names the session a
 *  pre-4d bearer gets on upgrade. */
export const RefreshBodySchema = z.object({
  device: DeviceSchema.optional(),
});
export type RefreshBody = z.infer<typeof RefreshBodySchema>;

/** `POST auth/apple` (phase 4f). `rawNonce` is the nonce BEFORE hashing:
 *  the app put `sha256hex(rawNonce)` in the Apple request. */
export const AppleSignInBodySchema = z.object({
  identityToken: z.string().trim().min(1, "Falta el token de Apple.").max(10_000),
  rawNonce: z.string().min(1, "Falta el nonce.").max(200),
  authorizationCode: z.string().trim().min(1).max(2_000).optional(),
  /** Accepted for forward-compat and IGNORED by the server (see §2.2): the
   *  app pre-fills the onboarding name with it. */
  fullName: z
    .object({
      givenName: z.string().max(100).nullable().optional(),
      familyName: z.string().max(100).nullable().optional(),
    })
    .nullable()
    .optional(),
  device: DeviceSchema,
});
export type AppleSignInBody = z.infer<typeof AppleSignInBodySchema>;

/** The nonce the app handed Google Sign-In for this sign-in (verbatim, not
 *  hashed). Optional while older builds don't send it; when present the ID
 *  token's `nonce` must match (`verifyGoogleIdToken`).
 *  TODO(nonce): required once every build in the field sends it. */
const GoogleNonceSchema = z.string().min(1, "Falta el nonce.").max(200).optional();

/** `POST auth/google` (phase 4f). */
export const GoogleSignInBodySchema = z.object({
  idToken: z.string().trim().min(1, "Falta el token de Google.").max(10_000),
  nonce: GoogleNonceSchema,
  device: DeviceSchema,
});
export type GoogleSignInBody = z.infer<typeof GoogleSignInBodySchema>;

/** `GET auth/providers` (public): which social buttons the app may paint. */
export const AuthProvidersSchema = z.object({
  apple: z.boolean(),
  google: z.object({ clientId: z.string().min(1) }).nullable(),
});
export type AuthProviders = z.infer<typeof AuthProvidersSchema>;

// ---------- identities & account merge (phase 4g) ----------

export const SocialProviderSchema = z.enum(["apple", "google"]);
export type SocialProviderWire = z.infer<typeof SocialProviderSchema>;

/** `GET /me/identities`: the ways into THIS account. `email` (the account's
 *  own address, always a way in by code) + the providers ENABLED on this
 *  deploy (same rule as `auth/providers`) and whether each is linked. */
export const IdentitiesSchema = z.object({
  email: z.string().min(1),
  /** The account email is an Apple private relay (`@privaterelay.appleid.com`):
   *  disconnecting Apple may stop the relay forwarding codes, so
   *  `DELETE /me/identities/apple` answers 409 `last_way_in` when Apple is
   *  the only provider linked. */
  emailIsRelay: z.boolean(),
  providers: z.array(z.object({ provider: SocialProviderSchema, linked: z.boolean() })),
});
export type Identities = z.infer<typeof IdentitiesSchema>;

/** `POST /me/identities/apple` — same token fields as `auth/apple`, no device. */
export const AppleLinkBodySchema = z.object({
  identityToken: z.string().trim().min(1, "Falta el token de Apple.").max(10_000),
  rawNonce: z.string().min(1, "Falta el nonce.").max(200),
  authorizationCode: z.string().trim().min(1).max(2_000).optional(),
});
export type AppleLinkBody = z.infer<typeof AppleLinkBodySchema>;

/** `POST /me/identities/google`. */
export const GoogleLinkBodySchema = z.object({
  idToken: z.string().trim().min(1, "Falta el token de Google.").max(10_000),
  nonce: GoogleNonceSchema,
});
export type GoogleLinkBody = z.infer<typeof GoogleLinkBodySchema>;

/** `POST /me/identities/{provider}` → 200. */
export const IdentityLinkedSchema = z.object({ linked: z.literal(true) });
export type IdentityLinked = z.infer<typeof IdentityLinkedSchema>;

/** The account the caller proved it owns and is about to absorb. Carries its
 *  email: the caller just proved that mailbox/provider is theirs. */
export const MergeSourceSchema = z.object({
  handle: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().min(1),
  /** The source was publicly visible (public + handle). false → warn: its
   *  per-title activity and reviews show under a public destination. */
  isPublic: z.boolean(),
  counts: z.object({
    titles: z.number().int().nonnegative(),
    collections: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
    followers: z.number().int().nonnegative(),
    following: z.number().int().nonnegative(),
  }),
});
export type MergeSource = z.infer<typeof MergeSourceSchema>;

/** A proof of ownership: 200 of `me/merge/otp/verify`, and the extra keys
 *  inside the 409 `linked_elsewhere` error of `me/identities/{provider}`.
 *  `mergeToken` = single use, 10 minutes, bound to the caller's account. */
export const MergeProofSchema = z.object({
  mergeToken: z.string().min(1),
  source: MergeSourceSchema,
});
export type MergeProof = z.infer<typeof MergeProofSchema>;

export const MergeOtpRequestBodySchema = z.object({
  email: z.string().trim().email("Escribe un correo válido.").max(254, "Ese correo es demasiado largo."),
});
export type MergeOtpRequestBody = z.infer<typeof MergeOtpRequestBodySchema>;

export const MergeOtpVerifyBodySchema = z.object({
  email: z.string().trim().email("Escribe un correo válido.").max(254, "Ese correo es demasiado largo."),
  code: z.string().trim().regex(/^\d{6}$/, "Seis dígitos"),
});
export type MergeOtpVerifyBody = z.infer<typeof MergeOtpVerifyBodySchema>;

export const MergeBodySchema = z.object({
  mergeToken: z.string().trim().min(1, "Falta el permiso para fusionar.").max(4_000),
});
export type MergeBody = z.infer<typeof MergeBodySchema>;

/** `POST /me/merge` → 200: the destination (the caller), after absorbing. */
export const MergeResultSchema = z.object({ user: MeSchema });
export type MergeResult = z.infer<typeof MergeResultSchema>;

// ---------- sessions & devices (phase 4d/4e) ----------

/** One signed-in install of the caller (`GET /me/sessions`). */
export const MobileSessionSchema = z.object({
  id: z.string().uuid(),
  platform: z.string().min(1),
  deviceName: z.string().min(1),
  appVersion: z.string().min(1),
  createdAt: IsoDateSchema,
  lastSeenAt: IsoDateSchema,
  /** The session of the bearer making this request. */
  current: z.boolean(),
});
export type MobileSession = z.infer<typeof MobileSessionSchema>;

/** `PUT /me/devices/{apnsToken}` body. */
export const DeviceTokenBodySchema = z.object({
  environment: z.enum(["sandbox", "production"]),
});
export type DeviceTokenBody = z.infer<typeof DeviceTokenBodySchema>;

/** `POST auth/web-session` body (optional): where the web should land.
 *  Validated against the handoff allow-list (`src/authz/handoff.ts`
 *  `parseHandoffTarget`) in the handler; absent = `/recap/tarjeta`. */
export const WebSessionBodySchema = z.object({
  to: z.string().max(200, "Ese destino es demasiado largo.").optional(),
});
export type WebSessionBody = z.infer<typeof WebSessionBodySchema>;

/** `POST auth/web-session` → a one-shot absolute URL (60 s) that opens the
 *  web already signed in and lands on the allow-listed path. */
export const WebSessionSchema = z.object({
  url: z.string().url(),
});
export type WebSession = z.infer<typeof WebSessionSchema>;
