import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { RATE_LIMIT_WRITES, checkRateLimit, clientIp } from "@/authz/api";
import { parseHandoffTarget } from "@/authz/handoff";

/**
 * GET /api/auth/handoff?t=<jws>&to=<path> — the web end of the bearer →
 * cookie handoff (phase 4b; mint side: `POST /api/v1/auth/web-session`,
 * design in src/authz/handoff.ts).
 *
 * OUTSIDE v1 on purpose: no bearer (an SFSafariViewController can't send
 * one), no JSON — the browser gets a 302 either way:
 *   - `to` allow-listed AND `t` accepted by the Credentials `authorize`
 *     (signature, aud, exp, single-use row burned, `tv` current) →
 *     Auth.js session cookie + 302 to `to`;
 *   - anything else → 302 to /login, no cookie. Same response whatever
 *     failed (bad/used/expired token, bearer passed as `t`, bad `to`,
 *     cross-site navigation, server error). The REASON goes to the server
 *     log only — `[auth/handoff] rid=… reason=…`, the `rid` also in
 *     `X-Request-Id` so a support report can be matched to its line.
 * `to` is checked BEFORE the token is touched, so a URL with a tampered
 * target doesn't even burn the token.
 *
 * Login-CSRF mitigation (cheap, not a boundary): the app opens this URL as
 * a top-level, user-initiated navigation in an SFSafariViewController, which
 * a Fetch-Metadata browser sends as `Sec-Fetch-Site: none` +
 * `Sec-Fetch-Mode: navigate`. A link on another site (`cross-site`), an
 * iframe/img/fetch (`mode` ≠ navigate) is refused WITHOUT consuming the
 * token — so an attacker can't plant their own handoff in someone else's
 * browser from a page they control. Headers absent (old clients, curl) =
 * allowed: the check only narrows what a modern browser can be tricked into.
 *
 * `no-store` + `Referrer-Policy: no-referrer`: the one-shot token is in this
 * URL, and nothing downstream should cache or forward it.
 */
function landAt(request: NextRequest, path: string, rid: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, request.url), 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Request-Id", rid);
  return res;
}

function refuse(request: NextRequest, rid: string, reason: string): NextResponse {
  console.warn(`[auth/handoff] rid=${rid} reason=${reason}`);
  return landAt(request, "/login", rid);
}

/** A navigation a Fetch-Metadata browser marks as NOT user-initiated
 *  top-level (see the header comment). Absent headers pass. */
function crossSiteOrEmbedded(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "none") return true;
  const mode = request.headers.get("sec-fetch-mode");
  if (mode !== null && mode !== "navigate") return true;
  return false;
}

/** 429 in the Kura voice — a person in a browser sees this, not an app. */
function tooManyPage(retryAfterSeconds: number, rid: string): Response {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>kura</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#f4f3ee;font:16px/1.5 -apple-system,system-ui,sans-serif}main{max-width:22rem;padding:24px}h1{font:400 1.5rem/1.2 Georgia,serif;margin:0 0 .5rem}p{margin:0;color:#a9a8a2}</style>
</head><body><main><h1>demasiados intentos</h1><p>Espera un momento y vuelve a abrir la tarjeta desde la app.</p></main></body></html>`;
  return new Response(html, {
    status: 429,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(retryAfterSeconds),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Request-Id": rid,
    },
  });
}

export async function GET(request: NextRequest) {
  const rid = randomUUID();
  // Per-IP, like `auth/otp/*`: each hit costs one HMAC and, only for a
  // validly signed token, one DELETE. Frena scripts; not a security boundary
  // (the token itself is the boundary).
  const rl = checkRateLimit(`handoff-ip:${clientIp(request)}`, RATE_LIMIT_WRITES);
  if (!rl.ok) return tooManyPage(rl.retryAfterSeconds, rid);

  if (crossSiteOrEmbedded(request)) return refuse(request, rid, "cross_site");

  const params = request.nextUrl.searchParams;
  const to = parseHandoffTarget(params.get("to"));
  const t = params.get("t");
  if (!to) return refuse(request, rid, "bad_to");
  if (!t) return refuse(request, rid, "no_token");

  try {
    // Server-side Credentials sign-in: runs `authorize({ handoff, rid })`
    // (src/auth/config.ts — which logs the token's own refusal reason with
    // this rid) and writes the session cookie through `cookies()`, which
    // Next merges into the response below. The URL Auth.js returns is
    // ignored — the target is the allow-listed `to`, nothing else.
    await signIn("otp", { handoff: t, rid, redirect: false, redirectTo: to });
  } catch (err) {
    if (err instanceof AuthError) {
      // `CredentialsSignin` = `authorize` said no (already logged there with
      // its reason). Anything else — `CallbackRouteError` is `authorize` or
      // the adapter THROWING — is a server fault: logged as an error, same
      // 302 for the browser.
      if (err.type !== "CredentialsSignin") {
        console.error(`[auth/handoff] rid=${rid} reason=server_error type=${err.type}`, err.cause ?? err);
      }
      return landAt(request, "/login", rid);
    }
    throw err;
  }
  return landAt(request, to, rid);
}
