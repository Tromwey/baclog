/**
 * Series status (Revamp UI 06c/06d, 2026-09-03) — the "Terminada · 1
 * temporada" / "En emisión · 3 temporadas" pill. PURE module: no DB, no
 * network, no `server-only`, so the mapping is unit-checkable from a script
 * (`scripts/check-series-status.ts`). The fetch + persistence live in
 * `display-media.ts` (`getSeriesStatus`).
 *
 * The facts come from TMDB `GET /tv/{id}` and are merged INTO `catalog_item.raw`
 * (which for TMDB is otherwise the `/search/tv` hit, which carries none of
 * them) — no new column, no migration. Only these four TMDB fields plus one
 * marker of ours are stored; see `SeriesFactsPatch`.
 */

/** The four TMDB `/tv/{id}` fields we keep, under TMDB's own names. */
export interface SeriesFacts {
  status: string | null;
  number_of_seasons: number | null;
  in_production: boolean | null;
  last_air_date: string | null;
}

/**
 * Our marker inside `raw`: when the facts were fetched. It can't be
 * `refreshed_at` — the search upsert bumps that column WITHOUT touching
 * `raw`, so a re-search of an airing series would make week-old facts look
 * fresh. Underscore-prefixed so it can never collide with a TMDB field.
 */
export const SERIES_FACTS_AT_KEY = "_series_facts_at";

export type SeriesFactsPatch = SeriesFacts & { [SERIES_FACTS_AT_KEY]: string };

export interface SeriesStatus {
  kind: "ended" | "airing";
  seasons: number;
}

/** Airing series re-check their facts after this long; ended ones never do. */
export const SERIES_FACTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ENDED = new Set(["Ended", "Canceled", "Cancelled"]);
const AIRING = new Set(["Returning Series", "In Production", "Planned", "Pilot"]);

/**
 * The stored facts, or null when `raw` has never been enriched (no marker) —
 * the signal to fetch. A payload that HAS the marker but null fields (TMDB
 * knew nothing) still counts as present: it's a known "nothing", not a miss,
 * and it re-checks on the same weekly clock as an airing series.
 */
export function readSeriesFacts(raw: unknown): SeriesFactsPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const at = r[SERIES_FACTS_AT_KEY];
  if (typeof at !== "string") return null;
  return {
    status: typeof r.status === "string" ? r.status : null,
    number_of_seasons:
      typeof r.number_of_seasons === "number" && Number.isFinite(r.number_of_seasons)
        ? r.number_of_seasons
        : null,
    in_production: typeof r.in_production === "boolean" ? r.in_production : null,
    last_air_date: typeof r.last_air_date === "string" ? r.last_air_date : null,
    [SERIES_FACTS_AT_KEY]: at,
  };
}

/**
 * TMDB status → the pill's two states. "Ended"/"Canceled" → ended; the four
 * live statuses → airing; an unknown status with `in_production: true` →
 * airing (TMDB's boolean is the more reliable of the two). Anything else, or
 * fewer than one season, → null (render nothing — "En emisión · 0
 * temporadas" would be noise for a Planned title).
 */
export function seriesStatusFromFacts(facts: SeriesFacts | null): SeriesStatus | null {
  if (!facts) return null;
  const seasons = facts.number_of_seasons;
  if (seasons === null || !Number.isInteger(seasons) || seasons < 1) return null;
  const status = facts.status ?? "";
  if (ENDED.has(status)) return { kind: "ended", seasons };
  if (AIRING.has(status) || facts.in_production === true) {
    return { kind: "airing", seasons };
  }
  return null;
}

/** Stored facts need a refresh: never for an ended series, weekly otherwise. */
export function seriesFactsAreStale(
  facts: SeriesFactsPatch,
  now: number = Date.now(),
): boolean {
  if (seriesStatusFromFacts(facts)?.kind === "ended") return false;
  const at = Date.parse(facts[SERIES_FACTS_AT_KEY]);
  if (!Number.isFinite(at)) return true;
  return now - at > SERIES_FACTS_TTL_MS;
}

/** "Terminada · 1 temporada" / "En emisión · 3 temporadas". */
export function seriesStatusLabel(status: SeriesStatus): string {
  const head = status.kind === "ended" ? "Terminada" : "En emisión";
  const unit = status.seasons === 1 ? "temporada" : "temporadas";
  return `${head} · ${status.seasons} ${unit}`;
}
