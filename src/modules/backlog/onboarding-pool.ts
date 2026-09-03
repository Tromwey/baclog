import "server-only";
import { and, desc, eq, inArray, isNotNull, not, sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, userItems } from "@/db/schema";
import { MEDIA_TYPES, type MediaType } from "@/modules/catalog/types";

/**
 * Onboarding · "Elige tres" (Revamp UI, 2026-09-03) — the nine covers a new
 * account picks its first obsessions from.
 *
 * The pool is the catalog's MOST-SAVED titles: one `user_item` row per
 * (user, title), so a title filed in two backlogs counts once, and only
 * titles with a cover (the grid is nothing but covers). Kind diversity so a
 * pool of nine isn't nine films: top 3 per kind first, then the overall
 * ranking fills whatever a kind couldn't. Aggregate counts only — no user is
 * named, no per-user state is read — so the page can load it without an
 * action.
 *
 * Same shape as a search result minus `source`, so the picks step can mix pool
 * tiles and searched titles in one list.
 */
export interface OnboardingPoolItem {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  /** Cover-derived cache (catalog_item). Null ⇒ the client extracts on add. */
  paletteHex: string[] | null;
  year: number | null;
  byline: string | null;
}

const PER_KIND = 3;

const POOL_FIELDS = {
  catalogItemId: catalogItems.id,
  title: catalogItems.title,
  mediaType: catalogItems.mediaType,
  posterUrl: catalogItems.posterUrl,
  paletteHex: catalogItems.paletteHex,
  year: catalogItems.year,
  byline: catalogItems.byline,
};

export async function getOnboardingPool(limit = 9): Promise<OnboardingPoolItem[]> {
  // Saves per title, from the small per-user state table — then join the
  // catalog to it (not the other way round: the catalog cache is the big one).
  const saves = db
    .select({
      catalogItemId: userItems.catalogItemId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(userItems)
    .groupBy(userItems.catalogItemId)
    .as("saves");

  // Enough headroom that every kind can find its three even when one kind
  // dominates the top of the ranking.
  const ranked = await db
    .select(POOL_FIELDS)
    .from(catalogItems)
    .innerJoin(saves, eq(saves.catalogItemId, catalogItems.id))
    .where(isNotNull(catalogItems.posterUrl))
    .orderBy(desc(saves.n), desc(catalogItems.createdAt))
    .limit(limit * 8);

  const chosen = diversify(ranked, limit);
  if (chosen.length >= limit) return chosen;

  // A young catalog (nothing saved yet, or fewer than `limit` saved titles):
  // fill with the most recent covered titles so the grid is never short.
  const taken = chosen.map((c) => c.catalogItemId);
  const fill = await db
    .select(POOL_FIELDS)
    .from(catalogItems)
    .where(
      taken.length > 0
        ? and(
            isNotNull(catalogItems.posterUrl),
            not(inArray(catalogItems.id, taken)),
          )
        : isNotNull(catalogItems.posterUrl),
    )
    .orderBy(desc(catalogItems.createdAt))
    .limit(limit - chosen.length);

  return [...chosen, ...fill];
}

/**
 * Top `PER_KIND` of each kind in ranking order, then the ranking itself fills
 * the remainder. Output keeps the overall ranking order (the most-saved title
 * is the first tile), whatever kind it is.
 */
function diversify(
  ranked: OnboardingPoolItem[],
  limit: number,
): OnboardingPoolItem[] {
  const picked = new Set<string>();
  const perKind: Record<MediaType, number> = { film: 0, series: 0, album: 0 };
  for (const item of ranked) {
    if (perKind[item.mediaType] >= PER_KIND) continue;
    perKind[item.mediaType] += 1;
    picked.add(item.catalogItemId);
    if (picked.size === PER_KIND * MEDIA_TYPES.length) break;
  }
  for (const item of ranked) {
    if (picked.size >= limit) break;
    picked.add(item.catalogItemId);
  }
  return ranked.filter((r) => picked.has(r.catalogItemId)).slice(0, limit);
}
