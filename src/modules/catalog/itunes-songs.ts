import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import { SONG_SOURCE, toSongItem, type ItunesSongResult, type SongItem, type SongRaw } from "./song-map";

export { SONG_SOURCE, songFactsOf, type SongItem, type SongRaw } from "./song-map";

/**
 * Colecciones de fiesta — SONG search (iTunes Search API, `entity=song`,
 * keyless like the album search in itunes.ts, ADR-007) and its cache write.
 *
 * A song is stored in `catalog_item` as `media_type = 'track'`,
 * `source = "itunes-track"`, `external_id = trackId`. Its own `source` keeps
 * it apart from the album rows (`source = "itunes"`, `external_id =
 * collectionId`): the album-only code keyed on `source = "itunes"` (link
 * resolution, the release cron, `findCatalogItemByRef`) can never pick a song
 * up, and the unique `(source, external_id)` can't collide across the two.
 *
 * What a song row carries:
 *   title = trackName · byline = artistName · year · genre · posterUrl =
 *   600×600 artwork · raw = a WHITELIST of the iTunes payload (below), whose
 *   `previewUrl` is the 30 s preview the party plays.
 *   `release_date` is never written: the release cron scans that column and a
 *   song is never "no puede esperar".
 * The palette (`palette_hex`) is filled like any cover, on-device, through
 * `fillCatalogPalette`.
 */

export class SongSearchUnavailableError extends Error {
  constructor(cause: unknown) {
    super("iTunes song search failed");
    this.name = "SongSearchUnavailableError";
    this.cause = cause;
  }
}

/**
 * iTunes `entity=song` for `query`, deduped by trackId, in relevance order.
 * THROWS `SongSearchUnavailableError` when iTunes fails (HTTP error, network,
 * bad JSON) — the caller distinguishes "no results" ([]) from "catalog down"
 * (the design's search-error state), like `unifiedSearchDetailed`.
 * `country=mx`: the party is in Mexico and the preview/store links should
 * match the store the guests have. Cached 5 min per query (typing the same
 * query twice, or two guests searching the same hit, costs one call).
 */
export async function searchSongs(query: string, limit = 25): Promise<SongItem[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "song");
  url.searchParams.set("media", "music");
  url.searchParams.set("country", "mx");
  url.searchParams.set("limit", String(limit));
  let data: { results?: ItunesSongResult[] };
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`iTunes song search: ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("[catalog] iTunes song search failed:", err);
    throw new SongSearchUnavailableError(err);
  }
  const seen = new Set<string>();
  const out: SongItem[] = [];
  for (const r of data.results ?? []) {
    const song = toSongItem(r);
    if (!song || seen.has(song.externalId)) continue;
    seen.add(song.externalId);
    out.push(song);
  }
  return out;
}

export interface CachedSong {
  id: string;
  externalId: string;
  title: string;
  byline: string | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
  raw: SongRaw;
}

/**
 * Upsert songs into `catalog_item` (media_type `track`) in ONE statement and
 * return them in the caller's order. A re-search refreshes the display facts
 * and REPLACES `raw` (it is our whitelist, nothing else writes into a song's
 * `raw`), keeps the palette. Needs migration 0033 (the enum value): the
 * party module only calls it with `MIGRATION_0033_LIVE`.
 */
export async function cacheSongs(songs: SongItem[]): Promise<CachedSong[]> {
  if (songs.length === 0) return [];
  const rows = await db
    .insert(catalogItems)
    .values(
      songs.map((s) => ({
        source: SONG_SOURCE,
        externalId: s.externalId,
        mediaType: "track" as const,
        title: s.title,
        byline: s.byline,
        year: s.year,
        genre: s.genre,
        synopsis: null,
        posterUrl: s.posterUrl,
        raw: s.raw,
      })),
    )
    .onConflictDoUpdate({
      target: [catalogItems.source, catalogItems.externalId],
      set: {
        title: sql`excluded.title`,
        byline: sql`coalesce(excluded.byline, ${catalogItems.byline})`,
        year: sql`coalesce(excluded.year, ${catalogItems.year})`,
        genre: sql`coalesce(excluded.genre, ${catalogItems.genre})`,
        posterUrl: sql`coalesce(excluded.poster_url, ${catalogItems.posterUrl})`,
        raw: sql`excluded.raw`,
        refreshedAt: sql`now()`,
      },
    })
    .returning({
      id: catalogItems.id,
      externalId: catalogItems.externalId,
      title: catalogItems.title,
      byline: catalogItems.byline,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      raw: catalogItems.raw,
    });
  const byExt = new Map(rows.map((r) => [r.externalId, r]));
  return songs.flatMap((s) => {
    const r = byExt.get(s.externalId);
    return r ? [{ ...r, raw: (r.raw as SongRaw | null) ?? s.raw }] : [];
  });
}

