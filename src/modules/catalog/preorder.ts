import "server-only";
import { cacheReleaseDate, getCatalogItem } from "./cache";
import { getAlbumDetail } from "./itunes";

/**
 * F3.8 — resolve a pre-order's release date at add time. ONE copy, shared by
 * every path that puts a title into a library (`addTitleToBacklog`,
 * `completePicks`, and the API handlers through them).
 *
 * Gated on `year IS NULL`, which is the pre-order signature and nothing else:
 * iTunes' album search index doesn't carry unreleased titles at all, and the
 * song rows that DO surface them (the song→album fold in itunes.ts) carry no
 * releaseDate, so a pre-order is the only album that lands in the catalog
 * without a year. Every already-released album skips the lookup entirely.
 *
 * Best-effort by construction: adding a title must never fail because Apple
 * was slow. Worst case the date arrives later, on the first view of the item.
 */
export async function backfillPreorderDate(catalogItemId: string): Promise<void> {
  try {
    const item = await getCatalogItem(catalogItemId);
    if (
      !item ||
      item.source !== "itunes" ||
      item.mediaType !== "album" ||
      item.year !== null ||
      item.releaseDate !== null
    ) {
      return;
    }
    const detail = await getAlbumDetail(item.externalId);
    await cacheReleaseDate(catalogItemId, detail.releaseDate, null);
  } catch (err) {
    console.error("[F3.8] pre-order date backfill failed:", err);
  }
}
