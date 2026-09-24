import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

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
 * Phase 4b switch. FALSE until drizzle/0027_user_token_version.sql is applied
 * to the shared Neon DB (local = beta = prod): while false the column is
 * never read, every token's `tv` reads as 0 against a version of 0 (= the
 * pre-4b behaviour: nothing is revocable) and `auth/logout` does not bump.
 * TODO(migración 0027): after `drizzle-kit migrate`, uncomment
 * `tokenVersion` in src/db/schema.ts and flip this to `true`.
 */
export const TOKEN_VERSION_LIVE = false;

/** Raw on purpose: it compiles whether or not `schema.ts` declares the
 *  column yet (see TOKEN_VERSION_LIVE). */
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
