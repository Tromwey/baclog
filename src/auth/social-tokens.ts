import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { KURA_BUNDLE_ID } from "./apple-key";

/**
 * Phase 4f — verification of the identity tokens the iOS app gets from
 * Sign in with Apple and Google Sign-In. Pure (no DB, no env): the routes
 * pass the audience, and tests pass their own key set.
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
 * Google ID token (iOS client): RS256 against Google's JWKS, `iss` ∈
 * {https://accounts.google.com, accounts.google.com}, `aud` = the iOS
 * OAuth client id, `exp`/`sub` required, and `email_verified` MUST be true
 * with an email present (a Google identity is only linked or created
 * through a verified address).
 *
 * `nonce`: the value the app passed to Google Sign-In for THIS sign-in
 * (GIDSignIn puts it in the token verbatim, no hashing). When given, the
 * token's `nonce` claim must equal it (constant-time) — the replay guard,
 * as with Apple; a mismatch or a token without the claim is the same null.
 * When absent the token is accepted without it.
 * TODO(nonce): make `nonce` required (here and in the zod bodies) once every
 * iOS build in TestFlight/App Store sends it — until then old builds would
 * be locked out of Google sign-in.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  nonce: string | undefined,
  keys: JWTVerifyGetKey = googleKeySet(),
): Promise<VerifiedIdentity | null> {
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      algorithms: ["RS256"],
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
      requiredClaims: ["exp", "iat", "sub"],
      clockTolerance: 30,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (nonce !== undefined) {
      if (typeof payload.nonce !== "string" || !sameSecret(payload.nonce, nonce)) return null;
    }
    const email = emailOf(payload);
    if (!email || !truthyClaim(payload.email_verified)) return null;
    return { sub: payload.sub, email, emailVerified: true };
  } catch {
    return null;
  }
}
