import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { ZodError } from "zod";
import type { CurrentUser } from "@/auth/session";
import { loadUserForBearer } from "@/auth/user-row";
import { SESSION_TOUCH_INTERVAL_MS, touchMobileSession } from "@/auth/mobile-sessions";
import { afterResponse } from "@/lib/after-response";
import { apiContext } from "./api-context";
import { secretKey } from "./keys";
import { NotFoundError, UnauthorizedError } from "./errors";

export { apiContext } from "./api-context";

/**
 * /api/v1 — the bearer edge of the app-layer authz model (Kura iOS, ios/API.md).
 *
 * The web app is cookie + server actions; the native app has no cookies, so
 * every v1 request carries `Authorization: Bearer <JWT>`:
 *
 *   HS256 signed with AUTH_SECRET · sub = user.id · aud = "kura-ios"
 *   tv = users.token_version at mint · iat · exp = +30 days · jti random
 *   · sid = mobile_session.id (phase 4d; absent on pre-4d tokens).
 *
 * Revocation: every request re-reads the user row (`loadUserForBearer`,
 * the same field list the cookie session uses — never `birthYear` — plus the
 * version, in ONE query), so a deleted account or a blocked minor is a 401
 * on the next call even with a valid signature, AND a token whose `tv` is
 * not the row's current `token_version` is the same 401. `auth/logout`
 * bumps the version: "cerrar sesión en todos lados", account-level (it also
 * revokes every device session since 4d; revoking ONE device is
 * `DELETE /me/sessions/{id}`). Tokens minted before phase 4b carry no `tv` and read
 * as 0 — the column's default — so they live until the account's first
 * logout. `auth/refresh` only issues a new token inside the last 7 days
 * (otherwise it hands the same one back); a refresh never revokes the old
 * one — only its `exp`, a logout or revoking its session does.
 *
 * Phase 4d — per-device sessions: a bearer with `sid` is only valid while
 * its `mobile_session` row exists, belongs to `sub` and is not revoked,
 * checked in the SAME re-read (`loadUserForBearer` LEFT JOINs the row; no
 * second query). A bearer without `sid` (minted before 4d) stays valid until
 * its `exp` as before; `auth/refresh` upgrades it to one with `sid`. A `sid`
 * that is present but not a UUID is the uniform 401.
 *
 * The user comes from the token and ONLY the token. No handler ever accepts
 * a userId in a body, query or path. `withApi` runs the handler inside
 * `apiContext.run({ user })` so the existing `assertUser` /
 * `assertOwnsBacklog` / `assertOwnsUserItem` helpers — and every module that
 * calls `getCurrentUser()` — see the bearer user without touching a cookie
 * (see api-context.ts).
 *
 * Failures are deliberately uniform: every 401 is the same body, whatever
 * failed (missing header, bad signature, wrong audience, expired, unknown or
 * blocked user). A distinguishable 401 is an oracle.
 */

// ---------- error contract (ios/API.md §1) ----------

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "rate_limited"
  | "unsupported"
  | "unavailable"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  conflict: 409,
  rate_limited: 429,
  unsupported: 501,
  unavailable: 503,
  internal: 500,
};

/**
 * Default copy per code — final Spanish text in the Kura voice (what happened
 * and what to do; no wink, no exclamation). Handlers pass a more specific
 * message when they know more; the default is what the wrapper uses.
 */
export const API_MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: "Tu sesión no es válida. Entra de nuevo con tu correo.",
  forbidden: "Esta cuenta no puede hacer eso.",
  not_found: "No encontramos lo que buscas. Puede que ya no exista.",
  invalid: "Revisa los datos que enviaste.",
  conflict: "Eso ya no se puede hacer así. Vuelve a cargar e inténtalo otra vez.",
  rate_limited:
    "Demasiadas peticiones seguidas. Espera un momento e inténtalo de nuevo.",
  unsupported: "Esta versión de la app todavía no puede hacer eso.",
  unavailable:
    "El catálogo no responde en este momento. Inténtalo de nuevo en unos minutos.",
  internal: "Algo falló de nuestro lado. Inténtalo de nuevo en un momento.",
};

export interface ApiErrorExtra {
  /** Sub-code for a `forbidden`/`conflict` the app branches on
   *  ("underage" · "not_released", "reaction_required", "taken"). */
  reason?: string;
  /** `invalid` only: field → message. */
  fields?: Record<string, string>;
  /** `rate_limited` only. */
  retryAfterSeconds?: number;
  /** `conflict` + `linked_elsewhere` only (phase 4g): the ownership proof
   *  rides INSIDE the error envelope, next to `reason`. */
  mergeToken?: string;
  source?: unknown;
  /** HTTP status override — only 422, only for `invalid` + reason
   *  `invalid_proof` (phase 4g): a rejected ownership proof (provider token,
   *  merge code) on an AUTHENTICATED route. Not 401, which the app reads as
   *  "session dead" and signs out; not 400, which means "your body is
   *  malformed" (`fields`). */
  status?: 422;
}

/**
 * Throwable form of the contract: a handler (or a module wrapper) throws
 * `new ApiError("conflict", "…", { reason: "not_released" })` and `withApi`
 * turns it into the response. Keeps handler bodies linear.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly extra: ApiErrorExtra;
  constructor(code: ApiErrorCode, message?: string, extra: ApiErrorExtra = {}) {
    super(message ?? API_MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
    this.extra = extra;
  }
}

const NO_STORE = "private, no-store";

/** Stamps the one cache policy every v1 response carries. */
export function finalizeApiResponse(res: Response): Response {
  try {
    res.headers.set("Cache-Control", NO_STORE);
    return res;
  } catch {
    // Immutable headers (e.g. a Response built by a static helper): rebuild.
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", NO_STORE);
    return new Response(res.body, { status: res.status, headers });
  }
}

/** `{ error: { code, message, reason?, fields?, retryAfterSeconds?,
 *  mergeToken?, source? } }`. */
export function apiError(
  code: ApiErrorCode,
  message: string = API_MESSAGES[code],
  extra: ApiErrorExtra = {},
): Response {
  const body = {
    error: {
      code,
      message,
      ...(extra.reason ? { reason: extra.reason } : {}),
      ...(extra.fields ? { fields: extra.fields } : {}),
      ...(extra.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: extra.retryAfterSeconds }
        : {}),
      ...(extra.mergeToken ? { mergeToken: extra.mergeToken } : {}),
      ...(extra.source !== undefined ? { source: extra.source } : {}),
    },
  };
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": NO_STORE,
  });
  if (extra.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(Math.max(1, Math.ceil(extra.retryAfterSeconds))));
  }
  return new Response(JSON.stringify(body), { status: extra.status ?? STATUS[code], headers });
}

/** Maps anything a handler can throw onto the contract. Unknown → 500 + log. */
export function errorToResponse(err: unknown, meta?: RequestMeta): Response {
  if (err instanceof ApiError) return apiError(err.code, err.message, err.extra);
  if (err instanceof UnauthorizedError) return apiError("unauthorized");
  if (err instanceof NotFoundError) return apiError("not_found");
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      // A scalar at the root (a body that isn't an object) has no path.
      const key = issue.path.map(String).join(".") || "body";
      if (!(key in fields)) fields[key] = issue.message;
    }
    return apiError("invalid", API_MESSAGES.invalid, { fields });
  }
  // Anything else is a bug. The line carries what a log search needs to
  // find this request again (rid = the X-Request-Id the client saw), and
  // the user id so the founder can reach out — never the token.
  console.error(
    `[api/v1] 500 ${JSON.stringify({
      rid: meta?.rid ?? null,
      method: meta?.method ?? null,
      path: meta?.path ?? null,
      userId: meta?.userId ?? null,
    })}`,
    err,
  );
  return apiError("internal");
}

/** What `errorToResponse` logs beside a 500. */
export interface RequestMeta {
  rid: string;
  method: string;
  path: string;
  userId?: string | null;
}

// ---------- bearer tokens ----------

export const MOBILE_TOKEN_AUDIENCE = "kura-ios";
const MOBILE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** A fresh 30-day bearer for `userId` at the account's current
 *  `token_version` (new `jti` every call — refresh rotates it), bound to the
 *  device session `sessionId` when there is one (`sid`; null = a legacy,
 *  session-less bearer — only while migration 0029 is not live). */
export async function issueMobileToken(
  userId: string,
  tokenVersion: number,
  sessionId: string | null,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(sessionId ? { tv: tokenVersion, sid: sessionId } : { tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience(MOBILE_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + MOBILE_TOKEN_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(secretKey());
}

export interface MobileTokenClaims {
  sub: string;
  jti: string;
  /** Unix seconds. */
  exp: number;
  /** `users.token_version` the token was minted at. A pre-4b token has no
   *  `tv` claim and reads as 0 (the column default). */
  tv: number;
  /** `mobile_session.id` (phase 4d). Null = a pre-4d token. */
  sid: string | null;
}

const SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `auth/refresh` rotates only inside this window before `exp`; earlier it
 *  returns the same token (ios/API.md §2.1: the app refreshes when < 7 days
 *  remain — the server enforces the same line so a chatty client can't mint
 *  a fresh 30-day token on every launch). */
export const MOBILE_TOKEN_REFRESH_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/**
 * Signature + algorithm + audience + expiry, nothing else (the user row is
 * checked by the caller). Null on ANY failure — never says which.
 */
export async function verifyMobileToken(
  token: string,
): Promise<MobileTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: MOBILE_TOKEN_AUDIENCE,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.jti !== "string" || !payload.jti) return null;
    if (typeof payload.exp !== "number") return null;
    // Absent = a pre-4b token = version 0. Present but not a non-negative
    // integer = forged or broken: refused like any other bad claim.
    const tv = payload.tv === undefined ? 0 : payload.tv;
    if (typeof tv !== "number" || !Number.isInteger(tv) || tv < 0) return null;
    // Absent = a pre-4d token. Present but not a UUID string = refused (it
    // is compared against a uuid column; a malformed one must never reach
    // the query).
    const sid = payload.sid === undefined ? null : payload.sid;
    if (sid !== null && (typeof sid !== "string" || !SID_RE.test(sid))) return null;
    return { sub: payload.sub, jti: payload.jti, exp: payload.exp, tv, sid };
  } catch {
    return null;
  }
}

function bearerOf(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9\-_.]+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** The bearer as `withApi` hands it to a handler: the raw token (so
 *  `auth/refresh` can return the same one) and its verified claims. */
export interface ApiBearer {
  token: string;
  claims: MobileTokenClaims;
}

/**
 * Step 1 of the gate — signature, algorithm, audience, expiry, `tv` shape;
 * NO database.
 * Throws `UnauthorizedError` on any failure. Split from the user re-read so
 * the rate limiter can key on the verified `sub` BEFORE the first query: an
 * attacker with a real token can't turn the limiter's own lookup into load.
 */
export async function requireBearer(request: Request): Promise<ApiBearer> {
  const token = bearerOf(request);
  if (!token) throw new UnauthorizedError();
  const claims = await verifyMobileToken(token);
  if (!claims) throw new UnauthorizedError();
  return { token, claims };
}

/**
 * The v1 gate. Same `CurrentUser` as `requireUser()`; throws
 * `UnauthorizedError` (→ 401 via `withApi`) on any failure: no header, bad
 * signature, wrong `aud`, expired, user row gone, `isMinor`, or `tv` behind
 * the account's `token_version`.
 */
export async function requireApiUser(request: Request): Promise<CurrentUser> {
  const { claims } = await requireBearer(request);
  const user = await userForClaims(claims);
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Step 2 of the gate — the revocation re-read, ONE query: the row by `sub`
 * (gone or `isMinor` → null), its `token_version` equal to the token's `tv`
 * (behind → null: the account logged out after this token was minted) and,
 * when the token has a `sid`, its `mobile_session` row live and owned by
 * `sub` (revoked / another account's / gone → null). Null is the ONLY
 * failure signal; callers turn it into the uniform 401.
 *
 * A live session whose `last_seen_at` is older than the touch interval gets
 * its bump scheduled AFTER the response (`afterResponse`): no write on the
 * hot path, at most one per ~10 min per session.
 */
async function userForClaims(claims: MobileTokenClaims): Promise<CurrentUser | null> {
  const row = await loadUserForBearer(claims.sub, claims.sid);
  if (!row || row.tokenVersion !== claims.tv || !row.sessionOk) return null;
  const sid = claims.sid;
  if (
    sid &&
    row.sessionLastSeenAt &&
    Date.now() - row.sessionLastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS
  ) {
    afterResponse("api/v1 session touch", () => touchMobileSession(sid));
  }
  return row.user;
}

/**
 * Soft twin of `requireApiUser` for routes OUTSIDE v1 that serve both the web
 * (cookie) and the app (bearer) — today only `/api/avatar/[key]`. Returns the
 * bearer user or null (no header, bad token, unknown/blocked user): the
 * caller falls back to `getCurrentUser()` for the cookie. Same `tv` check as
 * `requireApiUser` — a logged-out bearer is no bearer here either. No rate limit and
 * no `apiContext` — it identifies, it does not wrap.
 */
export async function readApiUser(request: Request): Promise<CurrentUser | null> {
  const token = bearerOf(request);
  if (!token) return null;
  const claims = await verifyMobileToken(token);
  if (!claims) return null;
  return userForClaims(claims);
}

// ---------- rate limit ----------

/**
 * Sliding 60 s window, in-memory, PER INSTANCE. On Vercel each function
 * instance keeps its own Map, so the effective ceiling is limit × warm
 * instances and a cold start resets it — good enough to blunt a runaway
 * client or a script, NOT a global quota and NOT a security boundary (the
 * OTP flow has its own DB-backed cooldown + attempt cap in src/auth/otp.ts).
 * Replace with a shared store (Upstash / Postgres) if it ever needs to be
 * global. Keys: `u:<sub>` for bearer routes, `ip:<addr>` for auth/*.
 */
const RATE_WINDOW_MS = 60_000;
export const RATE_LIMIT_WRITES = 60;
export const RATE_LIMIT_READS = 300;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const hits = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < RATE_WINDOW_MS) return;
  lastSweep = now;
  for (const [key, stamps] of hits) {
    const live = stamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
}

/** Records one hit; returns how long to wait when over the limit. */
export function checkRateLimit(
  key: string,
  limit: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  sweep(now);
  const live = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (live.length >= limit) {
    const oldest = live[0];
    hits.set(key, live);
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000)),
    };
  }
  live.push(now);
  hits.set(key, live);
  return { ok: true };
}

/** First hop of `x-forwarded-for` (Vercel sets it), else `x-real-ip`. For
 *  rate-limit keys only — never for identity. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

function limitFor(method: string) {
  return WRITE_METHODS.has(method.toUpperCase()) ? RATE_LIMIT_WRITES : RATE_LIMIT_READS;
}

// ---------- handler wrappers ----------

/** Route params as Next hands them over, already awaited. */
export type ApiParams = Record<string, string | string[] | undefined>;

export interface ApiContext<P extends ApiParams = ApiParams> {
  user: CurrentUser;
  params: P;
  /** The verified bearer this request came in with. */
  bearer: ApiBearer;
  /** `X-Request-Id` of this response — for logs the app can quote back. */
  requestId: string;
}

export type ApiHandler<P extends ApiParams = ApiParams> = (
  request: NextRequest,
  ctx: ApiContext<P>,
) => Promise<Response>;

export type PublicApiHandler<P extends ApiParams = ApiParams> = (
  request: NextRequest,
  ctx: { params: P; requestId: string },
) => Promise<Response>;

type RouteHandler<P extends ApiParams> = (
  request: NextRequest,
  context: { params: Promise<P> },
) => Promise<Response>;

/** Every v1 response — success, error, 429 — carries the request id. */
function withRequestId(res: Response, rid: string): Response {
  try {
    res.headers.set("X-Request-Id", rid);
    return res;
  } catch {
    const headers = new Headers(res.headers);
    headers.set("X-Request-Id", rid);
    return new Response(res.body, { status: res.status, headers });
  }
}

function pathOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

/**
 * Bearer-gated wrapper — the ONLY way a v1 handler runs:
 *   1. `requireBearer` — signature/aud/exp, no DB (401 on any failure);
 *   2. rate limit by the verified `sub` (429 with `retryAfterSeconds`),
 *      BEFORE the user row is read, so the limiter costs no query;
 *   3. `userForClaims` — the revocation re-read (401 when gone / minor /
 *      `tv` behind `users.token_version`);
 *   4. handler inside `apiContext.run({ user })` so existing authz/modules
 *      resolve the same user via `getCurrentUser()`;
 *   5. thrown errors → the §1 contract; `Cache-Control: private, no-store`
 *      and `X-Request-Id` on every response, success or not.
 */
export function withApi<P extends ApiParams = ApiParams>(
  handler: ApiHandler<P>,
): RouteHandler<P> {
  return async (request, context) => {
    const requestId = randomUUID();
    let userId: string | null = null;
    try {
      const bearer = await requireBearer(request);
      const rl = checkRateLimit(`u:${bearer.claims.sub}`, limitFor(request.method));
      if (!rl.ok) {
        return withRequestId(
          apiError("rate_limited", undefined, { retryAfterSeconds: rl.retryAfterSeconds }),
          requestId,
        );
      }
      const user = await userForClaims(bearer.claims);
      if (!user) throw new UnauthorizedError();
      userId = user.id;
      const params = await context.params;
      const res = await apiContext.run({ user }, () =>
        handler(request, { user, params, bearer, requestId }),
      );
      return withRequestId(finalizeApiResponse(res), requestId);
    } catch (err) {
      return withRequestId(
        errorToResponse(err, { rid: requestId, method: request.method, path: pathOf(request), userId }),
        requestId,
      );
    }
  };
}

/**
 * Unauthenticated wrapper for the public `auth/*` routes only (OTP
 * request/verify, `auth/apple`, `auth/google`, `auth/providers`): no bearer,
 * rate limit by client IP BEFORE anything else runs (write limit — they're
 * all POSTs), same error contract, cache policy and request id. Nothing else
 * in v1 may use it.
 */
export function withPublicApi<P extends ApiParams = ApiParams>(
  handler: PublicApiHandler<P>,
): RouteHandler<P> {
  return async (request, context) => {
    const requestId = randomUUID();
    try {
      const rl = checkRateLimit(`ip:${clientIp(request)}`, RATE_LIMIT_WRITES);
      if (!rl.ok) {
        return withRequestId(
          apiError("rate_limited", undefined, { retryAfterSeconds: rl.retryAfterSeconds }),
          requestId,
        );
      }
      const params = await context.params;
      const res = await handler(request, { params, requestId });
      return withRequestId(finalizeApiResponse(res), requestId);
    } catch (err) {
      return withRequestId(
        errorToResponse(err, { rid: requestId, method: request.method, path: pathOf(request) }),
        requestId,
      );
    }
  };
}
