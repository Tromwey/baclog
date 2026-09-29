import "server-only";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems, itemReviews, userItems } from "@/db/schema";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import { libraryMediaType } from "@/modules/catalog/library-media";

/**
 * Library-wide reads — across ALL of a user's backlogs, keyed on `user_item`
 * (per-title state, one row per title no matter how many backlogs it's filed
 * under — AGENTS.md). Own-user only: every caller passes the session's id.
 */

/**
 * One row per TITLE in the user's library (`user_item`) with the shared
 * catalog facts. State from `user_item`, palette from `catalog_item`, and the
 * owner's own `reviewId` (one review per user+title; `hidden_at` is NOT
 * filtered — this is an own-user read and the author keeps seeing it).
 * `addedAt` is `user_item.addedAt` = the FIRST membership, so a title filed
 * in two collections carries one instant (the API's `savedAt`).
 *
 * A structural superset of `BacklogItemWithCatalog` on purpose: `deriveEras`
 * and `toCardBacklog` take these rows as they are. THE library query — the
 * recap (screen, card, cron) and `GET /me/titles` all read through here.
 */
export type LibraryItem = Awaited<ReturnType<typeof getUserLibrary>>[number];

export async function getUserLibrary(userId: string) {
  return db
    .select({
      id: userItems.id,
      catalogItemId: catalogItems.id,
      status: userItems.status,
      verdict: userItems.verdict,
      obsessed: userItems.obsessed,
      sourceCrossMediaRecId: userItems.sourceCrossMediaRecId,
      addedAt: userItems.addedAt,
      statusChangedAt: userItems.statusChangedAt,
      title: catalogItems.title,
      mediaType: libraryMediaType(),
      year: catalogItems.year,
      byline: catalogItems.byline,
      genre: catalogItems.genre,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      releaseDate: catalogItems.releaseDate,
      reviewId: itemReviews.id,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .leftJoin(
      itemReviews,
      and(
        eq(itemReviews.userId, userItems.userId),
        eq(itemReviews.catalogItemId, userItems.catalogItemId),
      ),
    )
    .where(eq(userItems.userId, userId))
    .orderBy(desc(userItems.addedAt));
}

/**
 * "No puede esperar" across the whole library (Revamp UI, 2026-09-03): every
 * title the user has whose release is still ahead, soonest first. Feeds the
 * strip on /backlogs and /perfil; a single backlog filters its own items
 * instead (backlog-zoom-view), and the public profile has its gated twin in
 * public.ts.
 */
export async function getLibraryUpcoming(
  userId: string,
  now: number,
  limit = 12,
): Promise<UpcomingItem[]> {
  const rows = await db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      mediaType: libraryMediaType(),
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      releaseDate: catalogItems.releaseDate,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
    .where(
      and(eq(userItems.userId, userId), gt(catalogItems.releaseDate, new Date(now))),
    )
    .orderBy(asc(catalogItems.releaseDate))
    .limit(limit);

  return rows.flatMap((r) =>
    r.releaseDate
      ? [
          {
            catalogItemId: r.catalogItemId,
            title: r.title,
            mediaType: r.mediaType,
            posterUrl: r.posterUrl,
            paletteHex: r.paletteHex ?? null,
            releaseDate: r.releaseDate.toISOString(),
          },
        ]
      : [],
  );
}

/**
 * Descubrir · Todo 3a: the collection each of these titles is filed in, for
 * the "próximos lanzamientos" line under the title — the user's OWN
 * memberships (newest first, so a title in two collections names the one it
 * was last saved to). Own-user read; `catalogItemId → { id, name }`.
 */
export async function getFirstCollectionFor(
  userId: string,
  catalogItemIds: string[],
): Promise<Map<string, { id: string; name: string }>> {
  if (catalogItemIds.length === 0) return new Map();
  const rows = await db
    .select({
      catalogItemId: backlogItems.catalogItemId,
      id: backlogs.id,
      name: backlogs.name,
    })
    .from(backlogItems)
    .innerJoin(backlogs, eq(backlogs.id, backlogItems.backlogId))
    .where(and(eq(backlogItems.userId, userId), inArray(backlogItems.catalogItemId, catalogItemIds)))
    .orderBy(desc(backlogItems.addedAt));
  const out = new Map<string, { id: string; name: string }>();
  for (const r of rows) if (!out.has(r.catalogItemId)) out.set(r.catalogItemId, { id: r.id, name: r.name });
  return out;
}
