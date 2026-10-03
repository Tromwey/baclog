import "server-only";
import { and, asc, desc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  backlogItems,
  backlogs,
  catalogItems,
  crossMediaRecs,
  itemReviews,
  userItems,
} from "@/db/schema";
import {
  CURSOR_ORDER,
  cursorOf,
  type CollectionCursor,
  type CursorKeyName,
  type PagedSort,
} from "./collection-cursor";
import type { MediaType } from "@/modules/cards/types";
import type { CollectionItem } from "./collection-item";
import { dominantHexes, groupDominantHexes } from "./palette";
import { libraryMediaType } from "@/modules/catalog/library-media";
import { notPartyBacklog } from "@/modules/party-collections/gate";

/**
 * All reads here are scoped by userId in the query itself — callers pass
 * the session user id obtained from requireUser()/assertUser(). Public
 * (unauthenticated) reads live in public.ts, gated on isPublic (G6).
 */

export async function getBacklogsForUser(userId: string) {
  const rows = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      vibe: backlogs.vibe,
      createdAt: backlogs.createdAt,
      // F3.10.1 — visibility axes, for the profile's escaparate + edit sheet.
      isPublic: backlogs.isPublic,
      showOnProfile: backlogs.showOnProfile,
      itemCount: sql<number>`count(${backlogItems.id})::int`,
    })
    .from(backlogs)
    .leftJoin(backlogItems, eq(backlogItems.backlogId, backlogs.id))
    .where(and(eq(backlogs.userId, userId), notPartyBacklog(backlogs.id)))
    .groupBy(backlogs.id)
    .orderBy(desc(backlogs.createdAt));

  if (rows.length === 0) return [];

  // Up to 6 ADN colors per backlog, newest item first. (Item lists live in
  // getLensItems/getBacklogItems — the shelf list stays palette-only.) Palette
  // is cover-derived, so it comes from the shared catalog_item, not per row.
  const palettes = await db
    .select({
      backlogId: backlogItems.backlogId,
      paletteHex: catalogItems.paletteHex,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(
      inArray(
        backlogItems.backlogId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(desc(backlogItems.addedAt));

  // ADN = each backlog's distinct dominant colors (one per item).
  const paletteMap = groupDominantHexes(palettes, (c) => c.backlogId, 6);

  return rows.map((r) => ({
    ...r,
    // Lima-only fallback so a backlog with no extracted palette still auras.
    paletteHex: paletteMap.get(r.id) ?? ["#D8FF3E"],
  }));
}

/**
 * Just {id, name} for backlog pickers (e.g. the item page's "¿A cuál
 * backlog?" sheet) — one cheap query, no item join. Same ordering as
 * getBacklogsForUser so both lists agree.
 */
export async function getBacklogNames(userId: string) {
  return db
    .select({ id: backlogs.id, name: backlogs.name })
    .from(backlogs)
    // A picker must never offer a party ("guardar en" a film into a fiesta).
    .where(and(eq(backlogs.userId, userId), notPartyBacklog(backlogs.id)))
    .orderBy(desc(backlogs.createdAt));
}

export interface UserStats {
  totalItems: number;
  totalBacklogs: number;
  obsesiones: number;
}

/**
 * Profile stats (M3.5). Counts scan user_item (per-title) so a title filed in
 * two backlogs counts ONCE — "guardadas" = distinct titles, "obsesiones" =
 * distinct obsessed titles. (Was per backlog_item, which double-counted.)
 * "Guardadas (horas)" from the mock needs runtime we don't store yet.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const [itemAgg, backlogAgg] = await Promise.all([
    db
      .select({
        totalItems: sql<number>`count(*)::int`,
        obsesiones: sql<number>`(count(*) filter (where ${userItems.obsessed}))::int`,
      })
      .from(userItems)
      .where(eq(userItems.userId, userId)),
    db
      .select({ totalBacklogs: sql<number>`count(*)::int` })
      .from(backlogs)
      .where(and(eq(backlogs.userId, userId), notPartyBacklog(backlogs.id))),
  ]);

  return {
    totalItems: itemAgg[0]?.totalItems ?? 0,
    totalBacklogs: backlogAgg[0]?.totalBacklogs ?? 0,
    obsesiones: itemAgg[0]?.obsesiones ?? 0,
  };
}

/**
 * The user's ADN palette (M3.5) — up to `limit` distinct dominant colors across
 * their most-recent items, for the profile orb aura. [] when nothing has an
 * extracted palette yet → AuraField falls back to lima-only.
 */
export async function getUserPalette(
  userId: string,
  limit = 6,
): Promise<string[]> {
  const rows = await db
    .select({ paletteHex: catalogItems.paletteHex })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(eq(userItems.userId, userId))
    .orderBy(desc(userItems.addedAt))
    .limit(40);
  return dominantHexes(rows, limit);
}

export type BacklogItemWithCatalog = Awaited<
  ReturnType<typeof getBacklogItems>
>[number];

/**
 * The user's per-title entry for a catalog item — one row (user_item), so no
 * more picking an arbitrary copy. State (status/verdict/obsession/provenance)
 * from user_item, cover facts + palette from catalog_item, plus the list of
 * backlogs the title is filed under. Null when the user hasn't logged it.
 * Powers the item detail, its ticket-share gate (F3.5.7) and the loved teaser.
 *
 * AI-sourced entries (sourceCrossMediaRecId set) also carry their rec's stored
 * narrative (rec* fields, LEFT-joined here so the item page needs no second
 * round-trip) — all null on non-AI entries. crossMediaRecs is a shared,
 * non-user-scoped cache of item-metadata prose (no user data), reached via an
 * id the user owns on their user_item, so no ownership check applies.
 */
export async function getUserCatalogEntry(
  userId: string,
  catalogItemId: string,
) {
  // Second catalogItems join (aliased): the rec's SEED item, for its title.
  const seedCatalogItems = alias(catalogItems, "seed_catalog_items");
  const [row] = await db
    .select({
      id: userItems.id,
      status: userItems.status,
      verdict: userItems.verdict,
      obsessed: userItems.obsessed,
      sourceCrossMediaRecId: userItems.sourceCrossMediaRecId,
      paletteHex: catalogItems.paletteHex,
      addedAt: userItems.addedAt,
      statusChangedAt: userItems.statusChangedAt,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      releaseDate: catalogItems.releaseDate,
      genre: catalogItems.genre,
      mediaType: libraryMediaType(),
      posterUrl: catalogItems.posterUrl,
      recHookEyebrow: crossMediaRecs.hookEyebrow,
      recHookTitle: crossMediaRecs.hookTitle,
      recResultEyebrow: crossMediaRecs.resultEyebrow,
      recCloser: crossMediaRecs.closer,
      recSeedTitle: seedCatalogItems.title,
      // F3.5.8 honesty label — "thematic"/null = vibe fallback, anything else
      // names a verified graph edge (soundtrack/score/…).
      recLinkType: crossMediaRecs.linkType,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .leftJoin(
      crossMediaRecs,
      eq(userItems.sourceCrossMediaRecId, crossMediaRecs.id),
    )
    .leftJoin(
      seedCatalogItems,
      eq(crossMediaRecs.seedCatalogItemId, seedCatalogItems.id),
    )
    .where(
      and(
        eq(userItems.userId, userId),
        eq(userItems.catalogItemId, catalogItemId),
      ),
    )
    .limit(1);
  if (!row) return null;

  // Every backlog the title is filed under (newest shelf first) — the detail
  // shows where it lives; `backlogName` keeps the single-name copy working.
  const memberships = await db
    .select({ id: backlogs.id, name: backlogs.name })
    .from(backlogItems)
    .innerJoin(backlogs, eq(backlogItems.backlogId, backlogs.id))
    .where(
      and(
        eq(backlogItems.userId, userId),
        eq(backlogItems.catalogItemId, catalogItemId),
      ),
    )
    .orderBy(desc(backlogs.createdAt));

  return { ...row, backlogs: memberships, backlogName: memberships[0]?.name ?? null };
}

/**
 * "Loved" = the trigger for a cross-media reco (F3.5.5/6). Spans BOTH axes now
 * (F3.7): obsessed OR a "me gusta" verdict. Status-independent — obsession can
 * strike mid-consumption. Centralized here so every "amado" read agrees.
 */
export const LOVED_FILTER = or(
  eq(userItems.obsessed, true),
  eq(userItems.verdict, "liked"),
);

export interface LovedSeed {
  catalogItemId: string;
  title: string;
  byline: string | null;
  year: number | null;
  mediaType: MediaType;
  /** Real cover — in-app display ONLY, never exported (ADR-008). */
  posterUrl: string | null;
  /** The seed's home backlog = the default accept target (its Side A backlog). */
  backlogId: string;
  backlogName: string;
}

/**
 * F3.5.6 — every distinct catalog item the user LOVES (LOVED_FILTER),
 * most-recently-touched first, each paired with its home backlog. These are the
 * seeds the /para-ti feed turns into Double Features. Deduped by catalog item so
 * a title loved in two backlogs surfaces once (its newest home wins as the
 * default accept target). Scoped to the user in the query.
 */
export async function getLovedSeeds(
  userId: string,
  limit = 24,
): Promise<LovedSeed[]> {
  const rows = await db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      mediaType: libraryMediaType(),
      posterUrl: catalogItems.posterUrl,
      backlogId: backlogItems.backlogId,
      backlogName: backlogs.name,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    // Loved state is per-title; join memberships to pair each seed with a home
    // backlog (its newest membership wins as the default accept target below).
    .innerJoin(
      backlogItems,
      and(
        eq(backlogItems.userId, userItems.userId),
        eq(backlogItems.catalogItemId, userItems.catalogItemId),
      ),
    )
    .innerJoin(backlogs, eq(backlogItems.backlogId, backlogs.id))
    .where(and(eq(userItems.userId, userId), LOVED_FILTER))
    // "obsessed" is a deliberate highlight ("this is what I want known about
    // me first"), not just a stronger "liked" — it should anchor the next
    // reco ahead of whatever was merely touched most recently. Newest
    // membership last so the dedup below keeps it as the home backlog.
    .orderBy(
      desc(userItems.obsessed),
      desc(userItems.statusChangedAt),
      desc(backlogItems.addedAt),
    );

  const seen = new Set<string>();
  const seeds: LovedSeed[] = [];
  for (const r of rows) {
    if (seen.has(r.catalogItemId)) continue;
    seen.add(r.catalogItemId);
    seeds.push(r);
    if (seeds.length >= limit) break;
  }
  return seeds;
}

/**
 * Colecciones formalizado — THE order a collection's titles are read in: the
 * owner's manual order (`position`, 0 first) with every unplaced title (null)
 * ahead of it, newest first. A never-reordered collection is exactly the old
 * newest-first. The JS twin is `byManualOrder` in fan.ts — keep both in step.
 * The API v1 reads it too since 2026-09-27 (`Collection.titleIds`).
 */
export const MANUAL_ORDER = [
  sql`${backlogItems.position} asc nulls first`,
  desc(backlogItems.addedAt),
] as const;

/** The shared field list of a backlog's item rows: membership id + per-title
 *  state (user_item) + the shared catalog facts. One constant so the two
 *  readers below can't drift, and so `getBacklogItems`' inferred type
 *  (`BacklogItemWithCatalog`, which `era.ts`/`recap.ts` take as a parameter
 *  and `library.ts`'s `getUserLibrary` satisfies STRUCTURALLY with its own
 *  select) stays exactly this shape when a reader needs an extra column —
 *  a new column here would become a missing property over there. */
const backlogItemColumns = {
  id: backlogItems.id,
  status: userItems.status,
  verdict: userItems.verdict,
  obsessed: userItems.obsessed,
  sourceCrossMediaRecId: userItems.sourceCrossMediaRecId,
  paletteHex: catalogItems.paletteHex,
  addedAt: backlogItems.addedAt,
  statusChangedAt: userItems.statusChangedAt,
  catalogItemId: catalogItems.id,
  title: catalogItems.title,
  byline: catalogItems.byline,
  year: catalogItems.year,
  // F3.8 — what turns a row into a countdown and feeds the shelf above it.
  releaseDate: catalogItems.releaseDate,
  genre: catalogItems.genre,
  mediaType: libraryMediaType(),
  posterUrl: catalogItems.posterUrl,
} as const;

/** Caller must have verified ownership (assertOwnsBacklog) first. `id` is the
 *  membership (backlog_item) id — the per-backlog remove acts on it; state comes
 *  from user_item, palette from the shared catalog_item. */
export async function getBacklogItems(backlogId: string) {
  return db
    .select(backlogItemColumns)
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(
      userItems,
      and(
        eq(userItems.userId, backlogItems.userId),
        eq(userItems.catalogItemId, backlogItems.catalogItemId),
      ),
    )
    .where(eq(backlogItems.backlogId, backlogId))
    .orderBy(...MANUAL_ORDER);
}

/* ------------------------------------------------------------------------
 * Colecciones largas (founder, ronda 8) — the collection's titles by pages.
 * The cursor's shape and its validation live in the pure
 * `./collection-cursor.ts`; here is only its SQL. Web-only:
 * `/api/v1` keeps reading `getBacklogItemsWithState` whole.
 * ---------------------------------------------------------------------- */

/** `added_at` at MILLISECOND precision — what a JS Date (and so the cursor)
 *  can carry. Ordering AND comparing on the same truncated value keeps two
 *  rows inside one millisecond from being skipped or repeated across pages
 *  (the same trap `social/queries.ts`' `olderThan` documents). */
const ADDED_AT_MS = sql`date_trunc('milliseconds', ${backlogItems.addedAt})`;

/** "Estado": obsesiona · gusta · completo · nada. JS twin: `stateRank`. */
const STATE_RANK = sql`(case when ${userItems.obsessed} then 0 when ${userItems.verdict} = 'liked' then 1 when ${userItems.status} = 'completed' then 2 else 3 end)`;

interface PageKey {
  expr: SQL;
  dir: "asc" | "desc";
  /** Where NULLs read; omitted = the expression is never null. */
  nulls?: "first" | "last";
}

/** The SQL of each key `CURSOR_ORDER` names. */
const PAGE_KEY: Record<CursorKeyName, PageKey> = {
  position: { expr: sql`${backlogItems.position}`, dir: "asc", nulls: "first" },
  rank: { expr: STATE_RANK, dir: "asc" },
  year: { expr: sql`${catalogItems.year}`, dir: "desc", nulls: "last" },
  at: { expr: ADDED_AT_MS, dir: "desc" },
  id: { expr: sql`${backlogItems.id}`, dir: "desc" },
};

function pageOrder(sort: PagedSort): SQL[] {
  return CURSOR_ORDER[sort].map((name) => {
    const k = PAGE_KEY[name];
    return k.nulls
      ? sql`${k.expr} ${sql.raw(k.dir)} nulls ${sql.raw(k.nulls)}`
      : sql`${k.expr} ${sql.raw(k.dir)}`;
  });
}

/**
 * "Strictly after the cursor" as a lexicographic keyset over the order's
 * keys: for each key, every earlier key EQUAL and this one past the cursor's
 * value. NULLs follow each key's `nulls` side: after a null that reads first
 * comes every non-null; after a null that reads last comes nothing (only the
 * tie, which the next key breaks); after a value whose nulls read last come
 * the nulls too.
 */
function afterCursor(c: CollectionCursor): SQL | undefined {
  // The cursor's value for each key of the order: `lead` carries the integer
  // ones in the order's own sequence.
  let lead = 0;
  const values: (SQL | null)[] = CURSOR_ORDER[c.sort].map((name) => {
    // ::timestamp — a raw-sql Date param would carry the process's offset
    // (learnings/2026-09-02; `social/queries.ts` `atParam`).
    if (name === "at") return sql`${c.at.toISOString()}::timestamp`;
    if (name === "id") return sql`${c.id}`;
    const v = c.lead[lead++];
    return v === null ? null : sql`${v}`;
  });
  const keys = CURSOR_ORDER[c.sort].map((name) => PAGE_KEY[name]);
  const equal = (k: PageKey, v: SQL | null) => (v === null ? sql`${k.expr} is null` : sql`${k.expr} = ${v}`);
  const past = (k: PageKey, v: SQL | null): SQL | null => {
    if (v === null) return k.nulls === "first" ? sql`${k.expr} is not null` : null;
    const cmp = k.dir === "asc" ? sql`${k.expr} > ${v}` : sql`${k.expr} < ${v}`;
    return k.nulls === "last" ? sql`(${cmp} or ${k.expr} is null)` : cmp;
  };
  const branches: SQL[] = [];
  keys.forEach((k, i) => {
    const step = past(k, values[i]);
    if (!step) return;
    const ties = keys.slice(0, i).map((prev, j) => equal(prev, values[j]));
    branches.push(sql`(${sql.join([...ties, step], sql` and `)})`);
  });
  return or(...branches);
}

/**
 * One page of a collection in `sort`'s order, optionally only one format.
 * `next` is the cursor of the page's last row when there is more (it reads
 * `limit + 1` to know). Caller must have verified ownership
 * (assertOwnsBacklog) first, and must have DECODED the cursor with
 * `decodeCollectionCursor(raw, sort, backlogId)` — a cursor of another order
 * would put its values under the wrong keys.
 */
export async function getBacklogItemsPage(
  backlogId: string,
  opts: { sort: PagedSort; format?: MediaType | null; after?: CollectionCursor | null; limit: number },
) {
  const rows = await db
    .select({ ...backlogItemColumns, position: backlogItems.position })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(
      userItems,
      and(
        eq(userItems.userId, backlogItems.userId),
        eq(userItems.catalogItemId, backlogItems.catalogItemId),
      ),
    )
    .where(
      and(
        eq(backlogItems.backlogId, backlogId),
        opts.format ? eq(catalogItems.mediaType, opts.format) : undefined,
        opts.after ? afterCursor(opts.after) : undefined,
      ),
    )
    .orderBy(...pageOrder(opts.sort))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    next: rows.length > opts.limit && last ? cursorOf(opts.sort, last) : null,
  };
}

/**
 * How many titles of each format a collection holds — the header's count
 * and the format pills, which can no longer come from `items.length` once
 * the list is paged. Same joins as the page reader, so the two agree.
 * Caller must have verified ownership first.
 */
export async function getBacklogKindCounts(backlogId: string): Promise<Record<MediaType, number>> {
  const rows = await db
    .select({ mediaType: libraryMediaType(), n: sql<number>`count(*)::int` })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(
      userItems,
      and(
        eq(userItems.userId, backlogItems.userId),
        eq(userItems.catalogItemId, backlogItems.catalogItemId),
      ),
    )
    .where(eq(backlogItems.backlogId, backlogId))
    .groupBy(catalogItems.mediaType);
  const counts: Record<MediaType, number> = { film: 0, series: 0, album: 0 };
  for (const r of rows) if (r.mediaType in counts) counts[r.mediaType] = r.n;
  return counts;
}

/** One title of a collection by its catalog id (the chosen cover, when it
 *  sits past the first page), or null. Caller must have verified ownership. */
export async function getBacklogItemByCatalog(backlogId: string, catalogItemId: string) {
  const [row] = await db
    .select(backlogItemColumns)
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(
      userItems,
      and(
        eq(userItems.userId, backlogItems.userId),
        eq(userItems.catalogItemId, backlogItems.catalogItemId),
      ),
    )
    .where(and(eq(backlogItems.backlogId, backlogId), eq(backlogItems.catalogItemId, catalogItemId)))
    .limit(1);
  return row ?? null;
}

/**
 * Which of the user's collections each of these titles lives in
 * (`catalogItemId → backlogId[]`) — what "Mover a" needs so a move never
 * duplicates and its undo never removes a membership that was already there.
 * Scoped by `userId` in the query; the caller passes the session's.
 */
export async function getMembershipsOf(
  userId: string,
  catalogIds: readonly string[],
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (catalogIds.length === 0) return out;
  const rows = await db
    .select({ backlogId: backlogItems.backlogId, catalogItemId: backlogItems.catalogItemId })
    .from(backlogItems)
    .where(and(eq(backlogItems.userId, userId), inArray(backlogItems.catalogItemId, [...catalogIds])));
  for (const r of rows) (out[r.catalogItemId] ??= []).push(r.backlogId);
  return out;
}

/** A reader's row as the collection's body draws it (dates as ISO: it
 *  crosses to the client). */
export function toCollectionItem(it: BacklogItemWithCatalog): CollectionItem {
  return {
    backlogItemId: it.id,
    catalogItemId: it.catalogItemId,
    title: it.title,
    byline: it.byline,
    mediaType: it.mediaType,
    year: it.year,
    posterUrl: it.posterUrl,
    paletteHex: it.paletteHex ?? null,
    status: it.status,
    verdict: it.verdict,
    obsessed: it.obsessed,
    releaseDate: it.releaseDate ? it.releaseDate.toISOString() : null,
    addedAt: it.addedAt.toISOString(),
  };
}

/**
 * API v1 `GET /collections/{id}` — `getBacklogItems` plus what `TitleState`
 * needs: `userItemAddedAt` (`user_item.addedAt`, the FIRST membership — a
 * title filed twice reports one `savedAt`) and the owner's own `reviewId`
 * (one review per user+title; `hidden_at` is NOT filtered because this is an
 * own-user read and the author keeps seeing their text). Caller must have
 * verified ownership (assertOwnsBacklog) first. A separate reader on purpose:
 * adding columns to `getBacklogItems` would widen `BacklogItemWithCatalog`,
 * which `getUserLibrary` (library.ts) satisfies with its own select (see
 * learnings/2026-09-24-campo-aditivo-en-select-rompe-tipos-construidos-a-mano).
 */
export async function getBacklogItemsWithState(backlogId: string) {
  return db
    .select({
      ...backlogItemColumns,
      // The manual order travels to the wire (`toCollection` sorts by it with
      // `byManualOrder`); kept OUT of `backlogItemColumns` on purpose (see
      // that constant's note).
      position: backlogItems.position,
      userItemAddedAt: userItems.addedAt,
      reviewId: itemReviews.id,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(
      userItems,
      and(
        eq(userItems.userId, backlogItems.userId),
        eq(userItems.catalogItemId, backlogItems.catalogItemId),
      ),
    )
    .leftJoin(
      itemReviews,
      and(
        eq(itemReviews.userId, backlogItems.userId),
        eq(itemReviews.catalogItemId, backlogItems.catalogItemId),
      ),
    )
    .where(eq(backlogItems.backlogId, backlogId))
    .orderBy(...MANUAL_ORDER);
}

/**
 * F3.8 — THE definition of "what this user is still waiting for", nearest
 * first. Keyed on `user_item` (library membership), so a title filed in two
 * backlogs appears once and the answer doesn't depend on which shelf they
 * opened. Unbounded by default; `limit` is for surfaces that show a finite
 * carousel rather than a count.
 *
 * EVERY selected column is catalog data, and that is load-bearing rather than
 * incidental: the public profile shares this query (public.ts, one of the three
 * deliberate authz exceptions — it runs with no session at all). A `user_item`
 * field added here (status, verdict, obsessed, addedAt) or anything off `users`
 * would silently become readable by anonymous visitors. The public caller still
 * narrows this to its own field list before returning; both guards are meant to
 * be there.
 */
export async function getUpcomingForUser(userId: string, limit?: number) {
  const q = db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      posterUrl: catalogItems.posterUrl,
      releaseDate: catalogItems.releaseDate,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(and(eq(userItems.userId, userId), gt(catalogItems.releaseDate, new Date())))
    .orderBy(asc(catalogItems.releaseDate));
  return limit === undefined ? q : q.limit(limit);
}

/**
 * How many titles, and the nearest one. ONE indexed read: the count and the
 * nearest both come out of the same rows, so a summary costs no more than the
 * list would — which is why this doesn't pass a limit.
 */
export async function getUpcomingSummary(userId: string) {
  const rows = await getUpcomingForUser(userId);
  return { count: rows.length, nearest: rows[0] ?? null };
}
