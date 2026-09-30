import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { KURA_BUNDLE_ID } from "./apple-key";

/**
 * Phase 4f — verification of the identity tokens the apps get from
 * Sign in with Apple (iOS) and Google Sign-In (iOS, and Android since
 * 2026-09-30). Pure (no DB) and env-free except ONE default: the routes
 * pass the audience, tests pass their own key set, and the Google
 * audiences that require a nonce default to `GOOGLE_WEB_CLIENT_ID`
 * (`googleNonceRequiredAudiences`).
 *
 * Both return the SAME shape or null. Null is the only failure signal —
 * bad signature, wrong `iss`/`aud`, expired, missing claims, nonce mismatch —
 * and the route turns every null into one 401 (never which).
 */

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Remote key sets, created lazily and kept per instance: jose caches the
 *  keys (and re-fetches on an unknown `kid`, with a cooldown). */
let appleKeys: JWTVerifyGetKey | null = null;
let googleKeys: JWTVerifyGetKey | null = null;
function appleKeySet(): JWTVerifyGetKey {
  appleKeys ??= createRemoteJWKSet(new URL(APPLE_JWKS_URL), { timeoutDuration: 5000 });
  return appleKeys;
}
function googleKeySet(): JWTVerifyGetKey {
  googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), { timeoutDuration: 5000 });
  return googleKeys;
}

export interface VerifiedIdentity {
  /** The provider's stable user id (`account.provider_account_id`). */
  sub: string;
  /** Lowercased, trimmed; null when the token carries none. */
  email: string | null;
  emailVerified: boolean;
}

/** Hex SHA-256 — what the app sends Apple as `nonce` for a given rawNonce. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Apple sends `email_verified` as a boolean or as the string "true". */
function truthyClaim(v: unknown): boolean {
  return v === true || v === "true";
}

function emailOf(payload: JWTPayload): string | null {
  const e = payload.email;
  if (typeof e !== "string") return null;
  const n = e.trim().toLowerCase();
  return n.length > 0 && n.length <= 254 && n.includes("@") ? n : null;
}

/**
 * Sign in with Apple identity token: RS256 against Apple's JWKS, `iss` =
 * https://appleid.apple.com, `aud` = the Kura bundle id, `exp`/`iat`/`sub`
 * required, and `nonce` = sha256hex(rawNonce) — the replay guard: the app
 * generated `rawNonce` for THIS sign-in and only its hash went to Apple.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce: string,
  keys: JWTVerifyGetKey = appleKeySet(),
): Promise<VerifiedIdentity | null> {
  try {
    const { payload } = await jwtVerify(identityToken, keys, {
      algorithms: ["RS256"],
      issuer: APPLE_ISSUER,
      audience: KURA_BUNDLE_ID,
      requiredClaims: ["exp", "iat", "sub", "nonce"],
      clockTolerance: 30,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.nonce !== "string" || payload.nonce !== sha256Hex(rawNonce)) return null;
    return {
      sub: payload.sub,
      email: emailOf(payload),
      emailVerified: truthyClaim(payload.email_verified),
    };
  } catch {
    return null;
  }
}

/** Constant-time string equality: both sides hashed first, so neither the
 *  length nor the first differing byte leaks through timing. */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * The Google audiences whose ID tokens MUST come with the raw nonce: the web
 * client id Android passes as `serverClientId` (every Android build sends the
 * nonce; no legacy build to spare). Read straight from `process.env` with the
 * same trim as `googleWebClientId()` in `app/api/v1/_lib/social.ts` — that
 * module is `server-only` and can't be imported here (tests run under tsx).
 */
export function googleNonceRequiredAudiences(): string[] {
  const web = process.env.GOOGLE_WEB_CLIENT_ID?.trim();
  return web ? [web] : [];
}

/**
 * Google ID token (iOS or Android client): RS256 against Google's JWKS,
 * `iss` ∈ {https://accounts.google.com, accounts.google.com}, `aud` ∈
 * `audiences` (the iOS OAuth client id and/or the web client id Android's
 * Credential Manager uses as `serverClientId` — `_lib/social.ts`
 * `googleAudiences()`; an empty list rejects everything), `exp`/`sub`
 * required, and `email_verified` MUST be true with an email present (a
 * Google identity is only linked or created through a verified address).
 * `azp` is not checked: on Android it is the Android client id, which only
 * says which app asked Google — the `aud` already pins the token to Kura.
 *
 * `rawNonce`: the RAW nonce the app generated for THIS sign-in — the SAME
 * scheme as Apple: the app handed Google `sha256Hex(rawNonce)` (lowercase
 * hex, `sha256Hex` above) and sends the raw value only to us. When given, the
 * token's `nonce` claim must equal `sha256Hex(rawNonce)` (constant-time) — the
 * replay guard: whoever steals an ID token can read its `nonce` claim, but
 * cannot invert the hash to the raw value the body must carry. A mismatch or
 * a token without the claim is the same null.
 *
 * When absent: a token whose `aud` names one of `nonceRequiredAudiences`
 * (default: the web client id — only Android uses it, and every Android build
 * sends the nonce) → null. Any other audience (iOS) is accepted without it:
 * legacy iOS builds, accepted risk.
 * TODO(nonce): make `nonce` required for every audience (here and in the zod
 * bodies) once every iOS build in TestFlight/App Store sends it — until then
 * old builds would be locked out of Google sign-in.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  audiences: string | readonly string[],
  rawNonce: string | undefined,
  keys: JWTVerifyGetKey = googleKeySet(),
  nonceRequiredAudiences: readonly string[] = googleNonceRequiredAudiences(),
): Promise<VerifiedIdentity | null> {
  const audience = (typeof audiences === "string" ? [audiences] : [...audiences]).filter((a) => a.length > 0);
  // jose treats an empty audience list as "no audience check": never let that
  // happen — no configured client = no Google token is ours.
  if (audience.length === 0) return null;
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      algorithms: ["RS256"],
      issuer: GOOGLE_ISSUERS,
      audience,
      requiredClaims: ["exp", "iat", "sub"],
      clockTolerance: 30,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (rawNonce === undefined) {
      // Fail closed: a token minted for several audiences needs the nonce if
      // ANY of them requires it.
      const tokenAud = typeof payload.aud === "string" ? [payload.aud] : (payload.aud ?? []);
      const required = nonceRequiredAudiences.filter((a) => a.length > 0);
      if (tokenAud.some((a) => required.includes(a))) return null;
    } else if (typeof payload.nonce !== "string" || !sameSecret(payload.nonce, sha256Hex(rawNonce))) {
      return null;
    }
    const email = emailOf(payload);
    if (!email || !truthyClaim(payload.email_verified)) return null;
    return { sub: payload.sub, email, emailVerified: true };
  } catch {
    return null;
  }
}
