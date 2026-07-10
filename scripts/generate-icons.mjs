// PLACEHOLDER app-icon generator (F3.7 followup — PWA).
//
// There is no brand logo asset yet, so this draws a simple lime (#D8FF3E)
// 4-point "spark" — the app's signature glyph — on the dark canvas (#0B0B0D)
// and writes the PWA/home-screen PNGs into public/. Dependency-free (pure Node
// zlib), so no image library is needed.
//
// FOUNDER: replace public/icon-192.png, public/icon-512.png and
// public/apple-touch-icon.png with the real logo whenever it exists (keep the
// same filenames + sizes and manifest.ts / layout metadata need no changes), or
// re-run `node scripts/generate-icons.mjs` after tweaking this file.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = [11, 11, 13]; // #0B0B0D — dark canvas (bleeds to edges = maskable-safe)
const LIME = [216, 255, 62]; // #D8FF3E — signature spark

// --- minimal RGBA PNG encoder (zlib only) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- 4-point star polygon (matches SPARKLE_PATH: sharp tips on the axes,
//     narrow inner vertices on the diagonals) ---
function starVertices(c, R) {
  const ri = R * 0.4; // inner radius → thin spikes, like the app glyph
  const d = ri * Math.SQRT1_2;
  return [
    [c, c - R], // top tip
    [c + d, c - d],
    [c + R, c], // right tip
    [c + d, c + d],
    [c, c + R], // bottom tip
    [c - d, c + d],
    [c - R, c], // left tip
    [c - d, c - d],
  ];
}
function inPoly(x, y, v) {
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [xi, yi] = v[i];
    const [xj, yj] = v[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function render(size) {
  const c = size / 2;
  // Tips reach 72% of the half-canvas → 36% of full size from center, inside
  // the maskable safe zone (inner 80% ⇒ 40% radius).
  const v = starVertices(c, c * 0.72);
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // supersample for anti-aliasing
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sx = 0; sx < SS; sx++)
        for (let sy = 0; sy < SS; sy++)
          if (inPoly(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, v)) hits++;
      const cov = hits / (SS * SS);
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(BG[0] + (LIME[0] - BG[0]) * cov);
      rgba[i + 1] = Math.round(BG[1] + (LIME[1] - BG[1]) * cov);
      rgba[i + 2] = Math.round(BG[2] + (LIME[2] - BG[2]) * cov);
      rgba[i + 3] = 255; // opaque (iOS ignores alpha; dark bg shows through mask)
    }
  }
  return encodePng(size, rgba);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(join(PUBLIC, name), render(size));
  console.log(`wrote public/${name} (${size}×${size})`);
}
