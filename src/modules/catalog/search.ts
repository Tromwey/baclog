import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import { searchAlbums } from "./itunes";
import { videoCatalog } from "./tmdb";
import type { CatalogSearchResult, ExternalItem, SearchTab } from "./types";

/**
 * F2.5 unified search: TMDB + iTunes fired in parallel, results upserted
 * into catalog_items in ONE round trip (search doubles as cache warmer),
 * merged into the normalized client shape.
 */
export async function unifiedSearch(
  query: string,
  tab: SearchTab,
): Promise<CatalogSearchResult[]> {
  const tasks: Promise<ExternalItem[]>[] = [];
  if (tab === "film" || tab === "all") tasks.push(safe(videoCatalog.search(query, "film")));
  if (tab === "series" || tab === "all") tasks.push(safe(videoCatalog.search(query, "series")));
  if (tab === "album" || tab === "all") tasks.push(safe(searchAlbums(query)));

  const external = (await Promise.all(tasks)).flat();
  if (external.length === 0) return [];

  const rows = await db
    .insert(catalogItems)
    .values(
      external.map((e) => ({
        source: e.source,
        externalId: e.externalId,
        mediaType: e.mediaType,
        title: e.title,
        byline: e.byline,
        year: e.year,
        genre: e.genre,
        synopsis: e.synopsis,
        posterUrl: e.posterUrl,
        sourceRating: e.sourceRating,
        isrc: e.isrc,
        upc: e.upc,
        raw: e.raw,
      })),
    )
    .onConflictDoUpdate({
      target: [catalogItems.source, catalogItems.externalId],
      set: {
        title: sql`excluded.title`,
        byline: sql`coalesce(excluded.byline, ${catalogItems.byline})`,
        year: sql`excluded.year`,
        genre: sql`coalesce(excluded.genre, ${catalogItems.genre})`,
        synopsis: sql`coalesce(excluded.synopsis, ${catalogItems.synopsis})`,
        posterUrl: sql`coalesce(excluded.poster_url, ${catalogItems.posterUrl})`,
        sourceRating: sql`excluded.source_rating`,
        refreshedAt: sql`now()`,
      },
    })
    .returning({
      id: catalogItems.id,
      source: catalogItems.source,
      externalId: catalogItems.externalId,
      mediaType: catalogItems.mediaType,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
    });

  // Preserve upstream relevance order (rows come back in insert order, but
  // keep an explicit map in case of dedupe collisions across tabs)
  const byKey = new Map(rows.map((r) => [`${r.source}:${r.externalId}`, r]));
  return external
    .map((e) => byKey.get(`${e.source}:${e.externalId}`))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      catalogItemId: r.id,
      source: r.source as "tmdb" | "itunes",
      mediaType: r.mediaType,
      title: r.title,
      byline: r.byline,
      year: r.year,
      posterUrl: r.posterUrl,
      paletteHex: r.paletteHex ?? null,
    }));
}

/** One upstream failing must not blank the whole search. */
async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    console.error("[catalog] upstream search failed:", err);
    return [];
  }
}
