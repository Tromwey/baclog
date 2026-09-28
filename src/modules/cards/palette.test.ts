import { test } from "node:test";
import assert from "node:assert/strict";
import { rankPalette } from "./palette";

// Run: pnpm tsx --test src/modules/cards/palette.test.ts

/** A 64×64 RGBA raster painted with `[hex, pixelCount]` runs (the rest = the last colour). */
function raster(runs: [string, number][]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(64 * 64 * 4);
  let at = 0;
  for (const [hex, count] of runs) {
    const n = parseInt(hex.slice(1), 16);
    for (let k = 0; k < count && at < 64 * 64; k++, at++) {
      px.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], at * 4);
    }
  }
  return px;
}

// mosca/Burning in miniature: one big blue split over five neighbouring
// buckets, a small yellow (5 %) and a white field (12 %). The old top-5-by-score
// returned the five blues (#0a5abe #2864b0 #144696 #2050a0 #465aaa).
const BLUES: [string, number][] = [
  ["#2050a0", 700],
  ["#2864b0", 700],
  ["#144696", 700],
  ["#465aaa", 650],
  ["#0a5abe", 650],
];
const COVER = raster([...BLUES, ["#e8c020", 200], ["#f5f5f5", 496]]);

test("rankPalette: a dominant blue no longer fills all five slots — yellow and white get in", () => {
  const p = rankPalette(COVER);
  assert.equal(p.length, 5);
  assert.ok(p.includes("#e8c020"), `yellow missing: ${p.join(" ")}`);
  assert.ok(p.includes("#f5f5f5"), `white missing: ${p.join(" ")}`);
});

test("rankPalette: tone 1 is still the top chroma × coverage bucket", () => {
  // #0a5abe: chroma 180 × 650 — the highest score, as before the change.
  assert.equal(rankPalette(COVER)[0], "#0a5abe");
});

test("rankPalette: never fewer colours than there are buckets (up to 5)", () => {
  // Three near-identical blues: nothing is ΔE ≥ 20 apart, the fill keeps all three.
  const p = rankPalette(raster([["#2050a0", 2000], ["#2860b0", 1500], ["#18489a", 596]]));
  assert.equal(p.length, 3);
});

test("rankPalette: monochrome art still ranks by coverage", () => {
  const p = rankPalette(raster([["#101010", 3000], ["#f0f0f0", 1096]]));
  assert.deepEqual(p, ["#101010", "#f0f0f0"]);
});

test("rankPalette: stray pixels (< 1 %) don't take a distinct slot", () => {
  // 20 red pixels (0.5 %) are far from blue but too few to count as a colour of the cover.
  const p = rankPalette(raster([...BLUES, ["#e02020", 20], ["#2050a0", 676]]));
  assert.notEqual(p[1], "#e02020");
});

test("rankPalette: transparent pixels are ignored; empty in, empty out", () => {
  assert.deepEqual(rankPalette(new Uint8ClampedArray(64 * 64 * 4)), []);
});
