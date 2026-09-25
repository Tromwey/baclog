import "server-only";
import { and, eq, gte, isNotNull, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceTokens, mobileSessions } from "@/db/schema";
import { MIGRATION_0029_LIVE } from "@/auth/live-0029";
import { DEVICE_TOKEN_LIVE_WINDOW_MS } from "./liveness";

/**
 * Phase 4e — APNs device tokens (`device_token`). Keyed by the token: iOS
 * gives the SAME token to whoever is signed in on that install, so a PUT
 * from another account MOVES the row to the caller (last writer wins) and
 * re-binds it to the caller's session. Every function takes the caller's id
 * from the bearer; nothing here trusts a userId from the client.
 */

/** An APNs device token as the app sends it: hex, 64..200 chars (today 64;
 *  Apple has said it may grow). Stored lowercase. */
export const APNS_TOKEN_RE = /^[0-9a-f]{64,200}$/i;

export function parseApnsToken(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && APNS_TOKEN_RE.test(raw) ? raw.toLowerCase() : null;
}

export type ApnsEnvironment = "sandbox" | "production";

/** Upsert: new row, or the existing token moved to this user/session/env. */
export async function registerDeviceToken(
  userId: string,
  sessionId: string | null,
  token: string,
  environment: ApnsEnvironment,
): Promise<void> {
  await db
    .insert(deviceTokens)
    .values({ token, userId, sessionId, environment })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: {
        userId,
        sessionId,
        environment,
        updatedAt: sql`now()`,
      },
    });
}

/** Idempotent; only ever deletes the caller's own row (another account's
 *  token — or an unknown one — is a silent no-op). */
export async function unregisterDeviceToken(userId: string, token: string): Promise<void> {
  await db
    .delete(deviceTokens)
    .where(and(eq(deviceTokens.token, token), eq(deviceTokens.userId, userId)));
}

/**
 * Daily housekeeping (`/api/cron/release`, pass H): deletes every token
 * `deviceTokenIsLive` (`./liveness.ts`) would refuse — bound to a session
 * that is gone, revoked or unseen for the bearer lifetime, or session-less
 * and not re-registered within it. `pushToUsers` already skips those rows;
 * this keeps the table from growing with dead installs. Returns the number
 * deleted; throws on a DB error (the cron reports it, never swallows it).
 * No-op (0) while migration 0029 is not live.
 */
export async function pruneStaleDeviceTokens(now: Date = new Date()): Promise<number> {
  if (!MIGRATION_0029_LIVE) return 0;
  // Column-bound operators (not a raw Date in a sql`` template): the columns
  // are `timestamp` without zone (learning 2026-09-02-date-crudo-en-sql…).
  const cutoff = new Date(now.getTime() - DEVICE_TOKEN_LIVE_WINDOW_MS);
  const liveSession = db
    .select({ one: sql`1` })
    .from(mobileSessions)
    .where(
      and(
        eq(mobileSessions.id, deviceTokens.sessionId),
        eq(mobileSessions.userId, deviceTokens.userId),
        isNull(mobileSessions.revokedAt),
        gte(mobileSessions.lastSeenAt, cutoff),
      ),
    );
  const deleted = await db
    .delete(deviceTokens)
    .where(
      or(
        and(isNull(deviceTokens.sessionId), lt(deviceTokens.updatedAt, cutoff)),
        and(isNotNull(deviceTokens.sessionId), notExists(liveSession)),
      ),
    )
    .returning({ token: deviceTokens.token });
  return deleted.length;
}
