import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { deviceTokens } from "@/db/schema";
import { appleKeyConfig, signApnsProviderToken, type AppleKeyConfig } from "@/auth/apple-key";
import { MIGRATION_0029_LIVE } from "@/auth/live-0029";
import {
  isDeadToken,
  isProviderTokenError,
  sendApns,
  type ApnsDelivery,
  type PushMessage,
} from "./apns-transport";

export type { PushMessage } from "./apns-transport";

/**
 * Phase 4e — THE entry point for push notifications (AGENTS.md: external
 * effects go through one place). `pushToUsers` sends a message to every
 * registered device of each user, prunes the tokens Apple says are dead, and
 * NEVER throws: callers (the release cron, the follow side effect) must not
 * fail because a phone is unreachable. It returns counters for the caller's
 * own log/response.
 *
 * Degrades without breaking: migration 0029 not live, or APPLE_TEAM_ID /
 * APPLE_KEY_ID / APPLE_PRIVATE_KEY missing → a `[push] …` log line and a
 * no-op (like the dev mailer without RESEND_API_KEY).
 *
 * Provider token (ES256 JWT, `kid` + `iss`): minted once and reused for
 * ~50 min (Apple accepts it up to 60 and throttles re-minting more than
 * every 20); a 403 Expired/InvalidProviderToken drops the cache.
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

export interface PushTarget {
  userId: string;
  message: PushMessage;
}

export interface PushOutcome {
  /** Deliveries Apple accepted (200). */
  sent: number;
  /** Deliveries that failed for any other reason (logged). */
  failed: number;
  /** Dead tokens deleted (410 / BadDeviceToken / Unregistered). */
  pruned: number;
  /** Why nothing was attempted, when nothing was. */
  skipped: "not_live" | "not_configured" | null;
}

export async function pushToUsers(targets: PushTarget[]): Promise<PushOutcome> {
  const outcome: PushOutcome = { sent: 0, failed: 0, pruned: 0, skipped: null };
  if (targets.length === 0) return outcome;
  if (!MIGRATION_0029_LIVE) {
    console.log(`[push] migración 0029 sin aplicar: ${targets.length} aviso(s) no enviados`);
    return { ...outcome, skipped: "not_live" };
  }
  const cfg = appleKeyConfig();
  if (!cfg) {
    console.log(`[push] sin APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY: ${targets.length} aviso(s) no enviados (${targets.map((t) => t.message.data.type ?? "?").join(",")})`);
    return { ...outcome, skipped: "not_configured" };
  }

  try {
    const userIds = [...new Set(targets.map((t) => t.userId))];
    const rows = await db
      .select({
        token: deviceTokens.token,
        userId: deviceTokens.userId,
        environment: deviceTokens.environment,
      })
      .from(deviceTokens)
      .where(inArray(deviceTokens.userId, userIds));
    const deliveries: ApnsDelivery[] = [];
    for (const t of targets) {
      for (const r of rows) {
        if (r.userId === t.userId) {
          deliveries.push({ token: r.token, environment: r.environment, message: t.message });
        }
      }
    }
    if (deliveries.length === 0) return outcome;

    const results = await sendApns(deliveries, await currentProviderToken(cfg));
    for (const r of results) {
      if (r.status === 200) {
        outcome.sent++;
        continue;
      }
      if (isDeadToken(r)) {
        try {
          await db
            .delete(deviceTokens)
            .where(and(eq(deviceTokens.token, r.token), eq(deviceTokens.environment, r.environment)));
          outcome.pruned++;
        } catch (err) {
          console.error("[push] no se pudo borrar un token muerto:", err);
          outcome.failed++;
        }
        continue;
      }
      if (isProviderTokenError(r)) providerToken = null;
      outcome.failed++;
      // The token prefix only: enough to correlate, not a usable token.
      console.error(`[push] APNs ${r.environment} ${r.status} ${r.reason ?? ""} token=${r.token.slice(0, 8)}…`);
    }
  } catch (err) {
    console.error("[push] envío falló:", err);
    outcome.failed++;
  }
  return outcome;
}

export function pushToUser(userId: string, message: PushMessage): Promise<PushOutcome> {
  return pushToUsers([{ userId, message }]);
}
