import "server-only";
import { env } from "@/lib/env";
import { releaseDateOf, runtimeMinutesOf, type FilmFacts } from "./film-facts";
import { releaseDayInstant } from "./release";
import type { SeriesFacts } from "./series-status";
import { TMDB_FIXTURES } from "./tmdb.fixtures";
import type { ExternalItem, VideoCatalog } from "./types";

const IMG = "https://image.tmdb.org/t/p/w342";

/** Stable TMDB genre ids — a static map avoids an extra API round trip. */
const GENRES: Record<number, string> = {
  28: "action", 12: "adventure", 16: "animation", 35: "comedy",
  80: "crime", 99: "documentary", 18: "drama", 10751: "family",
  14: "fantasy", 36: "history", 27: "horror", 10402: "music",
  9648: "mystery", 10749: "romance", 878: "sci-fi", 53: "thriller",
  10752: "war", 37: "western", 10759: "action", 10762: "kids",
  10763: "news", 10764: "reality", 10765: "sci-fi", 10766: "soap",
  10767: "talk", 10768: "war",
};

/**
 * TMDB auth for a request: v4 read tokens are JWTs (start with "eyJ") and go in
 * the Authorization header; v3 keys go in the query. Mutates `url` (adds the v3
 * param) and returns the headers. One place so the four TMDB call sites
 * (TmdbApi.get, getSpanishOverview, getSeriesFacts, links/providers.getWatchLink)
 * can't drift.
 */
export function tmdbAuth(url: URL, apiKey: string): HeadersInit {
  if (apiKey.startsWith("eyJ")) return { Authorization: `Bearer ${apiKey}` };
  url.searchParams.set("api_key", apiKey);
  return {};
}

interface TmdbResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  genre_ids?: number[];
}

class TmdbApi implements VideoCatalog {
  constructor(private apiKey: string) {}

  private async get(path: string, params: Record<string, string>) {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = tmdbAuth(url, this.apiKey);
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`TMDB ${path}: ${res.status}`);
    return res.json();
  }

  /**
   * F3.5.8 — composer credit for the link graph. Series use aggregate_credits
   * (per-season crew flattened by TMDB). Fail-open to null: a credits error
   * only costs a "score" edge, never blocks the pipeline.
   */
  async getComposer(
    externalId: string,
    type: "film" | "series",
  ): Promise<string | null> {
    const path =
      type === "film"
        ? `/movie/${externalId}/credits`
        : `/tv/${externalId}/aggregate_credits`;
    try {
      const data = await this.get(path, {});
      const crew = (data.crew ?? []) as {
        name?: string;
        job?: string;
        jobs?: { job?: string }[];
      }[];
      const composer = crew.find(
        (c) =>
          c.job === "Original Music Composer" ||
          c.jobs?.some((j) => j.job === "Original Music Composer"),
      );
      return composer?.name ?? null;
    } catch (err) {
      console.error("[catalog] TMDB credits failed:", err);
      return null;
    }
  }

  async search(query: string, type: "film" | "series"): Promise<ExternalItem[]> {
    const path = type === "film" ? "/search/movie" : "/search/tv";
    const data = await this.get(path, {
      query,
      include_adult: "false",
      language: "en-US",
      page: "1",
    });
    return (data.results as TmdbResult[]).slice(0, 10).map((r) => ({
      source: "tmdb",
      externalId: String(r.id),
      mediaType: type,
      title: r.title ?? r.name ?? "Untitled",
      byline: null, // studio needs a details call — filled lazily on item view
      year: yearOf(r.release_date ?? r.first_air_date),
      // F3.8 for video (founder, 2026-09-24): the DAY TMDB knows — film
      // `release_date`, series `first_air_date` (the show's premiere; a new
      // season is not a release) — stored at 06:00Z (release.ts
      // `RELEASE_DAY_UTC_HOUR`). "" / garbage → null, and a null never erases
      // a known date in the upsert (search.ts), while a known one corrects it.
      releaseDate: releaseDayInstant(type === "film" ? r.release_date : r.first_air_date),
      genre: r.genre_ids?.map((g) => GENRES[g]).find(Boolean) ?? null,
      synopsis: r.overview || null,
      posterUrl: r.poster_path ? `${IMG}${r.poster_path}` : null,
      sourceRating: r.vote_average ?? null,
      isrc: null,
      upc: null,
      raw: r,
    }));
  }
}

function yearOf(date?: string): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}

/**
 * Spanish overview for a title, fetched at item-view time (cached 30d). The
 * catalog is stored in English (search runs `en-US`; changing that would also
 * localize TITLES, which the link graph matches soundtracks against — so we
 * localize ONLY the synopsis, here, without touching stored rows). Returns null
 * when TMDB has no Spanish translation (much of the long tail) so the caller
 * falls back to the stored English `synopsis`. Uses /translations to catch both
 * es-MX and es-ES in one call. Text metadata (not artwork) → server-side fetch
 * is fine (ADR-007's proxy rule is images only).
 */
export async function getSpanishOverview(
  tmdbId: string,
  mediaType: "film" | "series",
): Promise<string | null> {
  if (!env.TMDB_API_KEY) return null;
  const kind = mediaType === "film" ? "movie" : "tv";
  const url = new URL(
    `https://api.themoviedb.org/3/${kind}/${tmdbId}/translations`,
  );
  const headers = tmdbAuth(url, env.TMDB_API_KEY);
  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const es = ((data.translations ?? []) as Array<{
      iso_639_1?: string;
      iso_3166_1?: string;
      data?: { overview?: string };
    }>).filter((t) => t.iso_639_1 === "es" && t.data?.overview?.trim());
    if (es.length === 0) return null;
    // Prefer Mexican Spanish, then Spain, then any es variant.
    const pick =
      es.find((t) => t.iso_3166_1 === "MX") ??
      es.find((t) => t.iso_3166_1 === "ES") ??
      es[0];
    return pick.data?.overview?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Series status facts (Revamp UI 06c/06d): `status`, `number_of_seasons`,
 * `in_production`, `last_air_date` from `GET /tv/{id}`. The `/search/tv` hit
 * stored in `catalog_item.raw` carries none of them, so — like the Spanish
 * overview — they're fetched lazily at item-view time; unlike it, the caller
 * persists them back onto the row (see `getSeriesStatus`), so this only runs
 * on a miss or a weekly re-check. Returns ONLY those four fields (never the
 * whole details payload — nothing else here should leak into `raw`). Fail-open
 * to null on no key, non-2xx, or a network/parse error: the pill just doesn't
 * render.
 */
export async function getSeriesFacts(tmdbId: string): Promise<SeriesFacts | null> {
  if (!env.TMDB_API_KEY) return null;
  const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`);
  url.searchParams.set("language", "es-MX");
  const headers = tmdbAuth(url, env.TMDB_API_KEY);
  try {
    // Short fetch cache: the DB row is the real cache; this only dedupes a
    // burst of views between the fetch and the persisted write.
    const res = await fetch(url, { headers, next: { revalidate: 60 * 60 } });
    if (!res.ok) {
      console.error(`[catalog] TMDB /tv/${tmdbId} failed: ${res.status}`);
      return null;
    }
    const d = (await res.json()) as {
      status?: unknown;
      number_of_seasons?: unknown;
      in_production?: unknown;
      last_air_date?: unknown;
    };
    return {
      status: typeof d.status === "string" ? d.status : null,
      number_of_seasons:
        typeof d.number_of_seasons === "number" && Number.isFinite(d.number_of_seasons)
          ? d.number_of_seasons
          : null,
      in_production: typeof d.in_production === "boolean" ? d.in_production : null,
      last_air_date: typeof d.last_air_date === "string" ? d.last_air_date : null,
    };
  } catch (err) {
    console.error(`[catalog] TMDB /tv/${tmdbId} failed:`, err);
    return null;
  }
}

/**
 * Film facts (API v1 `Title.detail`, web meta line 24a "2001 · 125 min"):
 * `runtime` and `release_date` from `GET /movie/{id}`. The `/search/movie` hit
 * in `catalog_item.raw` has no runtime; like `getSeriesFacts`, the caller
 * (`getFilmRuntime` in display-media.ts) persists these back onto the row
 * with a marker, so this runs ONCE per title (see film-facts.ts). Returns ONLY
 * those two fields — nothing else from the details payload leaks into `raw`.
 *
 * Two kinds of "no answer", on purpose:
 *  - 404 = TMDB no longer has this film (deleted/merged). That is an ANSWER:
 *    `{ runtime: null, release_date: null }`, so the caller writes the marker
 *    and the 30-day re-check applies. Returning null here made every view of
 *    the ficha (public anonymous one included) call TMDB and log, forever.
 *  - no key, 401/429/5xx, network or parse error = TRANSIENT: null, nothing
 *    is written and the next view retries. Logged at warn — the detail line
 *    just omits the runtime, the page is fine.
 */
export async function getFilmFacts(tmdbId: string): Promise<FilmFacts | null> {
  if (!env.TMDB_API_KEY) return null;
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set("language", "es-MX");
  const headers = tmdbAuth(url, env.TMDB_API_KEY);
  try {
    // Short fetch cache: the DB row is the real cache; this only dedupes a
    // burst of views between the fetch and the persisted write.
    const res = await fetch(url, { headers, next: { revalidate: 60 * 60 } });
    if (res.status === 404) return { runtime: null, release_date: null };
    if (!res.ok) {
      console.warn(`[catalog] TMDB /movie/${tmdbId} failed: ${res.status} (transitorio, se reintenta)`);
      return null;
    }
    const d = (await res.json()) as { runtime?: unknown; release_date?: unknown };
    return {
      runtime: runtimeMinutesOf(d.runtime),
      release_date: releaseDateOf(d.release_date),
    };
  } catch (err) {
    console.warn(`[catalog] TMDB /movie/${tmdbId} failed (transitorio, se reintenta):`, err);
    return null;
  }
}

class TmdbFixtures implements VideoCatalog {
  async search(query: string, type: "film" | "series"): Promise<ExternalItem[]> {
    const q = query.toLowerCase();
    return TMDB_FIXTURES.filter(
      (f) =>
        f.mediaType === type &&
        (f.title.toLowerCase().includes(q) ||
          (f.byline ?? "").toLowerCase().includes(q)),
    );
  }
}

/**
 * Launch dep seam (tooling-y-accesos): a real TMDB_API_KEY swaps in with no
 * code change anywhere else. Fixtures keep the whole loop buildable today.
 */
export const videoCatalog: VideoCatalog = env.TMDB_API_KEY
  ? new TmdbApi(env.TMDB_API_KEY)
  : new TmdbFixtures();
