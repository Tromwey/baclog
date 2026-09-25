import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { mobileSessions, users } from "@/db/schema";
import { MIGRATION_0029_LIVE } from "@/auth/live-0029";

/**
 * The per-request user row, by id — the ONE field list both the cookie
 * session (`session.ts`) and the bearer gate (`src/authz/api.ts`) read.
 * Explicit and MUST NOT include birthYear (F2.2: never displayed, never
 * serialized — defense in depth). A deleted account (row gone) or blocked
 * minor resolves to null: the JWT (cookie OR mobile bearer) may still exist,
 * but this read is the revocation check.
 *
 * Lives apart from `session.ts` (which imports the Auth.js config) so the
 * Auth.js `authorize` callback — via `src/authz/handoff.ts` — can load a user
 * without an import cycle through `config.ts`.
 */
const USER_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  username: users.username,
  // F3.11 — the viewer's own photo URL (null = ADN orb).
  image: users.image,
  isPublic: users.isPublic,
  notifyReleases: users.notifyReleases,
  // Phase 4b — the recap email's opt-out: an own preference (Ajustes, `Me`),
  // never on `Person` or any cross-user read.
  notifyRecap: users.notifyRecap,
  // Phase 4e — the "@x te sigue" push opt-out: an own preference (`Me`),
  // never on `Person`. Raw SQL behind the 0029 switch: the column is
  // commented out in schema.ts until the migration is applied (declaring it
  // early breaks every `insert(users)`); before that it reads as its default.
  notifyFollowers: MIGRATION_0029_LIVE
    ? sql<boolean>`"user"."notify_followers"`
    : sql<boolean>`true`,
  preferredService: users.preferredService,
  isMinor: users.isMinor,
  isFounder: users.isFounder,
  founderRank: users.founderRank,
  isAdmin: users.isAdmin,
  // Feature announcements (modules/announcements.ts). Rides along on the
  // per-request user read the JWT-session deviation already pays for, so
  // eligibility costs no extra query anywhere in the app.
  announcementSeen: users.announcementSeen,
  createdAt: users.createdAt,
};

export async function loadUserById(id: string) {
  const [user] = await db.select(USER_COLUMNS).from(users).where(eq(users.id, id)).limit(1);
  if (!user || user.isMinor) return null;
  return user;
}

export type UserRow = NonNullable<Awaited<ReturnType<typeof loadUserById>>>;

/**
 * Phase 4b kill-switch — LIVE since 2026-09-24, when migration
 * 0027_user_token_version_notify_recap reached the shared Neon DB (local =
 * beta = prod). While true, `auth/logout` bumps `token_version` and every
 * bearer AND web cookie carrying an older `tv` is refused: revocation is
 * active. Kept as a documented kill-switch, not a transitional flag: flipping
 * it to false restores the pre-4b behaviour (every `tv` reads 0 against 0,
 * logout revokes nothing) with a code deploy and NO schema change — only
 * reach for it if the column read itself breaks sign-in. Never set it true
 * on a DB without the column (every sign-in would 42703);
 * `scripts/api-smoke.ts` (W2's precondition) checks both halves agree.
 */
export const TOKEN_VERSION_LIVE = true;

/** Raw (not `users.tokenVersion`, which `schema.ts` declares since 0027):
 *  harmless, and it keeps this file independent of the schema line, which is
 *  what let the switch ship before the migration. */
const TOKEN_VERSION = sql<number>`"user"."token_version"`.mapWith(Number);

/**
 * `loadUserById` + `users.token_version`, in the SAME single query — for the
 * bearer gate, the web handoff AND the cookie session (`getCurrentUser`, which
 * compares the cookie's `tv`; phase 4b, "cerrar sesión en todos lados"). The
 * version travels BESIDE the user, never on it: `CurrentUser` (and so `Me`,
 * every web prop, every module) stays exactly the field list above.
 */
export async function loadUserWithTokenVersion(
  id: string,
): Promise<{ user: UserRow; tokenVersion: number } | null> {
  if (!TOKEN_VERSION_LIVE) {
    const user = await loadUserById(id);
    return user ? { user, tokenVersion: 0 } : null;
  }
  const [row] = await db
    .select({ ...USER_COLUMNS, tokenVersion: TOKEN_VERSION })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row || row.isMinor) return null;
  const { tokenVersion, ...user } = row;
  return { user, tokenVersion };
}

/**
 * Just the account's current `token_version` (0 while the switch is off, or
 * when the row is gone) — for the web OTP sign-in, which already holds the
 * user from `verifyOtp` and only needs the version to stamp on the new
 * cookie (`tv`, src/auth/config.ts). Deliberately ignores `isMinor`: that
 * gate belongs to the per-request read (`getCurrentUser`), not to minting.
 */
export async function readTokenVersion(id: string): Promise<number> {
  if (!TOKEN_VERSION_LIVE) return 0;
  const [row] = await db
    .select({ tokenVersion: TOKEN_VERSION })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row?.tokenVersion ?? 0;
}

/** `auth/logout`: ONE atomic `token_version + 1` for the account. False when
 *  the switch is off (nothing was bumped — the pre-4b no-op). */
export async function bumpTokenVersion(id: string): Promise<boolean> {
  if (!TOKEN_VERSION_LIVE) return false;
  await db.execute(
    sql`update "user" set "token_version" = "token_version" + 1 where "id" = ${id}`,
  );
  return true;
}

/**
 * The bearer gate's ONE query (phase 4d): `loadUserWithTokenVersion` plus the
 * token's device session, LEFT JOINed on `(mobile_session.id = sid AND
 * mobile_session.user_id = user.id)` — so a session of ANOTHER account never
 * joins — in the SAME round trip as the user row and its `token_version`
 * (no second query per request).
 *
 * `sessionOk`: true when the token carries no `sid` (a pre-4d bearer, valid
 * until its `exp` as before) or while `MIGRATION_0029_LIVE` is false (the
 * table may not exist; the gate behaves as in 4b); otherwise the joined row
 * must exist and have no `revoked_at`. `sessionLastSeenAt` feeds the
 * throttled `last_seen_at` bump (null when there is nothing to bump).
 * `sid` must already be UUID-shaped (`verifyMobileToken` refuses anything
 * else): it is compared against a `uuid` column.
 */
export async function loadUserForBearer(
  id: string,
  sid: string | null,
): Promise<{
  user: UserRow;
  tokenVersion: number;
  sessionOk: boolean;
  sessionLastSeenAt: Date | null;
} | null> {
  if (!sid || !MIGRATION_0029_LIVE) {
    const row = await loadUserWithTokenVersion(id);
    return row ? { ...row, sessionOk: true, sessionLastSeenAt: null } : null;
  }
  const [row] = await db
    .select({
      ...USER_COLUMNS,
      tokenVersion: TOKEN_VERSION_LIVE ? TOKEN_VERSION : sql<number>`0`.mapWith(Number),
      sessionId: mobileSessions.id,
      sessionRevokedAt: mobileSessions.revokedAt,
      sessionLastSeenAt: mobileSessions.lastSeenAt,
    })
    .from(users)
    .leftJoin(
      mobileSessions,
      and(eq(mobileSessions.id, sid), eq(mobileSessions.userId, users.id)),
    )
    .where(eq(users.id, id))
    .limit(1);
  if (!row || row.isMinor) return null;
  const { tokenVersion, sessionId, sessionRevokedAt, sessionLastSeenAt, ...user } = row;
  const sessionOk = sessionId !== null && sessionRevokedAt === null;
  return {
    user,
    tokenVersion,
    sessionOk,
    sessionLastSeenAt: sessionOk ? sessionLastSeenAt : null,
  };
}
