import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { decideAge, type BirthField } from "./age";
import { displayNameSchema } from "./profile";

/**
 * F2.1 step 3 + F2.2 minor gate — shared by `completeOnboardingAction` (web)
 * and `POST /me/onboarding` (API). Takes a `userId`: never a "use server"
 * file. Knows nothing about redirects: the web action sends the minor to
 * /blocked, the API answers 403 `underage`.
 */

export { MIN_AGE } from "./age";

/**
 * `name` is deliberately NOT validated here: an account that already has a
 * name (an older account passing the age gate late) completes with the birth
 * date alone, and its stored name may not meet today's rule (a name longer
 * than 50 from before the limit left it stuck — every client re-sends it).
 * The rule (`displayNameSchema`) is applied in `completeOnboarding`, where it
 * is known whether a name is needed at all.
 */
/** Longest `name` the body may carry (ronda 4). Far above the rule (50) so a
 *  legacy name re-sent by a client still parses and is ignored as described
 *  above; a string beyond it is refused before anything reads it. */
export const ONBOARDING_NAME_INPUT_MAX = 200;

/**
 * The body's SHAPE only. `birthDate` ("YYYY-MM-DD") is the contract;
 * `birthYear` is what installed builds (and, until the UI lane lands, the web
 * form) still send. Both optional here: which one is there, whether it is a
 * real day, in range, and how old it makes the caller is ONE decision with
 * `now` in hand — `decideAge` (age.ts, pure, tested) — taken in
 * `completeOnboarding`, so the range can't go stale in a warm instance the
 * way a `max(new Date().getFullYear())` evaluated at import did.
 */
export const onboardingSchema = z.object({
  name: z.string().max(ONBOARDING_NAME_INPUT_MAX).optional(),
  birthDate: z.string().max(10).optional(),
  birthYear: z.number().int().optional(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export type OnboardingResult =
  | { ok: true }
  | { ok: false; error: "underage" }
  /** No valid name was sent and the account has none: nothing was written. */
  | { ok: false; error: "name_required" }
  /** The birth date / year can't be used (missing, malformed, out of range,
   *  or a legacy year that can't tell 12 from 13): nothing was written.
   *  `message` is final copy for `fields[field]`. */
  | { ok: false; error: "invalid_birth"; field: BirthField; message: string };

/**
 * The age is EXACT (founder, 2026-10-01): `decideAge` computes it from the
 * full birth date against today's UTC date. Only the YEAR is stored
 * (`birth_year`, written and never read back out — F2.2); the date is not
 * persisted and never reaches a log (the statements below bind the year).
 *
 * Under MIN_AGE: mark blocked and bail — the `isMinor` flag makes
 * `loadUserById` (cookie AND bearer) return null everywhere, an effective,
 * permanent sign-out, and prevents re-onboarding with a different date.
 *
 * The name, in ONE statement (no read-then-write):
 *   - a VALID name was sent → it is written, as always;
 *   - none, or one that fails `displayNameSchema` → the stored name is kept,
 *     untouched and un-revalidated, and the year is recorded — but ONLY if
 *     the row already has a name (`name IS NOT NULL` in the WHERE). A brand
 *     new account can't skip the name: zero rows → `name_required`, and
 *     nothing (not even the year) is written.
 */
export async function completeOnboarding(
  userId: string,
  input: OnboardingInput,
  now: Date = new Date(),
): Promise<OnboardingResult> {
  const age = decideAge(input, now);
  if (age.kind === "invalid") {
    return { ok: false, error: "invalid_birth", field: age.field, message: age.message };
  }
  const birthYear = age.birthYear;
  if (age.kind === "underage") {
    await db
      .update(users)
      .set({ isMinor: true, birthYear })
      .where(eq(users.id, userId));
    return { ok: false, error: "underage" };
  }
  const parsedName = displayNameSchema.safeParse(input.name);
  const name = parsedName.success ? parsedName.data : null;
  const written = await db
    .update(users)
    .set({
      ...(name !== null ? { name } : {}),
      birthYear,
      isMinor: false,
      // The handle claimed BEFORE this call (the apps' order) was reserved
      // without publishing the profile (`claimUsername` waits for the age
      // gate): publish it now, once, in the statement that records the birth
      // year. `birth_year IS NULL AND name IS NULL` are the row's OLD values
      // (= a first onboarding), so re-submitting it — or an older account
      // that has a name but no birth year passing the gate late — never
      // re-publishes a profile its owner made private.
      isPublic: sql`case when ${users.birthYear} is null and ${users.name} is null and ${users.username} is not null then true else ${users.isPublic} end`,
    })
    .where(and(eq(users.id, userId), name === null ? isNotNull(users.name) : undefined))
    .returning({ id: users.id });
  if (written.length === 0) return { ok: false, error: "name_required" };
  return { ok: true };
}
