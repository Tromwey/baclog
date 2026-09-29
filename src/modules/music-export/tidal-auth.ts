import "server-only";
import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { checkRateLimit } from "@/authz/api";
import { db } from "@/db";
import { musicConnections, musicOauthStates } from "@/db/schema";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { TIDAL_AUTHORIZE_URL, TIDAL_SCOPES, tidalOAuthConfig, type TidalOAuthConfig } from "./config";
import { assertMusicExportLive, MusicExportError, notConfigured, notConnected, serviceFailed } from "./errors";
import {
  clientOfState,
  codeChallengeS256,
  hashOAuthState,
  newCodeVerifier,
  newOAuthState,
  tidalAuthorizeUrl,
  type OAuthClient,
} from "./pkce";
import { exchangeTidalCode, refreshTidalToken, TidalHttpError, tidalMeCountry, type TidalTokenSet } from "./tidal-api";

/**
 * TIDAL account link (OAuth 2.1 authorization code + PKCE), server-side.
 *
 * Why the finish needs the SAME Kura credential that started it: a `state`
 * bound only to "who started" lets an attacker start a flow, send the TIDAL
 * consent link to a victim, and have the VICTIM's TIDAL linked to the
 * ATTACKER's Kura account (then write playlists into it). So:
 *   - web: the callback only finishes when the browser's cookie session is
 *     the user who started (`client = "web"`);
 *   - iOS: the callback only PARKS the code (encrypted) and bounces to
 *     `kura://music/tidal/authorized?ref=<state>`; the app finishes with
 *     `POST /api/v1/music/tidal/complete { ref }` and ITS bearer must be the
 *     user who started (`client = "ios"`).
 * The state is 1 letter of client hint (`w`/`i`, so the callback knows where
 * to bounce even for a dead state) + 43 chars of randomness; only its sha256
 * is stored; single use (DELETE … RETURNING); 10 minutes of life.
 *
 * Tokens: encrypted at rest (secret-box, AAD = user + provider + field),
 * refreshed 2 min before expiry, never logged, never returned to a client.
 */

const STATE_TTL_MS = 10 * 60 * 1000;
const STARTS_PER_MINUTE = 10;
const PURPOSE = "music-token";


const aadConn = (userId: string, field: "access" | "refresh") => `music-connection:${userId}:tidal:${field}`;
const aadState = (hash: string, field: "verifier" | "code") => `music-oauth:${hash}:${field}`;

function requireConfig(): TidalOAuthConfig {
  const cfg = tidalOAuthConfig();
  if (!cfg) throw notConfigured("tidal");
  return cfg;
}

// ---------- start ----------

/** A fresh TIDAL consent URL for `userId`. `returnTo` (web) is already allow-listed. */
export async function startTidalAuth(userId: string, client: OAuthClient, returnTo: string | null): Promise<string> {
  assertMusicExportLive();
  const cfg = requireConfig();
  const rl = checkRateLimit(`tidal-start:${userId}`, STARTS_PER_MINUTE);
  if (!rl.ok) {
    throw new MusicExportError(
      "rate_limited",
      "rate_limited",
      "Demasiados intentos seguidos. Espera un momento e inténtalo de nuevo.",
      rl.retryAfterSeconds,
    );
  }
  const state = newOAuthState(client);
  const hash = hashOAuthState(state);
  const verifier = newCodeVerifier();
  await db.batch([
    // Housekeeping: this user's dead attempts.
    db.delete(musicOauthStates).where(and(eq(musicOauthStates.userId, userId), lt(musicOauthStates.expiresAt, new Date()))),
    db.insert(musicOauthStates).values({
      stateHash: hash,
      userId,
      provider: "tidal",
      client,
      codeVerifierEnc: sealSecret(verifier, PURPOSE, aadState(hash, "verifier")),
      returnTo: client === "web" ? returnTo : null,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    }),
  ]);
  return tidalAuthorizeUrl({
    authorizeUrl: TIDAL_AUTHORIZE_URL,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    scopes: TIDAL_SCOPES,
    state,
    codeChallenge: codeChallengeS256(verifier),
  });
}

// ---------- callback ----------

export type CallbackOutcome =
  | { client: "web"; ok: true; returnTo: string | null }
  | { client: "web"; ok: false; returnTo: string | null; reason: CallbackFailure }
  | { client: "ios"; ok: true; ref: string }
  | { client: "ios"; ok: false; reason: CallbackFailure };

export type CallbackFailure = "denied" | "expired" | "session" | "exchange" | "unavailable";

/**
 * GET /api/music/tidal/callback?code&state[&error]. `sessionUserId` = the
 * web cookie user (null when none). Never throws for an expected failure.
 */
export async function handleTidalCallback(
  params: { state: string | null; code: string | null; error: string | null },
  sessionUserId: string | null,
): Promise<CallbackOutcome> {
  const client = params.state ? clientOfState(params.state) : null;
  if (!params.state || !client) return { client: "web", ok: false, returnTo: null, reason: "expired" };
  const state = params.state;
  const hash = hashOAuthState(state);
  const now = new Date();

  if (client === "ios") {
    if (params.error || !params.code) {
      await db.delete(musicOauthStates).where(eq(musicOauthStates.stateHash, hash));
      return { client, ok: false, reason: params.error ? "denied" : "expired" };
    }
    const parked = await db
      .update(musicOauthStates)
      .set({ codeEnc: sealSecret(params.code.slice(0, 2048), PURPOSE, aadState(hash, "code")) })
      .where(
        and(
          eq(musicOauthStates.stateHash, hash),
          eq(musicOauthStates.client, "ios"),
          isNull(musicOauthStates.codeEnc),
          gt(musicOauthStates.expiresAt, now),
        ),
      )
      .returning({ userId: musicOauthStates.userId });
    return parked.length > 0 ? { client, ok: true, ref: state } : { client, ok: false, reason: "expired" };
  }

  // Web: consume first (single use whatever happens next), then judge.
  const [row] = await db.delete(musicOauthStates).where(eq(musicOauthStates.stateHash, hash)).returning();
  const returnTo = row?.returnTo ?? null;
  if (!row || row.client !== "web" || row.expiresAt <= now) return { client, ok: false, returnTo, reason: "expired" };
  if (params.error || !params.code) return { client, ok: false, returnTo, reason: "denied" };
  if (!sessionUserId || sessionUserId !== row.userId) {
    console.warn(`[music-export] tidal callback session mismatch (has_session=${sessionUserId !== null})`);
    return { client, ok: false, returnTo, reason: "session" };
  }
  const verifier = openSecret(row.codeVerifierEnc, PURPOSE, aadState(hash, "verifier"));
  if (!verifier) return { client, ok: false, returnTo, reason: "expired" };
  try {
    await exchangeAndSave(row.userId, params.code, verifier);
    return { client, ok: true, returnTo };
  } catch (err) {
    console.warn(`[music-export] tidal code exchange failed: ${describe(err)}`);
    return { client, ok: false, returnTo, reason: "exchange" };
  }
}

// ---------- iOS complete ----------

/** `POST /api/v1/music/tidal/complete { ref }` — the bearer must be the starter. */
export async function completeTidalAuth(userId: string, ref: string): Promise<void> {
  assertMusicExportLive();
  requireConfig();
  const expired = new MusicExportError(
    "conflict",
    "auth_expired",
    "La conexión con TIDAL caducó o ya se usó. Vuelve a intentarlo.",
  );
  if (clientOfState(ref) !== "ios") throw expired;
  const hash = hashOAuthState(ref);
  const [row] = await db
    .delete(musicOauthStates)
    .where(
      and(
        eq(musicOauthStates.stateHash, hash),
        eq(musicOauthStates.userId, userId),
        eq(musicOauthStates.client, "ios"),
        isNotNull(musicOauthStates.codeEnc),
        gt(musicOauthStates.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) throw expired;
  const verifier = openSecret(row.codeVerifierEnc, PURPOSE, aadState(hash, "verifier"));
  const code = openSecret(row.codeEnc, PURPOSE, aadState(hash, "code"));
  if (!verifier || !code) throw expired;
  try {
    await exchangeAndSave(userId, code, verifier);
  } catch (err) {
    console.warn(`[music-export] tidal code exchange failed: ${describe(err)}`);
    if (err instanceof TidalHttpError && err.status >= 400 && err.status < 500) throw expired;
    throw serviceFailed("tidal");
  }
}

// ---------- the stored link ----------

async function exchangeAndSave(userId: string, code: string, verifier: string): Promise<void> {
  const set = await exchangeTidalCode(requireConfig(), code, verifier);
  await saveConnection(userId, set);
}

async function saveConnection(userId: string, set: TidalTokenSet, previousRefreshEnc?: string | null): Promise<void> {
  let country = set.countryCode;
  if (!country) {
    try {
      country = await tidalMeCountry(set.accessToken);
    } catch (err) {
      // Not fatal: exports fall back to the party's storefront (MX).
      console.warn(`[music-export] tidal users/me failed: ${describe(err)}`);
    }
  }
  const now = new Date();
  const values = {
    accessTokenEnc: sealSecret(set.accessToken, PURPOSE, aadConn(userId, "access")),
    // TIDAL may not rotate the refresh token: keep the old one when absent.
    refreshTokenEnc: set.refreshToken
      ? sealSecret(set.refreshToken, PURPOSE, aadConn(userId, "refresh"))
      : (previousRefreshEnc ?? null),
    expiresAt: new Date(now.getTime() + set.expiresInSeconds * 1000),
    scope: set.scope,
    externalUserId: set.externalUserId,
    updatedAt: now,
  };
  await db
    .insert(musicConnections)
    .values({ userId, provider: "tidal", ...values, countryCode: country })
    .onConflictDoUpdate({
      target: [musicConnections.userId, musicConnections.provider],
      set: { ...values, countryCode: country ? country : sql`${musicConnections.countryCode}` },
    });
}

export async function isTidalConnected(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: musicConnections.id })
    .from(musicConnections)
    .where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, "tidal")))
    .limit(1);
  return Boolean(row);
}

export async function disconnectTidal(userId: string): Promise<void> {
  assertMusicExportLive();
  await db
    .delete(musicConnections)
    .where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, "tidal")));
}

export interface TidalAccess {
  accessToken: string;
  countryCode: string | null;
}

/**
 * A usable user token, refreshed when it expires within 2 minutes (or when
 * `force`, after a 401). A refresh TIDAL refuses (4xx) drops the link →
 * `not_connected` (the UI offers "Conectar TIDAL" again) — unless another
 * request refreshed it meanwhile (rotating refresh tokens + two steps in
 * flight), in which case the fresh row wins.
 */
export async function getTidalAccess(userId: string, force = false): Promise<TidalAccess> {
  const cfg = requireConfig();
  const row = await loadConnection(userId);
  if (!row) throw notConnected("tidal");
  const access = openSecret(row.accessTokenEnc, PURPOSE, aadConn(userId, "access"));
  if (access && !force && row.expiresAt.getTime() - Date.now() > 2 * 60 * 1000) {
    return { accessToken: access, countryCode: row.countryCode };
  }
  const refresh = openSecret(row.refreshTokenEnc, PURPOSE, aadConn(userId, "refresh"));
  if (!refresh) {
    await dropConnection(userId, row.updatedAt);
    throw notConnected("tidal");
  }
  try {
    const set = await refreshTidalToken(cfg, refresh);
    await saveConnection(userId, { ...set, countryCode: set.countryCode ?? row.countryCode }, row.refreshTokenEnc);
    return { accessToken: set.accessToken, countryCode: set.countryCode ?? row.countryCode };
  } catch (err) {
    if (err instanceof TidalHttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
      const fresh = await loadConnection(userId);
      if (fresh && fresh.updatedAt.getTime() !== row.updatedAt.getTime()) {
        const token = openSecret(fresh.accessTokenEnc, PURPOSE, aadConn(userId, "access"));
        if (token) return { accessToken: token, countryCode: fresh.countryCode };
      }
      console.warn(`[music-export] tidal refresh refused (${err.status}): link dropped`);
      await dropConnection(userId, row.updatedAt);
      throw notConnected("tidal");
    }
    console.warn(`[music-export] tidal refresh failed: ${describe(err)}`);
    throw serviceFailed("tidal");
  }
}

async function loadConnection(userId: string) {
  const [row] = await db
    .select({
      accessTokenEnc: musicConnections.accessTokenEnc,
      refreshTokenEnc: musicConnections.refreshTokenEnc,
      expiresAt: musicConnections.expiresAt,
      countryCode: musicConnections.countryCode,
      updatedAt: musicConnections.updatedAt,
    })
    .from(musicConnections)
    .where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, "tidal")))
    .limit(1);
  return row ?? null;
}

/** Deletes the link only if nobody refreshed it since we read it. */
async function dropConnection(userId: string, seenUpdatedAt: Date): Promise<void> {
  await db
    .delete(musicConnections)
    .where(
      and(
        eq(musicConnections.userId, userId),
        eq(musicConnections.provider, "tidal"),
        eq(musicConnections.updatedAt, seenUpdatedAt),
      ),
    );
}

/** Status/name only — never a body, a token or a code. */
export function describe(err: unknown): string {
  if (err instanceof TidalHttpError) return err.message;
  if (err instanceof Error) return err.name;
  return "error";
}
