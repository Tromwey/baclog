import { redactedError } from "@/authz/safe-log";
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { deviceTokens, mobileSessions } from "@/db/schema";
import { appleKeyConfig, signApnsProviderToken, type AppleKeyConfig } from "@/auth/apple-key";
import {
  isDeadToken,
  isProviderTokenError,
  sendApns,
  type ApnsDelivery,
  type PushMessage,
} from "./apns-transport";
import type { PushProvider } from "./devices";
import {
  fcmConfig,
  isDeadFcmToken,
  isFcmAuthError,
  mintFcmAccessToken,
  sendFcm,
  type FcmAccessToken,
  type FcmConfig,
  type FcmDelivery,
} from "./fcm-transport";
import { deviceTokenIsLive } from "./liveness";

export type { PushMessage } from "./apns-transport";

/**
 * Phase 4e — THE entry point for push notifications (AGENTS.md: external
 * effects go through one place), for BOTH providers: APNs (iOS) and, since
 * migration 0035, FCM HTTP v1 (Android). `pushToUsers` sends a message to
 * every registered device of each user whose install is still signed in
 * (`deviceTokenIsLive`: its session live and seen within the bearer
 * lifetime — an expired bearer deletes nothing, so without the gate a
 * signed-out phone kept getting the account's pushes), routes each token by
 * its `device_token.provider`, prunes the tokens Apple / Google say are dead,
 * and NEVER throws: callers (the release cron, the follow side effect —
 * both already after the response) must not fail because a phone is
 * unreachable. It returns counters for the caller's own log/response.
 *
 * Degrades without breaking, per provider: APNs without APPLE_TEAM_ID /
 * APPLE_KEY_ID / APPLE_PRIVATE_KEY, or FCM without FCM_SERVICE_ACCOUNT_JSON
 * → that provider's deliveries are logged and skipped (like the dev mailer
 * without RESEND_API_KEY).
 *
 * APNs provider token (ES256 JWT, `kid` + `iss`): minted once and reused
 * for ~50 min (Apple accepts it up to 60 and throttles re-minting more than
 * every 20); a 403 Expired/InvalidProviderToken drops the cache.
 * FCM access token (OAuth2 JWT-bearer grant of the service account, ~1 h):
 * reused until 5 min before it expires; a 401 from FCM drops the cache.
 */

const PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000;
let providerToken: { token: string; keyId: string; mintedAt: number } | null = null;

async function currentProviderToken(cfg: AppleKeyConfig): Promise<string> {
  const now = Date.now();
  if (
    providerToken &&
    providerToken.keyId === cfg.keyId &&
    now - providerToken.mintedAt < PROVIDER_TOKEN_TTL_MS
  ) {
    return providerToken.token;
  }
  const token = await signApnsProviderToken(cfg, Math.floor(now / 1000));
  providerToken = { token, keyId: cfg.keyId, mintedAt: now };
  return token;
}

const FCM_TOKEN_MARGIN_MS = 5 * 60 * 1000;
let fcmAccess: (FcmAccessToken & { clientEmail: string }) | null = null;

async function currentFcmAccessToken(cfg: FcmConfig): Promise<string> {
  const now = Date.now();
  if (fcmAccess && fcmAccess.clientEmail === cfg.clientEmail && now < fcmAccess.expiresAt - FCM_TOKEN_MARGIN_MS) {
    return fcmAccess.token;
  }
  const minted = await mintFcmAccessToken(cfg, now);
  fcmAccess = { ...minted, clientEmail: cfg.clientEmail };
  return minted.token;
}

export interface PushTarget {
  userId: string;
  message: PushMessage;
}

export interface PushOutcome {
  /** Deliveries Apple / Google accepted. */
  sent: number;
  /** Deliveries that failed for any other reason (logged). */
  failed: number;
  /** Dead tokens deleted (APNs 410 / BadDeviceToken / Unregistered, FCM
   *  404 / UNREGISTERED). */
  pruned: number;
  /** Why nothing was attempted, when nothing was: NO
   *  provider that could deliver is configured. A provider missing its keys
   *  while the other has them is logged, not reported here. */
  skipped: "not_configured" | null;
  /** Deliveries owed to a LIVE registered device that were not attempted
   *  because that device's provider has no credentials (APNs keys missing
   *  while FCM works, or the other way round). Not `failed` — nothing was
   *  tried — but never invisible either: a batch that reports `sent: 0,
   *  failed: 0` must not be readable as "everyone was told". */
  undelivered: number;
}

/**
 * Which providers could deliver right now. THE one read of "is push
 * configured": `pushToUsers` and every caller that wants to skip work (or a
 * throttle claim) for a push that can't go out use this, so "APNs key
 * missing" can never be mistaken for "push is off" while FCM is configured.
 */
export function pushProviders(): { apns: AppleKeyConfig | null; fcm: FcmConfig | null } {
  return {
    apns: appleKeyConfig(),
    fcm: fcmConfig(),
  };
}

type RegisteredRow = Parameters<typeof deviceTokenIsLive>[0] & {
  token: string;
  userId: string;
  environment: "sandbox" | "production";
  provider: PushProvider;
};

export async function pushToUsers(targets: PushTarget[]): Promise<PushOutcome> {
  const outcome: PushOutcome = { sent: 0, failed: 0, pruned: 0, skipped: null, undelivered: 0 };
  if (targets.length === 0) return outcome;
  const { apns: apnsCfg, fcm: fcmCfg } = pushProviders();
  if (!apnsCfg && !fcmCfg) {
    console.log(`[push] sin llaves de APNs ni de FCM: ${targets.length} aviso(s) no enviados (${targets.map((t) => t.message.data.type ?? "?").join(",")})`);
    return { ...outcome, skipped: "not_configured" };
  }

  try {
    const userIds = [...new Set(targets.map((t) => t.userId))];
    const registered: RegisteredRow[] = await db
      .select({
        token: deviceTokens.token,
        userId: deviceTokens.userId,
        environment: deviceTokens.environment,
        provider: deviceTokens.provider,
        sessionId: deviceTokens.sessionId,
        updatedAt: deviceTokens.updatedAt,
        joinedSessionId: mobileSessions.id,
        sessionRevokedAt: mobileSessions.revokedAt,
        sessionLastSeenAt: mobileSessions.lastSeenAt,
      })
      .from(deviceTokens)
      .leftJoin(
        mobileSessions,
        and(
          eq(mobileSessions.id, deviceTokens.sessionId),
          eq(mobileSessions.userId, deviceTokens.userId),
        ),
      )
      .where(inArray(deviceTokens.userId, userIds));
    // Signed-out installs (bearer expired, session revoked) never get a push;
    // the daily cron deletes those rows (`pruneStaleDeviceTokens`).
    const now = Date.now();
    const rows = registered.filter((r) => deviceTokenIsLive(r, now));
    const apnsDeliveries: ApnsDelivery[] = [];
    const fcmDeliveries: FcmDelivery[] = [];
    for (const t of targets) {
      for (const r of rows) {
        if (r.userId !== t.userId) continue;
        if (r.provider === "fcm") fcmDeliveries.push({ token: r.token, message: t.message });
        else apnsDeliveries.push({ token: r.token, environment: r.environment, message: t.message });
      }
    }

    // The two providers are independent: one failing never stops the other.
    await Promise.all([
      deliverApns(apnsDeliveries, apnsCfg, outcome),
      deliverFcm(fcmDeliveries, fcmCfg, outcome),
    ]);
  } catch (err) {
    console.error("[push] envío falló:", redactedError(err));
    outcome.failed++;
  }
  return outcome;
}

/** Deletes a dead token row; a failed delete counts as a failure. APNs
 *  passes the environment it was refused in, so a token re-registered in
 *  the other environment meanwhile survives. */
async function pruneToken(
  token: string,
  outcome: PushOutcome,
  environment?: "sandbox" | "production",
): Promise<void> {
  try {
    await db
      .delete(deviceTokens)
      .where(
        environment
          ? and(eq(deviceTokens.token, token), eq(deviceTokens.environment, environment))
          : eq(deviceTokens.token, token),
      );
    outcome.pruned++;
  } catch (err) {
    console.error("[push] no se pudo borrar un token muerto:", redactedError(err));
    outcome.failed++;
  }
}

async function deliverApns(
  deliveries: ApnsDelivery[],
  cfg: AppleKeyConfig | null,
  outcome: PushOutcome,
): Promise<void> {
  if (deliveries.length === 0) return;
  if (!cfg) {
    console.error(`[push] sin APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY: ${deliveries.length} envío(s) APNs no enviados`);
    outcome.undelivered += deliveries.length;
    return;
  }
  try {
    const results = await sendApns(deliveries, await currentProviderToken(cfg));
    for (const r of results) {
      if (r.status === 200) {
        outcome.sent++;
        continue;
      }
      if (isDeadToken(r)) {
        await pruneToken(r.token, outcome, r.environment);
        continue;
      }
      if (isProviderTokenError(r)) providerToken = null;
      outcome.failed++;
      // The token prefix only: enough to correlate, not a usable token.
      console.error(`[push] APNs ${r.environment} ${r.status} ${r.reason ?? ""} token=${r.token.slice(0, 8)}…`);
    }
  } catch (err) {
    console.error("[push] envío APNs falló:", redactedError(err));
    outcome.failed += deliveries.length;
  }
}

async function deliverFcm(
  deliveries: FcmDelivery[],
  cfg: FcmConfig | null,
  outcome: PushOutcome,
): Promise<void> {
  if (deliveries.length === 0) return;
  if (!cfg) {
    console.error(`[push] sin FCM_SERVICE_ACCOUNT_JSON (o no se pudo leer): ${deliveries.length} envío(s) FCM no enviados`);
    outcome.undelivered += deliveries.length;
    return;
  }
  try {
    const results = await sendFcm(deliveries, cfg, await currentFcmAccessToken(cfg));
    for (const r of results) {
      if (r.status === 200) {
        outcome.sent++;
        continue;
      }
      if (isDeadFcmToken(r)) {
        await pruneToken(r.token, outcome);
        continue;
      }
      if (isFcmAuthError(r)) fcmAccess = null;
      outcome.failed++;
      console.error(`[push] FCM ${r.status} ${r.errorCode ?? ""} token=${r.token.slice(0, 8)}…`);
    }
  } catch (err) {
    // Minting the access token failed (bad key, Google down): nothing sent.
    fcmAccess = null;
    console.error("[push] envío FCM falló:", redactedError(err));
    outcome.failed += deliveries.length;
  }
}

export function pushToUser(userId: string, message: PushMessage): Promise<PushOutcome> {
  return pushToUsers([{ userId, message }]);
}
