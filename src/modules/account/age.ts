/**
 * F2.2 — the 13+ gate's RULE, pure (no db, no `server-only`): tested with
 * `tsx --test` (age.test.ts) and applied by `completeOnboarding`.
 *
 * The gate takes the full birth DATE and computes the exact age against
 * "today" = the MOST ADVANCED calendar date on Earth (UTC+14, `latestToday`;
 * founder, 2026-10-01 ronda 7). `underage` blocks the account for good, so
 * it must never fire on someone who already turned 13 where they live; the
 * cost is that the gate opens up to 26 h early for zones behind UTC+14. Before, it compared YEARS
 * (`currentYear − birthYear < 13`), which let through anyone who turns 13
 * later this year — up to twelve months under age.
 *
 * Minimization: the date is an INPUT of the decision, nothing more. Only
 * `birthYear` leaves this module for storage (`user.birth_year`, the column
 * that already existed); the day and month are never persisted, returned or
 * logged — the messages below never echo what was sent.
 */

export const MIN_AGE = 13;
export const MIN_BIRTH_YEAR = 1900;

export type BirthField = "birthDate" | "birthYear";

export type AgeDecision =
  /** 13 or older: record `birthYear`. */
  | { kind: "ok"; birthYear: number }
  /** Certainly under 13: the `underage` path (blocks the account). */
  | { kind: "underage"; birthYear: number }
  /** Nothing may be written. `message` is final copy for `fields[field]`. */
  | { kind: "invalid"; field: BirthField; message: string };

export const BIRTH_DATE_REQUIRED = "Escribe tu fecha de nacimiento.";
export const BIRTH_DATE_INVALID = "Esa fecha no es válida.";
export const BIRTH_YEAR_INVALID = "Ese año no es válido.";
/** The legacy year-only body when the year alone can't tell 12 from 13. */
export const BIRTH_DATE_NEEDED =
  "Necesitamos tu fecha de nacimiento completa. Actualiza kura y vuelve a intentarlo.";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict `YYYY-MM-DD` naming a real calendar day (2023-02-29 is null). */
export function parseBirthDate(value: string): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  // `Date.UTC` rolls an impossible day over (Feb 30 → Mar 2): reject those.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** The most advanced timezone offset in use (Kiritimati, UTC+14). */
const LATEST_ZONE_MS = 14 * 60 * 60 * 1000;

/**
 * `now` shifted so its UTC date IS the calendar date at UTC+14 — the latest
 * "today" anyone on Earth is living. Every date decision below reads this.
 */
export function latestToday(now: Date): Date {
  return new Date(now.getTime() + LATEST_ZONE_MS);
}

/**
 * Whole years lived on `now`'s UTC date (`decideAge` passes `latestToday`). The birthday counts from its first
 * instant (born 2013-10-01 → 13 on 2026-10-01). Someone born on Feb 29 has
 * their birthday on Mar 1 in a non-leap year — the plain (month, day)
 * comparison, and the later of the two conventions: the gate never rounds
 * a twelve-year-old up.
 */
export function ageOn(birth: { year: number; month: number; day: number }, now: Date): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const hadBirthday = m > birth.month || (m === birth.month && d >= birth.day);
  return y - birth.year - (hadBirthday ? 0 : 1);
}

/**
 * The decision. `birthDate` wins when both are sent.
 *
 * `birthDate` ("YYYY-MM-DD"): a real day, year ≥ 1900, not after today (UTC+14)
 * → exact age; `< 13` is `underage`.
 *
 * `birthYear` alone (installed builds that predate the date field) — the year
 * difference `n = currentYear − birthYear` brackets the age in [n − 1, n]:
 *   n ≥ 14 → at least 13: ok, as before.
 *   n ≤ 12 → at most 12: `underage`, as before.
 *   n = 13 → 12 OR 13, the year can't tell: `invalid` on `birthYear` asking
 *            for the full date. NOT `underage` (that blocks the account for
 *            good, and half of these people are 13) and NOT ok (the other
 *            half are 12 — the hole this replaced). Nothing is written.
 */
export function decideAge(
  input: { birthDate?: string | null; birthYear?: number | null },
  now: Date,
): AgeDecision {
  const today = latestToday(now);
  const currentYear = today.getUTCFullYear();

  if (typeof input.birthDate === "string") {
    const birth = parseBirthDate(input.birthDate);
    if (!birth || birth.year < MIN_BIRTH_YEAR) {
      return { kind: "invalid", field: "birthDate", message: BIRTH_DATE_INVALID };
    }
    const age = ageOn(birth, today);
    // A date after today (UTC+14) is a negative age.
    if (age < 0) return { kind: "invalid", field: "birthDate", message: BIRTH_DATE_INVALID };
    return age < MIN_AGE
      ? { kind: "underage", birthYear: birth.year }
      : { kind: "ok", birthYear: birth.year };
  }

  const year = input.birthYear;
  if (year === null || year === undefined) {
    return { kind: "invalid", field: "birthDate", message: BIRTH_DATE_REQUIRED };
  }
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > currentYear) {
    return { kind: "invalid", field: "birthYear", message: BIRTH_YEAR_INVALID };
  }
  const n = currentYear - year;
  if (n > MIN_AGE) return { kind: "ok", birthYear: year };
  if (n < MIN_AGE) return { kind: "underage", birthYear: year };
  return { kind: "invalid", field: "birthYear", message: BIRTH_DATE_NEEDED };
}
