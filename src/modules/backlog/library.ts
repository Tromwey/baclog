import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, userItems } from "@/db/schema";
import type { UpcomingItem } from "@/components/upcoming-shelf";

/**
 * Library-wide reads — across ALL of a user's backlogs, keyed on `user_item`
 * (per-title state, one row per title no matter how many backlogs it's filed
 * under — AGENTS.md). Own-user only: every caller passes the session's id.
 */

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
      mediaType: catalogItems.mediaType,
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
