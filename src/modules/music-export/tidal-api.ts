import "server-only";
import { budgetLeftMs, StepBudgetError } from "./budget";
import { TIDAL_API_BASE, TIDAL_SCOPES, TIDAL_TOKEN_URL, type TidalOAuthConfig } from "./config";
import { isoDurationMs, normalizeIsrc, type TrackCandidate } from "./match";
import { TIDAL_ADD_CHUNK, tidalPlaylistUrl } from "./rules";

/**
 * TIDAL HTTP — every call the export makes, and nothing else. Contract
 * source of truth: the OpenAPI at
 * https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json
 * (learning 2026-09-02-tidal-search-endpoint…: not forum examples).
 * Verified against that file on 2026-09-29:
 *   - authorize `https://login.tidal.com/authorize`, token
 *     `https://auth.tidal.com/v1/oauth2/token` (Authorization_Code_PKCE);
 *   - `POST /playlists` (scope playlists.write) body `{data:{type:"playlists",
 *     attributes:{name, description?, accessType?: PUBLIC|UNLISTED}}}`,
 *     header `Idempotency-Key` (same key + same payload = original response
 *     replayed) → 201 `{data:{id,…}}`;
 *   - `POST /playlists/{id}/relationships/items` (playlists.write), 1..50
 *     `{id, type:"tracks"}` + `meta.onDuplicates: "SKIP"` (adds only absent);
 *   - `GET /tracks?filter[isrc]=…` (client credentials OK; several ISRCs →
 *     one track per ISRC), `attributes.isrc`, `duration` ISO 8601;
 *   - `GET /searchResults?filter[query]=…&include=tracks` (client credentials);
 *   - `GET /users/me` (user.read) → `attributes.country`;
 *   - `DELETE /playlists/{id}` (playlists.write) → 200 (verified 2026-10-01;
 *     used only to remove a playlist a step created and could not record).
 * NOT in the OpenAPI (auth server), assumed from TIDAL's SDK docs and to be
 * verified on the first real connection: the token endpoint's form fields
 * (`client_id`, `code`, `code_verifier`, `redirect_uri`,
 * `grant_type=authorization_code` / `refresh_token`) and response
 * (`access_token`, `refresh_token`, `expires_in`, `scope`, optional
 * `user_id` / `user.countryCode`). See export-contract.md › Supuestos.
 *
 * Tokens never reach a log line: errors carry the HTTP status only.
 */

const TIMEOUT_MS = 6000;

export class TidalHttpError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  /** JSON:API `errors[].code` of a 4xx (sanitized; never `detail`, never the body). */
  readonly codes: readonly string[];
  /** Which call failed (`app_token`, `refresh`, `search`…): the label `call` was given. */
  readonly what: string;
  /** The auth server's OAuth `error` of a 4xx (RFC 6749 §5.2: `invalid_grant`,
   *  `invalid_client`…), sanitized like `codes`. Null for API (JSON:API) errors. */
  readonly oauthError: string | null;
  constructor(
    what: string,
    status: number,
    retryAfterSeconds: number | null = null,
    codes: readonly string[] = [],
    oauthError: string | null = null,
  ) {
    const tags = oauthError ? [oauthError, ...codes] : codes;
    super(`tidal ${what}: ${status}${tags.length ? ` [${tags.join(",")}]` : ""}`);
    this.name = "TidalHttpError";
    this.what = what;
    this.oauthError = oauthError;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.codes = codes;
  }
}

const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * What a 4xx body says, as identifiers only: the `errors[].code` list of a
 * JSON:API error (max 5) and the OAuth `error` of the auth server
 * (`{"error":"invalid_grant"}`). Never `detail`/`error_description`.
 */
async function errorCodes(res: Response): Promise<{ codes: string[]; oauthError: string | null }> {
  try {
    const doc = (await res.json()) as { errors?: { code?: unknown }[]; error?: unknown };
    const codes = (Array.isArray(doc?.errors) ? doc.errors : [])
      .map((e) => e?.code)
      .filter((c): c is string => typeof c === "string" && CODE_RE.test(c))
      .slice(0, 5);
    const oauthError = typeof doc?.error === "string" && CODE_RE.test(doc.error) ? doc.error : null;
    return { codes, oauthError };
  } catch {
    return { codes: [], oauthError: null };
  }
}

function retryAfterOf(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * One request. Its timeout is `TIMEOUT_MS` or what is left of the step's
 * budget (budget.ts), whichever is shorter. Inside a step, a call that timed
 * out — or that the budget didn't let start — throws `StepBudgetError`: the
 * caller decides what stays pending (matching) or fails the step (writes).
 * Outside a step a timeout is the plain `TimeoutError` it always was.
 */
async function call(what: string, url: URL | string, init: RequestInit): Promise<Response> {
  const left = budgetLeftMs();
  if (left <= 0) throw new StepBudgetError(what);
  const timeoutMs = Math.min(TIMEOUT_MS, left);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (err) {
    // Inside a step EVERY timeout is the budget's business, the full 6 s
    // one included: a search that hangs must cost that song a turn (it stays
    // pending), not throw away the songs that did match in the same batch.
    if (Number.isFinite(left) && err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new StepBudgetError(what);
    }
    throw err;
  }
  if (!res.ok) {
    const body =
      res.status >= 400 && res.status < 500 && res.status !== 429 ? await errorCodes(res) : { codes: [], oauthError: null };
    throw new TidalHttpError(what, res.status, retryAfterOf(res), body.codes, body.oauthError);
  }
  return res;
}

// ---------- OAuth (user tokens) ----------

export interface TidalTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scope: string | null;
  externalUserId: string | null;
  countryCode: string | null;
}

function tokenSetOf(data: Record<string, unknown>): TidalTokenSet | null {
  const accessToken = typeof data.access_token === "string" ? data.access_token : null;
  if (!accessToken) return null;
  const user = (data.user ?? {}) as Record<string, unknown>;
  const uid = data.user_id ?? user.userId ?? user.id;
  const cc = user.countryCode ?? data.country_code;
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresInSeconds: typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 3600,
    scope: typeof data.scope === "string" ? data.scope : null,
    externalUserId: uid === undefined || uid === null ? null : String(uid).slice(0, 64),
    countryCode: typeof cc === "string" && /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : null,
  };
}

async function tokenRequest(what: string, body: URLSearchParams): Promise<TidalTokenSet> {
  const res = await call(what, TIDAL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const set = tokenSetOf((await res.json()) as Record<string, unknown>);
  if (!set) throw new TidalHttpError(what, 502);
  return set;
}

/** authorization_code + PKCE (public-client form: client_id, no secret). */
export function exchangeTidalCode(
  cfg: TidalOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<TidalTokenSet> {
  return tokenRequest(
    "token",
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: codeVerifier,
    }),
  );
}

export function refreshTidalToken(cfg: TidalOAuthConfig, refreshToken: string): Promise<TidalTokenSet> {
  return tokenRequest(
    "refresh",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      refresh_token: refreshToken,
      scope: TIDAL_SCOPES,
    }),
  );
}

// ---------- app token (client credentials: catalog reads) ----------

let appToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(cfg: TidalOAuthConfig): Promise<string> {
  const now = Date.now();
  if (appToken && appToken.expiresAt > now) return appToken.value;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await call("app_token", TIDAL_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new TidalHttpError("app_token", 502);
  const ttlMs = Math.max(60, (data.expires_in ?? 3600) - 60) * 1000;
  appToken = { value: data.access_token, expiresAt: now + ttlMs };
  return data.access_token;
}

/**
 * Runs `fn` with the cached app token; a 401 means TIDAL no longer accepts
 * it (revoked or rotated before our `expires_in` bookkeeping said so): the
 * cache is emptied and `fn` runs ONCE more with a fresh token. Without this
 * every catalog call of the instance failed until the cached expiry.
 * Only the entry that was refused is dropped, so two concurrent 401s don't
 * throw away the token the other one just fetched.
 */
async function withAppToken<T>(cfg: TidalOAuthConfig, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getAppToken(cfg);
  try {
    return await fn(token);
  } catch (err) {
    if (!(err instanceof TidalHttpError && err.status === 401)) throw err;
    if (appToken?.value === token) appToken = null;
    return fn(await getAppToken(cfg));
  }
}

/** Test seam (db-harness): forget the cached app token. */
export function resetTidalAppTokenForTests(): void {
  appToken = null;
}

function jsonApi(token: string, extra: Record<string, string> = {}): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.api+json", ...extra };
}

// ---------- JSON:API plumbing ----------

interface Res {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string }[] }>;
}
interface Doc {
  data?: Res[] | Res;
  included?: Res[];
}

function asList(d: Doc["data"]): Res[] {
  return Array.isArray(d) ? d : d ? [d] : [];
}

function artistNames(doc: Doc): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of doc.included ?? []) {
    if (r.type === "artists" && typeof r.attributes?.name === "string") m.set(r.id, r.attributes.name);
  }
  return m;
}

function toCandidate(r: Res, names: Map<string, string>): TrackCandidate | null {
  const title = r.attributes?.title;
  if (r.type !== "tracks" || typeof title !== "string") return null;
  const version = r.attributes?.version;
  return {
    id: r.id,
    title,
    version: typeof version === "string" && version.trim() ? version : null,
    artists: (r.relationships?.artists?.data ?? [])
      .map((ref) => names.get(ref.id))
      .filter((n): n is string => Boolean(n)),
    durationMs: isoDurationMs(r.attributes?.duration),
    isrc: normalizeIsrc(r.attributes?.isrc),
  };
}

// ---------- catalog (app token) ----------

/** ISRC → TIDAL track id, for up to ~20 ISRCs in one call. */
export async function tidalTracksByIsrc(
  cfg: TidalOAuthConfig,
  isrcs: readonly string[],
  countryCode: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (isrcs.length === 0) return out;
  const url = new URL(`${TIDAL_API_BASE}/tracks`);
  for (const isrc of isrcs) url.searchParams.append("filter[isrc]", isrc);
  url.searchParams.set("countryCode", countryCode);
  const doc = await withAppToken(
    cfg,
    async (token) => (await (await call("tracks_isrc", url, { headers: jsonApi(token) })).json()) as Doc,
  );
  for (const r of asList(doc.data)) {
    const isrc = normalizeIsrc(r.attributes?.isrc);
    if (r.type === "tracks" && isrc && !out.has(isrc)) out.set(isrc, r.id);
  }
  return out;
}

/** Title+artist search → candidates with credited artists (filled in one
 *  extra `/tracks?filter[id]` call when the nested include was ignored). */
export async function tidalSearchTracks(
  cfg: TidalOAuthConfig,
  term: string,
  countryCode: string,
): Promise<TrackCandidate[]> {
  const url = new URL(`${TIDAL_API_BASE}/searchResults`);
  url.searchParams.set("filter[query]", term.slice(0, 256));
  url.searchParams.set("countryCode", countryCode);
  url.searchParams.set("include", "tracks,tracks.artists");
  const doc = await withAppToken(
    cfg,
    async (token) => (await (await call("search", url, { headers: jsonApi(token) })).json()) as Doc,
  );
  const tracks = new Map<string, Res>();
  for (const r of doc.included ?? []) if (r.type === "tracks") tracks.set(r.id, r);
  const ordered = asList(doc.data)[0]?.relationships?.tracks?.data?.map((x) => x.id) ?? [...tracks.keys()];
  const names = artistNames(doc);
  let out = ordered
    .map((id) => tracks.get(id))
    .filter((r): r is Res => Boolean(r))
    .slice(0, 10)
    .map((r) => toCandidate(r, names))
    .filter((c): c is TrackCandidate => c !== null);
  if (out.some((c) => c.artists.length === 0)) {
    const ids = new URL(`${TIDAL_API_BASE}/tracks`);
    for (const c of out) ids.searchParams.append("filter[id]", c.id);
    ids.searchParams.set("countryCode", countryCode);
    ids.searchParams.set("include", "artists");
    const more = await withAppToken(
      cfg,
      async (token) => (await (await call("tracks_ids", ids, { headers: jsonApi(token) })).json()) as Doc,
    );
    const moreNames = artistNames(more);
    const filled = new Map(
      asList(more.data)
        .map((r) => toCandidate(r, moreNames))
        .filter((c): c is TrackCandidate => c !== null)
        .map((c) => [c.id, c.artists]),
    );
    out = out.map((c) => (c.artists.length > 0 ? c : { ...c, artists: filled.get(c.id) ?? [] }));
  }
  return out;
}

// ---------- the user's account (user token) ----------

export async function tidalMeCountry(accessToken: string): Promise<string | null> {
  const res = await call("me", `${TIDAL_API_BASE}/users/me`, { headers: jsonApi(accessToken) });
  const doc = (await res.json()) as Doc;
  const cc = asList(doc.data)[0]?.attributes?.country;
  return typeof cc === "string" && /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : null;
}

export async function tidalCreatePlaylist(
  accessToken: string,
  input: { name: string; description: string; idempotencyKey: string },
): Promise<{ id: string; url: string | null }> {
  const res = await call("create_playlist", `${TIDAL_API_BASE}/playlists`, {
    method: "POST",
    headers: jsonApi(accessToken, {
      "Content-Type": "application/vnd.api+json",
      "Idempotency-Key": input.idempotencyKey,
    }),
    body: JSON.stringify({
      data: {
        type: "playlists",
        attributes: { name: input.name.slice(0, 250), description: input.description.slice(0, 500), accessType: "UNLISTED" },
      },
    }),
  });
  const doc = (await res.json()) as Doc;
  const pl = asList(doc.data)[0];
  if (!pl?.id) throw new TidalHttpError("create_playlist", 502);
  const links = (pl.attributes?.externalLinks ?? []) as { href?: string }[];
  const href = links.find((l) => typeof l.href === "string")?.href ?? null;
  return { id: pl.id, url: tidalPlaylistUrl(pl.id, href) };
}

/**
 * Does the playlist still exist for this user? `GET /playlists/{id}` (user
 * token): 404 → false; anything else not-ok THROWS (the caller decides).
 * A 404 on ADD doesn't prove the playlist is gone (a track id can 404 too):
 * this is the confirmation before starting a new generation.
 */
export async function tidalPlaylistExists(accessToken: string, playlistId: string): Promise<boolean> {
  try {
    await call("get_playlist", `${TIDAL_API_BASE}/playlists/${encodeURIComponent(playlistId)}`, {
      headers: jsonApi(accessToken),
    });
    return true;
  } catch (err) {
    if (err instanceof TidalHttpError && err.status === 404) return false;
    throw err;
  }
}

/**
 * Deletes a playlist of the user's (`DELETE /playlists/{id}`, user token).
 * 404 = already gone = done. Only for a playlist a step created and could
 * not record (exports.ts): we never delete one the person can see in kura.
 */
export async function tidalDeletePlaylist(accessToken: string, playlistId: string): Promise<void> {
  try {
    await call("delete_playlist", `${TIDAL_API_BASE}/playlists/${encodeURIComponent(playlistId)}`, {
      method: "DELETE",
      headers: jsonApi(accessToken),
    });
  } catch (err) {
    if (err instanceof TidalHttpError && err.status === 404) return;
    throw err;
  }
}

/** Appends `trackIds` in order; duplicates already in the playlist are skipped by TIDAL. */
export async function tidalAddTracks(accessToken: string, playlistId: string, trackIds: readonly string[]): Promise<void> {
  for (let i = 0; i < trackIds.length; i += TIDAL_ADD_CHUNK) {
    const chunk = trackIds.slice(i, i + TIDAL_ADD_CHUNK);
    await call("add_items", `${TIDAL_API_BASE}/playlists/${encodeURIComponent(playlistId)}/relationships/items`, {
      method: "POST",
      headers: jsonApi(accessToken, { "Content-Type": "application/vnd.api+json" }),
      body: JSON.stringify({
        data: chunk.map((id) => ({ id, type: "tracks" })),
        meta: { onDuplicates: "SKIP" },
      }),
    });
  }
}
