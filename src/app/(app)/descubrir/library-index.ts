import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, catalogItems } from "@/db/schema";
import type { LibraryIndex } from "./library";

/**
 * The caller's memberships, indexed for Descubrir's "guardar" (see
 * `library.ts`). OWN-USER ONLY: `userId` is always the session's id, passed by
 * the page — never something the client sent. One indexed read on
 * `backlog_item.user_id`, joined to `catalog_item` for the cover facts only
 * (membership + catalog data; no per-title state crosses here).
 */
export async function getLibraryIndex(userId: string): Promise<LibraryIndex> {
  const rows = await db
    .select({
      backlogItemId: backlogItems.id,
      backlogId: backlogItems.backlogId,
      catalogItemId: backlogItems.catalogItemId,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      mediaType: catalogItems.mediaType,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(catalogItems.id, backlogItems.catalogItemId))
    .where(eq(backlogItems.userId, userId))
    .orderBy(desc(backlogItems.addedAt));

  const index: LibraryIndex = {
    byTitle: {},
    thumbs: {},
    lastUsedBacklogId: rows[0]?.backlogId ?? null,
  };
  for (const r of rows) {
    (index.byTitle[r.catalogItemId] ??= []).push({
      backlogId: r.backlogId,
      backlogItemId: r.backlogItemId,
    });
    // Newest first, so the first row seen per collection is its cover.
    if (!index.thumbs[r.backlogId]) {
      index.thumbs[r.backlogId] = {
        posterUrl: r.posterUrl,
        paletteHex: r.paletteHex ?? [],
        mediaType: r.mediaType,
      };
    }
  }
  return index;
}
