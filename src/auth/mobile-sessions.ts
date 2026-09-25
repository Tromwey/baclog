import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceTokens, mobileSessions, users } from "@/db/schema";
import { MIGRATION_0029_LIVE } from "@/auth/live-0029";
import { TOKEN_VERSION_LIVE, bumpTokenVersion } from "./user-row";

/**
 * Phase 4d — device sessions for the Kura iOS bearer (`mobile_session`).
 *
 * A sign-in (OTP, Apple, Google) creates one row per install and the bearer
 * carries its id as `sid`; the gate (`loadUserForBearer`) re-reads it in the
 * same query as the user. Revoking one row kills exactly that install's
 * bearer (next request = the uniform 401) and deletes its APNs tokens.
 * `logoutEverywhere` is the 4b "cerrar sesión en todos lados" plus: every
 * session stamped revoked and every device token of the account deleted.
 *
 * Every function takes a `userId` that the caller derived from the bearer:
 * never a "use server" file, never a userId from the client. While
 * `MIGRATION_0029_LIVE` is false the writers are no-ops that say so
 * (`createMobileSession` → null = mint a token without `sid`).
 */

export interface DeviceInfo {
  platform: string;
  name: string;
  appVersion: string;
}

/** `last_seen_at` moves at most this often per session. */
export const SESSION_TOUCH_INTERVAL_MS = 10 * 60 * 1000;

/** Placeholder device for a pre-4d bearer upgraded by `auth/refresh`
 *  without a `device` body: it never told us what it was. */
export const LEGACY_DEVICE: DeviceInfo = {
  platform: "ios",
  name: "iPhone",
  appVersion: "desconocida",
};

/** New session row → its id (the `sid` claim), or null while the table is
 *  not live (the caller then mints a legacy, `sid`-less bearer). */
export async function createMobileSession(
  userId: string,
  device: DeviceInfo,
): Promise<string | null> {
  if (!MIGRATION_0029_LIVE) return null;
  const [row] = await db
    .insert(mobileSessions)
    .values({
      userId,
      platform: device.platform,
      deviceName: device.name,
      appVersion: device.appVersion,
    })
    .returning({ id: mobileSessions.id });
  return row.id;
}

/** `auth/refresh` with a `device` body: the app tells us its current name
 *  and version (an app update changes `appVersion`). Own row only. */
export async function updateMobileSessionDevice(
  userId: string,
  sessionId: string,
  device: DeviceInfo,
): Promise<void> {
  if (!MIGRATION_0029_LIVE) return;
  await db
    .update(mobileSessions)
    .set({
      platform: device.platform,
      deviceName: device.name,
      appVersion: device.appVersion,
    })
    .where(and(eq(mobileSessions.id, sessionId), eq(mobileSessions.userId, userId)));
}

/**
 * The throttled `last_seen_at` bump. The condition lives IN the UPDATE, so
 * concurrent requests of the same session write at most once per interval
 * whatever the caller believed; the gate only schedules it (via
 * `afterResponse`) when the value it just read is already stale, so a
 * normal request costs no write at all.
 */
export async function touchMobileSession(sessionId: string): Promise<void> {
  if (!MIGRATION_0029_LIVE) return;
  await db
    .update(mobileSessions)
    .set({ lastSeenAt: sql`now()` })
    .where(
      and(
        eq(mobileSessions.id, sessionId),
        isNull(mobileSessions.revokedAt),
        sql`${mobileSessions.lastSeenAt} < now() - interval '10 minutes'`,
      ),
    );
}

export interface MobileSessionRow {
  id: string;
  platform: string;
  deviceName: string;
  appVersion: string;
  createdAt: Date;
  lastSeenAt: Date;
}

/** The caller's live (non-revoked) sessions, most recently seen first. */
export async function listMobileSessions(userId: string): Promise<MobileSessionRow[]> {
  return db
    .select({
      id: mobileSessions.id,
      platform: mobileSessions.platform,
      deviceName: mobileSessions.deviceName,
      appVersion: mobileSessions.appVersion,
      createdAt: mobileSessions.createdAt,
      lastSeenAt: mobileSessions.lastSeenAt,
    })
    .from(mobileSessions)
    .where(and(eq(mobileSessions.userId, userId), isNull(mobileSessions.revokedAt)))
    .orderBy(desc(mobileSessions.lastSeenAt), desc(mobileSessions.createdAt));
}

/**
 * Revoke ONE of the caller's sessions (and delete its device tokens) in one
 * transaction. False when there was nothing live to revoke — another
 * account's id, an unknown id, an already-revoked one: the handler folds all
 * of them into the same 404. `sessionId` must be UUID-shaped (the handler
 * checks) — it is compared against a `uuid` column.
 */
export async function revokeMobileSession(userId: string, sessionId: string): Promise<boolean> {
  const [revoked] = await db.batch([
    db
      .update(mobileSessions)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(mobileSessions.id, sessionId),
          eq(mobileSessions.userId, userId),
          isNull(mobileSessions.revokedAt),
        ),
      )
      .returning({ id: mobileSessions.id }),
    db
      .delete(deviceTokens)
      .where(and(eq(deviceTokens.sessionId, sessionId), eq(deviceTokens.userId, userId))),
  ]);
  return revoked.length > 0;
}

/**
 * `POST /auth/logout` — "cerrar sesión en todos lados" (4b semantics, kept):
 * `token_version + 1` (every bearer, handoff and web cookie of the account
 * dies) AND, since 4d, every session stamped revoked and every APNs token of
 * the account deleted — a logged-out phone stops receiving pushes. One
 * transaction (`db.batch`), so a half-done logout can't leave tokens behind.
 */
export async function logoutEverywhere(userId: string): Promise<void> {
  const revokeSessions = db
    .update(mobileSessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(mobileSessions.userId, userId), isNull(mobileSessions.revokedAt)));
  const dropTokens = db.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
  if (!MIGRATION_0029_LIVE) {
    await bumpTokenVersion(userId);
    return;
  }
  if (!TOKEN_VERSION_LIVE) {
    await db.batch([revokeSessions, dropTokens]);
    return;
  }
  await db.batch([
    db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId)),
    revokeSessions,
    dropTokens,
  ]);
}
