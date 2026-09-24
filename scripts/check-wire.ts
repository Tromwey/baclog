/**
 * Guardrail for the /api/v1 wire serializers (`src/app/api/v1/_lib/wire/*`
 * + `modules/backlog/mark.ts`): feeds each one representative rows and parses
 * the output against the zod contract in `_lib/schemas.ts`. Pure — no DB, no
 * server — so it runs anywhere: `pnpm tsx scripts/check-wire.ts`. Exits 1 on
 * the first failure.
 */
import assert from "node:assert/strict";
import { kuraMarkOf, publicMarkOf } from "../src/modules/backlog/mark";
import { profileTint } from "../src/modules/backlog/profile-hexes";
import {
  CollectionSchema,
  PersonSchema,
  ReleaseSchema,
  TitleSchema,
  TitleStateSchema,
} from "../src/app/api/v1/_lib/schemas";
import {
  releaseOf,
  toCollection,
  toCollectionDetail,
  toPersonLite,
  toTitleState,
  toTitleSummary,
  wireVisibilityOf,
} from "../src/app/api/v1/_lib/wire";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`   ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`   FAIL ${name}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const T0 = new Date("2026-09-24T15:00:00.123Z");
const T1 = new Date("2026-09-25T09:30:00.000Z");

console.log("check-wire");

check("kuraMarkOf: precedencia obsessed → liked → completed → null", () => {
  assert.equal(kuraMarkOf({ obsessed: true, verdict: "disliked", status: "completed" }), "obsessed");
  assert.equal(kuraMarkOf({ obsessed: false, verdict: "liked", status: "on_my_radar" }), "liked");
  assert.equal(kuraMarkOf({ obsessed: false, verdict: null, status: "completed" }), "completed");
  // "disliked" is NOT a Kura mark for the owner: the app has no such picker state.
  assert.equal(kuraMarkOf({ obsessed: false, verdict: "disliked", status: "completed" }), "completed");
  assert.equal(kuraMarkOf({ obsessed: false, verdict: null, status: "on_my_radar" }), null);
});

check("publicMarkOf: disliked tal cual, resto como kuraMarkOf", () => {
  assert.equal(publicMarkOf({ obsessed: false, verdict: "disliked", status: "completed" }), "disliked");
  assert.equal(publicMarkOf({ obsessed: true, verdict: "disliked", status: "completed" }), "obsessed");
  assert.equal(publicMarkOf({ obsessed: false, verdict: null, status: "completed" }), "completed");
  assert.equal(publicMarkOf({ obsessed: false, verdict: null, status: "on_my_radar" }), null);
});

check("toTitleSummary cumple TitleSchema (resumen, paleta null → [])", () => {
  const t = TitleSchema.parse(
    toTitleSummary({
      id: "t1",
      title: "Perfect Days",
      mediaType: "film",
      year: 2023,
      byline: "Master Mind",
      posterUrl: "https://image.tmdb.org/t/p/w500/x.jpg",
      paletteHex: null,
    }),
  );
  assert.deepEqual(t.palette, []);
  assert.equal(t.creator, "Master Mind");
  assert.ok(!("synopsis" in t), "el resumen no lleva campos de detalle");
  TitleSchema.parse(
    toTitleSummary({
      id: "t2",
      title: "Blonde",
      mediaType: "album",
      year: null,
      byline: null,
      posterUrl: null,
      paletteHex: ["#112233", "#AABBCC"],
    }),
  );
  assert.throws(() =>
    TitleSchema.parse(
      toTitleSummary({
        id: "t3",
        title: "x",
        mediaType: "series",
        year: null,
        byline: null,
        posterUrl: null,
        paletteHex: ["not-a-hex"],
      }),
    ),
  );
});

check("toTitleSummary: catalogItemId GANA sobre id (una fila de membresía trae ambos)", () => {
  const t = TitleSchema.parse(
    toTitleSummary({
      id: "membership-row-id",
      catalogItemId: "cat-1",
      title: "Shōgun",
      mediaType: "series",
      year: 2024,
      byline: "FX",
      posterUrl: null,
      paletteHex: [],
    }),
  );
  assert.equal(t.id, "cat-1", "el id del catálogo, nunca el de la fila");
});

check("releaseOf: day siempre con fecha (pasada o futura), year, null", () => {
  const past = ReleaseSchema.parse(releaseOf(T0, 2026));
  assert.deepEqual(past, { kind: "day", date: "2026-09-24T15:00:00Z" });
  const future = ReleaseSchema.parse(releaseOf(T1, null));
  assert.equal(future.kind, "day");
  const fromString = ReleaseSchema.parse(releaseOf("2026-01-02T00:00:00.000Z", null));
  assert.equal(fromString.date, "2026-01-02T00:00:00Z");
  const year = ReleaseSchema.parse(releaseOf(null, 1999));
  assert.deepEqual(year, { kind: "year", date: "1999-01-01T00:00:00Z" });
  assert.equal(releaseOf(null, null), null);
});

check("toTitleState cumple TitleStateSchema (savedAt sin fracción, reviewId opcional)", () => {
  const s = TitleStateSchema.parse(
    toTitleState({
      catalogItemId: "t1",
      status: "completed",
      verdict: null,
      obsessed: false,
      addedAt: T0,
    }),
  );
  assert.deepEqual(s, { titleId: "t1", mark: "completed", savedAt: "2026-09-24T15:00:00Z", reviewId: null });
  const r = TitleStateSchema.parse(
    toTitleState({
      catalogItemId: "t1",
      status: "on_my_radar",
      verdict: null,
      obsessed: false,
      addedAt: T0,
      reviewId: "r9",
    }),
  );
  assert.equal(r.mark, null);
  assert.equal(r.reviewId, "r9");
});

check("wireVisibilityOf: private · link · profile", () => {
  assert.equal(wireVisibilityOf({ isPublic: false, showOnProfile: true }), "private");
  assert.equal(wireVisibilityOf({ isPublic: false, showOnProfile: false }), "private");
  assert.equal(wireVisibilityOf({ isPublic: true, showOnProfile: false }), "link");
  assert.equal(wireVisibilityOf({ isPublic: true, showOnProfile: true }), "profile");
});

check("toCollection: orden addedAt desc, coverTitleId = más reciente con portada", () => {
  const c = CollectionSchema.parse(
    toCollection({
      id: "c1",
      name: "Obsesiones",
      vibe: null,
      isPublic: true,
      showOnProfile: true,
      createdAt: T0,
      updatedAt: T1,
      memberships: [
        { catalogItemId: "old", addedAt: new Date("2026-01-01T00:00:00Z"), posterUrl: "https://x/old.jpg" },
        { catalogItemId: "newest", addedAt: T1, posterUrl: null },
        { catalogItemId: "mid", addedAt: T0, posterUrl: "https://x/mid.jpg" },
      ],
    }),
  );
  assert.deepEqual(c.titleIds, ["newest", "mid", "old"]);
  assert.equal(c.coverTitleId, "mid", "el más reciente SIN portada no es la portada");
  assert.equal(c.addedAt.newest, "2026-09-25T09:30:00Z");
  assert.equal(c.visibility, "profile");
  assert.equal(c.createdAt, "2026-09-24T15:00:00Z");
  const empty = CollectionSchema.parse(
    toCollection({
      id: "c2",
      name: "Vacía",
      vibe: "noche",
      isPublic: false,
      showOnProfile: true,
      createdAt: T0,
      updatedAt: T0,
      memberships: [],
    }),
  );
  assert.deepEqual(empty.titleIds, []);
  assert.equal(empty.coverTitleId, null);
  assert.equal(empty.visibility, "private");
});

check("toCollectionDetail: { collection, titles, states } coherentes y en orden", () => {
  const d = toCollectionDetail(
    { id: "c1", name: "Noche", vibe: null, isPublic: true, showOnProfile: false, createdAt: T0, updatedAt: T1 },
    [
      { catalogItemId: "old", addedAt: new Date("2026-01-01T00:00:00Z"), title: "Old", mediaType: "film", year: 2001, byline: null, posterUrl: "https://x/old.jpg", paletteHex: null, status: "completed", verdict: "liked", obsessed: false, savedAt: new Date("2025-12-01T00:00:00Z"), reviewId: "r1" },
      { catalogItemId: "new", addedAt: T1, title: "New", mediaType: "album", year: null, byline: "Someone", posterUrl: null, paletteHex: ["#112233"], status: "on_my_radar", verdict: null, obsessed: true, savedAt: T1, reviewId: null },
    ],
  );
  CollectionSchema.parse(d.collection);
  d.titles.forEach((t) => TitleSchema.parse(t));
  Object.values(d.states).forEach((st) => TitleStateSchema.parse(st));
  assert.deepEqual(d.collection.titleIds, ["new", "old"]);
  assert.deepEqual(d.titles.map((t) => t.id), ["new", "old"], "titles en el orden de la colección");
  assert.equal(d.collection.visibility, "link");
  assert.equal(d.collection.coverTitleId, "old", "el más reciente sin portada no es la portada");
  assert.equal(d.states.old.savedAt, "2025-12-01T00:00:00Z", "savedAt sale de savedAt, no del addedAt de la membresía");
  assert.equal(d.states.old.reviewId, "r1");
  assert.equal(d.states.old.mark, "liked");
  assert.equal(d.states.new.mark, "obsessed");
});

check("profileTint: featuredTitleId = la obsesión que tiñe; null si tiñe la biblioteca", () => {
  const fromObsession = profileTint(
    [
      { catalogItemId: "no-palette", paletteHex: null },
      { catalogItemId: "tints", paletteHex: ["#123456", "#d8ff3e"] },
    ],
    ["#aaaaaa"],
  );
  assert.equal(fromObsession.featuredTitleId, "tints", "la primera obsesión CON paleta, no la más reciente sin ella");
  assert.deepEqual(fromObsession.hexes, ["#123456"], "la lima se filtra");
  const fromLibrary = profileTint([{ catalogItemId: "no-palette", paletteHex: [] }], ["#aaaaaa"]);
  assert.equal(fromLibrary.featuredTitleId, null, "sin obsesión con paleta no hay título destacado");
  assert.deepEqual(fromLibrary.hexes, ["#aaaaaa"]);
  assert.deepEqual(profileTint([], []), { hexes: [], featuredTitleId: null });
});

check("toPersonLite cumple PersonSchema (defaults en cero, name null → '')", () => {
  const p = PersonSchema.parse(toPersonLite({ username: "ana", name: null, avatarUrl: null }));
  assert.equal(p.name, "");
  assert.deepEqual(p.hexes, []);
  assert.equal(p.isFollowing, false);
  assert.equal(p.followers, 0);
  assert.deepEqual(p.stats, { obsessed: 0, liked: 0, completed: 0, reviews: 0 });
  assert.equal(p.why, null);
  const full = PersonSchema.parse(
    toPersonLite({
      username: "eric",
      name: "Eric",
      avatarUrl: "/api/avatar/abc",
      avatarHexes: ["#000000", "#ffffff"],
      isFounder: true,
      followerCount: 3,
      followingCount: 7,
      following: true,
      why: "le obsesiona Perfect Days",
    }),
  );
  assert.equal(full.followingCount, 7);
  assert.equal(full.isFollowing, true);
  assert.ok(!("id" in full) && !("email" in full), "Person jamás lleva id ni email");
  assert.ok(!("isPrivate" in p) && !("isPrivate" in full), "isPrivate no viaja salvo que sea true");
  const priv = PersonSchema.parse(
    toPersonLite({ username: "ana", name: "Ana", avatarUrl: null, avatarHexes: [], isPrivate: true }),
  );
  assert.equal(priv.isPrivate, true);
});

console.log(failures === 0 ? "\ncheck-wire ok" : `\n${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
