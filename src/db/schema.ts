import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------- enums ----------
export const mediaTypeEnum = pgEnum("media_type", ["film", "series", "album"]);
export const itemStatusEnum = pgEnum("item_status", [
  "on_my_radar",
  "in_progress",
  "completed",
  // @deprecated F2.8 custom status — retired in the item-flow redesign (no UI
  // adds it anymore; existing rows were folded into `in_progress` in migration
  // 0009). The VALUE is kept only because removing an enum member requires
  // recreating the type (not worth it). Never set it.
  "custom",
]);
/**
 * Veredicto — me gusta / no me gusta (F3.7 followup). An INDEPENDENT axis from
 * `obsessed`: a verdict is a considered judgement, obsession is a free
 * real-time signal. They were briefly merged in F3.6 (one `reaction` field),
 * which made picking a verdict silently un-light an obsession — split back
 * apart in 0009. Nullable column = sin veredicto.
 */
export const itemVerdictEnum = pgEnum("item_verdict", ["disliked", "liked"]);
export const preferredServiceEnum = pgEnum("preferred_service", [
  "spotify",
  "apple_music",
  "youtube_music",
]);
export const linkServiceEnum = pgEnum("link_service", [
  "spotify",
  "apple_music",
  "youtube_music",
  "netflix",
  "hulu",
  "disney_plus",
  "max",
  "prime_video",
  "other",
]);
export const reportReasonEnum = pgEnum("report_reason", [
  "spam",
  "impersonation",
  "harassment",
  "illegal_content",
  "other",
]);
export const deviceClassEnum = pgEnum("device_class", [
  "ios",
  "android",
  "desktop",
  "other",
]);
export const analyticsEventTypeEnum = pgEnum("analytics_event_type", [
  "session_view",
  "public_profile_view",
  "public_backlog_view",
  "public_item_view",
  "card_share",
]);

// ---------- Auth.js tables (Drizzle adapter, OTP flow — no passwords) ----------

export const users = pgTable(
  "user",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { mode: "date" }),
    /** Display name (F2.1) — null until onboarding completes */
    name: text("name"),
    /** Unused in M2 (no OAuth avatars); kept for Auth.js adapter compat */
    image: text("image"),
    /** F2.2 — never selected into any public-facing query, never displayed */
    birthYear: smallint("birth_year"),
    /** Derived once at onboarding; <13 accounts are blocked and signed out */
    isMinor: boolean("is_minor").notNull().default(false),
    /** F2.3 — null until chosen in onboarding */
    preferredService: preferredServiceEnum("preferred_service"),
    /** F2.17 — null means not claimed; public page requires it + isPublic */
    username: varchar("username", { length: 30 }),
    isPublic: boolean("is_public").notNull().default(false),
    /** F3.2 — first ~100 accounts + manually-seeded curators */
    isFounder: boolean("is_founder").notNull().default(false),
    /** F3.2 — organic first-100 get a rank; seeded curators keep it null */
    founderRank: integer("founder_rank"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_email_unique").on(t.email),
    uniqueIndex("user_username_unique").on(t.username),
  ],
);

/** Repurposed as the OTP store: token = sha256(code), identifier = email. */
export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
    /** Failed verification attempts — token invalidated at the cap */
    attempts: smallint("attempts").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/** DB session strategy: account deletion must revoke sessions instantly. */
export const sessions = pgTable(
  "session",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

/** Unused in M2 (no OAuth); forward-compat with M4 Apple/Google sign-in. */
export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// ---------- catalog module (shared cache, no user FKs — ADR-007) ----------

export const catalogItems = pgTable(
  "catalog_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    source: text("source").notNull(), // "tmdb" | "itunes"
    externalId: text("external_id").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    title: text("title").notNull(),
    /** Studio/network for video, artist for music */
    byline: text("byline"),
    year: smallint("year"),
    /** Primary genre label — also seeds the pattern card style */
    genre: text("genre"),
    synopsis: text("synopsis"),
    /** Hotlinked TMDB/mzstatic URL — never proxied or stored as binary */
    posterUrl: text("poster_url"),
    /**
     * F2.15 — 4-6 dominant hex colors, extracted on-device (canvas) from the
     * poster the FIRST time any user adds this title, then shared here. Purely
     * cover-derived (same for every user), so it lives on the shared catalog
     * cache, not per user/backlog. `[]` from a CORS-failed extraction is never
     * persisted (only-if-null write) so a later success can still fill it.
     */
    paletteHex: text("palette_hex").array(),
    /** Upstream rating (TMDB vote_average) — distinct from user rating */
    sourceRating: real("source_rating"),
    isrc: text("isrc"),
    upc: text("upc"),
    raw: jsonb("raw"),
    /** ADR-007: ≤3-month cache clock, stale-while-revalidate */
    refreshedAt: timestamp("refreshed_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("catalog_item_source_external_unique").on(
      t.source,
      t.externalId,
    ),
    index("catalog_item_media_type_idx").on(t.mediaType),
  ],
);

// ---------- backlog module ----------

export const backlogs = pgTable(
  "backlog",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    vibe: text("vibe"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("backlog_user_id_idx").on(t.userId)],
);

export const backlogItems = pgTable(
  "backlog_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    backlogId: text("backlog_id")
      .notNull()
      .references(() => backlogs.id, { onDelete: "cascade" }),
    /**
     * Denormalized from backlog.userId so the authz helper checks ownership
     * with one indexed column, no join (ADR-010 names missed-authz the #1
     * risk). Any future "move item between backlogs" mutation must update
     * both backlogId AND userId atomically.
     */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    catalogItemId: text("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "restrict" }),
    /**
     * When the title was added to THIS backlog. Per-membership; per-title state
     * (status / verdict / obsession / provenance) and the cover palette moved
     * off this table (→ user_item and catalog_item) in migration 0011→0012.
     */
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (t) => [
    index("backlog_item_backlog_id_idx").on(t.backlogId),
    index("backlog_item_user_id_idx").on(t.userId),
    uniqueIndex("backlog_item_unique_per_backlog").on(
      t.backlogId,
      t.catalogItemId,
    ),
  ],
);

/**
 * The user's per-TITLE state — one row per (user, catalog_item), independent of
 * how many backlogs the title is filed under. Split out from `backlog_item`
 * (which is now pure membership) so status / verdict / obsession / AI-provenance
 * are the SAME across every backlog a title lives in: setting "me obsesiona"
 * once is true everywhere, and it's counted once in stats/recap. Palette is NOT
 * here — it's cover-derived, so it lives on the shared `catalog_item`.
 */
export const userItems = pgTable(
  "user_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    catalogItemId: text("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "restrict" }),
    status: itemStatusEnum("status").notNull().default("on_my_radar"),
    /** Eras (F2.10) bucket by max(addedAt, statusChangedAt) at read time. */
    statusChangedAt: timestamp("status_changed_at").notNull().defaultNow(),
    /** Veredicto — me gusta / no me gusta (F3.7). Null = sin veredicto. */
    verdict: itemVerdictEnum("verdict"),
    verdictChangedAt: timestamp("verdict_changed_at"),
    /** Obsession — free, status-independent "me obsesiona" + public marker. */
    obsessed: boolean("obsessed").notNull().default(false),
    obsessedAt: timestamp("obsessed_at"),
    /** Provenance (F3.6): the AI reco this title was accepted from, if any. */
    sourceCrossMediaRecId: text("source_cross_media_rec_id").references(
      () => crossMediaRecs.id,
      { onDelete: "set null" },
    ),
    /** When the title first entered the user's library (min across memberships). */
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (t) => [
    // At most one state row per (user, title) — the join key from backlog_item.
    uniqueIndex("user_item_user_catalog_unique").on(t.userId, t.catalogItemId),
    index("user_item_user_id_idx").on(t.userId),
    index("user_item_source_cross_media_rec_id_idx").on(
      t.sourceCrossMediaRecId,
    ),
  ],
);

// ---------- links module (lazy-resolved deep-link cache — ADR-007) ----------

export const mediaLinks = pgTable(
  "media_link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    catalogItemId: text("catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    service: linkServiceEnum("service").notNull(),
    /** ISO country code — only meaningful for video providers (F2.12) */
    region: varchar("region", { length: 8 }),
    url: text("url").notNull(),
    /** F2.13 — true = no exact match, this is a search deep link */
    isSearchFallback: boolean("is_search_fallback").notNull().default(false),
    resolvedAt: timestamp("resolved_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("media_link_unique").on(t.catalogItemId, t.service, t.region),
    index("media_link_catalog_item_idx").on(t.catalogItemId),
  ],
);

// ---------- trust & safety (F2.21) ----------

export const reports = pgTable(
  "report",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Nullable: anonymous reports from public pages are allowed */
    reporterUserId: text("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("report_target_user_id_idx").on(t.targetUserId)],
);

// ---------- growth module (F3.1 waitlist + referrals) ----------

export const waitlistEntries = pgTable(
  "waitlist_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Pre-signup identity — minimal PII (Pilar 4) */
    email: text("email").notNull(),
    /** Opaque shareable code (not derived from name/email) */
    referralCode: varchar("referral_code", { length: 12 }).notNull(),
    referredByEntryId: text("referred_by_entry_id"),
    /** Monotonic arrival order — base queue position before referral boosts */
    sequence: integer("sequence").notNull(),
    /** Confirmed referred signups; denormalized for cheap ranking */
    referralCount: integer("referral_count").notNull().default(0),
    /** Set once the entrant creates a real account */
    convertedUserId: text("converted_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    convertedAt: timestamp("converted_at", { mode: "date" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("waitlist_entry_email_unique").on(t.email),
    uniqueIndex("waitlist_entry_referral_code_unique").on(t.referralCode),
    index("waitlist_entry_referred_by_idx").on(t.referredByEntryId),
    index("waitlist_entry_sequence_idx").on(t.sequence),
  ],
);

export const waitlistReferrals = pgTable(
  "waitlist_referral",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    referrerEntryId: text("referrer_entry_id")
      .notNull()
      .references(() => waitlistEntries.id, { onDelete: "cascade" }),
    refereeEntryId: text("referee_entry_id")
      .notNull()
      .references(() => waitlistEntries.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // One credit per referee, ever — the anti-gaming guard
    uniqueIndex("waitlist_referral_referee_unique").on(t.refereeEntryId),
    index("waitlist_referral_referrer_idx").on(t.referrerEntryId),
  ],
);

// ---------- backlog module (F3.3 monthly recap idempotency) ----------

export const recapSends = pgTable(
  "recap_send",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "2026-07" — era.ts key format */
    eraKey: varchar("era_key", { length: 7 }).notNull(),
    emailSentAt: timestamp("email_sent_at", { mode: "date" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // THE idempotency key: at most one recap per (user, era), ever
    uniqueIndex("recap_send_user_era_unique").on(t.userId, t.eraKey),
    index("recap_send_era_key_idx").on(t.eraKey),
  ],
);

// ---------- recs module (F3.5.5 cross-media Double Feature) ----------

/**
 * Cache of generated cross-media recos, keyed by the seed catalog_item. One
 * row per (seed → grounded target) pairing so an identical seed never pays for
 * a second LLM generation (ADR-009: each generation costs — cache first). The
 * target is a REAL catalog_item resolved against search (grounding), so the
 * FK guarantees the reco is addable + link-outable. Narrative fields are the
 * LLM-authored prose the Double Feature card renders.
 */
export const crossMediaRecs = pgTable(
  "cross_media_rec",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seedCatalogItemId: text("seed_catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    /** Grounded reco — a real catalog_item (never a hallucinated title) */
    targetCatalogItemId: text("target_catalog_item_id")
      .notNull()
      .references(() => catalogItems.id, { onDelete: "cascade" }),
    /** Card narrative (LLM-authored, grounded). Mirrors DoubleFeatureData.narrative. */
    hookEyebrow: text("hook_eyebrow").notNull(),
    hookTitle: text("hook_title").notNull(),
    resultEyebrow: text("result_eyebrow").notNull(),
    closer: text("closer"),
    /** "fixture" | "llm" — which provider produced this row (observability) */
    provider: text("provider").notNull(),
    /**
     * v1 = crude "0.1" baseline prompt; bump CURRENT_PROMPT_VERSION when the
     * prompt is polished so stale rows can be invalidated/regenerated later.
     */
    promptVersion: integer("prompt_version").notNull().default(1),
    /** The model/provider that produced the row (e.g. "gemini-2.5-flash-lite", "fixture") — observability. */
    model: text("model"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // One cached reco per seed — the cache key that gates re-generation
    uniqueIndex("cross_media_rec_seed_unique").on(t.seedCatalogItemId),
    index("cross_media_rec_target_idx").on(t.targetCatalogItemId),
  ],
);

/**
 * Per-user monthly generation meter for cross-media recos (ADR-009: free tier
 * = N metered generations/month; aligns LLM cost with the gate). One row per
 * (user, month); the count is only bumped on a real LLM generation, never on a
 * cache hit. eraKey format "2026-07" matches recap_send.
 */
export const crossMediaRecUsage = pgTable(
  "cross_media_rec_usage",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "2026-07" — era.ts key format */
    eraKey: varchar("era_key", { length: 7 }).notNull(),
    /** LLM generations charged this month (cache hits do NOT count) */
    generations: integer("generations").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // THE meter key: at most one counter row per (user, month)
    uniqueIndex("cross_media_rec_usage_user_era_unique").on(t.userId, t.eraKey),
  ],
);

/**
 * Structured "why" feedback (F3.6) on a cross-media-sourced backlog item's
 * reaction — chips, not free text, so it's aggregable by promptVersion/model
 * without another LLM pass. One row per backlog item (upsert on re-submit —
 * there's one live reaction and one live "why" per item, no history needed).
 */
export const crossMediaRecoFeedback = pgTable(
  "cross_media_reco_feedback",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Per-title anchor — one live "why" per title (was per backlog_item). */
    userItemId: text("user_item_id")
      .notNull()
      .references(() => userItems.id, { onDelete: "cascade" }),
    /** Denormalized from userItems.userId — cheap ownership, no join. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Denormalized from userItems.sourceCrossMediaRecId so aggregating by
     * promptVersion/model is one join (→ cross_media_rec), not two.
     */
    crossMediaRecId: text("cross_media_rec_id")
      .notNull()
      .references(() => crossMediaRecs.id, { onDelete: "cascade" }),
    /** Tag slugs (see crossmedia-feedback-actions.ts) — validated app-side, not a DB enum. */
    reasons: text("reasons").array().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cross_media_reco_feedback_user_item_unique").on(t.userItemId),
    index("cross_media_reco_feedback_cross_media_rec_idx").on(
      t.crossMediaRecId,
    ),
  ],
);

// ---------- analytics module (F3.4) ----------

export const analyticsEvents = pgTable(
  "analytics_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventType: analyticsEventTypeEnum("event_type").notNull(),
    /** Null for anonymous viewer events */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** public_* events only — whose profile was viewed, never who viewed it */
    targetUsername: varchar("target_username", { length: 30 }),
    /** ISO 3166-1 alpha-2 from x-vercel-ip-country — coarse, never raw IP */
    country: varchar("country", { length: 2 }),
    /** Coarse bucket from User-Agent — raw UA never stored */
    device: deviceClassEnum("device").notNull().default("other"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("analytics_event_type_created_idx").on(t.eventType, t.createdAt),
    index("analytics_event_country_idx").on(t.country),
  ],
);

// ---------- relations ----------

export const usersRelations = relations(users, ({ many }) => ({
  backlogs: many(backlogs),
  sessions: many(sessions),
}));

export const backlogsRelations = relations(backlogs, ({ one, many }) => ({
  user: one(users, { fields: [backlogs.userId], references: [users.id] }),
  items: many(backlogItems),
}));

export const backlogItemsRelations = relations(backlogItems, ({ one }) => ({
  backlog: one(backlogs, {
    fields: [backlogItems.backlogId],
    references: [backlogs.id],
  }),
  catalogItem: one(catalogItems, {
    fields: [backlogItems.catalogItemId],
    references: [catalogItems.id],
  }),
}));

export const catalogItemsRelations = relations(catalogItems, ({ many }) => ({
  links: many(mediaLinks),
}));

export const userItemsRelations = relations(userItems, ({ one }) => ({
  user: one(users, { fields: [userItems.userId], references: [users.id] }),
  catalogItem: one(catalogItems, {
    fields: [userItems.catalogItemId],
    references: [catalogItems.id],
  }),
}));

export const waitlistEntriesRelations = relations(
  waitlistEntries,
  ({ one }) => ({
    convertedUser: one(users, {
      fields: [waitlistEntries.convertedUserId],
      references: [users.id],
    }),
  }),
);

export const recapSendsRelations = relations(recapSends, ({ one }) => ({
  user: one(users, { fields: [recapSends.userId], references: [users.id] }),
}));

export const crossMediaRecsRelations = relations(crossMediaRecs, ({ one }) => ({
  seed: one(catalogItems, {
    fields: [crossMediaRecs.seedCatalogItemId],
    references: [catalogItems.id],
  }),
  target: one(catalogItems, {
    fields: [crossMediaRecs.targetCatalogItemId],
    references: [catalogItems.id],
  }),
}));
