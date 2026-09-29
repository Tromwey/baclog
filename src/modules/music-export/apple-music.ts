import "server-only";
import { signAppleMusicDeveloperToken } from "./apple-token";
import { APPLE_DEVELOPER_TOKEN_TTL_SECONDS, appleMusicKeyConfig, CATALOG_STOREFRONT } from "./config";
import { normalizeIsrc } from "./match";

/**
 * Apple Music — the SERVER half (the playlist itself is created by the
 * client: MusicKit JS on the web, MusicKit on iOS; contract §Apple Music).
 *
 *  - `appleDeveloperToken()`: the MusicKit developer token (ES256 JWT,
 *    `iss` = team, `kid` = a key with MusicKit, `iat`, `exp` = +12 h).
 *    Public by design (MusicKit JS ships it to the browser), so it is the
 *    one credential a response may carry. Cached per instance, re-minted
 *    with ≥ 1 h left.
 *  - `appleCatalogIsrcs(ids)`: ISRC of catalog songs (`GET /v1/catalog/mx/
 *    songs?ids=…`, ≤ 300 ids per call) — the key that finds the same
 *    recording on TIDAL.
 *  - `appleMusicProbe()`: is the key accepted by Apple? (services endpoint;
 *    cached 1 h so the sheet never costs an Apple call per open).
 */

const API = "https://api.music.apple.com/v1";
const TIMEOUT_MS = 6000;
const IDS_PER_CALL = 300;

let tokenCache: { value: string; expiresAt: number; keyId: string } | null = null;

/** `{ token, expiresAt }` or null when the deploy has no MusicKit key. */
export async function appleDeveloperToken(): Promise<{ token: string; expiresAt: Date } | null> {
  const cfg = appleMusicKeyConfig();
  if (!cfg) return null;
  const now = Date.now();
  if (tokenCache && tokenCache.keyId === cfg.keyId && tokenCache.expiresAt - now > 60 * 60 * 1000) {
    return { token: tokenCache.value, expiresAt: new Date(tokenCache.expiresAt) };
  }
  const nowSeconds = Math.floor(now / 1000);
  const value = await signAppleMusicDeveloperToken(cfg, nowSeconds);
  const expiresAt = (nowSeconds + APPLE_DEVELOPER_TOKEN_TTL_SECONDS) * 1000;
  tokenCache = { value, expiresAt, keyId: cfg.keyId };
  return { token: value, expiresAt: new Date(expiresAt) };
}

let probeCache: { ok: boolean; at: number; keyId: string } | null = null;
const PROBE_TTL_MS = 60 * 60 * 1000;

/**
 * "available" for Apple Music: configured AND (last we checked) Apple
 * accepted the token. A 401/403 = the key has no MusicKit → `key_rejected`.
 * A network error/5xx is NOT a verdict (stays available; the export itself
 * reports failures) and isn't cached.
 */
export async function appleMusicProbe(): Promise<{ available: boolean; reason?: "not_configured" | "key_rejected" }> {
  const cfg = appleMusicKeyConfig();
  if (!cfg) return { available: false, reason: "not_configured" };
  const now = Date.now();
  if (probeCache && probeCache.keyId === cfg.keyId && now - probeCache.at < PROBE_TTL_MS) {
    return probeCache.ok ? { available: true } : { available: false, reason: "key_rejected" };
  }
  try {
    const dev = await appleDeveloperToken();
    if (!dev) return { available: false, reason: "not_configured" };
    const res = await fetch(`${API}/storefronts/${CATALOG_STOREFRONT}`, {
      headers: { Authorization: `Bearer ${dev.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      console.warn(`[music-export] apple probe rejected status=${res.status} key=${cfg.source}`);
      probeCache = { ok: false, at: now, keyId: cfg.keyId };
      tokenCache = null;
      return { available: false, reason: "key_rejected" };
    }
    if (res.ok) probeCache = { ok: true, at: now, keyId: cfg.keyId };
    return { available: true };
  } catch (err) {
    // A key that doesn't import (bad PEM) is a verdict; a timeout is not.
    if (err instanceof Error && /key|pkcs8|asn1/i.test(err.message)) {
      console.warn(`[music-export] apple key unusable key=${cfg.source}: ${err.name}`);
      probeCache = { ok: false, at: now, keyId: cfg.keyId };
      return { available: false, reason: "key_rejected" };
    }
    return { available: true };
  }
}

/**
 * ISRC per Apple catalog song id (storefront mx, where the iTunes search
 * found them). A song Apple no longer lists is simply absent from the map.
 * THROWS on HTTP/network failure (the caller decides: the TIDAL step falls
 * back to title+artist search). Null when the deploy has no key.
 */
export async function appleCatalogIsrcs(ids: readonly string[]): Promise<Map<string, string> | null> {
  const dev = await appleDeveloperToken();
  if (!dev) return null;
  const out = new Map<string, string>();
  const clean = [...new Set(ids.filter((id) => /^\d{1,20}$/.test(id)))];
  for (let i = 0; i < clean.length; i += IDS_PER_CALL) {
    const chunk = clean.slice(i, i + IDS_PER_CALL);
    const url = new URL(`${API}/catalog/${CATALOG_STOREFRONT}/songs`);
    url.searchParams.set("ids", chunk.join(","));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${dev.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      tokenCache = null;
      probeCache = null;
      throw new Error(`apple catalog: ${res.status}`);
    }
    if (!res.ok) throw new Error(`apple catalog: ${res.status}`);
    const doc = (await res.json()) as { data?: { id?: string; attributes?: { isrc?: string } }[] };
    for (const song of doc.data ?? []) {
      const isrc = normalizeIsrc(song.attributes?.isrc);
      if (song.id && isrc) out.set(song.id, isrc);
    }
  }
  return out;
}
