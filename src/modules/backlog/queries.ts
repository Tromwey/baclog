import "server-only";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems } from "@/db/schema";
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

  // Up to 4 cover posters + up to 6 ADN colors + up to 14 items (for the shelf
  // zoom's clickable list) per backlog, newest first.
  const covers = await db
    .select({
      backlogId: backlogItems.backlogId,
      posterUrl: catalogItems.posterUrl,
      paletteHex: backlogItems.paletteHex,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      addedAt: backlogItems.addedAt,
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

  const coverMap = new Map<string, string[]>();
  const itemMap = new Map<string, { catalogItemId: string; title: string }[]>();
  for (const c of covers) {
    if (c.posterUrl) {
      const list = coverMap.get(c.backlogId) ?? [];
      if (list.length < 4) {
        list.push(c.posterUrl);
        coverMap.set(c.backlogId, list);
      }
    }
    if (c.title) {
      const list = itemMap.get(c.backlogId) ?? [];
      if (list.length < 14) {
        list.push({ catalogItemId: c.catalogItemId, title: c.title });
        itemMap.set(c.backlogId, list);
      }
    }
  }
  // ADN = each backlog's distinct dominant colors (one per item).
  const paletteMap = groupDominantHexes(covers, (c) => c.backlogId, 6);

  return rows.map((r) => ({
    ...r,
    coverUrls: coverMap.get(r.id) ?? [],
    // Lima-only fallback so a backlog with no extracted palette still auras.
    paletteHex: paletteMap.get(r.id) ?? ["#D8FF3E"],
    items: itemMap.get(r.id) ?? [],
  }));
}

export interface UserStats {
  totalItems: number;
  totalBacklogs: number;
  obsesiones: number;
}

/**
 * Profile stats (M3.5). Both counts scan by the denormalized backlogItems.userId
 * (no join) — same trust model as getBacklogsForUser. "Guardadas (horas)" from
 * the mock needs runtime we don't store yet, so the third stat is "obsesiones".
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const [itemAgg, backlogAgg] = await Promise.all([
    db
      .select({
        totalItems: sql<number>`count(*)::int`,
        obsesiones: sql<number>`(count(*) filter (where ${backlogItems.status} = 'obsessing_over'))::int`,
      })
      .from(backlogItems)
      .where(eq(backlogItems.userId, userId)),
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
    .select({ paletteHex: backlogItems.paletteHex })
    .from(backlogItems)
    .where(eq(backlogItems.userId, userId))
    .orderBy(desc(backlogItems.addedAt))
    .limit(40);
  return dominantHexes(rows, limit);
}

export type BacklogItemWithCatalog = Awaited<
  ReturnType<typeof getBacklogItems>
>[number];

/**
 * The user's most-recent entry for a catalog item (any status), joined to its
 * catalog metadata and home backlog. Null when the user hasn't logged it.
 * Powers the item page's ticket-share gate (F3.5.7 — you ticket what you've
 * logged) and the loved-seed teaser (F3.5.6). Scoped to the user in the query.
 */
export async function getUserCatalogEntry(
  userId: string,
  catalogItemId: string,
) {
  const [row] = await db
    .select({
      id: backlogItems.id,
      status: backlogItems.status,
      customStatusLabel: backlogItems.customStatusLabel,
      rating: backlogItems.rating,
      paletteHex: backlogItems.paletteHex,
      addedAt: backlogItems.addedAt,
      statusChangedAt: backlogItems.statusChangedAt,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      genre: catalogItems.genre,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
      backlogId: backlogItems.backlogId,
      backlogName: backlogs.name,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(backlogs, eq(backlogItems.backlogId, backlogs.id))
    .where(
      and(
        eq(backlogItems.userId, userId),
        eq(backlogItems.catalogItemId, catalogItemId),
      ),
    )
    .orderBy(desc(backlogItems.statusChangedAt))
    .limit(1);
  return row ?? null;
}

/**
 * F3.5.5/6 — "loved" = the trigger for a cross-media reco: obsessing over, or
 * completed with a strong rating (≥4). Kept as a pure predicate so both the
 * item page and getLovedSeeds share one definition of "loved".
 */
export function isLovedEntry(
  entry: { status: string; rating: number | null } | null,
): boolean {
  if (!entry) return false;
  if (entry.status === "obsessing_over") return true;
  if (entry.status === "completed" && (entry.rating ?? 0) >= 4) return true;
  return false;
}

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
 * F3.5.6 — every distinct catalog item the user LOVES (see isLovedEntry),
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
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(backlogs, eq(backlogItems.backlogId, backlogs.id))
    .where(
      and(
        eq(backlogItems.userId, userId),
        or(
          eq(backlogItems.status, "obsessing_over"),
          and(
            eq(backlogItems.status, "completed"),
            gte(backlogItems.rating, 4),
          ),
        ),
      ),
    )
    .orderBy(desc(backlogItems.statusChangedAt));

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

/** Caller must have verified ownership (assertOwnsBacklog) first. */
export async function getBacklogItems(backlogId: string) {
  return db
    .select({
      id: backlogItems.id,
      status: backlogItems.status,
      customStatusLabel: backlogItems.customStatusLabel,
      rating: backlogItems.rating,
      paletteHex: backlogItems.paletteHex,
      addedAt: backlogItems.addedAt,
      statusChangedAt: backlogItems.statusChangedAt,
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
    .where(eq(backlogItems.backlogId, backlogId))
    .orderBy(desc(backlogItems.addedAt));
}
