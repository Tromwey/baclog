import "server-only";
import { env } from "@/lib/env";
import { pickAlbumMatch, searchTitle } from "./match";
import type { AlbumCandidate, AlbumQuery, ResolveOutcome } from "./types";

/**
 * TIDAL exact album link via the official API (developer.tidal.com), client
 * credentials flow — no user, catalogue read only. One search per
 * album-service in the lifetime of the media_link cache; free at our volume.
 *
 * Fail-open to the search floor, never a 500: no keys / 429 / 5xx / timeout
 * → "unavailable" (caller returns the fallback WITHOUT caching it, so the
 * next tap retries); a real "no confident match" → "none" (cached).
 */

const TOKEN_URL = "https://auth.tidal.com/v1/oauth2/token";
const API_BASE = "https://openapi.tidal.com/v2";
const TIMEOUT_MS = 4000;
const CANDIDATES = 10;

let tokenCache: { value: string; expiresAt: number } | null = null;

export function tidalAlbumUrl(id: string): string {
  return `https://tidal.com/album/${id}`;
}

export async function resolveTidalAlbum(
  query: AlbumQuery,
  countryCode: string,
): Promise<ResolveOutcome> {
  if (!env.TIDAL_CLIENT_ID || !env.TIDAL_CLIENT_SECRET) {
    return { kind: "unavailable", reason: "no_credentials" };
  }
  const term = [searchTitle(query.title) || query.title, query.byline]
    .filter(Boolean)
    .join(" ")
    .slice(0, 256);
  if (!term.trim()) return { kind: "none" };

  try {
    const token = await getToken();
    if (!token) return { kind: "unavailable", reason: "token" };

    const url = new URL(`${API_BASE}/searchResults`);
    url.searchParams.set("filter[query]", term);
    url.searchParams.set("countryCode", countryCode);
    url.searchParams.set("include", "albums,albums.artists");
    const res = await apiGet(url, token);
    if (res.status === 401) {
      tokenCache = null; // stale/revoked token: next tap re-mints
      return { kind: "unavailable", reason: "unauthorized" };
    }
    // A 404 here is a routing/contract problem, not "nothing indexed" (zero
    // hits come back 200 with empty relationships) — never freeze it in cache.
    if (res.status === 404) return { kind: "unavailable", reason: "search_404" };
    if (!res.ok) return { kind: "unavailable", reason: `search_${res.status}` };

    const doc = (await res.json()) as JsonApiDoc;
    let candidates = candidatesFrom(doc).slice(0, CANDIDATES);
    if (candidates.length === 0) return { kind: "none" };

    // Nested include may be ignored by the upstream — fill missing artist
    // credits with one batched /albums call before matching (never match
    // on title alone).
    if (candidates.some((c) => c.artists.length === 0)) {
      const filled = await fetchArtists(
        candidates.map((c) => c.id),
        countryCode,
        token,
      );
      if (filled === null) return { kind: "unavailable", reason: "artists" };
      candidates = candidates.map((c) =>
        c.artists.length > 0 ? c : { ...c, artists: filled.get(c.id) ?? [] },
      );
    }

    const match = pickAlbumMatch(query, candidates);
    return match
      ? { kind: "exact", url: tidalAlbumUrl(match.id) }
      : { kind: "none" };
  } catch (err) {
    // AbortError (timeout), DNS, JSON parse — all transient from our side.
    return {
      kind: "unavailable",
      reason: err instanceof Error ? err.name : "error",
    };
  }
}

async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.value;
  const basic = Buffer.from(
    `${env.TIDAL_CLIENT_ID}:${env.TIDAL_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;
  // Refresh a minute early so an in-flight search never carries an expiring token.
  const ttlMs = Math.max(60, (data.expires_in ?? 3600) - 60) * 1000;
  tokenCache = { value: data.access_token, expiresAt: now + ttlMs };
  return data.access_token;
}

function apiGet(url: URL, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: 0 },
  });
}

async function fetchArtists(
  albumIds: string[],
  countryCode: string,
  token: string,
): Promise<Map<string, string[]> | null> {
  const url = new URL(`${API_BASE}/albums`);
  for (const id of albumIds.slice(0, 20)) {
    url.searchParams.append("filter[id]", id);
  }
  url.searchParams.set("countryCode", countryCode);
  url.searchParams.set("include", "artists");
  const res = await apiGet(url, token);
  if (!res.ok) return null;
  const doc = (await res.json()) as JsonApiDoc;
  const artistNames = artistIndex(doc);
  const out = new Map<string, string[]>();
  for (const album of doc.data ?? []) {
    if (album.type !== "albums") continue;
    out.set(album.id, creditedNames(album, artistNames));
  }
  return out;
}

// --- JSON:API plumbing (minimal, defensive: the shape we don't use is ignored)

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string }[] }>;
}
interface JsonApiDoc {
  data?: JsonApiResource[];
  included?: JsonApiResource[];
}

function artistIndex(doc: JsonApiDoc): Map<string, string> {
  const names = new Map<string, string>();
  for (const r of doc.included ?? []) {
    if (r.type === "artists" && typeof r.attributes?.name === "string") {
      names.set(r.id, r.attributes.name);
    }
  }
  return names;
}

function creditedNames(
  album: JsonApiResource,
  names: Map<string, string>,
): string[] {
  return (album.relationships?.artists?.data ?? [])
    .map((ref) => names.get(ref.id))
    .filter((n): n is string => Boolean(n));
}

function candidatesFrom(doc: JsonApiDoc): AlbumCandidate[] {
  const albums = new Map<string, JsonApiResource>();
  for (const r of doc.included ?? []) {
    if (r.type === "albums") albums.set(r.id, r);
  }
  // Relevance order lives in the search resource's relationship list; fall
  // back to `included` order when the upstream omits it.
  const ordered =
    doc.data?.[0]?.relationships?.albums?.data?.map((ref) => ref.id) ??
    [...albums.keys()];
  const names = artistIndex(doc);
  const out: AlbumCandidate[] = [];
  for (const id of ordered) {
    const album = albums.get(id);
    const title = album?.attributes?.title;
    if (!album || typeof title !== "string") continue;
    const albumType = album.attributes?.albumType;
    const releaseDate = album.attributes?.releaseDate;
    out.push({
      id,
      title,
      artists: creditedNames(album, names),
      releaseDate: typeof releaseDate === "string" ? releaseDate : null,
      albumType:
        albumType === "ALBUM" || albumType === "EP" || albumType === "SINGLE"
          ? albumType
          : null,
    });
  }
  return out;
}
