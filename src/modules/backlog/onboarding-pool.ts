import "server-only";
import { mostPlayedAlbums } from "@/modules/catalog/itunes-charts";
import { cacheExternalItems } from "@/modules/catalog/search";
import { discoverVideo } from "@/modules/catalog/tmdb-discover";
import type { ExternalItem, MediaType } from "@/modules/catalog/types";

/**
 * Onboarding · "Elige tres" (v2, 2026-09-03) — the CURATED, endless pool a
 * new account picks its first obsessions from.
 *
 * Founder call: not the catalog's most-saved titles (a young DB surfaces
 * junk) but the providers we already trust for name/cover/synopsis — TMDB's
 * discover ranking for film and series, Apple's most-played chart for albums.
 * Every page is 4 film · 4 series · 4 album interleaved (a row of the grid is
 * one of each), and the video genre ROTATES per page so a scroll crosses
 * drama, comedy, sci-fi, animation, horror, documentary, romance, crime and
 * thriller instead of twenty pages of the same top 100.
 *
 * Deterministic page → source mapping: page 1 is plain popular; pages 2–10
 * walk the genre cycle once, taking each genre's first four; pages 11–20 walk
 * it again taking the NEXT four (same cached upstream call, a deeper slice),
 * and albums are the mx+us charts merged and sliced four per page. So one
 * source never repeats a title across pages; a title tagged with TWO genres
 * (a crime drama) can recur, and the client dedupes on append.
 *
 * Results go through `cacheExternalItems` — the exact path search takes — so
 * every tile has a real `catalogItemId` and the cached `paletteHex` when the
 * cover was extracted before. Aggregate/provider data only: no user is read.
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

export interface OnboardingPoolPage {
  items: OnboardingPoolItem[];
  nextPage: number | null;
}

/** Tiles per kind per page (× 3 kinds = 12 tiles, four rows of the grid). */
const PER_KIND = 4;
export const POOL_PAGE_COUNT = 20;

/** TMDB genre ids per kind (movie / tv taxonomies differ), in page order. */
const GENRE_CYCLE: { slug: string; film: number; series: number }[] = [
  { slug: "drama", film: 18, series: 18 },
  { slug: "comedy", film: 35, series: 35 },
  { slug: "sci-fi", film: 878, series: 10765 },
  { slug: "animation", film: 16, series: 16 },
  // TV has no horror genre; mystery is the closest shelf.
  { slug: "horror", film: 27, series: 9648 },
  { slug: "documentary", film: 99, series: 99 },
  // TV has no romance genre either; family keeps the tone.
  { slug: "romance", film: 10749, series: 10751 },
  { slug: "crime", film: 80, series: 80 },
  { slug: "thriller", film: 53, series: 10759 },
];

/** Vote floors: below these the popularity sort surfaces junk. TV accrues
 *  far fewer votes than film, and a genre shelf fewer than the overall top. */
const MIN_VOTES = {
  popular: { film: 3000, series: 800 },
  genre: { film: 1500, series: 300 },
} as const;

export async function getOnboardingPoolPage(
  page: number,
): Promise<OnboardingPoolPage> {
  if (page < 1 || page > POOL_PAGE_COUNT) return { items: [], nextPage: null };

  const cycle = GENRE_CYCLE.length + 1; // + the plain-popular page
  const idx = (page - 1) % cycle;
  const visit = Math.floor((page - 1) / cycle);
  const genre = idx === 0 ? null : GENRE_CYCLE[idx - 1];
  const from = visit * PER_KIND;

  const video = (type: "film" | "series") =>
    discoverVideo({
      type,
      genre: genre ? genre[type] : null,
      genreSlug: genre?.slug ?? null,
      minVotes: genre ? MIN_VOTES.genre[type] : MIN_VOTES.popular[type],
      page: 1,
    }).then((rows) => rows.slice(from, from + PER_KIND));

  const albums = Promise.all([mostPlayedAlbums("mx"), mostPlayedAlbums("us")])
    .then(([mx, us]) => dedupe([...mx, ...us]))
    .then((rows) => rows.slice((page - 1) * PER_KIND, page * PER_KIND));

  const [films, series, records] = await Promise.all([
    video("film"),
    video("series"),
    albums,
  ]);

  const cached = await cacheExternalItems(
    interleave([films, series, records]).filter((e) => e.posterUrl),
  );

  return {
    items: cached.map((r) => ({
      catalogItemId: r.catalogItemId,
      title: r.title,
      mediaType: r.mediaType,
      posterUrl: r.posterUrl,
      paletteHex: r.paletteHex,
      year: r.year,
      byline: r.byline,
    })),
    nextPage: page < POOL_PAGE_COUNT ? page + 1 : null,
  };
}

/** film[0] · series[0] · album[0] · film[1] … — one of each per grid row. */
function interleave(lists: ExternalItem[][]): ExternalItem[] {
  const out: ExternalItem[] = [];
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out;
}

function dedupe(rows: ExternalItem[]): ExternalItem[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.externalId)) return false;
    seen.add(r.externalId);
    return true;
  });
}
