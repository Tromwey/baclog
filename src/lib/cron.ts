import { redactedError } from "@/authz/safe-log";
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";

/**
 * What every cron route (`src/app/api/cron/**`) shares: the bearer check, a
 * wall-clock budget, and the claim → send → release sequence that makes a
 * send idempotent AND retryable.
 */

/**
 * `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends), compared in
 * constant time. Both sides are hashed first so the comparison never leaks
 * the secret's length and `timingSafeEqual` always gets equal-sized buffers.
 * `env.CRON_SECRET` throws when unset, so a missing secret can never match
 * the literal string "Bearer undefined".
 */
export function isAuthorizedCron(request: Request): boolean {
  const expected = `Bearer ${env.CRON_SECRET}`;
  const given = request.headers.get("authorization") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * A wall-clock budget for a run. The platform kills the function at
 * `maxDuration` with no response and no log line; a run that checks
 * `exhausted()` before each unit of work stops EARLY instead, answers with
 * what it did, and leaves the rest unclaimed for the next run.
 *
 * `reserveMs` is what must stay free for the unit already in flight (one
 * provider round-trip + one email) plus the response.
 */
export interface CronBudget {
  exhausted(): boolean;
  elapsedMs(): number;
}

export function cronBudget(maxDurationSeconds: number, reserveMs = 15_000): CronBudget {
  const startedAt = Date.now();
  const deadline = startedAt + maxDurationSeconds * 1000 - reserveMs;
  return {
    exhausted: () => Date.now() >= deadline,
    elapsedMs: () => Date.now() - startedAt,
  };
}

/**
 * A claim with no email behind it (`email_sent_at IS NULL`) older than this
 * is ABANDONED, not held: the run that took it died between the claim and the
 * send (killed at maxDuration, a crash), or failed and could not release it.
 * It counts as pending again and the next run takes it over. Far above the
 * 60 s a live run can hold a claim, so an overlapping run is never robbed.
 * Compared with the DB clock on both sides (`created_at` is `defaultNow()`).
 * Shared by both crons (`release_notice`, `recap_send`).
 *
 * The one cost: an email that DID go out but whose stamp failed
 * (`stampFailed`) is indistinguishable from an abandoned claim and is mailed
 * again on the next run. "Twice" over "never" — the same trade the release
 * of a failed claim already makes; it needs the DB to fail between two
 * consecutive statements, and the run answers 500 when it happens.
 */
export const STALE_CLAIM = sql`now() - interval '15 minutes'`;

export type DeliverOutcome = "sent" | "nothing" | "already";

/**
 * Claim → send → release-on-failure, the one sequence behind every
 * "tell this user exactly once" job.
 *
 * - `claim` is the atomic INSERT … ON CONFLICT … RETURNING. `null` = someone
 *   else holds it → `"already"`, nothing is sent.
 * - `send` does the work. It answers `"nothing"` when there was nothing to
 *   say (the claim STAYS: that answer is final for this key).
 * - If `send` throws, the claim is RELEASED before the error propagates, so
 *   the next run retries this user. Without the release a provider hiccup
 *   leaves a row that says "handled" with nothing behind it — the user is
 *   never told, and nothing ever notices. Worst case flips from "never" to
 *   "twice".
 * - If the release itself fails, that is said out loud with the claim (the
 *   row has to be deleted by hand, or reclaimed by a staleness rule), and
 *   the ORIGINAL error is still the one thrown.
 */
export async function deliverOnce<C>(opts: {
  /** Log prefix + what the claim is about, e.g. "[cron/recap] user 123". */
  label: string;
  claim: () => Promise<C | null | undefined>;
  send: (claim: C) => Promise<"sent" | "nothing">;
  release: (claim: C) => Promise<unknown>;
}): Promise<DeliverOutcome> {
  const claim = await opts.claim();
  if (claim === null || claim === undefined) return "already";
  try {
    return await opts.send(claim);
  } catch (err) {
    try {
      await opts.release(claim);
    } catch (releaseErr) {
      console.error(
        `${opts.label}: the claim could NOT be released after a failed send — it will not be retried until the row is released:`,
        claim, redactedError(releaseErr));
    }
    throw err;
  }
}
