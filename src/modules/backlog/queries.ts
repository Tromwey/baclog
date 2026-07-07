import "server-only";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems } from "@/db/schema";
import type { MediaType } from "@/modules/cards/types";

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

  // Up to 4 cover posters per backlog, newest first
  const covers = await db
    .select({
      backlogId: backlogItems.backlogId,
      posterUrl: catalogItems.posterUrl,
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
  for (const c of covers) {
    if (!c.posterUrl) continue;
    const list = coverMap.get(c.backlogId) ?? [];
    if (list.length < 4) {
      list.push(c.posterUrl);
      coverMap.set(c.backlogId, list);
    }
  }

  return rows.map((r) => ({ ...r, coverUrls: coverMap.get(r.id) ?? [] }));
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
