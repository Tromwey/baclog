import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  backlogItems,
  backlogs,
  catalogItems,
  crossMediaRecs,
  userItems,
} from "@/db/schema";
import type { MediaType } from "@/modules/cards/types";
import { dominantHexes, groupDominantHexes } from "./palette";

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
      itemCount: sql<number>`count(${backlogItems.id})::int`,
    })
    .from(backlogs)
    .leftJoin(backlogItems, eq(backlogItems.backlogId, backlogs.id))
    .where(eq(backlogs.userId, userId))
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
    .where(eq(backlogs.userId, userId))
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
      .where(eq(backlogs.userId, userId)),
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
      genre: catalogItems.genre,
      mediaType: catalogItems.mediaType,
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
      mediaType: catalogItems.mediaType,
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

/** Caller must have verified ownership (assertOwnsBacklog) first. `id` is the
 *  membership (backlog_item) id — the per-backlog remove acts on it; state comes
 *  from user_item, palette from the shared catalog_item. */
export async function getBacklogItems(backlogId: string) {
  return db
    .select({
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
      genre: catalogItems.genre,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
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
    .where(eq(backlogItems.backlogId, backlogId))
    .orderBy(desc(backlogItems.addedAt));
}
