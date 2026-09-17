/**
 * Guardrail for the first-run coach marks (first-run-coach.ts). Run:
 * `pnpm tsx scripts/check-first-run.ts` — exits 1 on the first failed
 * expectation. Pure module, no DB, no network.
 *
 * The bug this guards: onboarding v2 plants a backlog + 3 obsessed titles, so
 * any gate that reads "the user hasn't done X yet" must still be TRUE for a
 * brand-new account — v1's step meter wasn't, and silently never rendered.
 */
import assert from "node:assert/strict";
import {
  ONBOARDING_PICKS,
  firstRunCoach,
  type FirstRunCounts,
} from "../src/modules/backlog/first-run-coach";

const counts = (
  items: number,
  loved: number,
  completed = 0,
  judged = completed,
): FirstRunCounts => ({ items, loved, completed, judged });

// Mirrors picksSchema `.max(3)` in onboarding-actions.ts.
assert.equal(ONBOARDING_PICKS, 3);

// --- A brand-new v2 account (3 picks, all obsessed, nothing judged) sees ALL three.
assert.deepEqual(firstRunCoach(counts(3, 3)), { shelves: true, grid: true, item: true });

// --- Moment 1 lifts on the first add beyond the picks…
assert.equal(firstRunCoach(counts(4, 3)).shelves, false);
// …or on the first judgement, even with the same three titles.
assert.equal(firstRunCoach(counts(3, 3, 0, 1)).shelves, false);
// A removed pick keeps it (still "just the picks").
assert.equal(firstRunCoach(counts(2, 2)).shelves, true);
// An un-obsessed pick is no longer "what you started with" — lifts.
assert.equal(firstRunCoach(counts(3, 2)).shelves, false);
// An old ≤3-title account whose titles aren't all loved never sees it.
assert.equal(firstRunCoach(counts(1, 0)).shelves, false);
// An empty library has nothing to explain — the note would lie ("empezaste con…").
assert.equal(firstRunCoach(counts(0, 0)).shelves, false);

// --- Moment 2 (glyph legend) only cares about completions.
assert.equal(firstRunCoach(counts(3, 3, 0, 1)).grid, true); // liked one, completed none
assert.equal(firstRunCoach(counts(3, 3, 1)).grid, false);
assert.equal(firstRunCoach(counts(0, 0)).grid, true); // caller adds hasItems

// --- Moment 3 (reaction row) lifts on ANY judgement: verdict OR completion…
assert.equal(firstRunCoach(counts(3, 3, 0, 1)).item, false);
assert.equal(firstRunCoach(counts(3, 3, 1)).item, false);
// …but NOT on obsession alone — v2 plants it, so it proves nothing.
assert.equal(firstRunCoach(counts(10, 10)).item, true);

// --- After the first completion an account is fully past the tutorial.
assert.deepEqual(firstRunCoach(counts(3, 3, 1)), { shelves: false, grid: false, item: false });

console.log("check-first-run: ok");
