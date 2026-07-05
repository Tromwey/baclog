import "server-only";
import { env } from "@/lib/env";
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
    const headers: HeadersInit = {};
    // v4 read tokens are JWTs (start with "eyJ"); v3 keys go in the query
    if (this.apiKey.startsWith("eyJ")) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    } else {
      url.searchParams.set("api_key", this.apiKey);
    }
    const res = await fetch(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`TMDB ${path}: ${res.status}`);
    return res.json();
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
