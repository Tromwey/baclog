import { normalizeP8 } from "@/auth/apple-key";
import { SITE_HOST, SITE_URL } from "@/lib/site";

/**
 * Which export services this deploy can offer, from env ONLY (pure; the
 * services endpoint adds the per-user `connected` and the Apple key probe).
 * A missing piece = the service answers `available: false` ("Próximamente")
 * instead of failing mid-flow.
 *
 * TIDAL (server-side OAuth): the SAME developer app as the link-out
 * (`TIDAL_CLIENT_ID` / `TIDAL_CLIENT_SECRET`, client credentials for catalog
 * lookups) PLUS `TIDAL_OAUTH_REDIRECT_URI` — the exact callback URL
 * registered in the TIDAL dashboard (`https://get-kura.app/api/music/tidal/callback`
 * in prod). The redirect URI being set is the founder's "the dashboard is
 * configured" switch: without it the service stays "Próximamente" even
 * though the link-out keys exist.
 *
 * Apple Music: MusicKit developer tokens are ES256 JWTs; TWO key roles
 * (founder + security review, 2026-09-29):
 *   - SERVER key (`appleMusicServerKeyConfig`): signs the token the server
 *     uses for its OWN calls to Apple (ISRC lookup for TIDAL, the probe).
 *     The dedicated `APPLE_MUSIC_KEY_ID` + `APPLE_MUSIC_PRIVATE_KEY` when
 *     present, else the SHARED `APPLE_KEY_ID` + `APPLE_PRIVATE_KEY` (the
 *     APNs / Sign in with Apple key; the founder enabled MusicKit on it). A
 *     token signed with the shared key NEVER leaves the server.
 *   - WEB key (`appleMusicWebKeyConfig`): signs the token handed to the
 *     BROWSER (MusicKit JS) — ONLY the dedicated pair, never the shared key
 *     (one key, one job: the key behind APNs/SIWA must not sign something
 *     every browser carries). Without it the web shows "Próximamente" for
 *     Apple Music while iOS (native MusicKit, no developer token) stays on:
 *     `services.apple_music.webAvailable: false`.
 * Both are probed against Apple (`key_rejected` = the key lacks MusicKit).
 */

export const TIDAL_AUTHORIZE_URL = "https://login.tidal.com/authorize";
export const TIDAL_TOKEN_URL = "https://auth.tidal.com/v1/oauth2/token";
export const TIDAL_API_BASE = "https://openapi.tidal.com/v2";
/** "kura solo crea la playlist … No lee ni cambia tu biblioteca": write
 *  playlists + read the account's country (catalog availability). */
export const TIDAL_SCOPES = "playlists.write user.read";

export interface TidalOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function tidalOAuthConfig(
  env: Record<string, string | undefined> = process.env,
): TidalOAuthConfig | null {
  const clientId = env.TIDAL_CLIENT_ID?.trim();
  const clientSecret = env.TIDAL_CLIENT_SECRET?.trim();
  const redirectUri = env.TIDAL_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const u = new URL(redirectUri);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

export interface AppleMusicKeyConfig {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  /** Which env pair it came from: only a `dedicated` key may sign a web token. */
  source: "dedicated" | "shared";
}

function keyPair(
  teamId: string,
  keyId: string | undefined,
  raw: string | undefined,
  source: AppleMusicKeyConfig["source"],
): AppleMusicKeyConfig | null {
  const id = keyId?.trim();
  if (!id || !raw) return null;
  const pem = normalizeP8(raw);
  return pem ? { teamId, keyId: id, privateKeyPem: pem, source } : null;
}

/** The dedicated MusicKit key — the ONLY one that may sign a token for the browser. */
export function appleMusicWebKeyConfig(
  env: Record<string, string | undefined> = process.env,
): AppleMusicKeyConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  if (!teamId) return null;
  return keyPair(teamId, env.APPLE_MUSIC_KEY_ID, env.APPLE_MUSIC_PRIVATE_KEY, "dedicated");
}

/** Server→Apple calls only: the dedicated key, else the shared APNs/SIWA key. */
export function appleMusicServerKeyConfig(
  env: Record<string, string | undefined> = process.env,
): AppleMusicKeyConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  if (!teamId) return null;
  return appleMusicWebKeyConfig(env) ?? keyPair(teamId, env.APPLE_KEY_ID, env.APPLE_PRIVATE_KEY, "shared");
}

/**
 * The `origin` claim of the developer token handed to BROWSERS: Apple then
 * refuses it from any other page, so a token lifted off our site can't run
 * someone else's MusicKit app on our quota. Prod + beta (from `lib/site.ts`),
 * plus localhost outside production. The token the server keeps for its own
 * catalog calls (ISRC) carries no origin (server fetches send none).
 */
export function appleMusicWebOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const out = [SITE_URL, `https://beta.${SITE_HOST}`];
  if (env.NODE_ENV !== "production") out.push("http://localhost:3010", "http://localhost:3000");
  return out;
}

/** Storefront of the song catalog (iTunes search runs with `country=mx`). */
export const CATALOG_STOREFRONT = "mx";
/** Server-only developer token lifetime (Apple allows ≤ 6 months; short = less to leak). */
export const APPLE_DEVELOPER_TOKEN_TTL_SECONDS = 12 * 60 * 60;
/** The browser's token (origin-bound): 1 h; MusicKit JS asks for another after. */
export const APPLE_WEB_TOKEN_TTL_SECONDS = 60 * 60;
