/**
 * Guardrail for the series status pill mapping (Revamp UI 06c/06d). Run:
 * `pnpm tsx scripts/check-series-status.ts` — exits 1 on the first failed
 * expectation. Pure module, no DB, no network.
 */
import assert from "node:assert/strict";
import {
  SERIES_FACTS_AT_KEY,
  SERIES_FACTS_TTL_MS,
  readSeriesFacts,
  seriesFactsAreStale,
  seriesStatusFromFacts,
  seriesStatusLabel,
} from "../src/modules/catalog/series-status";

const facts = (
  status: string | null,
  seasons: number | null,
  inProduction: boolean | null = null,
) => ({ status, number_of_seasons: seasons, in_production: inProduction, last_air_date: null });

// --- TMDB status → kind
assert.deepEqual(seriesStatusFromFacts(facts("Ended", 1)), { kind: "ended", seasons: 1 });
assert.deepEqual(seriesStatusFromFacts(facts("Canceled", 2)), { kind: "ended", seasons: 2 });
assert.deepEqual(seriesStatusFromFacts(facts("Returning Series", 3)), { kind: "airing", seasons: 3 });
assert.deepEqual(seriesStatusFromFacts(facts("In Production", 1)), { kind: "airing", seasons: 1 });
assert.deepEqual(seriesStatusFromFacts(facts("Planned", 1)), { kind: "airing", seasons: 1 });
assert.deepEqual(seriesStatusFromFacts(facts("Pilot", 1)), { kind: "airing", seasons: 1 });
// unknown status: in_production decides, and only when true
assert.deepEqual(seriesStatusFromFacts(facts("Something New", 4, true)), { kind: "airing", seasons: 4 });
assert.equal(seriesStatusFromFacts(facts("Something New", 4, false)), null);
assert.equal(seriesStatusFromFacts(facts(null, 4)), null);
// Ended wins over a stale in_production flag
assert.deepEqual(seriesStatusFromFacts(facts("Ended", 5, true)), { kind: "ended", seasons: 5 });
// no seasons yet → nothing to say ("En emisión · 0 temporadas" is noise)
assert.equal(seriesStatusFromFacts(facts("Planned", 0)), null);
assert.equal(seriesStatusFromFacts(facts("Returning Series", null)), null);
assert.equal(seriesStatusFromFacts(null), null);

// --- copy
assert.equal(seriesStatusLabel({ kind: "ended", seasons: 1 }), "Terminada · 1 temporada");
assert.equal(seriesStatusLabel({ kind: "ended", seasons: 3 }), "Terminada · 3 temporadas");
assert.equal(seriesStatusLabel({ kind: "airing", seasons: 1 }), "En emisión · 1 temporada");
assert.equal(seriesStatusLabel({ kind: "airing", seasons: 2 }), "En emisión · 2 temporadas");

// --- reading raw: only an enriched payload (our marker) counts as present
assert.equal(readSeriesFacts(null), null);
assert.equal(readSeriesFacts({ id: 1, name: "Shōgun" }), null); // bare /search/tv hit
assert.equal(readSeriesFacts({ status: "Ended", number_of_seasons: 1 }), null); // no marker
const at = "2026-09-01T00:00:00.000Z";
assert.deepEqual(
  readSeriesFacts({ id: 1, status: "Ended", number_of_seasons: 1, [SERIES_FACTS_AT_KEY]: at }),
  { status: "Ended", number_of_seasons: 1, in_production: null, last_air_date: null, [SERIES_FACTS_AT_KEY]: at },
);

// --- staleness: ended never re-checks, airing does after the TTL
const now = Date.parse("2026-09-03T00:00:00.000Z");
const week = SERIES_FACTS_TTL_MS;
const stamped = (status: string, ageMs: number) => ({
  ...facts(status, 2),
  [SERIES_FACTS_AT_KEY]: new Date(now - ageMs).toISOString(),
});
assert.equal(seriesFactsAreStale(stamped("Ended", 10 * week), now), false);
assert.equal(seriesFactsAreStale(stamped("Returning Series", week - 1), now), false);
assert.equal(seriesFactsAreStale(stamped("Returning Series", week + 1), now), true);
// a known "nothing" (TMDB had no status) re-checks weekly too
assert.equal(seriesFactsAreStale({ ...facts(null, null), [SERIES_FACTS_AT_KEY]: at }, now), false);
assert.equal(
  seriesFactsAreStale({ ...facts(null, null), [SERIES_FACTS_AT_KEY]: new Date(now - week - 1).toISOString() }, now),
  true,
);
// a corrupt marker is stale, never a crash
assert.equal(seriesFactsAreStale({ ...facts("Returning Series", 1), [SERIES_FACTS_AT_KEY]: "garbage" }, now), true);

console.log("check-series-status: ok");
