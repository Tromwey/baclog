import "server-only";
import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { checkRateLimit } from "@/authz/api";
import { db } from "@/db";
import { musicConnections, musicOauthStates } from "@/db/schema";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { afterResponse } from "@/lib/after-response";
import { budgetLeftMs, StepBudgetError, withDeadline, withinBudget } from "./budget";
import { TIDAL_AUTHORIZE_URL, TIDAL_SCOPES, tidalOAuthConfig, type TidalOAuthConfig } from "./config";
import { MusicExportError, notConfigured, notConnected, serviceFailed } from "./errors";
import {
  claimMatches,
  clientOfState,
  codeChallengeS256,
  hashClaim,
  hashOAuthState,
  newClaim,
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
 *   - iOS: the callback only PARKS the code (encrypted) with the hash of a
 *     fresh one-time `claim`, and bounces to
 *     `kura://music/tidal/authorized?ref=<state>&claim=<claim>`; the app
 *     finishes with `POST /api/v1/music/tidal/complete { ref, claim }` and
 *     ITS bearer must be the user who started (`client = "ios"`). The claim
 *     is what the bearer check alone can't give: the ref IS the state, which
 *     the starter already has in his authorize URL — so an attacker who got
 *     a victim to consent on it could otherwise complete it himself (learning
 *     2026-09-29-oauth-codigo-estacionado-csrf). The claim only travels in
 *     the bounce, to the browser that actually came back from TIDAL.
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
  const cfg = requireConfig();
  const rl = checkRateLimit(`tidal-start:${userId}`, STARTS_PER_MINUTE);
  if (!rl.ok) {
    throw new MusicExportError(
      "rate_limited",
      "rate_limited",
      "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.",
      rl.retryAfterSeconds,
    );
  }
  const state = newOAuthState(client);
  const hash = hashOAuthState(state);
  const verifier = newCodeVerifier();
  await db.batch([
    // Housekeeping: EVERY dead attempt, not just this user's (an abandoned
    // consent would otherwise sit there forever; `expires_idx` makes it cheap).
    db.delete(musicOauthStates).where(lt(musicOauthStates.expiresAt, new Date())),
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
  | { client: "ios"; ok: true; ref: string; claim: string }
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
    const claim = newClaim();
    const parked = await db
      .update(musicOauthStates)
      .set({
        codeEnc: sealSecret(params.code.slice(0, 2048), PURPOSE, aadState(hash, "code")),
        claimHash: hashClaim(claim),
      })
      .where(
        and(
          eq(musicOauthStates.stateHash, hash),
          eq(musicOauthStates.client, "ios"),
          isNull(musicOauthStates.codeEnc),
          gt(musicOauthStates.expiresAt, now),
        ),
      )
      .returning({ userId: musicOauthStates.userId });
    return parked.length > 0 ? { client, ok: true, ref: state, claim } : { client, ok: false, reason: "expired" };
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

/**
 * `POST /api/v1/music/tidal/complete { ref, claim }` — needs all three: the
 * ref, the claim the callback bounced (constant-time hash compare) and the
 * starter's bearer. Any miss is the SAME `auth_expired` and burns nothing:
 * the row is only consumed (DELETE … RETURNING, guarded by the claim hash we
 * just matched) once everything checked out, so a stranger's attempt never
 * spends the owner's parked code.
 */
export async function completeTidalAuth(userId: string, ref: string, claim: string): Promise<void> {
  requireConfig();
  const expired = new MusicExportError(
    "conflict",
    "auth_expired",
    "La conexión con TIDAL caducó o ya se usó. Vuelve a intentarlo.",
  );
  if (clientOfState(ref) !== "ios") throw expired;
  const hash = hashOAuthState(ref);
  const live = and(
    eq(musicOauthStates.stateHash, hash),
    eq(musicOauthStates.userId, userId),
    eq(musicOauthStates.client, "ios"),
    isNotNull(musicOauthStates.codeEnc),
    isNotNull(musicOauthStates.claimHash),
    gt(musicOauthStates.expiresAt, new Date()),
  );
  const [pending] = await db
    .select({ claimHash: musicOauthStates.claimHash })
    .from(musicOauthStates)
    .where(live)
    .limit(1);
  if (!pending || !claimMatches(claim, pending.claimHash)) throw expired;
  const [row] = await db
    .delete(musicOauthStates)
    .where(and(live, eq(musicOauthStates.claimHash, pending.claimHash as string)))
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
      set: {
        ...values,
        // A refresh that doesn't echo these keeps what we knew.
        scope: set.scope ? set.scope : sql`${musicConnections.scope}`,
        countryCode: country ? country : sql`${musicConnections.countryCode}`,
      },
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
  await db
    .delete(musicConnections)
    .where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, "tidal")));
}

export interface TidalAccess {
  accessToken: string;
  countryCode: string | null;
  /** The granted scopes as TIDAL reported them (null = unknown). */
  scope: string | null;
}

/**
 * How long a refresh TIDAL refused waits for the OTHER request's fresh row
 * before concluding the link is dead. TIDAL rotates refresh tokens: of two
 * requests that read the same row, one wins the refresh and the other gets a
 * 4xx for a token that was valid a moment ago. The winner still has to write
 * its row (one upsert, plus `users/me` when the country is unknown), so the
 * loser re-reads a few times instead of once.
 */
const REFRESH_RACE_WAITS_MS = [150, 350, 750, 1500] as const;
/** The shared refresh's own time: one token call (6 s timeout) plus the
 *  race re-reads above. Fixed — never the budget of whoever started it. */
const REFRESH_BUDGET_MS = 9_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** In-flight refresh per user, per instance: concurrent callers share ONE
 *  refresh (the pool of a step, two tabs on a warm function). Across
 *  instances the re-read below covers it — neon-http has no session to hold
 *  an advisory lock across TIDAL's HTTP call. */
const refreshing = new Map<string, Promise<TidalAccess>>();

/**
 * A usable user token, refreshed when it expires within 2 minutes (or when
 * `force`, after a 401). A refresh TIDAL refuses with `invalid_grant` drops
 * the link (any other 4xx is `service_failed`, link intact) →
 * `not_connected` (the UI offers "Conectar TIDAL" again) — unless another
 * request refreshed it meanwhile (rotating refresh tokens + two steps in
 * flight), in which case the fresh row wins: the row is re-read up to
 * `REFRESH_RACE_WAITS_MS.length` times (~2.7 s) before giving up, and the
 * delete itself is still guarded by the `updated_at` we read.
 */
export async function getTidalAccess(userId: string, force = false): Promise<TidalAccess> {
  const cfg = requireConfig();
  const row = await loadConnection(userId);
  if (!row) throw notConnected("tidal");
  const access = openSecret(row.accessTokenEnc, PURPOSE, aadConn(userId, "access"));
  if (access && !force && row.expiresAt.getTime() - Date.now() > 2 * 60 * 1000) {
    return { accessToken: access, countryCode: row.countryCode, scope: row.scope };
  }
  let shared = refreshing.get(userId);
  if (!shared) {
    // The shared refresh runs under its OWN fixed deadline, not the budget of
    // the request that happened to start it: inheriting that one handed every
    // other caller a `service_failed` the moment the first request's step ran
    // out, with their own budget untouched.
    const mine = withDeadline(Date.now() + REFRESH_BUDGET_MS, () => refreshConnection(cfg, userId, row)).finally(() => {
      if (refreshing.get(userId) === mine) refreshing.delete(userId);
    });
    refreshing.set(userId, mine);
    shared = mine;
  }
  try {
    // Each caller still waits only as long as ITS budget allows.
    return await withinBudget("refresh", shared);
  } catch (err) {
    if (!(err instanceof StepBudgetError)) throw err;
    // This caller is out of time; the refresh is not. TIDAL rotates refresh
    // tokens, so the new pair must reach the row even though nobody in this
    // request waits for it: keep the function alive until it settles.
    const pending = shared;
    afterResponse("music-export/tidal-refresh", () => pending.catch(() => {}));
    console.warn("[music-export] tidal refresh still running with the step budget spent: link kept");
    throw serviceFailed("tidal");
  }
}

type ConnectionRow = NonNullable<Awaited<ReturnType<typeof loadConnection>>>;

/** The row somebody else wrote after we read `seen` (a usable token), or null. */
async function refreshedByOther(userId: string, seen: ConnectionRow): Promise<TidalAccess | null> {
  const fresh = await loadConnection(userId);
  if (!fresh || fresh.updatedAt.getTime() === seen.updatedAt.getTime()) return null;
  const token = openSecret(fresh.accessTokenEnc, PURPOSE, aadConn(userId, "access"));
  return token ? { accessToken: token, countryCode: fresh.countryCode, scope: fresh.scope } : null;
}

async function refreshConnection(cfg: TidalOAuthConfig, userId: string, row: ConnectionRow): Promise<TidalAccess> {
  const refresh = openSecret(row.refreshTokenEnc, PURPOSE, aadConn(userId, "refresh"));
  if (!refresh) {
    await dropConnection(userId, row.updatedAt);
    throw notConnected("tidal");
  }
  try {
    const set = await refreshTidalToken(cfg, refresh);
    await saveConnection(userId, { ...set, countryCode: set.countryCode ?? row.countryCode }, row.refreshTokenEnc);
    return { accessToken: set.accessToken, countryCode: set.countryCode ?? row.countryCode, scope: set.scope ?? row.scope };
  } catch (err) {
    // ONLY `invalid_grant` says "this refresh token is no good" (RFC 6749
    // §5.2: revoked, expired, or already rotated). Any other 4xx —
    // `invalid_client` after a secret rotation, `invalid_request`, a WAF's
    // 403 — is OUR problem or TIDAL's, and dropping the link for it would
    // disconnect every user at once: it falls through to `service_failed`.
    if (err instanceof TidalHttpError && err.oauthError === "invalid_grant") {
      let other = await refreshedByOther(userId, row);
      for (const wait of REFRESH_RACE_WAITS_MS) {
        if (other) break;
        if (budgetLeftMs() < wait) {
          // Inside a step whose budget can't cover the wait: don't conclude
          // "dead link" early — the next step re-reads the row.
          console.warn("[music-export] tidal refresh refused (invalid_grant) with the step budget spent: link kept");
          throw serviceFailed("tidal");
        }
        await sleep(wait);
        other = await refreshedByOther(userId, row);
      }
      if (other) return other;
      console.warn(`[music-export] tidal refresh refused (${err.status} invalid_grant): link dropped`);
      await dropConnection(userId, row.updatedAt);
      throw notConnected("tidal");
    }
    if (err instanceof MusicExportError) throw err;
    console.warn(`[music-export] tidal refresh failed, link kept: ${describe(err)}`);
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
      scope: musicConnections.scope,
      updatedAt: musicConnections.updatedAt,
    })
    .from(musicConnections)
    .where(and(eq(musicConnections.userId, userId), eq(musicConnections.provider, "tidal")))
    .limit(1);
  return row ?? null;
}

/**
 * Deletes the link only if nobody refreshed it since we read it. Compared at
 * millisecond precision: `seenUpdatedAt` went through a JS Date, and a row
 * whose `updated_at` carries microseconds (written by SQL `now()`) would
 * otherwise never match — a dead link nobody could drop.
 */
async function dropConnection(userId: string, seenUpdatedAt: Date): Promise<void> {
  await db
    .delete(musicConnections)
    .where(
      and(
        eq(musicConnections.userId, userId),
        eq(musicConnections.provider, "tidal"),
        sql`date_trunc('milliseconds', ${musicConnections.updatedAt}) = ${seenUpdatedAt.toISOString()}::timestamp`,
      ),
    );
}

/** Status/name only — never a body, a token or a code. */
export function describe(err: unknown): string {
  if (err instanceof TidalHttpError) return err.message;
  if (err instanceof Error) return err.name;
  return "error";
}
