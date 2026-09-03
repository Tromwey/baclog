import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  catalogItems,
  crossMediaRecSeen,
  crossMediaRecs,
  userItems,
} from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";
import { getLovedSeeds } from "@/modules/backlog/queries";

/**
 * Revamp UI (2026-09-03) — the rails Discover renders on PAGE LOAD, read from
 * the cross-media cache only. Nothing here ever calls the engine: a visit to
 * Discover must stay free (ADR-009 meters generations), so these reads only
 * surface pairings that were already narrated — by this user or by anyone
 * (`cross_media_rec` is a shared cache keyed on (seed, target)).
 *
 * The per-user view is the feed's (crossmedia.ts `orderShowable`): a target
 * the user already owns is dropped (they don't need to discover what's on a
 * shelf), a pairing they dismissed with × is gone for good, and everything
 * else is fair game — seen or not, since a rail shows several at once.
 */

export interface RailWork {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  byline: string | null;
  posterUrl: string | null;
  paletteHex: string[];
}

export interface ObsessionRail {
  /** The obsessed title the rail is "because of". */
  seed: RailWork;
  /** Its cached recos, graph edges before deep cuts, newest first. */
  items: RailWork[];
}

const toWork = (c: typeof catalogItems.$inferSelect): RailWork => ({
  catalogItemId: c.id,
  title: c.title,
  mediaType: c.mediaType,
  year: c.year,
  byline: c.byline,
  posterUrl: c.posterUrl,
  paletteHex: c.paletteHex ?? [],
});

/**
 * "Porque te obsesiona · {title}" — one rail per obsessed title that already
 * has cached recos seeded by it, most recent obsession first. Scoped to the
 * caller in every query; the recs themselves are cross-user cache rows but
 * carry no user data (catalog metadata only).
 */
export async function getObsessionRails(
  userId: string,
  { maxRails = 3, perRail = 4 }: { maxRails?: number; perRail?: number } = {},
): Promise<ObsessionRail[]> {
  // More seeds than rails on purpose: an obsession with nothing cached yet
  // yields no rail, so we look a little past `maxRails` before giving up.
  const seeds = await db
    .select({ seed: catalogItems })
    .from(userItems)
    .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
    .where(
      and(
        eq(userItems.userId, userId),
        eq(userItems.obsessed, true),
        isNotNull(userItems.obsessedAt),
      ),
    )
    .orderBy(desc(userItems.obsessedAt), desc(userItems.id))
    .limit(maxRails * 4);
  if (seeds.length === 0) return [];

  const seedIds = seeds.map((s) => s.seed.id);
  const owned = db
    .select({ catalogItemId: userItems.catalogItemId })
    .from(userItems)
    .where(eq(userItems.userId, userId))
    .as("owned");
  const recs = await db
    .select({
      seedCatalogItemId: crossMediaRecs.seedCatalogItemId,
      linkType: crossMediaRecs.linkType,
      createdAt: crossMediaRecs.createdAt,
      target: catalogItems,
    })
    .from(crossMediaRecs)
    .innerJoin(catalogItems, eq(catalogItems.id, crossMediaRecs.targetCatalogItemId))
    // Dismissed by THIS user → out. (A plain "seen" row keeps it: the rail
    // is a strip, not a one-at-a-time card, so deprioritizing is moot.)
    .leftJoin(
      crossMediaRecSeen,
      and(
        eq(crossMediaRecSeen.crossMediaRecId, crossMediaRecs.id),
        eq(crossMediaRecSeen.userId, userId),
      ),
    )
    // Already in their library → nothing to discover.
    .leftJoin(owned, eq(owned.catalogItemId, crossMediaRecs.targetCatalogItemId))
    .where(
      and(
        inArray(crossMediaRecs.seedCatalogItemId, seedIds),
        isNull(crossMediaRecSeen.dismissedAt),
        isNull(owned.catalogItemId),
      ),
    )
    .orderBy(desc(crossMediaRecs.createdAt));

  const bySeed = new Map<string, typeof recs>();
  for (const r of recs) {
    const list = bySeed.get(r.seedCatalogItemId) ?? [];
    list.push(r);
    bySeed.set(r.seedCatalogItemId, list);
  }

  const rails: ObsessionRail[] = [];
  for (const { seed } of seeds) {
    const list = bySeed.get(seed.id);
    if (!list || list.length === 0) continue;
    // Same rank as the engine's cache read: verified graph edges before
    // thematic deep cuts, newest first within each.
    const ranked = [...list].sort((a, b) => {
      const at = a.linkType === null || a.linkType === "thematic" ? 1 : 0;
      const bt = b.linkType === null || b.linkType === "thematic" ? 1 : 0;
      return at - bt || b.createdAt.getTime() - a.createdAt.getTime();
    });
    // One target per rail even if two rows (different link types) share it.
    const seen = new Set<string>();
    const items: RailWork[] = [];
    for (const r of ranked) {
      if (seen.has(r.target.id)) continue;
      seen.add(r.target.id);
      items.push(toWork(r.target));
      if (items.length === perRail) break;
    }
    rails.push({ seed: toWork(seed), items });
    if (rails.length === maxRails) break;
  }
  return rails;
}

export interface LatestDoubleFeature {
  seed: RailWork;
  reco: RailWork;
}

/**
 * The Double Feature card on Discover: the pairing this user most recently
 * SAW (the seen ledger is the only per-user trace of "their" double features —
 * the cache itself is shared), falling back to the newest cached pairing for
 * any of their loved seeds. Dismissed pairings never come back. Null when
 * nothing has been narrated for them yet — the card then shows its generic
 * copy and the tap runs the engine as before.
 */
export async function getLatestDoubleFeature(
  userId: string,
): Promise<LatestDoubleFeature | null> {
  const seeds = await getLovedSeeds(userId);
  if (seeds.length === 0) return null;
  const seedIds = [...new Set(seeds.map((s) => s.catalogItemId))];

  const [row] = await db
    .select({
      seedCatalogItemId: crossMediaRecs.seedCatalogItemId,
      target: catalogItems,
    })
    .from(crossMediaRecs)
    .innerJoin(catalogItems, eq(catalogItems.id, crossMediaRecs.targetCatalogItemId))
    .leftJoin(
      crossMediaRecSeen,
      and(
        eq(crossMediaRecSeen.crossMediaRecId, crossMediaRecs.id),
        eq(crossMediaRecSeen.userId, userId),
      ),
    )
    .where(
      and(
        inArray(crossMediaRecs.seedCatalogItemId, seedIds),
        isNull(crossMediaRecSeen.dismissedAt),
      ),
    )
    .orderBy(
      sql`${crossMediaRecSeen.seenAt} desc nulls last`,
      desc(crossMediaRecs.createdAt),
    )
    .limit(1);
  if (!row) return null;

  const [seedRow] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, row.seedCatalogItemId))
    .limit(1);
  if (!seedRow) return null;

  return { seed: toWork(seedRow), reco: toWork(row.target) };
}
