import "server-only";
import { env } from "@/lib/env";
import { tmdbAuth } from "./tmdb";
import type { ExternalItem } from "./types";

const IMG = "https://image.tmdb.org/t/p/w342";

/**
 * Onboarding pool (v2, 2026-09-03) — `GET /discover/{movie|tv}` sorted by
 * popularity, optionally pinned to one genre. Lives apart from `tmdb.ts`
 * (search + item-time lookups) on purpose: discover has no query, a different
 * cache posture (an hour — the pool is the same for everyone and TMDB's
 * popularity barely moves within the hour) and no fixture equivalent (fixtures
 * carry no poster, and a pool tile IS its poster — without a key the video
 * half of the pool is simply empty and albums, keyless, fill the grid).
 *
 * Same stored shape as `TmdbApi.search` (English titles: the link graph
 * matches soundtracks against the stored title, see `getSpanishOverview`),
 * so a pool tile that gets picked is indistinguishable from a searched one.
 */
export interface DiscoverQuery {
  type: "film" | "series";
  /** TMDB genre id, or null for plain popular. */
  genre: number | null;
  /** Our slug for the genre asked for (search derives it from `genre_ids`). */
  genreSlug: string | null;
  /** Below this the popularity sort surfaces junk. */
  minVotes: number;
  page: number;
}

interface TmdbDiscoverResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
}

export async function discoverVideo(q: DiscoverQuery): Promise<ExternalItem[]> {
  if (!env.TMDB_API_KEY) return [];
  const kind = q.type === "film" ? "movie" : "tv";
  const url = new URL(`https://api.themoviedb.org/3/discover/${kind}`);
  url.searchParams.set("sort_by", "popularity.desc");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");
  url.searchParams.set("vote_count.gte", String(q.minVotes));
  url.searchParams.set("page", String(q.page));
  if (q.genre !== null) url.searchParams.set("with_genres", String(q.genre));
  const headers = tmdbAuth(url, env.TMDB_API_KEY);

  try {
    const res = await fetch(url, { headers, next: { revalidate: 60 * 60 } });
    if (!res.ok) {
      console.error(`[catalog] TMDB discover/${kind} failed: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { results?: TmdbDiscoverResult[] };
    return (data.results ?? [])
      .filter((r) => Boolean(r.poster_path))
      .map((r) => ({
        source: "tmdb",
        externalId: String(r.id),
        mediaType: q.type,
        title: r.title ?? r.name ?? "Untitled",
        byline: null,
        year: yearOf(r.release_date ?? r.first_air_date),
        releaseDate: null,
        genre: q.genreSlug,
        synopsis: r.overview || null,
        posterUrl: `${IMG}${r.poster_path}`,
        sourceRating: r.vote_average ?? null,
        isrc: null,
        upc: null,
        raw: r,
      }));
  } catch (err) {
    console.error(`[catalog] TMDB discover/${kind} failed:`, err);
    return [];
  }
}

function yearOf(date?: string): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}
