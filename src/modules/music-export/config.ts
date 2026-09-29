import { normalizeP8 } from "@/auth/apple-key";

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
 * Apple Music: the MusicKit developer token is an ES256 JWT signed with a
 * key that has **MusicKit** enabled. `APPLE_MUSIC_KEY_ID` +
 * `APPLE_MUSIC_PRIVATE_KEY` when the founder made a dedicated key; if they
 * are absent it falls back to `APPLE_KEY_ID` + `APPLE_PRIVATE_KEY` (the APNs
 * / Sign in with Apple key — valid only if MusicKit was enabled on it too;
 * the services endpoint probes Apple once an hour and reports
 * `reason: "key_rejected"` when it wasn't). `APPLE_TEAM_ID` always.
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
  /** Which env pair it came from (logs only). */
  source: "dedicated" | "shared";
}

export function appleMusicKeyConfig(
  env: Record<string, string | undefined> = process.env,
): AppleMusicKeyConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  if (!teamId) return null;
  const dedicatedId = env.APPLE_MUSIC_KEY_ID?.trim();
  const dedicatedKey = env.APPLE_MUSIC_PRIVATE_KEY;
  if (dedicatedId && dedicatedKey) {
    const pem = normalizeP8(dedicatedKey);
    return pem ? { teamId, keyId: dedicatedId, privateKeyPem: pem, source: "dedicated" } : null;
  }
  // Half a dedicated pair is a misconfiguration, not a fallback trigger.
  if (dedicatedId || dedicatedKey) return null;
  const keyId = env.APPLE_KEY_ID?.trim();
  const raw = env.APPLE_PRIVATE_KEY;
  if (!keyId || !raw) return null;
  const pem = normalizeP8(raw);
  return pem ? { teamId, keyId, privateKeyPem: pem, source: "shared" } : null;
}

/** Storefront of the song catalog (iTunes search runs with `country=mx`). */
export const CATALOG_STOREFRONT = "mx";
/** Developer token lifetime (Apple allows ≤ 6 months; short = less to leak). */
export const APPLE_DEVELOPER_TOKEN_TTL_SECONDS = 12 * 60 * 60;
