import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceTokens } from "@/db/schema";

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
