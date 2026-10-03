import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The time budget of ONE TIDAL step, carried in async context so every
 * upstream call made on the step's behalf (catalog, playlist writes and the
 * token refresh in tidal-auth.ts) is capped by it without threading a
 * deadline through each signature.
 *
 * Why: iOS and Android cut the step request at 20 s and do not retry it, so
 * a step has to ANSWER well before that — with whatever part of the batch it
 * got through (the rest stays `pending` and the client's next step takes
 * it). Outside a step (connect, callback, `start`) there is no deadline and
 * calls keep their own timeout.
 */

/** Whole step: nothing upstream starts, or keeps waiting, past this. */
export const STEP_BUDGET_MS = 12_000;
/** Matching (ISRC lookup + searches) stops here; the rest is for the writes
 *  (create + add, and the song-by-song resend when an add 404s). */
export const STEP_MATCH_BUDGET_MS = 7_000;

/** Inside a step: an upstream call timed out, or wasn't started because the budget ran out. */
export class StepBudgetError extends Error {
  constructor(what: string) {
    super(`tidal ${what}: timed out inside the step budget`);
    this.name = "StepBudgetError";
  }
}

const store = new AsyncLocalStorage<{ deadline: number }>();

/** Runs `fn` with `deadline` (epoch ms) as the budget of everything it awaits. */
export function withDeadline<T>(deadline: number, fn: () => Promise<T>): Promise<T> {
  return store.run({ deadline }, fn);
}

/** Milliseconds left in the current budget; `Infinity` when there is none. */
export function budgetLeftMs(): number {
  const ctx = store.getStore();
  return ctx ? ctx.deadline - Date.now() : Infinity;
}

/**
 * Waits for `shared` — work that runs under its OWN deadline and may be
 * awaited by several requests (the token refresh in tidal-auth.ts) — for at
 * most what is left of the CALLER's budget. Running out throws
 * `StepBudgetError` for this caller only; `shared` keeps going for the others.
 */
export async function withinBudget<T>(what: string, shared: Promise<T>): Promise<T> {
  const left = budgetLeftMs();
  if (!Number.isFinite(left)) return shared;
  if (left <= 0) {
    shared.catch(() => {});
    throw new StepBudgetError(what);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      shared,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StepBudgetError(what)), left);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
