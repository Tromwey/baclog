import { z } from "zod";

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
    /** Sub-code the app branches on: "underage" (forbidden), "not_released"
     *  / "reaction_required" (conflict). */
    reason: z.string().optional(),
    /** `invalid` only: field → message. */
    fields: z.record(z.string(), z.string()).optional(),
    /** `rate_limited` only. */
    retryAfterSeconds: z.number().int().positive().optional(),
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
 * A catalog title. The SUMMARY fields (id…coverUrl) are always present —
 * inside collections, feed events, search results and rails. The DETAIL
 * fields are optional and only `GET /titles/{id}` fills them.
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
  genre: z.string().nullable().optional(),
  synopsis: z.string().nullable().optional(),
  /** "125 min" · "2 temporadas" · "18 canciones" — server-formatted meta. */
  detail: z.string().nullable().optional(),
  release: ReleaseSchema.nullable().optional(),
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
 * A private or nonexistent handle is the same 404; there is no `isPrivate`
 * on the wire. Never carries an id or an email.
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
  authorHandle: z.string().min(1),
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
  /** The author's mark on the title (completed/obsessed/reviewed). */
  mark: PublicMarkSchema.nullable(),
  /** `added` only. */
  collectionId: z.string().nullable(),
  collectionName: z.string().nullable(),
  /** `added` only: set when the title had not been released at add time. */
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
  email: z.string().trim().email().max(254),
});
export type OtpRequestBody = z.infer<typeof OtpRequestBodySchema>;

export const OtpVerifyBodySchema = z.object({
  email: z.string().trim().email().max(254),
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
