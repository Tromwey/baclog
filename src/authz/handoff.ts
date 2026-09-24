import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/db";
import { verificationTokens } from "@/db/schema";
import { loadUserWithTokenVersion, type UserRow } from "@/auth/user-row";
import { secretKey } from "./keys";

export { DEFAULT_HANDOFF_TARGET, HANDOFF_PATHS, parseHandoffTarget } from "./handoff-target";

/**
 * Bearer → web cookie handoff (ios/API.md §2.1, phase 4b).
 *
 * The app has a bearer; a few screens only exist on the web (the recap card
 * exporter, `/recap/tarjeta`). `POST /api/v1/auth/web-session` mints a
 * ONE-SHOT, 60-second JWS and returns
 *
 *   <origin>/api/auth/handoff?t=<jws>&to=<allow-listed path>
 *
 * which the app opens in an SFSafariViewController. `GET /api/auth/handoff`
 * hands `t` to Auth.js (`signIn("otp", { handoff })`), whose Credentials
 * `authorize` calls `consumeWebHandoff` below, gets the Auth.js session
 * cookie, and 302s to `to`.
 *
 *   HS256 (AUTH_SECRET) · aud = "kura-web-handoff" · sub = user.id
 *   tv = users.token_version at mint time · jti random · exp = +60 s
 *
 * Single use WITHOUT a new table: the mint writes a `verificationToken` row
 * (`identifier = "handoff:" + jti`, `token = jti`, `expires`), and the consume
 * is `DELETE … RETURNING` of that row — two concurrent opens of the same URL
 * race on one row and exactly one wins. The OTP rows share the table but not
 * the namespace: their identifier is an email (always has `@`), and
 * `verifyOtp` refuses anything under `handoff:`.
 *
 * WHY the consume lives HERE (inside `authorize`) and not in the GET route:
 * the Credentials provider is also reachable directly at
 * `POST /api/auth/callback/otp` (anyone can fetch a CSRF token). If only the
 * route consumed the row, a URL already used — or leaked from a log — could
 * be replayed straight at the callback. Every path into a session goes
 * through `authorize`, so that is where single-use is enforced.
 *
 * The JWS rides in a query string (an SFSafariViewController can't send a
 * header or a body). Accepted because it is dead within 60 s AND after the
 * first open; the handoff response is `no-store` + `Referrer-Policy:
 * no-referrer`. It is a bearer for exactly one thing — minting a cookie — and
 * `tv` ties it to the account's current token version, so "cerrar sesión en
 * todos lados" kills pending handoffs too — and the cookie it produces
 * carries that same `tv` (src/auth/config.ts → `getCurrentUser`), so the
 * logout kills the web session it opened as well: a bearer is never laundered
 * into a cookie the logout can't reach. Login-CSRF (a planted URL opened by
 * someone else) is narrowed in the GET route with Fetch Metadata.
 */
export const WEB_HANDOFF_AUDIENCE = "kura-web-handoff";
export const WEB_HANDOFF_TTL_SECONDS = 60;
/** `verificationToken.identifier` namespace for handoff rows. */
export const HANDOFF_IDENTIFIER_PREFIX = "handoff:";

/**
 * Mint the one-shot handoff JWS for `userId` at `tokenVersion` and register
 * its `jti`. Also sweeps handoff rows that expired unopened, so the shared
 * table never accrues them.
 */
export async function issueWebHandoff(userId: string, tokenVersion: number): Promise<string> {
  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + WEB_HANDOFF_TTL_SECONDS;
  const token = await new SignJWT({ tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience(WEB_HANDOFF_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(secretKey());
  await db
    .delete(verificationTokens)
    .where(
      and(
        like(verificationTokens.identifier, `${HANDOFF_IDENTIFIER_PREFIX}%`),
        lt(verificationTokens.expires, new Date()),
      ),
    );
  await db.insert(verificationTokens).values({
    identifier: `${HANDOFF_IDENTIFIER_PREFIX}${jti}`,
    token: jti,
    expires: new Date(exp * 1000),
  });
  return token;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Why a handoff was refused — for the SERVER LOG only (`[auth/handoff]
 * rid=… reason=…`). The browser always gets the same 302 to /login whatever
 * the reason: a distinguishable failure would be an oracle.
 *   bad_signature — not a JWS we signed, or a claim missing/malformed
 *                   (`exp`/`jti`/`sub` are required, `tv` must be an int ≥ 0)
 *   bad_aud       — validly signed but another audience (e.g. an iOS bearer)
 *   expired       — past its 60 s
 *   used          — no live single-use row: already opened, or never minted
 *   no_user       — account gone or blocked (isMinor)
 *   tv_mismatch   — the account logged out after this handoff was minted
 *   db_error      — the burn or the user read threw; refused, fail-closed
 */
export type HandoffFailure =
  | "bad_signature"
  | "bad_aud"
  | "expired"
  | "used"
  | "no_user"
  | "tv_mismatch"
  | "db_error";

export type HandoffResult =
  | { ok: true; user: UserRow; tokenVersion: number }
  /** `cause`: only on `db_error` — the thrown error, for the caller's log line. */
  | { ok: false; reason: HandoffFailure; cause?: unknown };

function joseFailure(err: unknown): HandoffFailure {
  const e = err as { code?: unknown; claim?: unknown };
  if (e?.code === "ERR_JWT_EXPIRED") return "expired";
  if (e?.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && e.claim === "aud") return "bad_aud";
  return "bad_signature";
}

/**
 * Verify + BURN a handoff token. `{ ok: true, user, tokenVersion }` = sign
 * this user in and stamp `tokenVersion` on the cookie (`tv`, compared on
 * every request by `getCurrentUser`); anything else is a refusal with a
 * reason for the log (never for the client). The row is consumed before the
 * user check, so a token that fails late is still dead. Never throws: a DB
 * failure is `db_error` (fail-closed).
 */
export async function consumeWebHandoff(token: string): Promise<HandoffResult> {
  if (!token || token.length > 2048) return { ok: false, reason: "bad_signature" };
  let sub: string;
  let jti: string;
  let tv: number;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: WEB_HANDOFF_AUDIENCE,
      // Without these, a validly signed JWS that simply OMITS `exp` would
      // never expire (jose only checks `exp` when present).
      requiredClaims: ["exp", "jti", "sub"],
    });
    if (typeof payload.sub !== "string" || !payload.sub) return { ok: false, reason: "bad_signature" };
    if (typeof payload.jti !== "string" || !UUID_RE.test(payload.jti)) return { ok: false, reason: "bad_signature" };
    if (typeof payload.tv !== "number" || !Number.isInteger(payload.tv) || payload.tv < 0) {
      return { ok: false, reason: "bad_signature" };
    }
    sub = payload.sub;
    jti = payload.jti;
    tv = payload.tv;
  } catch (err) {
    return { ok: false, reason: joseFailure(err) };
  }
  try {
    const consumed = await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, `${HANDOFF_IDENTIFIER_PREFIX}${jti}`),
          eq(verificationTokens.token, jti),
          gt(verificationTokens.expires, new Date()),
        ),
      )
      .returning({ identifier: verificationTokens.identifier });
    if (consumed.length === 0) return { ok: false, reason: "used" };
    const row = await loadUserWithTokenVersion(sub);
    if (!row) return { ok: false, reason: "no_user" };
    if (row.tokenVersion !== tv) return { ok: false, reason: "tv_mismatch" };
    return { ok: true, user: row.user, tokenVersion: row.tokenVersion };
  } catch (err) {
    return { ok: false, reason: "db_error", cause: err };
  }
}
