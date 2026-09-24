import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import { searchAlbums } from "./itunes";
import { videoCatalog } from "./tmdb";
import type { CatalogSearchResult, ExternalItem, SearchTab } from "./types";

export interface DetailedSearch {
  results: CatalogSearchResult[];
  /** The providers that were asked and threw (a failing upstream is logged,
   *  never rethrown — one dead provider must not blank the other's hits). */
  failed: SearchTab[];
}

/**
 * F2.5 unified search: TMDB + iTunes fired in parallel, results upserted
 * into catalog_items in ONE round trip (search doubles as cache warmer),
 * merged into the normalized client shape.
 *
 * The detailed form ALSO says which providers failed, so a caller that has
 * to tell "no results" from "the catalog is down" (the mobile API's 503,
 * ios/API.md §4) can: every asked provider failed AND nothing came back ⇒
 * unavailable. `unifiedSearch` is the same call minus that report — the web
 * keeps its `[]`-on-failure posture.
 */
export async function unifiedSearchDetailed(
  query: string,
  tab: SearchTab,
): Promise<DetailedSearch> {
  const tasks: { tab: SearchTab; run: Promise<ExternalItem[] | null> }[] = [];
  if (tab === "film" || tab === "all")
    tasks.push({ tab: "film", run: safe(videoCatalog.search(query, "film")) });
  if (tab === "series" || tab === "all")
    tasks.push({ tab: "series", run: safe(videoCatalog.search(query, "series")) });
  if (tab === "album" || tab === "all")
    tasks.push({ tab: "album", run: safe(searchAlbums(query)) });

  const settled = await Promise.all(tasks.map((t) => t.run));
  const failed: SearchTab[] = [];
  const external: ExternalItem[] = [];
  settled.forEach((items, i) => {
    if (items === null) failed.push(tasks[i].tab);
    else external.push(...items);
  });
  return { results: await cacheExternalItems(external), failed };
}

export async function unifiedSearch(
  query: string,
  tab: SearchTab,
): Promise<CatalogSearchResult[]> {
  return (await unifiedSearchDetailed(query, tab)).results;
}

/**
 * Upsert provider results into catalog_items and return them in the client
 * shape, preserving the caller's ordering. Search doubles as the cache warmer,
 * and F3.8's artist-lookup path (Novedades 6b) needs the same write to get a
 * catalogItemId it can add to a backlog — so the upsert lives here once
 * instead of being reimplemented next to each producer.
 */
export async function cacheExternalItems(
  external: ExternalItem[],
): Promise<CatalogSearchResult[]> {
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
        releaseDate: e.releaseDate,
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
        // coalesce, unlike `year`: search NEVER carries a pre-order's date, so
        // an incoming null here means "this payload doesn't know", not "there
        // is no date" — overwriting would erase what getAlbumDetail resolved.
        releaseDate: sql`coalesce(excluded.release_date, ${catalogItems.releaseDate})`,
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
      externalId: r.externalId,
      mediaType: r.mediaType,
      title: r.title,
      byline: r.byline,
      year: r.year,
      posterUrl: r.posterUrl,
      paletteHex: r.paletteHex ?? null,
    }));
}

/** One upstream failing must not blank the whole search — but the failure is
 *  still REPORTED (null, distinct from an honest empty `[]`) so the mobile API
 *  can answer 503 when every provider is down instead of a silent no-results. */
async function safe<T>(p: Promise<T[]>): Promise<T[] | null> {
  try {
    return await p;
  } catch (err) {
    console.error("[catalog] upstream search failed:", err);
    return null;
  }
}
