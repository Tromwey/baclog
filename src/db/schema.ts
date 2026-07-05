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
  "obsessing_over",
  "completed",
  "custom",
]);
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
    status: itemStatusEnum("status").notNull().default("on_my_radar"),
    /** Only meaningful when status = 'custom' (F2.8) */
    customStatusLabel: text("custom_status_label"),
    /** 1–5, only meaningful when status = 'completed' (F2.9) */
    rating: smallint("rating"),
    /** F2.15 — 4-6 hex colors extracted on-device at save time */
    paletteHex: text("palette_hex").array(),
    addedAt: timestamp("added_at").notNull().defaultNow(),
    /** Eras (F2.10) bucket by max(addedAt, statusChangedAt) at read time */
    statusChangedAt: timestamp("status_changed_at").notNull().defaultNow(),
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
