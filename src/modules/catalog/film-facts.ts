/**
 * Film facts (API v1 `Title.detail` "125 min", web ficha meta line 24a) — PURE
 * module, sibling of `series-status.ts`: no DB, no fetch, no "server-only", so
 * `scripts/check-wire.ts` can assert it under tsx.
 *
 * The `/search/movie` hit stored in `catalog_item.raw` carries no `runtime`;
 * `GET /movie/{id}` does. `getFilmRuntime` (display-media.ts) fetches it ONCE
 * per title and merges it INTO `raw` next to a `_film_facts_at` marker — no
 * new column on purpose (migrations on the shared DB need the founder). The
 * details payload's `release_date` rides along inside `raw` too (it's the same
 * key the search hit already stored). The `release_date` COLUMN for video is
 * filled by the search/discover upsert since 2026-09-24 (founder question 8;
 * rows cached before that were backfilled from this `raw` key); it is never
 * written to the column here.
 *
 * Freshness is read off the marker, never `refreshed_at` (the search upsert
 * bumps that without touching `raw`). A runtime never changes once TMDB knows
 * it, so a row with runtime + marker is never re-fetched. The one exception:
 * TMDB answered WITHOUT a runtime (an unreleased film often has 0) — that row
 * re-checks after `FILM_FACTS_RETRY_MS`, not on every view. A 404 from TMDB
 * (film deleted or merged) counts as "answered without a runtime": it writes
 * the marker too, so a dead id costs one call per 30 days, not one per view.
 */

export const FILM_FACTS_AT_KEY = "_film_facts_at";

/** What `getFilmFacts` (tmdb.ts) returns — only these keys ever reach `raw`. */
export interface FilmFacts {
  /** Minutes; null when TMDB doesn't know it yet (0 or absent). */
  runtime: number | null;
  /** `YYYY-MM-DD` as TMDB sends it (anything else → null, `releaseDateOf`);
   *  kept in `raw` (see above). */
  release_date: string | null;
}

/** What `readFilmFacts` hands back off `raw`. */
export type FilmFactsPatch = FilmFacts & { [FILM_FACTS_AT_KEY]: string };

/** What `cacheFilmFacts` merges into `raw` (`raw || patch`). A null fact is
 *  OMITTED, never written as null: a jsonb merge would otherwise erase the
 *  `release_date` the search hit already stored (and a 404 would wipe it). */
export type FilmFactsWrite = {
  runtime?: number;
  release_date?: string;
  [FILM_FACTS_AT_KEY]: string;
};

/** The one release_date shape we keep: a calendar `YYYY-MM-DD`. */
const RELEASE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` or null — TMDB sends "" for unknown, and a garbage string
 *  must never reach `raw` (the column backfill read it). */
export function releaseDateOf(value: unknown): string | null {
  return typeof value === "string" && RELEASE_DATE_RE.test(value) ? value : null;
}

/** The merge patch for a TMDB answer: marker always, facts only when known. */
export function filmFactsWrite(facts: FilmFacts, at: string): FilmFactsWrite {
  return {
    ...(facts.runtime !== null ? { runtime: facts.runtime } : {}),
    ...(facts.release_date !== null ? { release_date: facts.release_date } : {}),
    [FILM_FACTS_AT_KEY]: at,
  };
}

/** A film TMDB answered for without a runtime re-checks after 30 days. */
export const FILM_FACTS_RETRY_MS = 30 * 24 * 60 * 60 * 1000;

/** Positive integer minutes, else null — never invent a runtime. */
export function runtimeMinutesOf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const minutes = Math.round(value);
  return minutes > 0 ? minutes : null;
}

/**
 * The persisted facts off `catalog_item.raw`, or null when the row was never
 * enriched (no marker). A search hit's own `release_date` without the marker
 * does NOT count as enriched: that's exactly the row that still lacks runtime.
 */
export function readFilmFacts(raw: unknown): FilmFactsPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const at = r[FILM_FACTS_AT_KEY];
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return {
    runtime: runtimeMinutesOf(r.runtime),
    release_date: typeof r.release_date === "string" ? r.release_date : null,
    [FILM_FACTS_AT_KEY]: at,
  };
}

/** True when the stored facts should be fetched again: never enriched, or
 *  enriched WITHOUT a runtime more than `FILM_FACTS_RETRY_MS` ago. A known
 *  runtime is final. */
export function filmFactsNeedFetch(
  facts: FilmFactsPatch | null,
  now: number = Date.now(),
): boolean {
  if (!facts) return true;
  if (facts.runtime !== null) return false;
  return now - Date.parse(facts[FILM_FACTS_AT_KEY]) > FILM_FACTS_RETRY_MS;
}

/** "125 min" — the one formatter the API and the web ficha share. */
export function runtimeLabel(minutes: number | null): string | null {
  return minutes !== null && minutes > 0 ? `${minutes} min` : null;
}
