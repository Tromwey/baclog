import { SignJWT, importPKCS8 } from "jose";
import { normalizeP8 } from "@/auth/apple-key";
import type { PushMessage } from "./apns-transport";

/**
 * Android push (2026-09-30) — the FCM HTTP v1 wire, with no DB and no
 * module state: service-account parsing, the OAuth2 access token (JWT
 * bearer grant, RS256 signed with the account's `private_key` — `jose`,
 * already a dependency; no Google SDK), the message body and the send.
 * `modules/push/apns.ts` (`pushToUsers`, THE entry point) owns tokens,
 * caching and pruning; this file only talks to Google, and every network
 * call takes an injectable `fetch` so a scratch test can point it at a fake.
 *
 * Reads `process.env` only through `fcmConfig(env)`. Never logs the key,
 * the access token or a full registration token.
 */

export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
export const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
export const FCM_BASE_URL = "https://fcm.googleapis.com";

const REQUEST_TIMEOUT_MS = 10_000;
/** Parallel sends per batch (HTTP v1 has no multicast; one POST per token). */
const SEND_CONCURRENCY = 8;

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  /** Normalized PKCS#8 PEM. */
  privateKeyPem: string;
  privateKeyId: string | null;
  tokenUri: string;
}

/**
 * The service account from `FCM_SERVICE_ACCOUNT_JSON` (the JSON Google
 * downloads), however it was pasted: surrounding single quotes dropped, a
 * JSON-string-encoded copy decoded, a `private_key` whose newlines arrived
 * as literal `\n` repaired. Null when
 * absent or missing `project_id` / `client_email` / a key-shaped
 * `private_key` — callers degrade to a logged no-op.
 */
export function fcmConfig(env: Record<string, string | undefined> = process.env): FcmConfig | null {
  let raw = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
    // Pasted as a JSON string of the JSON (`"{\"type\": …}"`): one more pass.
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const projectId = str("project_id");
  const clientEmail = str("client_email");
  const privateKeyPem = normalizeP8(typeof o.private_key === "string" ? o.private_key : "");
  if (!projectId || !clientEmail || !privateKeyPem) return null;
  return {
    projectId,
    clientEmail,
    privateKeyPem,
    privateKeyId: str("private_key_id") || null,
    tokenUri: str("token_uri") || GOOGLE_TOKEN_URI,
  };
}

export interface FcmAccessToken {
  token: string;
  /** Epoch ms at which Google stops accepting it. */
  expiresAt: number;
}

/**
 * OAuth2 JWT-bearer grant (RFC 7523) for the service account: assertion =
 * RS256 JWT { iss = sub = client_email, scope = firebase.messaging, aud =
 * token_uri, iat, exp = iat + 1 h }, exchanged at `token_uri` for an access
 * token (~1 h). Throws on any failure (the caller logs and counts it).
 */
export async function mintFcmAccessToken(
  cfg: FcmConfig,
  nowMs: number = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<FcmAccessToken> {
  const iat = Math.floor(nowMs / 1000);
  const key = await importPKCS8(cfg.privateKeyPem, "RS256");
  const header: { alg: "RS256"; typ: "JWT"; kid?: string } = { alg: "RS256", typ: "JWT" };
  if (cfg.privateKeyId) header.kid = cfg.privateKeyId;
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader(header)
    .setIssuer(cfg.clientEmail)
    .setSubject(cfg.clientEmail)
    .setAudience(cfg.tokenUri)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(key);
  const res = await fetchImpl(cfg.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Google's error body is `{ error, error_description }`: no secrets.
    throw new Error(`token OAuth de FCM: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("token OAuth de FCM: respuesta sin access_token");
  }
  const ttl = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
  return { token: body.access_token, expiresAt: nowMs + ttl * 1000 };
}

/** FCM `data` is a map<string, string>: strings travel as-is, anything
 *  else as JSON; null/undefined keys are dropped. */
export function fcmData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

/** The JSON body of `projects/{id}/messages:send`. `validateOnly` = FCM
 *  checks auth + payload + token without delivering (scratch checks). */
export function fcmRequestBody(token: string, message: PushMessage, validateOnly = false): string {
  return JSON.stringify({
    ...(validateOnly ? { validate_only: true } : {}),
    message: {
      token,
      notification: message.body ? { title: message.title, body: message.body } : { title: message.title },
      data: fcmData(message.data),
      android: { priority: "high" },
    },
  });
}

export interface FcmDelivery {
  token: string;
  message: PushMessage;
}

export interface FcmResult {
  token: string;
  /** HTTP status from FCM; 0 = never got one (timeout, network error). */
  status: number;
  /** `FcmError.errorCode` (e.g. "UNREGISTERED"), else the google.rpc
   *  `status` ("NOT_FOUND"), else a local reason ("timeout"). */
  errorCode: string | null;
}

/** 404, or FCM says the app instance is gone: delete the row. */
export function isDeadFcmToken(r: FcmResult): boolean {
  return r.status === 404 || r.errorCode === "UNREGISTERED";
}

/** The access token was refused: mint a new one next time. */
export function isFcmAuthError(r: FcmResult): boolean {
  return r.status === 401;
}

function errorCodeOf(text: string): string | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as {
      error?: { status?: unknown; details?: Array<{ "@type"?: unknown; errorCode?: unknown }> };
    };
    const detail = parsed.error?.details?.find(
      (d) => typeof d?.["@type"] === "string" && (d["@type"] as string).endsWith("google.firebase.fcm.v1.FcmError"),
    );
    if (typeof detail?.errorCode === "string") return detail.errorCode;
    if (typeof parsed.error?.status === "string") return parsed.error.status;
    return null;
  } catch {
    return text.slice(0, 100);
  }
}

async function postOne(
  delivery: FcmDelivery,
  url: string,
  accessToken: string,
  fetchImpl: typeof fetch,
  validateOnly: boolean,
): Promise<FcmResult> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: fcmRequestBody(delivery.token, delivery.message, validateOnly),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) {
      await res.body?.cancel();
      return { token: delivery.token, status: res.status, errorCode: null };
    }
    return { token: delivery.token, status: res.status, errorCode: errorCodeOf(await res.text()) };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      token: delivery.token,
      status: 0,
      errorCode: timedOut ? "timeout" : err instanceof Error ? err.message.slice(0, 100) : "request_failed",
    };
  }
}

/**
 * Sends every delivery (at most `SEND_CONCURRENCY` in flight); never throws —
 * a network failure reads as status 0 on its delivery.
 */
export async function sendFcm(
  deliveries: FcmDelivery[],
  cfg: Pick<FcmConfig, "projectId">,
  accessToken: string,
  opts: { fetchImpl?: typeof fetch; baseUrl?: string; validateOnly?: boolean } = {},
): Promise<FcmResult[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl ?? FCM_BASE_URL}/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`;
  const results: FcmResult[] = new Array(deliveries.length);
  let next = 0;
  const worker = async () => {
    while (next < deliveries.length) {
      const i = next++;
      results[i] = await postOne(deliveries[i], url, accessToken, fetchImpl, opts.validateOnly ?? false);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, deliveries.length) }, worker));
  return results;
}
