import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { ZodError } from "zod";
import { loadUserById, type CurrentUser } from "@/auth/session";
import { env } from "@/lib/env";
import { apiContext } from "./api-context";
import { NotFoundError, UnauthorizedError } from "./errors";

export { apiContext } from "./api-context";

/**
 * /api/v1 — the bearer edge of the app-layer authz model (Kura iOS, ios/API.md).
 *
 * The web app is cookie + server actions; the native app has no cookies, so
 * every v1 request carries `Authorization: Bearer <JWT>`:
 *
 *   HS256 signed with AUTH_SECRET · sub = user.id · aud = "kura-ios"
 *   iat · exp = +30 days · jti random. No session table.
 *
 * Revocation is the same as the web's JWT cookie: `requireApiUser` re-reads
 * the user row on EVERY request (`loadUserById`, the same field list the
 * cookie session uses — never `birthYear`), so a deleted account or a blocked
 * minor is a 401 on the next call even with a valid signature. What does NOT
 * exist yet is per-token revocation: `auth/refresh` only issues a new token
 * when the current one is inside its last 7 days (otherwise it hands the
 * same one back), and an old token stays valid until its own `exp`. Real
 * revocation (a `users.token_version` claim checked here, bumped on logout
 * / password-less "sign out everywhere") is phase 4 (ios/API.md §2.1).
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

/** `{ error: { code, message, reason?, fields?, retryAfterSeconds? } }`. */
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
    },
  };
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": NO_STORE,
  });
  if (extra.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(Math.max(1, Math.ceil(extra.retryAfterSeconds))));
  }
  return new Response(JSON.stringify(body), { status: STATUS[code], headers });
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

/** HS256 wants ≥ 256 bits of key. A shorter AUTH_SECRET still signs (the
 *  web must not fall over for it — the DB is shared and the prod value is
 *  not ours to know here), but it is said ONCE in the log so it gets fixed. */
let warnedShortSecret = false;
const MIN_SECRET_CHARS = 32;

function secretKey(): Uint8Array {
  const secret = env.AUTH_SECRET;
  if (!warnedShortSecret && secret.length < MIN_SECRET_CHARS) {
    warnedShortSecret = true;
    console.warn(
      `[api/v1] AUTH_SECRET tiene ${secret.length} caracteres; HS256 quiere al menos ${MIN_SECRET_CHARS}. Rótalo a un valor más largo (openssl rand -base64 32).`,
    );
  }
  return new TextEncoder().encode(secret);
}

/** A fresh 30-day bearer for `userId` (new `jti` every call — refresh rotates it). */
export async function issueMobileToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
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
}

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
    return { sub: payload.sub, jti: payload.jti, exp: payload.exp };
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
 * Step 1 of the gate — signature, algorithm, audience, expiry; NO database.
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
 * signature, wrong `aud`, expired, user row gone, or `isMinor`.
 */
export async function requireApiUser(request: Request): Promise<CurrentUser> {
  const { claims } = await requireBearer(request);
  const user = await loadUserById(claims.sub);
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Soft twin of `requireApiUser` for routes OUTSIDE v1 that serve both the web
 * (cookie) and the app (bearer) — today only `/api/avatar/[key]`. Returns the
 * bearer user or null (no header, bad token, unknown/blocked user): the
 * caller falls back to `getCurrentUser()` for the cookie. No rate limit and
 * no `apiContext` — it identifies, it does not wrap.
 */
export async function readApiUser(request: Request): Promise<CurrentUser | null> {
  const token = bearerOf(request);
  if (!token) return null;
  const claims = await verifyMobileToken(token);
  if (!claims) return null;
  return loadUserById(claims.sub);
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

function clientIp(request: Request): string {
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
 *   3. `loadUserById` — the revocation re-read (401 when gone / minor);
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
      const user = await loadUserById(bearer.claims.sub);
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
 * Unauthenticated wrapper for `auth/*` only (OTP request/verify): no bearer,
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
