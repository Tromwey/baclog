/**
 * F2.15 — on-device palette extraction (client-only). Colors are not
 * protectable expression (ADR-008): we store 4-6 hex values, never the
 * artwork. Requires the CDN to allow CORS (mzstatic and image.tmdb.org do —
 * though TMDB only sends the ACAO header when an Origin is present, hence the
 * poisoned-cache guard below); a tainted canvas or any failure degrades to []
 * silently.
 *
 * F3.6.1: ranks buckets by vividness (chroma) × coverage, not raw pixel count.
 * Pure frequency favored whatever covered the most area — usually a dark or
 * washed-out background — over the striking accent color a cover is actually
 * memorable for. Chroma (max−min channel) is a cheap saturation proxy that
 * naturally scores near-black/near-white/gray areas low without a separate
 * lightness penalty, while still counting a dark-but-saturated color (e.g. a
 * deep red logo in shadow) as vivid. Weighting by coverage keeps a single
 * stray/noise pixel from outranking a color that's actually present.
 *
 * The ranking itself lives in `rankPalette` (pure, testable, twin of iOS
 * `CoverPalette.rank`).
 */
export async function extractPalette(posterUrl: string): Promise<string[]> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Poisoned-cache guard (films/series were silently losing their palette).
    // The same cover is ALSO rendered as a plain <img> (no crossOrigin) on the
    // item/search surfaces, which caches a NON-CORS response for the bare URL.
    // image.tmdb.org only sends Access-Control-Allow-Origin when the request
    // carries an Origin header, so that cached entry has no ACAO — and the
    // browser then reuses it for THIS crossOrigin load, throwing EncodingError
    // at decode() → []. (mzstatic albums send ACAO unconditionally, so they were
    // unaffected — which is why only TMDB video hit this.) Requesting a private
    // ?_pal variant nothing else fetches guarantees a clean CORS response. Keep
    // it STATIC so repeat extractions of the same cover still hit the cache.
    img.src = withPaletteCacheKey(posterUrl);
    await img.decode();

    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    return rankPalette(data);
  } catch {
    return [];
  }
}

/**
 * Append the private `?_pal` cache key used above. Kept separate (and behind its
 * own try/catch) so a non-absolute or malformed URL falls back to the original
 * string — the outer decode still runs, matching pre-fix behavior — instead of
 * throwing out of `new URL` and blanking the palette.
 */
function withPaletteCacheKey(posterUrl: string): string {
  try {
    const u = new URL(posterUrl);
    u.searchParams.set("_pal", "1");
    return u.toString();
  } catch {
    return posterUrl;
  }
}

type Bucket = { r: number; g: number; b: number; n: number; chroma: number };

/**
 * PROPUESTA (2026-09-28, pendiente del founder) — paleta con variedad.
 * How far apart (CIE76 ΔE) each chosen colour must be from every colour
 * already chosen. Measured on 37 real covers: 15/20/25 behave alike; 20 keeps
 * Burning's pale blue AND its pink (25 drops the blue for a navy).
 */
export const PALETTE_MIN_DELTA = 20;
/** A bucket must cover ≥ 1 % of the cover to count as a distinct colour (no stray pixels). */
const MIN_SHARE = 0.01;
/** A light (L* ≥ 80) or dark (L* ≤ 20) mass covering ≥ 8 % earns one reserved slot. */
const NEUTRAL_SHARE = 0.08;
const LIGHT_L = 80;
const DARK_L = 20;

/**
 * RGBA pixels (a 64×64 raster) → up to 5 `#rrggbb`, most memorable first.
 *
 * Buckets: 3 bits per channel, averaged inside each bucket; score = chroma ×
 * coverage (coverage alone when the art is monochrome, every chroma < 8).
 *
 * Variety (propuesta 2026-09-28): ranking by score alone filled all five slots
 * with one big area split across neighbouring buckets (mosca: five blues;
 * Burning: five blues) and never let white/black in (chroma ≈ 0). Now:
 * 1. the first colour is still the top score (tone 1 of every tint never moves);
 * 2. each next one is the best score among buckets ≥ `PALETTE_MIN_DELTA` from
 *    ALL chosen ones (and ≥ 1 % coverage);
 * 3. if the cover has a light or dark mass ≥ 8 % that tone 1 isn't part of,
 *    one slot is reserved for its biggest bucket (the larger mass wins);
 * 4. short of distinct candidates, the rest fill by score — never fewer
 *    colours than before.
 * Twin of iOS `CoverPalette.rank`; change both or neither.
 */
export function rankPalette(data: ArrayLike<number>): string[] {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r >> 5}:${g >> 5}:${b >> 5}`;
    const acc = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    acc.r += r;
    acc.g += g;
    acc.b += b;
    acc.n += 1;
    buckets.set(key, acc);
    total += 1;
  }

  const averaged: Bucket[] = [...buckets.values()].map((b) => {
    const r = Math.round(b.r / b.n);
    const g = Math.round(b.g / b.n);
    const bl = Math.round(b.b / b.n);
    return { r, g, b: bl, n: b.n, chroma: Math.max(r, g, bl) - Math.min(r, g, bl) };
  });
  if (averaged.length === 0) return [];

  // Grayscale/monochrome art (b&w stills, some vinyl sleeves): every bucket's
  // chroma is ~0, so chroma×count collapses to all-zero and .sort() would
  // fall back to Map insertion (raster-scan) order instead of a meaningful
  // ranking. Fall back to pure coverage in that case — there's no vivid
  // color to prefer, so "most common" is the best available signal.
  const maxChroma = Math.max(0, ...averaged.map((c) => c.chroma));
  const score = maxChroma < 8 ? (c: Bucket) => c.n : (c: Bucket) => c.chroma * c.n;
  const order = averaged.sort((a, b) => score(b) - score(a));

  const L = order.map(lab);
  const want = Math.min(5, order.length);
  const picked = [0];
  const far = (i: number) => picked.every((j) => deltaE76(L[i], L[j]) >= PALETTE_MIN_DELTA);

  // The light / dark mass (white paper, a black field) counted as a group —
  // it splits across several buckets — represented by its biggest bucket.
  const mass = (inGroup: (l: number) => boolean) => {
    let n = 0;
    let rep = -1;
    order.forEach((c, i) => {
      if (!inGroup(L[i][0])) return;
      n += c.n;
      if (rep < 0 || c.n > order[rep].n) rep = i;
    });
    return { inGroup, rep, share: n / total };
  };
  const neutral = [mass((l) => l >= LIGHT_L), mass((l) => l <= DARK_L)]
    .filter((m) => m.rep >= 0 && m.share >= NEUTRAL_SHARE && !m.inGroup(L[0][0]))
    .sort((a, b) => b.share - a.share)[0];
  const needsNeutral = () => !!neutral && !picked.some((j) => neutral.inGroup(L[j][0]));

  const diverse = (limit: number) => {
    for (let i = 1; i < order.length && picked.length < limit; i++) {
      if (!picked.includes(i) && order[i].n >= total * MIN_SHARE && far(i)) picked.push(i);
    }
  };
  diverse(want - (needsNeutral() ? 1 : 0));
  if (neutral && needsNeutral() && picked.length < want && far(neutral.rep)) picked.push(neutral.rep);
  diverse(want);
  for (let i = 1; i < order.length && picked.length < want; i++) {
    if (!picked.includes(i)) picked.push(i);
  }

  return picked.map((i) => {
    const c = order[i];
    return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  });
}

/** CIE L*a*b* (D65) — same math as `kura/tint.ts` (modules/cards keeps its own copies on purpose). */
function lab(c: { r: number; g: number; b: number }): [number, number, number] {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(c.r), lin(c.g), lin(c.b)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE76(p: readonly number[], q: readonly number[]): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
