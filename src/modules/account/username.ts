import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsEvents, users } from "@/db/schema";

/**
 * F2.17 username claim — shared by `claimUsernameAction` /
 * `checkUsernameAction` (web) and `PUT /me/username` /
 * `GET /me/username/check` (API). Same normalization, same regex, same
 * RESERVED set on every path, so a handle that is invalid on one surface is
 * invalid on all of them. Takes a `userId`: never a "use server" file.
 */

export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

// Handles that would shadow a real top-level route once clean public URLs
// (next.config.ts fallback rewrites) resolve baclog.app/{username}. Keep in
// sync with the app's top-level routes.
export const RESERVED = new Set([
  "admin", "api", "app", "baclog", "kura", "colecciones", "coleccion", "backlogs", "blocked", "descubrir", "item",
  "login", "onboarding", "para-ti", "perfil", "prototype", "search", "settings",
  "u", "verify", "www", "waitlist", "recap", "analytics", "cron", "marketing",
  // F3.10 nav destination + /creditos (public credits page, was missing here).
  "feed", "creditos",
  // Public aviso de privacidad (App Store privacy-policy URL).
  "privacidad",
]);

/** Trim, lowercase, and drop a leading `@` — the ONE normalization every
 *  handle goes through (claim, check, follow, `/people/{handle}`). */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/**
 * A handle as a PATH/lookup key: normalized and shape-checked (`USERNAME_RE`
 * only — RESERVED words simply never match a row). Null when malformed, so a
 * caller can answer the same 404 it gives a nonexistent handle: the shape is
 * public knowledge, but a distinct 400 would still tell a prober which
 * strings are worth trying. Shared by `modules/social/follow.ts` and the API's
 * `parseHandle` (`api/v1/_lib/http.ts`).
 */
export function parseHandleOrNull(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const normalized = normalizeUsername(raw);
  return USERNAME_RE.test(normalized) ? normalized : null;
}

/** Null when the handle can never be claimed (shape or reserved). */
export function validUsernameOrNull(raw: string): string | null {
  const normalized = normalizeUsername(raw);
  if (!USERNAME_RE.test(normalized) || RESERVED.has(normalized)) return null;
  return normalized;
}

export type UsernameStatus = "free" | "taken" | "invalid";

/**
 * Kura O1b "elige tu usuario" — the live "libre / ocupado" beside the field.
 * Read-only twin of `claimUsername`: no write. The caller's OWN current handle
 * reads as "free" so re-typing it never reads as taken (checked without a
 * query when `currentUsername` matches, and by owner id when it doesn't).
 * Enumeration note: this tells a signed-in user whether a handle exists,
 * which the public /{username} URL already reveals, so it leaks nothing new.
 */
export async function checkUsername(
  userId: string,
  currentUsername: string | null,
  raw: string,
): Promise<UsernameStatus> {
  const normalized = validUsernameOrNull(raw);
  if (!normalized) return "invalid";
  if (currentUsername === normalized) return "free";
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, normalized))
    .limit(1);
  if (!owner || owner.id === userId) return "free";
  return "taken";
}

export type ClaimUsernameResult =
  | { ok: true; username: string }
  | { ok: false; error: "invalid" | "taken" };

/**
 * F2.17 — claiming implies opting in to a public page (toggleable later via
 * `updateProfile({ isPublic })`). "Taken" is the unique index on
 * `users.username` saying so: the check-then-write race is settled by the
 * database, never by a prior SELECT.
 *
 * Fase 4b — a rename carries `analytics_event.target_username` forward
 * (old → new) in the SAME `db.batch` (Neon HTTP batch = one transaction,
 * mirrors `deleteAccount`'s scrub), so a handle released by a rename and
 * claimed later doesn't inherit the previous owner's visits, and the owner's
 * own history (Torre de Control) follows them. Two statements, and the ORDER
 * is the point:
 *   1. `update analytics_event … where lower(target_username) = (select
 *      lower(username) from "user" where id = $1 FOR UPDATE)` — the OLD
 *      handle is read INSIDE the transaction, under a row lock on the user.
 *      It has to run first: once (2) runs, the old value is gone from the
 *      row. The lock serialises two concurrent renames of the same account:
 *      the second waits, then re-reads the handle the first one committed
 *      (READ COMMITTED re-fetches a locked row), so A→B then B→C moves the
 *      events A→B→C instead of stranding them under B (the race the old
 *      read-before-the-batch version had).
 *   2. `update "user" set username = <new>` — if it loses the race for the
 *      handle (`unique_violation`, 23505) the whole transaction rolls back
 *      and (1) never lands: no separate guard needed.
 * No handle yet (`username` null) → `= (null)` is false, (1) touches nothing.
 * Re-claiming the same handle → (1) skips rows already under it.
 */
export async function claimUsername(
  userId: string,
  raw: string,
): Promise<ClaimUsernameResult> {
  const normalized = validUsernameOrNull(raw);
  if (!normalized) return { ok: false, error: "invalid" };

  // `users.username` is only ever stored lowercase (this same normalization,
  // on the way in), but `lower()` keeps the comparison honest the same way
  // `deleteAccount`'s scrub does.
  const previousLocked = sql`(select lower(${users.username}) from ${users} where ${users.id} = ${userId} for update)`;

  try {
    await db.batch([
      db
        .update(analyticsEvents)
        .set({ targetUsername: normalized })
        .where(
          sql`lower(${analyticsEvents.targetUsername}) = ${previousLocked} and lower(${analyticsEvents.targetUsername}) <> ${normalized}`,
        ),
      db
        .update(users)
        .set({ username: normalized, isPublic: true })
        .where(eq(users.id, userId)),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: "taken" };
    throw err;
  }
  return { ok: true, username: normalized };
}

/**
 * Postgres `unique_violation` (23505), whether the driver error is thrown
 * bare (Neon HTTP) or wrapped by Drizzle (`DrizzleQueryError.cause`). Any
 * OTHER failure is rethrown — a network blip must not read as "taken".
 */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur && typeof cur === "object" && depth < 4; depth++) {
    if ((cur as { code?: unknown }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
