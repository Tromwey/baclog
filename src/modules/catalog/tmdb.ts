import { redactedError } from "@/authz/safe-log";
import "server-only";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { env } from "@/lib/env";
import { releaseDateOf, runtimeMinutesOf, type FilmFacts } from "./film-facts";
import { releaseDayInstant } from "./release";
import type { SeriesFacts } from "./series-status";
import { TMDB_FIXTURES } from "./tmdb.fixtures";
import type { ExternalItem, VideoCatalog } from "./types";

const IMG = "https://image.tmdb.org/t/p/w342";

/** Stable TMDB genre ids — a static map avoids an extra API round trip. */
export const TMDB_GENRES: Record<number, string> = {
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

/** A non-2xx from TMDB, with the status (a 404 is an answer; a 5xx is not). */
class TmdbHttpError extends Error {
  constructor(path: string, readonly status: number) {
    super(`TMDB ${path}: ${status}`);
    this.name = "TmdbHttpError";
  }
}

class TmdbApi implements VideoCatalog {
  constructor(private apiKey: string) {}

  private async get(path: string, params: Record<string, string>) {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = tmdbAuth(url, this.apiKey);
    const res = await fetchWithTimeout(url, { headers, next: { revalidate: 0 } });
    if (!res.ok) throw new TmdbHttpError(path, res.status);
    return res.json();
  }

  /**
   * F3.5.8 — composer credit for the link graph. Series use aggregate_credits
   * (per-season crew flattened by TMDB). `null` is an ANSWER: TMDB lists no
   * composer, or no longer has the title (404). A lookup TMDB did not answer
   * (timeout, network, 429/5xx) THROWS — the caller must be able to tell "no
   * composer" from "nobody answered", or it caches the second as the first
   * for 180 days (linkgraph `getOrMaterializeLinkEdges`).
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
      if (err instanceof TmdbHttpError && err.status === 404) return null;
      throw err;
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
      genre: r.genre_ids?.map((g) => TMDB_GENRES[g]).find(Boolean) ?? null,
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
    const res = await fetchWithTimeout(url, {
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
    const res = await fetchWithTimeout(url, { headers, next: { revalidate: 60 * 60 } });
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
    console.error(`[catalog] TMDB /tv/${tmdbId} failed:`, redactedError(err));
    return null;
  }
}

/** Descubrir · Series · maratón (2b): how long a whole series takes. */
export interface SeriesLength {
  episodes: number;
  /** Whole-series running time, minutes (episodes × the typical episode). */
  minutes: number;
  /** First network ("Netflix", "HBO"), when TMDB names one. */
  network: string | null;
}

/**
 * The maratón pill ("3,9 h") — `number_of_episodes` × the episode runtime
 * TMDB gives (`episode_run_time` average, else the last aired episode's).
 * NOT persisted to `raw` like `getSeriesFacts`: it only feeds Descubrir's
 * shelf, and a week of fetch cache covers a pool that barely moves. Null on
 * no key, an error, or a series TMDB can't size (no episodes / no runtime).
 */
export async function getSeriesLength(tmdbId: string): Promise<SeriesLength | null> {
  if (!env.TMDB_API_KEY) return null;
  const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`);
  url.searchParams.set("language", "es-MX");
  const headers = tmdbAuth(url, env.TMDB_API_KEY);
  try {
    const res = await fetchWithTimeout(url, { headers, next: { revalidate: 60 * 60 * 24 * 7 } });
    if (!res.ok) {
      console.warn(`[catalog] TMDB /tv/${tmdbId} (length) failed: ${res.status}`);
      return null;
    }
    const d = (await res.json()) as {
      number_of_episodes?: unknown;
      episode_run_time?: unknown;
      last_episode_to_air?: { runtime?: unknown } | null;
      networks?: { name?: unknown }[];
    };
    const episodes = typeof d.number_of_episodes === "number" ? d.number_of_episodes : 0;
    const runs = Array.isArray(d.episode_run_time)
      ? d.episode_run_time.filter((n): n is number => typeof n === "number" && n > 0)
      : [];
    const last = d.last_episode_to_air?.runtime;
    const perEpisode = runs.length
      ? runs.reduce((a, b) => a + b, 0) / runs.length
      : typeof last === "number" && last > 0
        ? last
        : 0;
    if (episodes <= 0 || perEpisode <= 0) return null;
    const network = d.networks?.[0]?.name;
    return {
      episodes,
      minutes: Math.round(episodes * perEpisode),
      network: typeof network === "string" && network ? network : null,
    };
  } catch (err) {
    console.warn(`[catalog] TMDB /tv/${tmdbId} (length) failed:`, redactedError(err));
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
    const res = await fetchWithTimeout(url, { headers, next: { revalidate: 60 * 60 } });
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
    console.warn(`[catalog] TMDB /movie/${tmdbId} failed (transitorio, se reintenta):`, redactedError(err));
    return null;
  }
}

// ─── Descubrir · "los más esperados" + "lo nuevo de tus favoritos" ──────────
// (2026-09-29). Fanned-out reads on a page load, so every call has a
// per-call timeout, a Next fetch cache, and fails OPEN (null/[] + warn): a
// dead TMDB costs a section, never the page. Same stored shape as
// `TmdbApi.search` (English titles, day at 06:00Z) via `videoItemOf`.

/** Per-call budget for the Descubrir fan-out. */
const TMDB_FANOUT_TIMEOUT_MS = 4000;

/** A list row as TMDB returns it from discover and person credits. */
interface TmdbListRow extends TmdbResult {
  popularity?: number;
  adult?: boolean;
  video?: boolean;
  job?: string;
  department?: string;
  credit_id?: string;
  episode_count?: number;
  character?: string;
  order?: number;
  original_language?: string;
  origin_country?: string[];
}

async function tmdbFanoutJson(
  path: string,
  params: Record<string, string>,
  revalidate: number,
): Promise<unknown | null> {
  if (!env.TMDB_API_KEY) return null;
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = tmdbAuth(url, env.TMDB_API_KEY);
  try {
    const res = await fetch(url, {
      headers,
      next: { revalidate },
      signal: AbortSignal.timeout(TMDB_FANOUT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[catalog] TMDB ${path} failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[catalog] TMDB ${path} failed:`, redactedError(err));
    return null;
  }
}

const CREDIT_KEYS = ["job", "department", "credit_id", "episode_count", "character", "order"] as const;

/** A TMDB list row → the catalog's stored shape (the `search` mapping). The
 *  credit-only keys (job, character, credit_id…) are dropped from `raw` so a
 *  row cached from credits looks like one cached from search. */
function videoItemOf(r: TmdbListRow, type: "film" | "series"): ExternalItem {
  const raw: Record<string, unknown> = { ...r };
  for (const k of CREDIT_KEYS) delete raw[k];
  return {
    source: "tmdb",
    externalId: String(r.id),
    mediaType: type,
    title: r.title ?? r.name ?? "Untitled",
    byline: null,
    year: yearOf(r.release_date ?? r.first_air_date),
    releaseDate: releaseDayInstant(type === "film" ? r.release_date : r.first_air_date),
    genre: r.genre_ids?.map((g) => TMDB_GENRES[g]).find(Boolean) ?? null,
    synopsis: r.overview || null,
    posterUrl: r.poster_path ? `${IMG}${r.poster_path}` : null,
    sourceRating: r.vote_average ?? null,
    isrc: null,
    upc: null,
    raw,
  };
}

/** A discover hit with TMDB's own popularity (the cross-list rank). */
export interface RankedVideo {
  item: ExternalItem;
  popularity: number;
}

/** Talk, news, reality and soap: the "popular upcoming TV" noise. */
const UPCOMING_TV_NOISE = "10763,10764,10766,10767";

/**
 * Floor for upcoming TV (TMDB popularity). An unaired show has no votes, so
 * popularity is the only signal; it is filtered here, not in the query
 * (`/discover/tv` has no popularity filter). Picked against the real list on
 * 2026-09-29: the head (VisionQuest 19, Harry Potter 12, Carrie 13, Avatar:
 * Seven Havens 10) sits at ≥ 10, the long tail of regional dailies and
 * minor anime below it. Re-check if the section runs dry.
 */
const UPCOMING_TV_MIN_POPULARITY = 10;

/** Chinese animation (donghua) must clear a higher bar: it floods TMDB's
 *  upcoming popularity with titles nobody in Kura's audience has heard of. */
const DONGHUA_MIN_POPULARITY = 25;

const ANIMATION_GENRE = 16;

function isDonghua(r: TmdbListRow): boolean {
  if (!r.genre_ids?.includes(ANIMATION_GENRE)) return false;
  return r.original_language === "zh" || Boolean(r.origin_country?.includes("CN"));
}

/**
 * "Los más esperados" — TMDB's most popular titles that haven't come out yet,
 * one page (20) by popularity, cached 6h. `fromDay` is `YYYY-MM-DD`
 * (tomorrow, UTC).
 *  - Films: only those with an upcoming THEATRICAL release in Mexico —
 *    `region=MX` + `with_release_type=2|3` + `release_date.gte` (with a
 *    region, TMDB applies `release_date.*` to that region's dates). That is
 *    what drops the festival/VOD long tail. With a region TMDB also answers
 *    `release_date` with the MEXICAN date (Avengers: Doomsday 12-17 vs the
 *    primary 12-15), and that is the day stored — the one a Kura user in
 *    Mexico waits for. Caveat: `/search/movie` (no region) writes the
 *    primary date back, so a film can flip between the two days; each flip
 *    is one upsert and the countdown moves by a day or two.
 *  - Series: `first_air_date.gte`, minus talk/news/reality/soap, then a
 *    popularity floor (`UPCOMING_TV_MIN_POPULARITY`).
 *  - Both: no adult or video-only rows, no posterless rows, donghua only
 *    above `DONGHUA_MIN_POPULARITY`.
 * No `vote_count` floor: an unreleased title has (almost) no votes.
 * `[]` on no key or any failure.
 */
export async function discoverUpcomingVideo(
  type: "film" | "series",
  fromDay: string,
): Promise<RankedVideo[]> {
  const film = type === "film";
  const params: Record<string, string> = {
    sort_by: "popularity.desc",
    include_adult: "false",
    language: "en-US",
    page: "1",
  };
  if (film) {
    params.region = "MX";
    params.with_release_type = "2|3";
    params["release_date.gte"] = fromDay;
    params.include_video = "false";
  } else {
    params["first_air_date.gte"] = fromDay;
    params.without_genres = UPCOMING_TV_NOISE;
  }
  const data = (await tmdbFanoutJson(
    `/discover/${film ? "movie" : "tv"}`,
    params,
    60 * 60 * 6,
  )) as { results?: TmdbListRow[] } | null;
  return (data?.results ?? [])
    .filter((r) => {
      if (!r.poster_path || r.adult === true || r.video === true) return false;
      const popularity = r.popularity ?? 0;
      if (!film && popularity < UPCOMING_TV_MIN_POPULARITY) return false;
      return !isDonghua(r) || popularity >= DONGHUA_MIN_POPULARITY;
    })
    .map((r) => ({ item: videoItemOf(r, type), popularity: r.popularity ?? 0 }));
}

/** A person as the Descubrir fan-out needs them. */
export interface TmdbPerson {
  id: number;
  name: string;
}

/** A film's directors (`/movie/{id}/credits`, crew job "Director"). A
 *  finished film's director never changes: cached 30 days. */
export async function getFilmDirectors(tmdbId: string): Promise<TmdbPerson[]> {
  const data = (await tmdbFanoutJson(`/movie/${tmdbId}/credits`, {}, 60 * 60 * 24 * 30)) as {
    crew?: { id?: number; name?: string; job?: string }[];
  } | null;
  return peopleOf((data?.crew ?? []).filter((c) => c.job === "Director"));
}

/** A series' creators (`/tv/{id}` `created_by`). Cached 30 days (no language
 *  param, so it never shares a cache entry with `getSeriesFacts`). */
export async function getSeriesCreators(tmdbId: string): Promise<TmdbPerson[]> {
  const data = (await tmdbFanoutJson(`/tv/${tmdbId}`, {}, 60 * 60 * 24 * 30)) as {
    created_by?: { id?: number; name?: string }[];
  } | null;
  return peopleOf(data?.created_by ?? []);
}

function peopleOf(rows: { id?: number; name?: string }[]): TmdbPerson[] {
  const out: TmdbPerson[] = [];
  for (const r of rows) {
    if (typeof r.id !== "number" || !r.name || out.some((p) => p.id === r.id)) continue;
    out.push({ id: r.id, name: r.name });
  }
  return out;
}

/**
 * The films a person DIRECTED (`/person/{id}/movie_credits`, crew job
 * "Director") released on or after `sinceMs` — upcoming included; a credit
 * with no date yet is dropped (TMDB leaves announced-but-unscheduled films
 * dateless, and a shelf of "lo nuevo" can't place them). Cached 24h.
 */
export async function getDirectorFilms(personId: number, sinceMs: number): Promise<ExternalItem[]> {
  return personCredits(`/person/${personId}/movie_credits`, "Director", "film", sinceMs);
}

/** The series a person CREATED (`/person/{id}/tv_credits`, crew job
 *  "Creator") whose first air date is on or after `sinceMs`. Cached 24h. */
export async function getCreatorSeries(personId: number, sinceMs: number): Promise<ExternalItem[]> {
  return personCredits(`/person/${personId}/tv_credits`, "Creator", "series", sinceMs);
}

async function personCredits(
  path: string,
  job: string,
  type: "film" | "series",
  sinceMs: number,
): Promise<ExternalItem[]> {
  const data = (await tmdbFanoutJson(path, { language: "en-US" }, 60 * 60 * 24)) as {
    crew?: TmdbListRow[];
  } | null;
  const seen = new Set<number>();
  const out: ExternalItem[] = [];
  for (const r of data?.crew ?? []) {
    if (r.job !== job || r.adult === true || seen.has(r.id)) continue;
    seen.add(r.id);
    const item = videoItemOf(r, type);
    if (!item.releaseDate || item.releaseDate.getTime() < sinceMs) continue;
    out.push(item);
  }
  return out;
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
