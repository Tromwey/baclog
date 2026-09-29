/**
 * Guardrail for colecciones de fiesta (2026-09-29): the PURE rules
 * (`modules/party-collections/rules.ts`), the song mapping
 * (`modules/catalog/song-map.ts`), the login return whitelist
 * (`lib/return-to.ts`), the library-format filter
 * (`modules/catalog/library-media.ts`) and the party wire serializers
 * (`api/v1/_lib/wire/party.ts`) against the zod contract, plus two source
 * greps: `rules.ts` stays client-safe (no `node:crypto`), and every login
 * entry point keeps carrying `?to=` (email → /verify, Apple hidden input +
 * server re-validation, Apple error return, verify's "Enviar otro código").
 * No DB, no server: `pnpm tsx scripts/check-party-rules.ts`. Exits 1 on any
 * failure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mediaTypeEnum } from "../src/db/schema";
import { safeReturnTo, loginPathFor } from "../src/lib/return-to";
import { LIBRARY_MEDIA_TYPES, asLibraryRow, isLibraryMedia } from "../src/modules/catalog/library-media";
import { songFactsOf, toSongItem } from "../src/modules/catalog/song-map";
import {
  INVITE_TOKEN_RE,
  canAddNow,
  canBlockAuthor,
  canLeave,
  canRemoveSong,
  decideAdd,
  duplicateMessage,
  GUEST_REF_RE,
  INVITE_ROTATIONS_PER_HOUR,
  inviteUrl,
  joinOutcome,
  leaveEffect,
  lostAddOutcome,
  MAX_HOSTED_PARTIES,
  parseInviteToken,
  perGuestLimitSchema,
  playlistPitch,
  presenceLine,
  remainingFor,
  rotationRetryAfter,
  TOO_MANY_PARTIES_MESSAGE,
  type ViewerFacts,
} from "../src/modules/party-collections/rules";
import { guestRefOf, newInviteToken } from "../src/modules/party-collections/tokens";
import type { PartyDetail } from "../src/modules/party-collections/types";
import {
  ErrorBodySchema,
  InvitePreviewSchema,
  PartyCardSchema,
  PartySchema,
  PartySongHitSchema,
} from "../src/app/api/v1/_lib/schemas";
import { toInvitePreview, toParty, toPartyCard, toPartySongHit } from "../src/app/api/v1/_lib/wire";

// guestRefOf is an HMAC keyed with AUTH_SECRET (read at call time).
process.env.AUTH_SECRET ??= "check-party-rules-secret-0123456789abcdef";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`   ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`   FAIL ${name}\n        ${(err as Error).message.split("\n").join("\n        ")}`);
  }
}

const guest = (o: Partial<ViewerFacts> = {}): ViewerFacts => ({
  role: "guest",
  blocked: false,
  perGuestLimit: 3,
  mineCount: 0,
  ...o,
});
const host = (o: Partial<ViewerFacts> = {}): ViewerFacts => ({ ...guest(o), role: "host" });

console.log("\nReglas de aporte (decideAdd / remainingFor / canAddNow)");
check("invitado con 0 de 3: agrega; le quedan 3", () => {
  assert.deepEqual(decideAdd(guest(), null), { ok: true });
  assert.equal(remainingFor(guest()), 3);
  assert.equal(canAddNow(guest()), true);
});
check("invitado con 2 de 3: agrega la tercera; con 3 de 3: cap_reached", () => {
  assert.deepEqual(decideAdd(guest({ mineCount: 2 }), null), { ok: true });
  assert.deepEqual(decideAdd(guest({ mineCount: 3 }), null), { ok: false, reason: "cap_reached" });
  assert.equal(remainingFor(guest({ mineCount: 3 })), 0);
  assert.equal(canAddNow(guest({ mineCount: 3 })), false);
});
check("tope bajado por el anfitrión (5 puestas, tope 3): remaining 0, nunca negativo", () => {
  assert.equal(remainingFor(guest({ mineCount: 5 })), 0);
  assert.deepEqual(decideAdd(guest({ mineCount: 5 }), null), { ok: false, reason: "cap_reached" });
});
check("duplicado se reporta ANTES que el tope (\"Ya está, la puso @ana\" aun con tus 3)", () => {
  assert.deepEqual(decideAdd(guest({ mineCount: 3 }), { mine: false }), { ok: false, reason: "duplicate_other" });
  assert.deepEqual(decideAdd(guest({ mineCount: 1 }), { mine: true }), { ok: false, reason: "duplicate_mine" });
});
check("bloqueado: nada (ni duplicado ni tope) — siempre blocked", () => {
  assert.deepEqual(decideAdd(guest({ blocked: true }), { mine: false }), { ok: false, reason: "blocked" });
  assert.deepEqual(decideAdd(guest({ blocked: true }), null), { ok: false, reason: "blocked" });
  assert.equal(canAddNow(guest({ blocked: true })), false);
  assert.equal(remainingFor(guest({ blocked: true, perGuestLimit: null })), 0);
});
check("solo ver (tope 0): view_only para invitados", () => {
  assert.deepEqual(decideAdd(guest({ perGuestLimit: 0 }), null), { ok: false, reason: "view_only" });
  assert.equal(canAddNow(guest({ perGuestLimit: 0 })), false);
});
check("ilimitadas (null): remaining null, siempre agrega", () => {
  assert.equal(remainingFor(guest({ perGuestLimit: null, mineCount: 40 })), null);
  assert.deepEqual(decideAdd(guest({ perGuestLimit: null, mineCount: 40 }), null), { ok: true });
});
check("anfitrión: sin tope, nunca bloqueado, ni con tope 0", () => {
  assert.equal(remainingFor(host({ mineCount: 99 })), null);
  assert.deepEqual(decideAdd(host({ mineCount: 99, perGuestLimit: 0 }), null), { ok: true });
  assert.deepEqual(decideAdd(host({ blocked: true }), null), { ok: true });
  assert.deepEqual(decideAdd(host(), { mine: false }), { ok: false, reason: "duplicate_other" });
});
check("perGuestLimitSchema: 0..5 o null; 6, -1, 2.5 no", () => {
  for (const ok of [0, 1, 3, 5, null]) assert.ok(perGuestLimitSchema.safeParse(ok).success, String(ok));
  for (const bad of [6, -1, 2.5, "3"]) assert.ok(!perGuestLimitSchema.safeParse(bad).success, String(bad));
});

console.log("\nQuitar / bloquear");
check("anfitrión quita cualquiera; invitado solo las suyas", () => {
  assert.equal(canRemoveSong({ role: "host", blocked: false }, false), true);
  assert.equal(canRemoveSong({ role: "guest", blocked: false }, true), true);
  assert.equal(canRemoveSong({ role: "guest", blocked: false }, false), false);
});
check("C4: un invitado BLOQUEADO quita las suyas (y nada ajeno), pero no agrega", () => {
  assert.equal(canRemoveSong({ role: "guest", blocked: true }, true), true);
  assert.equal(canRemoveSong({ role: "guest", blocked: true }, false), false);
  assert.deepEqual(decideAdd(guest({ blocked: true, mineCount: 0 }), null), { ok: false, reason: "blocked" });
});
check("C5: un add perdido sin causa es conflict — NUNCA cap_reached para el anfitrión", () => {
  assert.equal(lostAddOutcome(host({ mineCount: 50 }), null), "conflict");
  assert.equal(lostAddOutcome(host({ perGuestLimit: 0 }), null), "conflict");
  assert.equal(lostAddOutcome(guest({ perGuestLimit: null, mineCount: 99 }), null), "conflict");
  assert.equal(lostAddOutcome(guest({ mineCount: 1 }), null), "conflict");
  // …but a real cause found in fresh state still wins, in decideAdd's order
  assert.equal(lostAddOutcome(guest({ mineCount: 3 }), null), "cap_reached");
  assert.equal(lostAddOutcome(guest({ mineCount: 3 }), { mine: false }), "duplicate_other");
  assert.equal(lostAddOutcome(host(), { mine: false }), "duplicate_other");
  assert.equal(lostAddOutcome(guest({ blocked: true }), null), "blocked");
});
check("quitar y bloquear: solo anfitrión, autor existente que no es el anfitrión", () => {
  assert.equal(canBlockAuthor("host", { exists: true, isHost: false }), true);
  assert.equal(canBlockAuthor("host", { exists: true, isHost: true }), false);
  assert.equal(canBlockAuthor("host", { exists: false, isHost: false }), false);
  assert.equal(canBlockAuthor("guest", { exists: true, isHost: false }), false);
});
check("guestRef: estable, opaco, distinto por fiesta, por persona y por secreto (HMAC)", () => {
  const a = guestRefOf("p1", "u1");
  const saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = `${saved}-otro`;
  const other = guestRefOf("p1", "u1");
  process.env.AUTH_SECRET = saved;
  assert.notEqual(a, other, "sin el secreto no se puede recalcular");
  assert.equal(a, guestRefOf("p1", "u1"));
  assert.notEqual(a, guestRefOf("p2", "u1"));
  assert.notEqual(a, guestRefOf("p1", "u2"));
  assert.ok(GUEST_REF_RE.test(a), a);
  assert.ok(!a.includes("u1"));
});

console.log("\nSalir y volver a entrar (C3)");
const LIVE = { linkActive: true, userBlocked: false };
check("solo un invitado sale (el anfitrión borra, un extraño no es nadie)", () => {
  assert.equal(canLeave("guest"), true);
  assert.equal(canLeave("host"), false);
  assert.equal(canLeave(null), false);
});
check("salir: sin bloqueo se borra la fila; bloqueado se conserva con left_at", () => {
  assert.equal(leaveEffect({ blocked: false, left: false }), "delete");
  assert.equal(leaveEffect({ blocked: true, left: false }), "mark_left");
});
check("salir y volver NO lava el bloqueo: el bloqueado vuelve bloqueado (y sin poder agregar)", () => {
  const row = { blocked: true, left: false };
  assert.equal(leaveEffect(row), "mark_left");
  const back = joinOutcome({ ...row, left: true }, LIVE);
  assert.deepEqual(back, { ok: true, joined: "new", blocked: true });
  assert.deepEqual(decideAdd(guest({ blocked: back.ok && back.blocked }), null), { ok: false, reason: "blocked" });
});
check("salir sin bloqueo y volver con link activo: entra como nuevo, sin bloqueo", () => {
  assert.equal(leaveEffect({ blocked: false, left: false }), "delete");
  assert.deepEqual(joinOutcome(null, LIVE), { ok: true, joined: "new", blocked: false });
});
check("volver a entrar exige link ACTIVO; quedarse no", () => {
  assert.deepEqual(joinOutcome(null, { ...LIVE, linkActive: false }), { ok: false, error: "invalid_link" });
  assert.deepEqual(joinOutcome({ blocked: true, left: true }, { ...LIVE, linkActive: false }), {
    ok: false,
    error: "invalid_link",
  });
  assert.deepEqual(joinOutcome({ blocked: false, left: false }, { ...LIVE, linkActive: false }), {
    ok: true,
    joined: "already",
    blocked: false,
  });
});
check("C2: bloqueo de usuario con el anfitrión = link muerto, aun siendo miembro", () => {
  assert.deepEqual(joinOutcome(null, { ...LIVE, userBlocked: true }), { ok: false, error: "invalid_link" });
  assert.deepEqual(joinOutcome({ blocked: false, left: false }, { ...LIVE, userBlocked: true }), {
    ok: false,
    error: "invalid_link",
  });
});

console.log("\nLímites (C7)");
check("20 fiestas por anfitrión, con su copy", () => {
  assert.equal(MAX_HOSTED_PARTIES, 20);
  assert.equal(TOO_MANY_PARTIES_MESSAGE, "Ya tienes 20 fiestas. Borra alguna para crear otra.");
});
check("links: 10 por hora por fiesta; el 11.º espera a que salga el más viejo", () => {
  assert.equal(INVITE_ROTATIONS_PER_HOUR, 10);
  assert.equal(rotationRetryAfter([]), null);
  assert.equal(rotationRetryAfter(Array.from({ length: 9 }, (_, i) => i * 60)), null);
  const ten = Array.from({ length: 10 }, (_, i) => 3000 - i * 60); // oldest 3000 s
  assert.equal(rotationRetryAfter(ten), 600);
  // ages outside the hour don't count
  assert.equal(rotationRetryAfter([...ten.slice(1), 3700, 5000]), null);
  // 12 in the window: the 3rd oldest has to age out
  const twelve = [3500, 3400, 3300, ...Array.from({ length: 9 }, (_, i) => 100 + i)];
  assert.equal(rotationRetryAfter(twelve), 300);
});

console.log("\nLink de invitación");
check("token nuevo: 16 chars base64url, distintos entre sí", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const t = newInviteToken();
    assert.ok(INVITE_TOKEN_RE.test(t), t);
    assert.ok(!seen.has(t));
    seen.add(t);
  }
});
check("parseInviteToken: forma exacta o null (malformado = desconocido = revocado)", () => {
  assert.equal(parseInviteToken("AbCdEfGhIjKlMn_-"), "AbCdEfGhIjKlMn_-");
  for (const bad of ["", "short", "AbCdEfGhIjKlMn_-x", "AbCdEfGhIjKlMn/-", "../../../etc/pas", null, 42]) {
    assert.equal(parseInviteToken(bad), null, String(bad));
  }
});
check("inviteUrl = https://get-kura.app/f/{token}", () => {
  assert.equal(inviteUrl("AbCdEfGhIjKlMn_-"), "https://get-kura.app/f/AbCdEfGhIjKlMn_-");
});

console.log("\nRegreso tras login (lista blanca, sin open redirect)");
check("acepta /f/{token} y /c/{uuid}", () => {
  assert.equal(safeReturnTo("/f/AbCdEfGhIjKlMn_-"), "/f/AbCdEfGhIjKlMn_-");
  const c = "/c/0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.equal(safeReturnTo(c), c);
  assert.equal(loginPathFor("/f/AbCdEfGhIjKlMn_-"), "/login?to=%2Ff%2FAbCdEfGhIjKlMn_-");
});
check("rechaza todo lo demás", () => {
  for (const bad of [
    "https://evil.com/f/AbCdEfGhIjKlMn_-",
    "//evil.com/f/AbCdEfGhIjKlMn_-",
    "/f/AbCdEfGhIjKlMn_-?x=1",
    "/f/AbCdEfGhIjKlMn_-#x",
    "/f/AbCdEfGhIjKlMn_-/..",
    "/\\evil.com",
    "/backlogs",
    "/c/not-a-uuid",
    "/f/%2F%2Fevil.com",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeReturnTo(bad as string | null | undefined), null, String(bad));
  }
  assert.equal(loginPathFor("https://evil.com"), "/login");
});
check("la regex de return-to y la de rules.ts describen el mismo token", () => {
  for (let i = 0; i < 50; i++) {
    const t = newInviteToken();
    assert.equal(safeReturnTo(`/f/${t}`), `/f/${t}`);
  }
  assert.equal(INVITE_TOKEN_RE.source, "^[A-Za-z0-9_-]{16}$");
});

console.log("\nCopy");
check("presenceLine (la línea de /party)", () => {
  assert.equal(presenceLine({ songCount: 8, named: ["ana", "rodri"], othersCount: 2 }), "8 canciones · @ana, @rodri y 2 más ya están dentro");
  assert.equal(presenceLine({ songCount: 1, named: ["ana"], othersCount: 0 }), "1 canción · @ana ya está dentro");
  assert.equal(presenceLine({ songCount: 3, named: ["ana", "rodri"], othersCount: 0 }), "3 canciones · @ana y @rodri ya están dentro");
  assert.equal(presenceLine({ songCount: 0, named: [], othersCount: 0 }), "0 canciones");
  assert.equal(presenceLine({ songCount: 4, named: [], othersCount: 3 }), "4 canciones · 3 personas ya están dentro");
  assert.equal(presenceLine({ songCount: 4, named: [], othersCount: 1 }), "4 canciones · 1 persona ya está dentro");
});
check("playlistPitch con el tope real (/party)", () => {
  assert.equal(playlistPitch(3), "Pon tus 3 canciones. Van a sonar esa noche, y todos verán quién puso cuál.");
  assert.equal(playlistPitch(1), "Pon tu canción. Va a sonar esa noche, y todos verán quién puso cuál.");
  assert.equal(playlistPitch(null), "Pon tus canciones. Van a sonar esa noche, y todos verán quién puso cuál.");
  assert.ok(!playlistPitch(0).startsWith("Pon"));
});
check("duplicateMessage", () => {
  assert.equal(duplicateMessage(true, "ana"), "Ya la pusiste tú.");
  assert.equal(duplicateMessage(false, "ana"), "Ya está, la puso @ana");
  assert.equal(duplicateMessage(false, null), "Ya está, la puso alguien");
});

console.log("\nCanciones (iTunes → catálogo)");
const itunesSong = {
  wrapperType: "track",
  kind: "song",
  trackId: 1440830311,
  collectionId: 1440830001,
  artistId: 4199621,
  trackName: "La Negra Tomasa",
  artistName: "Caifanes",
  collectionName: "Caifanes",
  previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a",
  trackViewUrl: "https://music.apple.com/mx/album/la-negra-tomasa/1440830001?i=1440830311",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music/x/100x100bb.jpg",
  trackTimeMillis: 263000,
  releaseDate: "1988-01-01T08:00:00Z",
  primaryGenreName: "Rock",
  isStreamable: true,
};
check("una canción se mapea con preview, portada 600 y sin release_date", () => {
  const s = toSongItem(itunesSong);
  assert.ok(s);
  assert.equal(s.externalId, "1440830311");
  assert.equal(s.title, "La Negra Tomasa");
  assert.equal(s.byline, "Caifanes");
  assert.equal(s.year, 1988);
  assert.equal(s.posterUrl, "https://is1-ssl.mzstatic.com/image/thumb/Music/x/600x600bb.jpg");
  assert.ok(!("releaseDate" in s), "una canción nunca entra al cron de estrenos");
  const f = songFactsOf(s.raw);
  assert.equal(f.previewUrl, itunesSong.previewUrl);
  assert.equal(f.durationMs, 263000);
  assert.equal(f.album, "Caifanes");
  assert.equal(f.appleMusicUrl, itunesSong.trackViewUrl);
});
check("lo que no es canción se descarta; URLs fuera de Apple/http no se guardan", () => {
  assert.equal(toSongItem({ ...itunesSong, kind: "music-video" }), null);
  assert.equal(toSongItem({ ...itunesSong, wrapperType: "collection" }), null);
  assert.equal(toSongItem({ ...itunesSong, trackId: undefined }), null);
  const s = toSongItem({ ...itunesSong, previewUrl: "http://audio.itunes.apple.com/x.m4a", trackViewUrl: "https://evil.com/x" });
  assert.ok(s);
  assert.equal(s.raw.previewUrl, null);
  assert.equal(s.raw.trackViewUrl, null);
});
check("songFactsOf tolera raw vacío o ajeno", () => {
  assert.deepEqual(songFactsOf(null), { album: null, previewUrl: null, durationMs: null, appleMusicUrl: null });
  assert.deepEqual(songFactsOf({ previewUrl: 3 }), { album: null, previewUrl: null, durationMs: null, appleMusicUrl: null });
});

console.log("\nFormatos de biblioteca (el barrido 'track')");
check("LIBRARY_MEDIA_TYPES = el enum menos 'track'", () => {
  assert.deepEqual([...LIBRARY_MEDIA_TYPES].sort(), mediaTypeEnum.enumValues.filter((v) => v !== "track").sort());
  assert.ok(mediaTypeEnum.enumValues.includes("track"));
  assert.equal(isLibraryMedia("track"), false);
  assert.equal(isLibraryMedia("album"), true);
  assert.equal(asLibraryRow({ mediaType: "track" }), null);
  assert.deepEqual(asLibraryRow({ mediaType: "film", id: "x" }), { mediaType: "film", id: "x" });
});

console.log("\nWire (serializadores → zod)");
const at = new Date("2026-10-20T18:00:00.000Z");
const person = { handle: "ana", name: "Ana", avatarUrl: "/api/avatar/k" };
const song = {
  titleId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  title: "Thriller",
  artist: "Michael Jackson",
  album: "Thriller",
  artworkUrl: "https://is1-ssl.mzstatic.com/a/600x600bb.jpg",
  previewUrl: "https://audio-ssl.itunes.apple.com/a.m4a",
  durationMs: 357000,
  appleMusicUrl: "https://music.apple.com/mx/album/x?i=1",
  paletteHex: null,
  addedAt: at,
  addedBy: person,
  mine: false,
  byHost: false,
  canRemove: true,
  canBlockAuthor: true,
};
const detail: PartyDetail = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "la fiesta de eric",
  perGuestLimit: 3,
  createdAt: at,
  host: { handle: "eric", name: "Eric", avatarUrl: null },
  viewer: { role: "host", blocked: false, mineCount: 1, remaining: null, canAdd: true },
  songs: [song, { ...song, titleId: "x2", addedBy: null, paletteHex: ["#aabbcc"], previewUrl: null, artworkUrl: null }],
  contributors: [
    { person, isYou: false, songCount: 1 },
    { person: null, isYou: false, songCount: 1 },
  ],
  guestCount: 4,
  invite: { active: true, token: "AbCdEfGhIjKlMn_-", url: "https://get-kura.app/f/AbCdEfGhIjKlMn_-", createdAt: at },
  blockedGuests: [{ guestRef: guestRefOf("p", "u"), person: null, blockedAt: at }],
};
check("toParty → PartySchema (host, link activo, 'alguien', bloqueados)", () => {
  const w = PartySchema.parse(toParty(detail));
  assert.equal(w.createdAt, "2026-10-20T18:00:00Z");
  assert.deepEqual(w.songs[0].palette, []);
  assert.equal(w.songs[1].addedBy, null);
});
check("toParty invitado: invite null, blockedGuests []", () => {
  PartySchema.parse(
    toParty({
      ...detail,
      viewer: { role: "guest", blocked: true, mineCount: 3, remaining: 0, canAdd: false },
      invite: null,
      blockedGuests: [],
    }),
  );
});
check("toPartyCard / toInvitePreview / toPartySongHit → zod", () => {
  PartyCardSchema.parse(
    toPartyCard({
      id: detail.id,
      name: detail.name,
      role: "guest",
      perGuestLimit: null,
      songCount: 2,
      peopleCount: 2,
      host: null,
      artworkUrls: [song.artworkUrl, null],
      paletteHex: null,
      updatedAt: at,
    }),
  );
  InvitePreviewSchema.parse(
    toInvitePreview({
      token: "AbCdEfGhIjKlMn_-",
      party: {
        id: detail.id,
        name: detail.name,
        perGuestLimit: 3,
        host: detail.host,
        songs: detail.songs,
        contributors: detail.contributors,
        guestCount: 4,
      },
      viewer: null,
    }),
  );
  PartySongHitSchema.parse(
    toPartySongHit({ ...song, inParty: { mine: false, addedBy: null } }),
  );
});
check("error de duplicado lleva addedBy (o null = alguien) en el sobre", () => {
  ErrorBodySchema.parse({ error: { code: "conflict", message: "Ya está, la puso @ana", reason: "duplicate_other", addedBy: person } });
  ErrorBodySchema.parse({ error: { code: "conflict", message: "Ya está, la puso alguien", reason: "duplicate_other", addedBy: null } });
});

console.log("\nFuentes (greps)");
const ROOT = join(__dirname, "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
check("rules.ts es client-safe: sin node:crypto ni server-only (lo importan componentes cliente)", () => {
  const rules = src("src/modules/party-collections/rules.ts");
  assert.ok(!/^import\b[^;]*["'](node:crypto|crypto|server-only|@\/db[^"']*)["']/m.test(rules));
});
check("login: cada entrada propaga ?to=", () => {
  const form = src("src/app/(auth)/login/login-form.tsx");
  assert.ok(/carryReturnTo\(`\/verify\?email=/.test(form), "login-form: el push a /verify debe pasar por carryReturnTo");
  assert.ok(/type="hidden" name="to"/.test(form), "login-form: el form de Apple debe llevar el input hidden `to`");
  const actions = src("src/app/(auth)/login/actions.ts");
  assert.ok(/formData\.get\("to"\)/.test(actions) && /safeReturnTo\(/.test(actions), "continueWithAppleAction: leer `to` y revalidarlo con safeReturnTo");
  assert.ok(!/redirectTo:\s*"\/backlogs"\s*\}/.test(actions), "continueWithAppleAction: redirectTo fijo a /backlogs pierde el regreso");
  const page = src("src/app/(auth)/login/page.tsx");
  assert.ok(/safeReturnTo\(/.test(page) && /returnTo=/.test(page), "login/page: pasar `to` (safeReturnTo) al form");
  const config = src("src/auth/config.ts");
  assert.ok(!/return APPLE_WEB_ERROR;\s*\n\s*const kuraAccount/.test(config) && /appleErrorUrl\(\)/.test(config), "auth/config: el error de Apple debe volver con `to` (appleErrorUrl)");
  const verify = src("src/app/(auth)/verify/page.tsx");
  assert.ok(/returnToParam\(\)/.test(verify), "verify: navegar a returnToParam() tras el código");
  assert.ok(/router\.push\(carryReturnTo\("\/login"\)\)/.test(verify), "verify: \"Enviar otro código\" debe volver a /login con `to`");
  assert.ok(!/router\.push\("\/login"\)/.test(verify), "verify: un push a /login sin `to`");
});

console.log(failures === 0 ? "\ncheck-party-rules ok" : `\n${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
