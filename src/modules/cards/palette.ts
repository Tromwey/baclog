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

    // Quantize to a 3-bit-per-channel histogram, average within buckets
    const buckets = new Map<
      string,
      { r: number; g: number; b: number; n: number }
    >();
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
    }

    const averaged = [...buckets.values()].map((b) => {
      const r = Math.round(b.r / b.n);
      const g = Math.round(b.g / b.n);
      const bl = Math.round(b.b / b.n);
      const chroma = Math.max(r, g, bl) - Math.min(r, g, bl);
      return { r, g, b: bl, n: b.n, chroma };
    });

    // Grayscale/monochrome art (b&w stills, some vinyl sleeves): every bucket's
    // chroma is ~0, so chroma×count collapses to all-zero and .sort() would
    // fall back to Map insertion (raster-scan) order instead of a meaningful
    // ranking. Fall back to pure coverage in that case — there's no vivid
    // color to prefer, so "most common" is the best available signal.
    const maxChroma = Math.max(0, ...averaged.map((c) => c.chroma));
    const score = maxChroma < 8 ? (c: (typeof averaged)[number]) => c.n : (c: (typeof averaged)[number]) => c.chroma * c.n;

    return averaged
      .sort((a, b) => score(b) - score(a))
      .slice(0, 5)
      .map(
        (c) =>
          `#${[c.r, c.g, c.b]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")}`,
      );
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
