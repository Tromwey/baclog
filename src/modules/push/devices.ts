import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceTokens, mobileSessions } from "@/db/schema";
import { DEVICE_TOKEN_LIVE_WINDOW_MS } from "./liveness";

/**
 * Phase 4e — push device tokens (`device_token`): APNs (iOS) and, since
 * migration 0035, FCM registration tokens (Android). Keyed by the token: the
 * OS gives the SAME token to whoever is signed in on that install, so a PUT
 * from another account MOVES the row to the caller (last writer wins) and
 * re-binds it to the caller's session. Every function takes the caller's id
 * from the bearer; nothing here trusts a userId from the client.
 */

/** Who delivers to the token: Apple (APNs) or Firebase (FCM HTTP v1). */
export type PushProvider = "apns" | "fcm";

/** An APNs device token as the app sends it: hex, 64..200 chars (today 64;
 *  Apple has said it may grow). Stored lowercase. */
export const APNS_TOKEN_RE = /^[0-9a-f]{64,200}$/i;

/** An FCM registration token: opaque, case-sensitive, URL-safe
 *  (`[A-Za-z0-9_-]` plus `:` between the instance id and the rest; today
 *  ~150-170 chars, Google promises no length). Stored AS SENT. The ceiling
 *  keeps a path segment sane; the floor rejects obvious junk. */
export const FCM_TOKEN_RE = /^[A-Za-z0-9_:-]{32,1024}$/;

export function parseApnsToken(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && APNS_TOKEN_RE.test(raw) ? raw.toLowerCase() : null;
}

export function parseFcmToken(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && FCM_TOKEN_RE.test(raw) ? raw : null;
}

/** The path token parsed by the rule of its provider (the PUT body says
 *  which), or null. */
export function parseDeviceToken(
  raw: string | string[] | undefined,
  provider: PushProvider,
): string | null {
  return provider === "fcm" ? parseFcmToken(raw) : parseApnsToken(raw);
}

/**
 * Every stored form a path token could have, for the provider-less DELETE:
 * the APNs form (lowercased) and/or the FCM form (as sent). Empty = neither
 * shape → the route's 400.
 */
export function deviceTokenCandidates(raw: string | string[] | undefined): string[] {
  const forms = [parseApnsToken(raw), parseFcmToken(raw)].filter((t): t is string => t !== null);
  return [...new Set(forms)];
}

export type ApnsEnvironment = "sandbox" | "production";

/**
 * Upsert: new row, or the existing token moved to this user/session/env
 * (and provider). `environment` only means something for APNs; FCM rows
 * store "production" (the column is NOT NULL and nothing reads it for them).
 */
export async function registerDeviceToken(
  userId: string,
  sessionId: string | null,
  token: string,
  provider: PushProvider,
  environment: ApnsEnvironment,
): Promise<void> {
  const env: ApnsEnvironment = provider === "fcm" ? "production" : environment;
  await db
    .insert(deviceTokens)
    .values({ token, userId, sessionId, environment: env, provider })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId, sessionId, environment: env, provider, updatedAt: sql`now()` },
    });
}

/** Idempotent; only ever deletes the caller's own row (another account's
 *  token — or an unknown one — is a silent no-op). `tokens` = the stored
 *  forms the path token could have (`deviceTokenCandidates`). */
export async function unregisterDeviceToken(userId: string, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db
    .delete(deviceTokens)
    .where(and(inArray(deviceTokens.token, tokens), eq(deviceTokens.userId, userId)));
}

/**
 * Daily housekeeping (`/api/cron/release`, pass H): deletes every token
 * `deviceTokenIsLive` (`./liveness.ts`) would refuse — bound to a session
 * that is gone, revoked or unseen for the bearer lifetime, or session-less
 * and not re-registered within it. `pushToUsers` already skips those rows;
 * this keeps the table from growing with dead installs. Returns the number
 * deleted; throws on a DB error (the cron reports it, never swallows it).
 */
export async function pruneStaleDeviceTokens(now: Date = new Date()): Promise<number> {
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
