import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth 2.1 authorization code + PKCE (RFC 7636, S256) pieces for TIDAL, and
 * the other small hashes of the export (iOS claim, TIDAL idempotency key).
 * Pure (`node:crypto` only, no DB, no `server-only`) so
 * `scripts/check-music-export.ts` runs them. Server code only.
 */

export type OAuthClient = "web" | "ios";

/**
 * The `state`: a 1-letter client hint (`w` web / `i` iOS — so the callback
 * knows where to bounce even when the row is gone) + 32 random bytes as 43
 * chars of base64url. Only its hash is stored.
 */
export function newOAuthState(client: OAuthClient): string {
  return `${client === "ios" ? "i" : "w"}${randomBytes(32).toString("base64url")}`;
}

export const TIDAL_STATE_RE = /^[wi][A-Za-z0-9_-]{43}$/;

export function clientOfState(state: string): OAuthClient | null {
  if (!TIDAL_STATE_RE.test(state)) return null;
  return state[0] === "i" ? "ios" : "web";
}

/** RFC 7636 §4.1: 43..128 chars of [A-Za-z0-9-._~]; 64 bytes → 86 chars. */
export function newCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** What the `music_oauth_state` PK stores. */
export function hashOAuthState(state: string): string {
  return createHash("sha256").update(`music-oauth:${state}`, "utf8").digest("base64url");
}

// ---------- iOS claim (anti OAuth-CSRF) ----------

/**
 * The iOS `claim`: 32 random bytes (43 chars base64url) minted by the
 * CALLBACK and only ever sent in the `kura://…/authorized?ref&claim` bounce
 * — i.e. to whoever's browser actually came back from TIDAL's consent. The
 * `ref` (= the state) is not enough to finish: the STARTER knows it from his
 * own authorize URL, so an attacker who sends that URL to a victim could
 * otherwise complete it with his bearer and get the victim's TIDAL linked to
 * HIS Kura account. Only the claim's hash is stored.
 */
export function newClaim(): string {
  return randomBytes(32).toString("base64url");
}

export const TIDAL_CLAIM_RE = /^[A-Za-z0-9_-]{43}$/;

export function hashClaim(claim: string): string {
  return createHash("sha256").update(`music-oauth-claim:${claim}`, "utf8").digest("base64url");
}

/** Constant-time: does `claim` hash to `storedHash`? Malformed / null → false. */
export function claimMatches(claim: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !TIDAL_CLAIM_RE.test(claim)) return false;
  const a = Buffer.from(hashClaim(claim), "utf8");
  const b = Buffer.from(storedHash, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface TidalAuthorizeParams {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  state: string;
  codeChallenge: string;
}

export function tidalAuthorizeUrl(p: TidalAuthorizeParams): string {
  const u = new URL(p.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", p.scopes);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", p.codeChallenge);
  u.searchParams.set("state", p.state);
  return u.toString();
}

// ---------- TIDAL create-playlist idempotency key ----------

/**
 * `Idempotency-Key` of `POST /playlists`: export + generation + a hash of the
 * NAME. TIDAL answers 422 (payload mismatch) when a key comes back with a
 * different body — so without the name in it, renaming the party between a
 * failed create and its retry would wedge that export for good.
 */
export function tidalIdempotencyKey(exportId: string, generation: number, name: string): string {
  const n = createHash("sha256").update(name, "utf8").digest("base64url").slice(0, 16);
  return `kura-export-${exportId}-g${generation}-${n}`;
}
