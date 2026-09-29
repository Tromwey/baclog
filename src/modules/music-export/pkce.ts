import { createHash, randomBytes } from "node:crypto";

/**
 * OAuth 2.1 authorization code + PKCE (RFC 7636, S256) pieces for TIDAL.
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
