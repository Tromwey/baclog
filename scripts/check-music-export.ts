/**
 * Guardrail for "Llévala a otra app" (music export, 2026-09-29, migration
 * 0034): the PURE pieces — token encryption at rest (`lib/secret-box.ts`),
 * the OAuth state/PKCE (`music-export/pkce.ts`), the web return whitelist
 * and URLs (`rules.ts`), the export plan (what "no duplicates on retry"
 * rests on), the track matcher (`match.ts`), the env gates (`config.ts`),
 * the MusicKit developer token (`apple-token.ts`) and the wire — plus source
 * greps: the encrypted token columns are only touched by `tidal-auth.ts`,
 * and the error family is mapped by the API edge.
 * No DB, no server: `pnpm tsx scripts/check-music-export.ts`. Exits 1 on any failure.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import { openSecret, sealSecret } from "../src/lib/secret-box";
import { signAppleMusicDeveloperToken } from "../src/modules/music-export/apple-token";
import {
  appleMusicServerKeyConfig,
  appleMusicWebKeyConfig,
  appleMusicWebOrigins,
  tidalOAuthConfig,
  TIDAL_SCOPES,
} from "../src/modules/music-export/config";
import { budgetLeftMs, STEP_BUDGET_MS, STEP_MATCH_BUDGET_MS, withDeadline } from "../src/modules/music-export/budget";
import { isoDurationMs, normalizeIsrc, pickTrackMatch, type TrackCandidate } from "../src/modules/music-export/match";
import {
  claimMatches,
  clientOfState,
  codeChallengeS256,
  hashClaim,
  hashOAuthState,
  newClaim,
  newCodeVerifier,
  newOAuthState,
  TIDAL_CLAIM_RE,
  TIDAL_STATE_RE,
  tidalAuthorizeUrl,
  tidalIdempotencyKey,
} from "../src/modules/music-export/pkce";
import {
  APPLE_PLAYLIST_ID_RE,
  applePlaylistUrl,
  doneLine,
  iosAuthorizedUrl,
  iosFailedUrl,
  isTidalAuthRefusal,
  musicLanding,
  parseProvider,
  planExport,
  sanitizeExportSongs,
  reportItems,
  safeMusicReturn,
  SERVICE_FAILED_MESSAGE,
  tidalForbiddenMessage,
  tidalPlaylistUrl,
  tidalStartPath,
} from "../src/modules/music-export/rules";
import type { ExportState } from "../src/modules/music-export/types";
import { songFactsOf } from "../src/modules/catalog/song-map";
import { MERGE_COVERAGE } from "../src/modules/account/merge-coverage";
import {
  AppleMusicReportBodySchema,
  ExportStateSchema,
  MusicServicesSchema,
  TidalCompleteBodySchema,
} from "../src/app/api/v1/_lib/schemas";
import { toExportState } from "../src/app/api/v1/_lib/wire/music";

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${(err as Error).message}`);
  }
}

const ENV = { AUTH_SECRET: "test-auth-secret-0123456789" };

async function main() {
  const root = join(__dirname, "..");
  const src = (p: string) => readFileSync(join(root, p), "utf8");
  // ---------- secret-box ----------
  await check("cifrado: ida y vuelta con la misma AAD", () => {
    const sealed = sealSecret("tok-123", "music-token", "music-connection:u1:tidal:access", ENV);
    assert.match(sealed, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    assert.ok(!sealed.includes("tok-123"));
    assert.equal(openSecret(sealed, "music-token", "music-connection:u1:tidal:access", ENV), "tok-123");
  });
  await check("cifrado: IV nuevo cada vez (mismo texto → distinto sello)", () => {
    const a = sealSecret("x", "p", "a", ENV);
    const b = sealSecret("x", "p", "a", ENV);
    assert.notEqual(a, b);
  });
  await check("cifrado: otra fila (AAD de otro usuario / otro campo) NO abre", () => {
    const sealed = sealSecret("tok", "music-token", "music-connection:u1:tidal:access", ENV);
    assert.equal(openSecret(sealed, "music-token", "music-connection:u2:tidal:access", ENV), null);
    assert.equal(openSecret(sealed, "music-token", "music-connection:u1:tidal:refresh", ENV), null);
    assert.equal(openSecret(sealed, "other", "music-connection:u1:tidal:access", ENV), null);
  });
  await check("cifrado: alterado / truncado / otra llave / basura → null (nunca lanza)", () => {
    const sealed = sealSecret("tok", "p", "a", ENV);
    const parts = sealed.split(".");
    const flip = parts[2][0] === "A" ? "B" : "A";
    assert.equal(openSecret([parts[0], parts[1], flip + parts[2].slice(1), parts[3]].join("."), "p", "a", ENV), null);
    assert.equal(openSecret(parts.slice(0, 3).join("."), "p", "a", ENV), null);
    assert.equal(openSecret(sealed, "p", "a", { ...ENV, MUSIC_TOKEN_KEY: "another" }), null);
    assert.equal(openSecret("v2.a.b.c", "p", "a", ENV), null);
    assert.equal(openSecret(null, "p", "a", ENV), null);
  });
  await check("cifrado: MUSIC_TOKEN_KEY gana a AUTH_SECRET", () => {
    const env2 = { ...ENV, MUSIC_TOKEN_KEY: "k2" };
    const sealed = sealSecret("tok", "p", "a", env2);
    assert.equal(openSecret(sealed, "p", "a", env2), "tok");
    assert.equal(openSecret(sealed, "p", "a", ENV), null);
  });

  // ---------- OAuth state + PKCE ----------
  await check("PKCE: vector del RFC 7636 (apéndice B)", () => {
    assert.equal(
      codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
  await check("PKCE: verifier 43..128 chars del alfabeto del RFC", () => {
    const v = newCodeVerifier();
    assert.ok(v.length >= 43 && v.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(v), v);
  });
  await check("state: pista de cliente + 43 aleatorios; único; hash estable y distinto al state", () => {
    const w = newOAuthState("web");
    const i = newOAuthState("ios");
    assert.ok(TIDAL_STATE_RE.test(w) && TIDAL_STATE_RE.test(i));
    assert.equal(clientOfState(w), "web");
    assert.equal(clientOfState(i), "ios");
    assert.notEqual(newOAuthState("web"), w);
    assert.equal(hashOAuthState(w), hashOAuthState(w));
    assert.notEqual(hashOAuthState(w), w);
    assert.equal(clientOfState("x" + w.slice(1)), null);
    assert.equal(clientOfState(w + "a"), null);
    assert.equal(clientOfState(""), null);
  });
  await check("authorize URL: response_type, client_id, redirect, scope, S256, state", () => {
    const url = new URL(
      tidalAuthorizeUrl({
        authorizeUrl: "https://login.tidal.com/authorize",
        clientId: "cid",
        redirectUri: "https://get-kura.app/api/music/tidal/callback",
        scopes: TIDAL_SCOPES,
        state: "wSTATE",
        codeChallenge: "CH",
      }),
    );
    assert.equal(url.origin + url.pathname, "https://login.tidal.com/authorize");
    const q = url.searchParams;
    assert.equal(q.get("response_type"), "code");
    assert.equal(q.get("client_id"), "cid");
    assert.equal(q.get("redirect_uri"), "https://get-kura.app/api/music/tidal/callback");
    assert.equal(q.get("scope"), "playlists.write user.read");
    assert.equal(q.get("code_challenge_method"), "S256");
    assert.equal(q.get("code_challenge"), "CH");
    assert.equal(q.get("state"), "wSTATE");
    assert.ok(!q.has("client_secret"));
  });
  await check("scopes: solo escribir playlists + país de la cuenta (no lee la biblioteca)", () => {
    assert.deepEqual(TIDAL_SCOPES.split(" ").sort(), ["playlists.write", "user.read"]);
  });
  await check("complete: el body solo acepta un ref de iOS (+ claim); nunca un userId", () => {
    const i = newOAuthState("ios");
    const claim = newClaim();
    assert.ok(TidalCompleteBodySchema.safeParse({ ref: i, claim }).success);
    // Missing claim parses (the MODULE answers the same 409 as a wrong one — no 400 oracle).
    assert.ok(TidalCompleteBodySchema.safeParse({ ref: i }).success);
    assert.ok(!TidalCompleteBodySchema.safeParse({ ref: newOAuthState("web"), claim }).success);
    assert.ok(!TidalCompleteBodySchema.safeParse({ ref: i, claim, userId: "u" }).data?.hasOwnProperty("userId"));
  });
  await check("claim: 43 chars base64url, único, solo su hash se guarda, comparación exacta", () => {
    const c = newClaim();
    assert.ok(TIDAL_CLAIM_RE.test(c));
    assert.notEqual(newClaim(), c);
    const h = hashClaim(c);
    assert.notEqual(h, c);
    assert.ok(!h.includes(c));
    assert.equal(claimMatches(c, h), true);
    assert.equal(claimMatches(newClaim(), h), false);
    assert.equal(claimMatches(c.slice(0, -1) + (c.endsWith("A") ? "B" : "A"), h), false);
    assert.equal(claimMatches("", h), false);
    assert.equal(claimMatches(c, null), false);
    assert.equal(claimMatches(c, ""), false);
    assert.equal(claimMatches(h, h), false, "the stored hash is not a valid claim");
  });
  await check("CSRF OAuth iOS: el que EMPEZÓ conoce el ref pero no el claim del rebote", () => {
    // Attacker starts: he holds the state (it is in HIS authorize URL = the ref).
    const ref = newOAuthState("ios");
    const authorize = new URL(
      tidalAuthorizeUrl({
        authorizeUrl: "https://login.tidal.com/authorize",
        clientId: "cid",
        redirectUri: "https://get-kura.app/api/music/tidal/callback",
        scopes: TIDAL_SCOPES,
        state: ref,
        codeChallenge: "CH",
      }),
    );
    const attackerKnows = new Set([...authorize.searchParams.values()]);
    assert.ok(attackerKnows.has(ref));
    // The victim consents; the callback parks the code with a FRESH claim that
    // only travels in the kura:// bounce to the victim's browser.
    const claim = newClaim();
    const stored = hashClaim(claim);
    const bounce = new URL(iosAuthorizedUrl(ref, claim));
    assert.equal(bounce.searchParams.get("ref"), ref);
    assert.equal(bounce.searchParams.get("claim"), claim);
    assert.ok(![...attackerKnows].some((v) => v.includes(claim)), "the claim never appears in the authorize URL");
    // complete without claim / with his own guess / with the ref as claim → refused.
    assert.equal(claimMatches("", stored), false);
    assert.equal(claimMatches(newClaim(), stored), false);
    assert.equal(claimMatches(ref.slice(1), stored), false);
    // The bounce's holder completes.
    assert.equal(claimMatches(claim, stored), true);
  });

  // ---------- return whitelist + URLs ----------
  await check("return web: solo /c/{uuid}, /settings, /settings/musica — exactos", () => {
    const party = "/c/7c9e6679-7425-40de-944b-e07fc1f90ae7";
    assert.equal(safeMusicReturn(party), party);
    assert.equal(safeMusicReturn("/settings"), "/settings");
    assert.equal(safeMusicReturn("/settings/musica"), "/settings/musica");
    for (const bad of [
      "//evil.com",
      "https://evil.com",
      `${party}?x=1`,
      `${party}/../../x`,
      "/c/not-a-uuid",
      "/settings/perfil",
      "/backlogs",
      "\\\\evil.com",
      "/settings#x",
      null,
      undefined,
    ]) {
      assert.equal(safeMusicReturn(bad as string | null | undefined), null, String(bad));
    }
    assert.equal(tidalStartPath("https://evil.com"), "/api/music/tidal/start?return=%2Fsettings%2Fmusica");
    assert.equal(tidalStartPath(party), `/api/music/tidal/start?return=${encodeURIComponent(party)}`);
  });
  await check("aterrizaje: ?music=tidal&connected=1|0&reason", () => {
    assert.equal(musicLanding("/settings/musica", true), "/settings/musica?music=tidal&connected=1");
    assert.equal(musicLanding("/settings", false, "denied"), "/settings?music=tidal&connected=0&reason=denied");
  });
  await check("iOS: rebote kura:// con ref + claim (autorizado) o ok=0 + razón", () => {
    const ref = newOAuthState("ios");
    const claim = newClaim();
    const u = new URL(iosAuthorizedUrl(ref, claim));
    assert.equal(u.protocol, "kura:");
    assert.equal(u.host + u.pathname, "music/tidal/authorized");
    assert.equal(u.searchParams.get("ref"), ref);
    assert.equal(u.searchParams.get("claim"), claim);
    assert.equal(iosFailedUrl("denied"), "kura://music/tidal/connected?ok=0&reason=denied");
  });
  await check("URLs de playlist: derivadas en servidor, nunca un href ajeno", () => {
    assert.equal(applePlaylistUrl("p.AbC123"), "https://music.apple.com/library/playlist/p.AbC123");
    assert.equal(applePlaylistUrl("pl.u-123"), null);
    assert.equal(applePlaylistUrl("javascript:alert(1)"), null);
    assert.ok(!APPLE_PLAYLIST_ID_RE.test("p.a/../x"));
    const id = "550e8400-e29b-41d4-a716-446655440000";
    assert.equal(tidalPlaylistUrl(id), `https://tidal.com/playlist/${id}`);
    assert.equal(tidalPlaylistUrl(id, "https://tidal.com/browse/playlist/x"), "https://tidal.com/browse/playlist/x");
    assert.equal(tidalPlaylistUrl(id, "https://evil.com/tidal.com"), `https://tidal.com/playlist/${id}`);
    assert.equal(tidalPlaylistUrl(id, "http://tidal.com/x"), `https://tidal.com/playlist/${id}`);
    assert.equal(tidalPlaylistUrl(id, "https://eviltidal.com/x"), `https://tidal.com/playlist/${id}`);
  });
  await check("proveedor: solo apple_music | tidal", () => {
    assert.equal(parseProvider("tidal"), "tidal");
    assert.equal(parseProvider("apple_music"), "apple_music");
    assert.equal(parseProvider("spotify"), null);
    assert.equal(parseProvider(["tidal"]), null);
  });
  await check("copy del diseño", () => {
    assert.equal(doneLine("tidal", 11, 12), "11 de 12 canciones ya están en tu playlist de TIDAL.");
    assert.ok(SERVICE_FAILED_MESSAGE("apple_music").endsWith("al reintentar no se duplican canciones."));
  });

  // ---------- the export plan (idempotence) ----------
  const songs = ["a", "b", "c", "d"].map((titleId) => ({ titleId }));
  await check("plan: lo agregado nunca vuelve a mandarse; lo faltante no es pendiente", () => {
    const p = planExport(songs, [
      { titleId: "a", outcome: "added" },
      { titleId: "b", outcome: "missing" },
    ]);
    assert.deepEqual(p.pending, ["c", "d"]);
    assert.equal(p.exported, 1);
    assert.equal(p.processed, 2);
    assert.equal(p.total, 4);
  });
  await check("plan: reintentar (start borra los missing) re-encola solo esos, en orden", () => {
    const afterStart = planExport(songs, [{ titleId: "a", outcome: "added" }]);
    assert.deepEqual(afterStart.pending, ["b", "c", "d"]);
  });
  await check("plan: canción quitada de la fiesta no cuenta; canción nueva queda pendiente al final", () => {
    const p = planExport([{ titleId: "a" }, { titleId: "e" }], [
      { titleId: "a", outcome: "added" },
      { titleId: "gone", outcome: "added" },
    ]);
    assert.deepEqual(p.pending, ["e"]);
    assert.equal(p.exported, 1);
    assert.equal(p.total, 2);
  });
  await check("plan: dos pasadas completas → cero pendientes (re-exportar no duplica)", () => {
    const all = songs.map((s) => ({ titleId: s.titleId, outcome: "added" as const }));
    assert.deepEqual(planExport(songs, all).pending, []);
    assert.deepEqual(planExport(songs, [...all, ...all]).pending, []);
  });
  await check("reporte Apple: solo ids de la fiesta, sin duplicados, 'added' gana", () => {
    const items = reportItems(["a", "b", "c"], ["a", "a", "zzz"], ["a", "b", "yyy"]);
    assert.deepEqual(
      items.sort((x, y) => x.titleId.localeCompare(y.titleId)),
      [
        { titleId: "a", outcome: "added" },
        { titleId: "b", outcome: "missing" },
      ],
    );
  });
  await check("reporte Apple: el body no acepta userId ni un playlistId raro; null = sin playlist", () => {
    assert.ok(AppleMusicReportBodySchema.safeParse({ playlistId: "p.AbC", added: ["x"] }).success);
    assert.ok(AppleMusicReportBodySchema.safeParse({ playlistId: null, replace: true, missing: ["x"] }).success);
    assert.ok(!AppleMusicReportBodySchema.safeParse({ missing: ["x"] }).success, "playlistId must be explicit");
    assert.ok(!AppleMusicReportBodySchema.safeParse({ playlistId: "p.a b" }).success);
    const parsed = AppleMusicReportBodySchema.parse({ playlistId: "p.A", userId: "u" }) as Record<string, unknown>;
    assert.ok(!("userId" in parsed));
    assert.deepEqual(parsed.added, []);
  });

  // ---------- track matching ----------
  const cand = (over: Partial<TrackCandidate>): TrackCandidate => ({
    id: over.id ?? "1",
    title: over.title ?? "Thriller",
    version: over.version ?? null,
    artists: over.artists ?? ["Michael Jackson"],
    durationMs: over.durationMs === undefined ? 357000 : over.durationMs,
  });
  const q = { title: "Thriller", artist: "Michael Jackson", durationMs: 357000 };
  await check("match: exacto", () => {
    assert.equal(pickTrackMatch(q, [cand({})])?.id, "1");
  });
  await check("match: «Cars» nunca es «Cars 2» (sin contención)", () => {
    assert.equal(pickTrackMatch({ title: "Cars", artist: "Gary Numan", durationMs: null }, [cand({ title: "Cars 2", artists: ["Gary Numan"] })]), null);
  });
  await check("match: versión Remaster sí; Live no; Live contra Live sí", () => {
    assert.equal(pickTrackMatch(q, [cand({ version: "2008 Remaster" })])?.id, "1");
    assert.equal(pickTrackMatch(q, [cand({ version: "Live" })]), null);
    assert.equal(pickTrackMatch({ ...q, title: "Thriller (Live)" }, [cand({ version: "Live" })])?.id, "1");
    assert.equal(pickTrackMatch({ ...q, title: "Thriller (Live)" }, [cand({ title: "Thriller (Live)", version: "Live" })])?.id, "1");
  });
  await check("match: duración > 7 s de diferencia = otra canción; la más cercana gana", () => {
    assert.equal(pickTrackMatch(q, [cand({ durationMs: 357000 + 8000 })]), null);
    const pick = pickTrackMatch(q, [cand({ id: "far", durationMs: 351000 }), cand({ id: "near", durationMs: 356500 })]);
    assert.equal(pick?.id, "near");
    assert.equal(pickTrackMatch({ ...q, durationMs: null }, [cand({ durationMs: 999999 })])?.id, "1");
  });
  await check("match: cada artista acreditado; sin artistas no hay match", () => {
    assert.equal(pickTrackMatch({ ...q, artist: "Michael Jackson & Paul McCartney" }, [cand({})]), null);
    assert.equal(
      pickTrackMatch({ ...q, artist: "Michael Jackson & Paul McCartney" }, [cand({ artists: ["Paul McCartney", "Michael Jackson"] })])?.id,
      "1",
    );
    assert.equal(pickTrackMatch(q, [cand({ artists: [] })]), null);
    assert.equal(pickTrackMatch({ ...q, artist: null }, [cand({})]), null);
    assert.equal(pickTrackMatch(q, [cand({ artists: ["Someone Else"] })]), null);
  });
  await check("match: feat. en el título (iTunes) vs acreditado (TIDAL); cirílico", () => {
    assert.equal(
      pickTrackMatch({ title: "Señorita (feat. Camila Cabello)", artist: "Shawn Mendes", durationMs: 191000 }, [
        cand({ title: "Señorita", artists: ["Shawn Mendes", "Camila Cabello"], durationMs: 190800 }),
      ])?.id,
      "1",
    );
    assert.equal(
      pickTrackMatch({ title: "Там, где рассвет", artist: "Би-2", durationMs: null }, [cand({ title: "Там, где рассвет", artists: ["Би-2"] })])?.id,
      "1",
    );
  });
  await check("duración ISO 8601 e ISRC", () => {
    assert.equal(isoDurationMs("PT3M58S"), 238000);
    assert.equal(isoDurationMs("PT1H2M3.5S"), 3723500);
    assert.equal(isoDurationMs("PT"), null);
    assert.equal(isoDurationMs(238), null);
    assert.equal(normalizeIsrc("usrc17607839"), "USRC17607839");
    assert.equal(normalizeIsrc("US-RC1-76-07839"), "USRC17607839");
    assert.equal(normalizeIsrc("nope"), null);
  });

  // ---------- env gates ----------
  await check("TIDAL: sin redirect URI = no disponible (aunque existan las llaves del link-out)", () => {
    const base = { TIDAL_CLIENT_ID: "id", TIDAL_CLIENT_SECRET: "s" };
    assert.equal(tidalOAuthConfig(base), null);
    assert.ok(tidalOAuthConfig({ ...base, TIDAL_OAUTH_REDIRECT_URI: "https://get-kura.app/api/music/tidal/callback" }));
    assert.ok(tidalOAuthConfig({ ...base, TIDAL_OAUTH_REDIRECT_URI: "http://localhost:3010/api/music/tidal/callback" }));
    assert.equal(tidalOAuthConfig({ ...base, TIDAL_OAUTH_REDIRECT_URI: "http://get-kura.app/cb" }), null);
    assert.equal(tidalOAuthConfig({ ...base, TIDAL_OAUTH_REDIRECT_URI: "nope" }), null);
    assert.equal(tidalOAuthConfig({ TIDAL_CLIENT_ID: "id", TIDAL_OAUTH_REDIRECT_URI: "https://x.app/cb" }), null);
  });

  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const escaped = pem.replace(/\n/g, "\\n");
  await check("Apple Music: la llave COMPARTIDA solo sirve al servidor; la web exige la dedicada", () => {
    const both = { APPLE_TEAM_ID: "T", APPLE_MUSIC_KEY_ID: "MK", APPLE_MUSIC_PRIVATE_KEY: escaped, APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: escaped };
    assert.equal(appleMusicWebKeyConfig(both)?.keyId, "MK");
    assert.equal(appleMusicServerKeyConfig(both)?.keyId, "MK", "dedicated preferred server-side too");
    const sharedOnly = { APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: escaped };
    assert.equal(appleMusicWebKeyConfig(sharedOnly), null, "the APNs/SIWA key never signs a browser token");
    assert.equal(appleMusicServerKeyConfig(sharedOnly)?.keyId, "K");
    assert.equal(appleMusicServerKeyConfig(sharedOnly)?.source, "shared");
    const half = { APPLE_TEAM_ID: "T", APPLE_MUSIC_KEY_ID: "MK", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: escaped };
    assert.equal(appleMusicWebKeyConfig(half), null);
    assert.equal(appleMusicServerKeyConfig(half)?.source, "shared");
    assert.equal(appleMusicServerKeyConfig({ APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: escaped }), null);
    assert.equal(appleMusicServerKeyConfig({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "not a key!" }), null);
  });
  await check("Apple Music: el token web sale SOLO de apple-music.ts con la llave web (fuente)", () => {
    const am = src("src/modules/music-export/apple-music.ts");
    const web = am.slice(am.indexOf("export async function appleWebDeveloperToken"), am.indexOf("function forgetTokens"));
    assert.ok(/appleMusicWebKeyConfig\(\)/.test(web) && !/appleMusicServerKeyConfig/.test(web), "web token signs with the web key only");
    assert.ok(/source !== "dedicated"/.test(web));
    assert.ok(/probeKey\(cfg\)/.test(web), "a rejected key hands out no token");
    assert.ok(!/export (async )?function appleServerToken/.test(am), "the server token is not exported");
    for (const f of ["src/app/actions/music-export-actions.ts", "src/app/api/v1/music/apple/developer-token/route.ts"]) {
      const t = src(f);
      assert.ok(/appleWebDeveloperToken/.test(t) && !/appleServerToken|signAppleMusicDeveloperToken/.test(t), f);
    }
  });
  await check("Apple Music: developer token ES256, kid, iss = team, exp = iat + 12 h, verificable", async () => {
    const cfg = appleMusicWebKeyConfig({ APPLE_TEAM_ID: "TEAM123456", APPLE_MUSIC_KEY_ID: "KEY1234567", APPLE_MUSIC_PRIVATE_KEY: escaped });
    assert.ok(cfg);
    const now = 1_790_000_000;
    const jwt = await signAppleMusicDeveloperToken(cfg, now);
    const header = decodeProtectedHeader(jwt);
    assert.equal(header.alg, "ES256");
    assert.equal(header.kid, "KEY1234567");
    const spki = await importSPKI(publicKey.export({ type: "spki", format: "pem" }).toString(), "ES256");
    const { payload } = await jwtVerify(jwt, spki, { currentDate: new Date((now + 60) * 1000) });
    assert.equal(payload.iss, "TEAM123456");
    assert.equal(payload.iat, now);
    assert.equal(payload.exp, now + 12 * 3600);
    assert.ok(!("sub" in payload) && !("aud" in payload));
    assert.ok(!("origin" in payload), "the server token has no origin");
  });
  await check("Apple Music: token web con origin = get-kura.app + beta (+ localhost fuera de prod), 1 h", async () => {
    const prod = appleMusicWebOrigins({ NODE_ENV: "production" });
    assert.deepEqual(prod, ["https://get-kura.app", "https://beta.get-kura.app"]);
    assert.ok(appleMusicWebOrigins({ NODE_ENV: "development" }).includes("http://localhost:3010"));
    const cfg = appleMusicWebKeyConfig({ APPLE_TEAM_ID: "TEAM123456", APPLE_MUSIC_KEY_ID: "KEY1234567", APPLE_MUSIC_PRIVATE_KEY: escaped });
    assert.ok(cfg);
    const now = 1_790_000_000;
    const jwt = await signAppleMusicDeveloperToken(cfg, now, 3600, prod);
    const spki = await importSPKI(publicKey.export({ type: "spki", format: "pem" }).toString(), "ES256");
    const { payload } = await jwtVerify(jwt, spki, { currentDate: new Date((now + 60) * 1000) });
    assert.deepEqual(payload.origin, prod);
    assert.equal(payload.exp, now + 3600);
  });

  // ---------- wire ----------
  await check("canción de fiesta: appleMusicId = trackId (y null si falta)", () => {
    assert.equal(songFactsOf({ trackId: 1440833098 }).appleMusicId, "1440833098");
    assert.equal(songFactsOf({}).appleMusicId, null);
    assert.equal(songFactsOf({ trackId: -1 }).appleMusicId, null);
  });
  const person = { handle: "ana", name: "Ana", avatarUrl: null };
  const song = (titleId: string, state: "pending" | "added" | "missing") => ({
    titleId,
    title: "Thriller",
    artist: "Michael Jackson",
    album: "Thriller",
    artworkUrl: "https://is1-ssl.mzstatic.com/a/600x600bb.jpg",
    durationMs: 357000,
    appleMusicId: "1440833098",
    isrc: state === "missing" ? null : "USSM18200530",
    state,
    addedBy: titleId === "b" ? null : person,
    mine: titleId === "a",
  });
  const exportState: ExportState = {
    provider: "tidal",
    playlistName: "la fiesta de eric",
    status: "in_progress",
    total: 3,
    exported: 1,
    processed: 2,
    current: { titleId: "c", title: "Thriller", artist: "Michael Jackson" },
    playlist: { id: "550e8400-e29b-41d4-a716-446655440000", url: "https://tidal.com/playlist/550e8400-e29b-41d4-a716-446655440000" },
    missing: [song("b", "missing")],
    songs: [song("a", "added"), song("b", "missing"), song("c", "pending")],
    busy: false,
  };
  await check("toExportState → ExportStateSchema ('Puso alguien' = addedBy null)", () => {
    const w = ExportStateSchema.parse(toExportState(exportState));
    assert.equal(w.missing[0].addedBy, null);
    assert.equal(w.songs[2].state, "pending");
  });
  await check("MusicServicesSchema: forma de la hoja (iOS lee available, web lee webAvailable)", () => {
    MusicServicesSchema.parse({ apple_music: { available: false, webAvailable: false, reason: "not_configured" }, tidal: { available: true, connected: false } });
    MusicServicesSchema.parse({ apple_music: { available: true, webAvailable: false }, tidal: { available: false, connected: false, reason: "not_configured" } });
    assert.ok(!MusicServicesSchema.safeParse({ apple_music: { available: true }, tidal: { available: true, connected: false } }).success);
  });

  // ---------- TIDAL: 403 and idempotency ----------
  await check("TIDAL 403: solo auth/scope desconecta; términos/cuota/otro = service_failed con mensaje", () => {
    assert.equal(isTidalAuthRefusal(["INSUFFICIENT_SCOPE"], "playlists.write user.read"), true);
    assert.equal(isTidalAuthRefusal(["UNAUTHORIZED"], null), true);
    assert.equal(isTidalAuthRefusal([], "user.read"), true, "granted scopes lack playlists.write");
    assert.equal(isTidalAuthRefusal(["REQUIRED_TERMS_NOT_ACCEPTED"], "playlists.write user.read"), false);
    assert.equal(isTidalAuthRefusal(["QUOTA_EXCEEDED"], null), false);
    assert.equal(isTidalAuthRefusal([], null), false, "an unexplained 403 keeps the link");
    assert.match(tidalForbiddenMessage(["REQUIRED_TERMS_NOT_ACCEPTED"]), /términos/);
    assert.match(tidalForbiddenMessage(["QUOTA_EXCEEDED"]), /límite/);
    assert.match(tidalForbiddenMessage([]), /desconecta TIDAL/);
  });
  await check("TIDAL Idempotency-Key: export + generación + hash del NOMBRE (renombrar no atora)", () => {
    const a = tidalIdempotencyKey("e1", 0, "la fiesta");
    assert.equal(a, tidalIdempotencyKey("e1", 0, "la fiesta"));
    assert.notEqual(a, tidalIdempotencyKey("e1", 0, "la fiesta 2"));
    assert.notEqual(a, tidalIdempotencyKey("e1", 1, "la fiesta"));
    assert.match(a, /^kura-export-e1-g0-[A-Za-z0-9_-]{16}$/);
    assert.ok(!a.includes("fiesta"), "the name travels hashed");
  });

  // ---------- source greps ----------
  await check("TIDAL: 'playlist borrada' solo tras GET 404, generación con tope 10 min (fuente)", () => {
    const ex = src("src/modules/music-export/exports.ts");
    const step = ex.slice(ex.indexOf("export async function stepTidalExport"), ex.indexOf("// ---------- Apple Music"));
    assert.ok(!/generation\}? \+ 1/.test(step), "the step never bumps generation by hand");
    const on404 = step.slice(step.indexOf("err.status === 404"));
    assert.ok(on404.indexOf("tidalPlaylistExists") !== -1 && on404.indexOf("tidalPlaylistExists") < on404.indexOf("restartGeneration("), "GET before regen");
    assert.ok(/refused\.add\(id\)/.test(on404), "playlist exists → song-by-song, 404 tracks = missing");
    const regen = ex.slice(ex.indexOf("async function restartGeneration"));
    assert.ok(/generation_bumped_at is null or generation_bumped_at </.test(regen), "regen cooldown");
    assert.ok(/service_failed/.test(regen.slice(0, regen.indexOf("\n}\n"))), "second regen in 10 min fails");
    const start = ex.slice(ex.indexOf("export async function startExport"), ex.indexOf("async function confirmTidalPlaylist"));
    assert.ok(/confirmTidalPlaylist\(/.test(start), "start verifies a 'done' TIDAL playlist");
    assert.ok(/music-export-report:\$\{userId\}/.test(ex), "reports are rate limited");
  });
  await check("OAuth: complete exige claim; start hace GC global; callback web exige mismo sitio (fuente)", () => {
    const auth = src("src/modules/music-export/tidal-auth.ts");
    const complete = auth.slice(auth.indexOf("export async function completeTidalAuth"), auth.indexOf("// ---------- the stored link"));
    assert.ok(/claimMatches\(claim/.test(complete));
    assert.ok(complete.indexOf("claimMatches") < complete.indexOf(".delete(musicOauthStates)"), "judge BEFORE consuming");
    const start = auth.slice(auth.indexOf("export async function startTidalAuth"), auth.indexOf("// ---------- callback"));
    assert.ok(/db\.delete\(musicOauthStates\)\.where\(lt\(musicOauthStates\.expiresAt/.test(start), "global GC of dead states");
    const web = src("src/app/api/music/tidal/start/route.ts");
    assert.ok(/sec-fetch-site/.test(web) && /same-origin/.test(web));
  });
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  }
  await check("tokens cifrados: solo tidal-auth.ts toca accessTokenEnc/refreshTokenEnc/codeEnc", () => {
    const offenders = walk(join(root, "src"))
      .filter((f) => !f.endsWith("modules/music-export/tidal-auth.ts") && !f.endsWith("db/schema.ts"))
      .filter((f) => /\b(accessTokenEnc|refreshTokenEnc|codeVerifierEnc|codeEnc)\b/.test(readFileSync(f, "utf8")));
    assert.deepEqual(offenders.map((f) => f.slice(root.length + 1)), []);
  });
  await check("ningún console.* del export imprime un token/código/verifier", () => {
    for (const f of walk(join(root, "src/modules/music-export")).concat(walk(join(root, "src/app/api/music")))) {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (!/console\.(log|warn|error|info)/.test(line)) continue;
        assert.ok(!/(accessToken|refreshToken|verifier|params\.code|\bcode\b\)|dev\.token|\.token\b)/.test(line), `${f}: ${line.trim()}`);
      }
    }
  });
  await check("una fila de canción anómala no tumba el export: se omite/normaliza y el wire estricto pasa", async () => {
    const { ExportSongSchema } = await import("../src/app/api/v1/_lib/schemas");
    const base = { artist: null, album: null, isrc: null, state: "pending" as const, addedBy: null, mine: false };
    const good = { titleId: "t1", title: "Bien", artworkUrl: "https://is1.mzstatic.com/a.jpg", durationMs: 1000, appleMusicId: "123" };
    const rows = [
      good,
      { titleId: "t2", title: "   ", artworkUrl: null, durationMs: 1, appleMusicId: null },
      { titleId: "t3", title: " Rara ", artworkUrl: "no-es-url", durationMs: 215000.4, appleMusicId: "id-9" },
      { titleId: "t4", title: "Negativa", artworkUrl: "javascript:alert(1)", durationMs: -5, appleMusicId: null },
      { titleId: "t5", title: "NaN", artworkUrl: null, durationMs: Number.NaN, appleMusicId: "42" },
    ];
    assert.ok(!ExportSongSchema.safeParse({ ...base, ...rows[2] }).success, "la fila cruda SÍ rompería el wire");
    const { songs, dropped, repaired } = sanitizeExportSongs(rows);
    assert.deepEqual(dropped, ["t2"]);
    assert.deepEqual(repaired, ["t3", "t4", "t5"]);
    assert.equal(songs[0], good, "una fila sana pasa intacta (misma referencia)");
    assert.deepEqual(songs[1], { titleId: "t3", title: "Rara", artworkUrl: null, durationMs: 215000, appleMusicId: null });
    assert.equal(songs[2].durationMs, null); assert.equal(songs[2].artworkUrl, null);
    assert.equal(songs[3].durationMs, null); assert.equal(songs[3].appleMusicId, "42");
    for (const s of songs) assert.ok(ExportSongSchema.safeParse({ ...base, ...s }).success, s.titleId);
    assert.ok(/sanitizeExportSongs\(party\.songs\)/.test(src("src/modules/music-export/exports.ts")), "partyFor es el único lector de canciones del export");
  });
  await check("step: presupuesto < corte de las apps, y los DOS caminos (ruta v1 + action web) declaran maxDuration ≤ lease", async () => {
    const exp = src("src/modules/music-export/exports.ts");
    const lease = Number(/const LEASE_MS = ([\d_]+);/.exec(exp)?.[1].replace(/_/g, ""));
    // The two ways a step is reached: the v1 route (iOS/Android) and the
    // server action, which runs under the maxDuration of the PAGE that calls it.
    const hosts = [
      "src/app/api/v1/parties/[id]/exports/[provider]/step/route.ts",
      "src/app/c/[backlogId]/page.tsx",
    ];
    for (const file of hosts) {
      const max = Number(/^export const maxDuration = (\d+);/m.exec(src(file))?.[1]);
      assert.ok(Number.isFinite(max), `${file} no declara maxDuration`);
      assert.ok(max * 1000 <= lease, `${file}: maxDuration ${max}s > lease ${lease}ms — un step podría sobrevivir a su lease`);
      assert.ok(max * 1000 > STEP_BUDGET_MS * 2, `${file}: maxDuration ${max}s no deja margen sobre el presupuesto`);
    }
    assert.ok(/<PartyRoom\b/.test(src("src/app/c/[backlogId]/page.tsx")), "la página que declara maxDuration es la que hospeda el export");
    assert.ok(/stepTidalExportAction/.test(src("src/components/party/party-export.tsx")), "la action del step se llama desde party-export");
    // The apps cut the request at 20 s and don't retry: budget + the abort's
    // cleanup must leave room for the DB work under that.
    const cleanup = Number(/const ABORT_CLEANUP_MS = ([\d_]+);/.exec(exp)?.[1].replace(/_/g, ""));
    assert.ok(STEP_BUDGET_MS <= 12_000 && STEP_BUDGET_MS + cleanup <= 16_000, "presupuesto + limpieza ≤ 16 s (corte del cliente: 20 s)");
    assert.ok(STEP_MATCH_BUDGET_MS < STEP_BUDGET_MS && STEP_BUDGET_MS - STEP_MATCH_BUDGET_MS >= 4_000, "queda presupuesto para crear + agregar");
    // The step runs under the deadline, matching under its own slice, and
    // every TIDAL call is capped by what is left.
    assert.ok(/withDeadline\(now\.getTime\(\) \+ STEP_BUDGET_MS, \(\) => runTidalStep\(/.test(exp), "el step corre bajo su presupuesto");
    assert.ok(/withDeadline\(startedAt \+ STEP_MATCH_BUDGET_MS, \(\) => matchOnTidal\(/.test(exp), "el matching tiene su tramo");
    const api = src("src/modules/music-export/tidal-api.ts");
    assert.ok(/Math\.min\(TIMEOUT_MS, left\)/.test(api) && /if \(left <= 0\) throw new StepBudgetError/.test(api), "cada llamada a TIDAL respeta el presupuesto");
    assert.ok(/budgetLeftMs\(\) < wait/.test(src("src/modules/music-export/tidal-auth.ts")), "la espera del refresh entra en el presupuesto");
    // A song the budget didn't reach is undecided (pending), never `missing`;
    // a step that recorded nothing fails instead of answering a frozen in_progress.
    assert.ok(/if \(err instanceof StepBudgetError\) return undefined;/.test(exp));
    assert.ok(/if \(!matches\.has\(s\.titleId\)\) return \[\];/.test(exp), "lo no decidido no se escribe");
    assert.ok(/if \(decided\.length === 0\) \{[\s\S]{0,200}throw serviceFailed\("tidal"\)/.test(exp));
    // The budget itself: scoped to the async context, absent outside a step.
    assert.equal(budgetLeftMs(), Infinity);
    await withDeadline(Date.now() + 5_000, async () => {
      await new Promise((r) => setTimeout(r, 5));
      const left = budgetLeftMs();
      assert.ok(left > 4_000 && left < 5_000, `dentro del step: ${left}`);
      await withDeadline(Date.now() + 1_000, async () => assert.ok(budgetLeftMs() <= 1_000, "el tramo interno manda"));
      assert.ok(budgetLeftMs() > 4_000, "y al salir vuelve el del step");
    });
    assert.equal(budgetLeftMs(), Infinity);
  });
  await check("refresh: solo invalid_grant suelta el vínculo; app_token nunca es «no encontrada»", () => {
    const auth = src("src/modules/music-export/tidal-auth.ts");
    const refresh = auth.slice(auth.indexOf("async function refreshConnection"), auth.indexOf("async function loadConnection"));
    const drops = refresh.split("dropConnection(").length - 1;
    assert.equal(drops, 2, "dos caminos sueltan: sin refresh token legible, e invalid_grant");
    assert.ok(/err\.oauthError === "invalid_grant"/.test(refresh));
    assert.ok(!/err\.status >= 400/.test(refresh), "ningún 4xx genérico decide el borrado");
    const exp = src("src/modules/music-export/exports.ts");
    assert.ok(/err\.what !== "app_token"/.test(exp.slice(exp.indexOf("function isNoResult"), exp.indexOf("async function pool"))));
  });
  await check("step abortado por cambio de generación: borra la playlist que creó y no registró", () => {
    const exp = src("src/modules/music-export/exports.ts");
    const abort = exp.slice(exp.indexOf("if (!saved) {"), exp.indexOf("current = saved;"));
    assert.ok(/tidalDeletePlaylist\(token, created\.id\)/.test(abort));
    assert.ok(abort.indexOf("tidalDeletePlaylist") < abort.indexOf("stateOf("), "borra ANTES de responder");
    assert.ok(/method: "DELETE"/.test(src("src/modules/music-export/tidal-api.ts")));
  });
  await check("borde API: MusicExportError mapeado en errorToResponse", () => {
    const api = src("src/authz/api.ts");
    assert.ok(/err instanceof MusicExportError/.test(api));
  });
  await check("fusión/borrado: las 3 tablas con user_id están decididas (cascade)", () => {
    for (const t of ["music_connection", "music_oauth_state", "party_export"]) {
      assert.deepEqual(MERGE_COVERAGE[t]?.actions, ["cascade"], t);
    }
  });

  console.log(failures === 0 ? "\ncheck-music-export ok" : `\n${failures} fallos`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
