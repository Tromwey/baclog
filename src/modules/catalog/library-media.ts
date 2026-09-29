import { inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { catalogItems } from "@/db/schema";
import { MEDIA_TYPES, type MediaType } from "./types";

/**
 * Colecciones de fiesta (migration 0033) added `track` to `media_type`: a
 * SONG that only ever lives in a party collection. It is NOT a library format
 * — no `user_item`, no review, no recap, no recos, no generic `Title`. The
 * library formats are exactly `MEDIA_TYPES` (film · series · album).
 *
 * Every read that enumerates `catalog_item` by format, or that can reach a
 * catalog row without going through `user_item` (the ONLY way a track stays
 * out by construction: tracks never get one), filters with `libraryMedia()`.
 *
 * Spelled as `IN ('film','series','album')` on purpose, never as
 * `<> 'track'`: the literal `'track'` is a 22P02 ("invalid input value for
 * enum") on a database that doesn't have migration 0033 yet, and these
 * filters sit on hot paths that must keep working in either order of
 * migrate/deploy.
 *
 * No `server-only`: pure predicates, importable by scripts.
 */

export const LIBRARY_MEDIA_TYPES: readonly MediaType[] = MEDIA_TYPES;

/** `media_type IN ('film','series','album')` on `col` (default: `catalog_item.media_type`). */
export function libraryMedia(col: AnyColumn = catalogItems.mediaType): SQL {
  return inArray(col, [...LIBRARY_MEDIA_TYPES]);
}

/**
 * `catalog_item.media_type` selected AS a library format (`MediaType`). Only
 * for reads that either (a) reach the catalog row THROUGH `user_item` — a
 * track never gets one, enforced at the two places a `user_item` is born
 * (`ensureUserItemAndMembership`, `setMark` via `getCatalogItem`) — or (b)
 * also filter with `libraryMedia()`. It is the type-level half of that
 * decision, not a filter.
 */
export function libraryMediaType(col: AnyColumn = catalogItems.mediaType): SQL<MediaType> {
  return sql<MediaType>`${col}`;
}

/** Type guard: a catalog `media_type` that is a library format (not `track`). */
export function isLibraryMedia(mediaType: string): mediaType is MediaType {
  return (LIBRARY_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

/**
 * Narrow a row whose `mediaType` came from the enum (which includes `track`)
 * to a library row — or null for a track. For rows that the SQL already
 * filtered with `libraryMedia()` / an inner join to `user_item`, this is the
 * type-level half of the same decision; a null here is a query that forgot
 * the filter, and it drops the row instead of rendering a song as a title.
 */
export function asLibraryRow<T extends { mediaType: string }>(
  row: T,
): (Omit<T, "mediaType"> & { mediaType: MediaType }) | null {
  return isLibraryMedia(row.mediaType) ? (row as Omit<T, "mediaType"> & { mediaType: MediaType }) : null;
}

/**
 * For rows that are library titles BY CONSTRUCTION (a cross-media reco's
 * target is picked by the engine from film/series/album search hits): the
 * narrowing, with a loud failure if that invariant ever breaks — never a
 * silent re-labelling of a song as an album.
 */
export function assertLibraryMedia(mediaType: string, where: string): MediaType {
  if (isLibraryMedia(mediaType)) return mediaType;
  throw new Error(`[library-media] ${where}: expected film/series/album, got ${mediaType}`);
}

/** `asLibraryRow` over a list, dropping tracks. */
export function libraryRows<T extends { mediaType: string }>(
  rows: readonly T[],
): (Omit<T, "mediaType"> & { mediaType: MediaType })[] {
  const out: (Omit<T, "mediaType"> & { mediaType: MediaType })[] = [];
  for (const r of rows) {
    const lib = asLibraryRow(r);
    if (lib) out.push(lib);
  }
  return out;
}
