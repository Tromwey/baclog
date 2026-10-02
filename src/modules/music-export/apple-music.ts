import "server-only";
import { signAppleMusicDeveloperToken } from "./apple-token";
import {
  APPLE_DEVELOPER_TOKEN_TTL_SECONDS,
  APPLE_WEB_TOKEN_TTL_SECONDS,
  appleMusicServerKeyConfig,
  appleMusicWebKeyConfig,
  appleMusicWebOrigins,
  CATALOG_STOREFRONT,
  type AppleMusicKeyConfig,
} from "./config";
import { notConfigured } from "./errors";
import { normalizeIsrc } from "./match";
import type { MusicServices } from "./types";

/**
 * Apple Music — the SERVER half (the playlist itself is created by the
 * client: MusicKit JS on the web, MusicKit on iOS; contract §Apple Music).
 * Two key roles (config.ts): the SERVER key (dedicated, else the shared
 * APNs/SIWA key) and the WEB key (dedicated only).
 *
 *  - `appleServerToken()` (private): the developer token for the server's
 *    OWN calls to Apple (ISRC lookup, probe) — SERVER key, 12 h, no
 *    `origin`. Never returned to a client (it may be signed by the shared
 *    key).
 *  - `appleWebDeveloperToken()`: the one a response may carry (MusicKit JS
 *    ships it to the browser): WEB key only, 1 h, `origin`-bound to our web
 *    origins, and only while Apple accepts that key.
 *  - `appleCatalogIsrcs(ids)`: ISRC of catalog songs (`GET /v1/catalog/mx/
 *    songs?ids=…`, ≤ 300 ids per call) — the key that finds the same
 *    recording on TIDAL.
 *  - `appleMusicProbe()`: `{ available, webAvailable, reason? }` for the
 *    services endpoint — each key probed against Apple, cached 1 h per key
 *    so the sheet never costs an Apple call per open.
 */

const API = "https://api.music.apple.com/v1";
const TIMEOUT_MS = 6000;
const IDS_PER_CALL = 300;

type Minted = { value: string; expiresAt: number };
/** Per key id (server) / key id + origins (web). */
const serverTokens = new Map<string, Minted>();
const webTokens = new Map<string, Minted>();

async function mint(
  cache: Map<string, Minted>,
  cacheKey: string,
  cfg: AppleMusicKeyConfig,
  ttlSeconds: number,
  minLeftMs: number,
  origins?: readonly string[],
): Promise<{ token: string; expiresAt: Date }> {
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt - now > minLeftMs) return { token: hit.value, expiresAt: new Date(hit.expiresAt) };
  const nowSeconds = Math.floor(now / 1000);
  const value = await signAppleMusicDeveloperToken(cfg, nowSeconds, ttlSeconds, origins);
  const expiresAt = (nowSeconds + ttlSeconds) * 1000;
  cache.set(cacheKey, { value, expiresAt });
  return { token: value, expiresAt: new Date(expiresAt) };
}

/** Server→Apple only (may be signed by the SHARED key): never hand it to a client. */
async function appleServerToken(cfg = appleMusicServerKeyConfig()): Promise<{ token: string; expiresAt: Date } | null> {
  if (!cfg) return null;
  return mint(serverTokens, cfg.keyId, cfg, APPLE_DEVELOPER_TOKEN_TTL_SECONDS, 60 * 60 * 1000);
}

/**
 * The browser's MusicKit developer token (GET /music/apple/developer-token,
 * `getAppleMusicDeveloperTokenAction`): the dedicated WEB key only, 1 h,
 * `origin` = our web origins. No web key, or Apple rejected it →
 * `not_configured` (the web sheet already says "Próximamente" from
 * `webAvailable: false`; a token Apple refuses would only fail mid-flow).
 * Cached per instance, re-minted with < 30 min left.
 */
export async function appleWebDeveloperToken(): Promise<{ token: string; expiresAt: Date }> {
  const cfg = appleMusicWebKeyConfig();
  if (!cfg || cfg.source !== "dedicated") throw notConfigured("apple_music");
  if ((await probeKey(cfg)) === "rejected") throw notConfigured("apple_music");
  const origins = appleMusicWebOrigins();
  return mint(webTokens, `${cfg.keyId} ${origins.join(" ")}`, cfg, APPLE_WEB_TOKEN_TTL_SECONDS, 30 * 60 * 1000, origins);
}

function forgetTokens(keyId: string): void {
  serverTokens.delete(keyId);
  for (const k of [...webTokens.keys()]) if (k.startsWith(`${keyId} `)) webTokens.delete(k);
}

const probeCache = new Map<string, { ok: boolean; at: number }>();
const PROBE_TTL_MS = 60 * 60 * 1000;

/**
 * Does Apple accept this key for MusicKit? A 401/403 (or a key that doesn't
 * import) = "rejected", cached 1 h. A network error/5xx is NOT a verdict
 * ("unknown", not cached: stays available; the export reports failures).
 */
async function probeKey(cfg: AppleMusicKeyConfig): Promise<"ok" | "rejected" | "unknown"> {
  const now = Date.now();
  const hit = probeCache.get(cfg.keyId);
  if (hit && now - hit.at < PROBE_TTL_MS) return hit.ok ? "ok" : "rejected";
  try {
    const dev = await appleServerToken(cfg);
    if (!dev) return "unknown";
    const res = await fetch(`${API}/storefronts/${CATALOG_STOREFRONT}`, {
      headers: { Authorization: `Bearer ${dev.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      console.warn(`[music-export] apple probe rejected status=${res.status} key=${cfg.source}`);
      probeCache.set(cfg.keyId, { ok: false, at: now });
      forgetTokens(cfg.keyId);
      return "rejected";
    }
    if (res.ok) probeCache.set(cfg.keyId, { ok: true, at: now });
    return res.ok ? "ok" : "unknown";
  } catch (err) {
    // A key that doesn't import (bad PEM) is a verdict; a timeout is not.
    if (err instanceof Error && /key|pkcs8|asn1/i.test(err.message)) {
      console.warn(`[music-export] apple key unusable key=${cfg.source}: ${err.name}`);
      probeCache.set(cfg.keyId, { ok: false, at: now });
      return "rejected";
    }
    return "unknown";
  }
}

/**
 * `services.apple_music`:
 *   - `available` — iOS reads THIS: the server has a MusicKit key Apple
 *     accepts (dedicated or shared; iOS itself uses native MusicKit, the key
 *     is what the ISRC lookup and the founder's on/off rest on);
 *   - `webAvailable` — the web reads THIS: `available` AND the dedicated web
 *     key exists and Apple accepts it (only it may sign the browser token);
 *   - `reason` — why `available` is false (`not_configured` | `key_rejected`).
 */
export async function appleMusicProbe(): Promise<MusicServices["apple_music"]> {
  const server = appleMusicServerKeyConfig();
  if (!server) return { available: false, webAvailable: false, reason: "not_configured" };
  const serverVerdict = await probeKey(server);
  if (serverVerdict === "rejected") return { available: false, webAvailable: false, reason: "key_rejected" };
  const web = appleMusicWebKeyConfig();
  const webVerdict = !web ? "rejected" : web.keyId === server.keyId ? serverVerdict : await probeKey(web);
  return { available: true, webAvailable: webVerdict !== "rejected" };
}

/**
 * ISRC per Apple catalog song id (storefront mx, where the iTunes search
 * found them). A song Apple no longer lists is simply absent from the map.
 * THROWS on HTTP/network failure (the caller decides: the TIDAL step falls
 * back to title+artist search). Null when the deploy has no key.
 */
export async function appleCatalogIsrcs(ids: readonly string[]): Promise<Map<string, string> | null> {
  const dev = await appleServerToken();
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
      const cfg = appleMusicServerKeyConfig();
      if (cfg) {
        forgetTokens(cfg.keyId);
        probeCache.delete(cfg.keyId);
      }
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

/**
 * Catalog reads for the LIBRARY catalog (album search, album detail, an
 * artist's discography, the party's song search — `catalog/apple-catalog.ts`),
 * signed with the SERVER token (never leaves the server).
 *
 * `path` is relative to `/v1` (`/catalog/us/search`) or a `next` href Apple
 * handed back (`/v1/catalog/…?offset=25`). Returns:
 *   - null when this deploy can't ask Apple (no key, or the key was REJECTED
 *     in the last hour): the caller falls back to the keyless iTunes API;
 *   - the parsed JSON on 2xx;
 * and THROWS on any other answer (HTTP error, network, timeout) — the caller
 * logs and falls back too. A 401/403 also forgets the token and marks the key
 * rejected, so the next calls go straight to the fallback for an hour
 * instead of failing one by one.
 */
export async function appleCatalogGet<T>(
  path: string,
  params: Record<string, string> = {},
  opts: { revalidate?: number; noStore?: boolean; signal?: AbortSignal } = {},
): Promise<T | null> {
  const cfg = appleMusicServerKeyConfig();
  if (!cfg) return null;
  const known = probeCache.get(cfg.keyId);
  if (known && !known.ok && Date.now() - known.at < PROBE_TTL_MS) return null;
  const dev = await appleServerToken(cfg);
  if (!dev) return null;

  const url = new URL(path.startsWith("/v1/") ? `https://api.music.apple.com${path}` : `${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${dev.token}` },
    signal: opts.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    ...(opts.noStore || opts.revalidate == null
      ? { cache: "no-store" as const }
      : { next: { revalidate: opts.revalidate } }),
  });
  if (res.status === 401 || res.status === 403) {
    console.warn(`[catalog] apple catalog rejected status=${res.status} key=${cfg.source}`);
    forgetTokens(cfg.keyId);
    probeCache.set(cfg.keyId, { ok: false, at: Date.now() });
    throw new Error(`apple catalog ${url.pathname}: ${res.status}`);
  }
  if (!res.ok) throw new Error(`apple catalog ${url.pathname}: ${res.status}`);
  return (await res.json()) as T;
}
