import http2 from "node:http2";
import { KURA_BUNDLE_ID } from "@/auth/apple-key";

/**
 * Phase 4e — the APNs wire, with no DB and no env: HTTP/2 (`node:http2`,
 * no dependency) to api.push.apple.com / api.sandbox.push.apple.com, one
 * connection per environment per batch, every request multiplexed on it.
 * `modules/push/apns.ts` owns tokens, config and pruning; this file only
 * talks to Apple (and scratch tests point `hosts` at a local h2c server).
 */

export type ApnsEnvironment = "sandbox" | "production";

export const APNS_HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

const REQUEST_TIMEOUT_MS = 10_000;

export interface PushMessage {
  /** Alert title (bold line). */
  title: string;
  /** Alert body; omitted = title-only alert. */
  body?: string;
  /** App-defined payload, sent under the top-level `kura` key. */
  data: Record<string, unknown>;
}

export interface ApnsDelivery {
  token: string;
  environment: ApnsEnvironment;
  message: PushMessage;
}

export interface ApnsResult {
  token: string;
  environment: ApnsEnvironment;
  /** HTTP status from Apple; 0 = never got one (timeout, connection error). */
  status: number;
  /** Apple's `reason` (e.g. "BadDeviceToken"), or a local one ("timeout"). */
  reason: string | null;
}

/** The JSON body Apple receives. */
export function apnsPayload(message: PushMessage): string {
  return JSON.stringify({
    aps: {
      alert: message.body ? { title: message.title, body: message.body } : { title: message.title },
      sound: "default",
    },
    kura: message.data,
  });
}

/** 410, or a token Apple says is not (or no longer) a device: delete it. */
export function isDeadToken(r: ApnsResult): boolean {
  return r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered";
}

/** The provider token itself was refused: mint a new one next time. */
export function isProviderTokenError(r: ApnsResult): boolean {
  return (
    r.status === 403 &&
    (r.reason === "ExpiredProviderToken" || r.reason === "InvalidProviderToken")
  );
}

function postOne(
  session: http2.ClientHttp2Session,
  delivery: ApnsDelivery,
  providerToken: string,
): Promise<ApnsResult> {
  const base = { token: delivery.token, environment: delivery.environment };
  return new Promise((resolve) => {
    let settled = false;
    const done = (status: number, reason: string | null) => {
      if (settled) return;
      settled = true;
      resolve({ ...base, status, reason });
    };
    let req: http2.ClientHttp2Stream;
    try {
      req = session.request({
        ":method": "POST",
        ":path": `/3/device/${delivery.token}`,
        authorization: `bearer ${providerToken}`,
        "apns-topic": KURA_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
    } catch (err) {
      done(0, err instanceof Error ? err.message : "request_failed");
      return;
    }
    let status = 0;
    const chunks: Buffer[] = [];
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      done(0, "timeout");
    });
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let reason: string | null = null;
      const text = Buffer.concat(chunks).toString("utf8");
      if (text) {
        try {
          const parsed = JSON.parse(text) as { reason?: unknown };
          if (typeof parsed.reason === "string") reason = parsed.reason;
        } catch {
          reason = text.slice(0, 100);
        }
      }
      done(status, reason);
    });
    req.on("error", (err) => done(0, err.message));
    req.end(apnsPayload(delivery.message));
  });
}

/**
 * Sends every delivery; never throws. One HTTP/2 connection per environment
 * present in the batch, closed at the end. A connection-level failure reads
 * as status 0 on each of its deliveries.
 */
export async function sendApns(
  deliveries: ApnsDelivery[],
  providerToken: string,
  hosts: Record<ApnsEnvironment, string> = APNS_HOSTS,
): Promise<ApnsResult[]> {
  const byEnv = new Map<ApnsEnvironment, ApnsDelivery[]>();
  for (const d of deliveries) {
    const list = byEnv.get(d.environment) ?? [];
    list.push(d);
    byEnv.set(d.environment, list);
  }
  const results: ApnsResult[] = [];
  for (const [environment, list] of byEnv) {
    let session: http2.ClientHttp2Session;
    try {
      session = http2.connect(hosts[environment]);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "connect_failed";
      for (const d of list) results.push({ token: d.token, environment, status: 0, reason });
      continue;
    }
    // Without a listener an http2 session error is an uncaught exception
    // that takes the whole function instance down. The streams report it.
    session.on("error", () => {});
    try {
      results.push(...(await Promise.all(list.map((d) => postOne(session, d, providerToken)))));
    } finally {
      session.close();
    }
  }
  return results;
}
