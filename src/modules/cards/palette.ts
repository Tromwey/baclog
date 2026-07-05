/**
 * F2.15 — on-device palette extraction (client-only). Colors are not
 * protectable expression (ADR-008): we store 4-6 hex values, never the
 * artwork. Requires the CDN to allow CORS (mzstatic and image.tmdb.org
 * do); a tainted canvas or any failure degrades to [] silently.
 */
export async function extractPalette(posterUrl: string): Promise<string[]> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = posterUrl;
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

    return [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
      .map(
        (b) =>
          `#${[b.r, b.g, b.b]
            .map((c) => Math.round(c / b.n).toString(16).padStart(2, "0"))
            .join("")}`,
      );
  } catch {
    return [];
  }
}
