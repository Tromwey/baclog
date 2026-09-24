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
 * minor is a 401 on the next call even with a valid signature.
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
   *  ("underage", "not_released", "reaction_required"). */
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
export function errorToResponse(err: unknown): Response {
  if (err instanceof ApiError) return apiError(err.code, err.message, err.extra);
  if (err instanceof UnauthorizedError) return apiError("unauthorized");
  if (err instanceof NotFoundError) return apiError("not_found");
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.map(String).join(".") || "_";
      if (!(key in fields)) fields[key] = issue.message;
    }
    return apiError("invalid", API_MESSAGES.invalid, { fields });
  }
  console.error("[api/v1] unhandled error:", err);
  return apiError("internal");
}

// ---------- bearer tokens ----------

export const MOBILE_TOKEN_AUDIENCE = "kura-ios";
const MOBILE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
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

/**
 * The v1 gate. Same `CurrentUser` as `requireUser()`; throws
 * `UnauthorizedError` (→ 401 via `withApi`) on any failure: no header, bad
 * signature, wrong `aud`, expired, user row gone, or `isMinor`.
 */
export async function requireApiUser(request: Request): Promise<CurrentUser> {
  const token = bearerOf(request);
  if (!token) throw new UnauthorizedError();
  const claims = await verifyMobileToken(token);
  if (!claims) throw new UnauthorizedError();
  const user = await loadUserById(claims.sub);
  if (!user) throw new UnauthorizedError();
  return user;
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
}

export type ApiHandler<P extends ApiParams = ApiParams> = (
  request: NextRequest,
  ctx: ApiContext<P>,
) => Promise<Response>;

export type PublicApiHandler<P extends ApiParams = ApiParams> = (
  request: NextRequest,
  ctx: { params: P },
) => Promise<Response>;

type RouteHandler<P extends ApiParams> = (
  request: NextRequest,
  context: { params: Promise<P> },
) => Promise<Response>;

/**
 * Bearer-gated wrapper — the ONLY way a v1 handler runs:
 *   1. `requireApiUser` (401 on any failure);
 *   2. rate limit by `sub` (429 with `retryAfterSeconds`);
 *   3. handler inside `apiContext.run({ user })` so existing authz/modules
 *      resolve the same user via `getCurrentUser()`;
 *   4. thrown errors → the §1 contract; `Cache-Control: private, no-store` on
 *      every response, success or not.
 */
export function withApi<P extends ApiParams = ApiParams>(
  handler: ApiHandler<P>,
): RouteHandler<P> {
  return async (request, context) => {
    try {
      const user = await requireApiUser(request);
      const rl = checkRateLimit(`u:${user.id}`, limitFor(request.method));
      if (!rl.ok) {
        return apiError("rate_limited", undefined, {
          retryAfterSeconds: rl.retryAfterSeconds,
        });
      }
      const params = await context.params;
      const res = await apiContext.run({ user }, () =>
        handler(request, { user, params }),
      );
      return finalizeApiResponse(res);
    } catch (err) {
      return errorToResponse(err);
    }
  };
}

/**
 * Unauthenticated wrapper for `auth/*` only (OTP request/verify): no bearer,
 * rate limit by client IP (write limit — they're all POSTs), same error
 * contract and cache policy. Nothing else in v1 may use it.
 */
export function withPublicApi<P extends ApiParams = ApiParams>(
  handler: PublicApiHandler<P>,
): RouteHandler<P> {
  return async (request, context) => {
    try {
      const rl = checkRateLimit(`ip:${clientIp(request)}`, RATE_LIMIT_WRITES);
      if (!rl.ok) {
        return apiError("rate_limited", undefined, {
          retryAfterSeconds: rl.retryAfterSeconds,
        });
      }
      const params = await context.params;
      const res = await handler(request, { params });
      return finalizeApiResponse(res);
    } catch (err) {
      return errorToResponse(err);
    }
  };
}
