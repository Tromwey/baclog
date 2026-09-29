import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import { getFilmRuntime } from "./display-media";
import {
  CINE_TIMES,
  SERIES_LENSES,
  type AlbumWork,
  type CineTime,
  type CineWork,
  type SeriesWork,
  type ShelfWork,
} from "./format-moods";
import { mostPlayedAlbums } from "./itunes-charts";
import { cacheExternalItems } from "./search";
import { getSeriesLength } from "./tmdb";
import { discoverVideo } from "./tmdb-discover";
import type { CatalogSearchResult, ExternalItem } from "./types";

/**
 * Descubrir · por formato (Claude Design "Descubrir Final – Formatos", 2a–2c)
 * — the three shelves. Same posture as the onboarding pool: the providers we
 * already trust (TMDB discover for video, Apple's most-played chart for
 * albums), every row through `cacheExternalItems` so each tile has a real
 * `catalogItemId` and whatever palette the catalog already cached. Provider
 * and catalog data only — no user is read here.
 *
 * No generation is spent and nothing is per-user, so a shelf is the same for
 * everyone; the upstream calls ride the fetch cache (an hour for discover and
 * the chart, a week for a series' length) and a film's runtime is persisted
 * onto its row the first time (`getFilmRuntime`), so a warm shelf costs the
 * DB upsert and nothing else.
 *
 * Every fetcher is fail-open: a dead provider is an empty shelf, which the
 * page words as "nada por aquí", never an error.
 */

/** Released within this long before now = "En cines" on the meta line. */
const IN_CINEMAS_MS = 45 * 24 * 60 * 60 * 1000;

const work = (r: CatalogSearchResult): ShelfWork => ({
  catalogItemId: r.catalogItemId,
  title: r.title,
  mediaType: r.mediaType,
  posterUrl: r.posterUrl,
  paletteHex: r.paletteHex,
  year: r.year,
  byline: r.byline,
});

const keyOf = (r: { source: string; externalId: string }) => `${r.source}:${r.externalId}`;

/** Upsert the provider rows and pair each cached row with its source row. */
async function cacheWithSource(
  external: ExternalItem[],
): Promise<{ row: CatalogSearchResult; ext: ExternalItem }[]> {
  const seen = new Set<string>();
  const unique = external.filter((e) => {
    if (!e.posterUrl || seen.has(keyOf(e))) return false;
    seen.add(keyOf(e));
    return true;
  });
  const byKey = new Map(unique.map((e) => [keyOf(e), e]));
  const rows = await cacheExternalItems(unique);
  return rows.map((row) => ({ row, ext: byKey.get(keyOf(row))! })).filter((p) => p.ext);
}

/**
 * 2a — popular films inside one runtime window (TMDB filters the window
 * itself), two pages deep so a mood still finds a handful. Sorted shortest
 * first, like the mock; an unknown runtime sorts last.
 */
export async function getCineShelf(time: CineTime, now: number): Promise<CineWork[]> {
  const pages = await Promise.all(
    [1, 2].map((page) =>
      discoverVideo({
        type: "film",
        genre: null,
        genreSlug: null,
        minVotes: 400,
        page,
        runtime: CINE_TIMES[time].runtime,
      }),
    ),
  );
  const pairs = await cacheWithSource(pages.flatMap((p) => p ?? []));
  if (pairs.length === 0) return [];

  // The runtime lives in `raw` once fetched; read those rows back and fill
  // the missing ones (persisted, so this runs once per title ever).
  const rows = await db
    .select({
      id: catalogItems.id,
      source: catalogItems.source,
      mediaType: catalogItems.mediaType,
      externalId: catalogItems.externalId,
      raw: catalogItems.raw,
    })
    .from(catalogItems)
    .where(inArray(catalogItems.id, pairs.map((p) => p.row.catalogItemId)));
  const runtimes = new Map(
    await Promise.all(
      rows.map(async (r) => [r.id, await getFilmRuntime(r).catch(() => null)] as const),
    ),
  );

  const films = pairs.map(({ row, ext }): CineWork => {
    const raw = ext.raw as { genre_ids?: unknown } | null;
    const released = ext.releaseDate?.getTime() ?? null;
    return {
      ...work(row),
      runtime: runtimes.get(row.catalogItemId) ?? null,
      genreIds: Array.isArray(raw?.genre_ids)
        ? raw.genre_ids.filter((g): g is number => typeof g === "number")
        : [],
      genre: ext.genre,
      inCinemas: released !== null && released <= now && now - released <= IN_CINEMAS_MS,
    };
  });
  return films.sort((a, b) => (a.runtime ?? Infinity) - (b.runtime ?? Infinity));
}

/**
 * 2b — "para maratonear": finished miniseries (TMDB `with_type=2`,
 * `with_status=3`), each sized by `getSeriesLength`. Only what fits the
 * longest lens comes back; the client narrows to the shorter one.
 */
export async function getMaratonShelf(): Promise<SeriesWork[]> {
  const pages = await Promise.all(
    [1, 2].map((page) =>
      discoverVideo({
        type: "series",
        genre: null,
        genreSlug: null,
        minVotes: 150,
        page,
        tvType: 2,
        tvStatus: 3,
      }),
    ),
  );
  const pairs = await cacheWithSource(pages.flatMap((p) => p ?? []));
  const longest = SERIES_LENSES[SERIES_LENSES.length - 1].maxMinutes;
  const sized = await Promise.all(
    pairs.map(async ({ row }) => {
      const len = await getSeriesLength(row.externalId).catch(() => null);
      return len && len.minutes <= longest
        ? ({ ...work(row), episodes: len.episodes, minutes: len.minutes, network: len.network } satisfies SeriesWork)
        : null;
    }),
  );
  return sized.filter((s): s is SeriesWork => s !== null);
}

/**
 * 2c — Apple's most-played albums (mx + us, deduped), with the genre each
 * moment is matched against on the client.
 */
export async function getMusicShelf(): Promise<AlbumWork[]> {
  const [mx, us] = await Promise.all([mostPlayedAlbums("mx"), mostPlayedAlbums("us")]);
  const pairs = await cacheWithSource([...(mx ?? []), ...(us ?? [])]);
  return pairs.map(({ row, ext }) => ({ ...work(row), genre: ext.genre }));
}
