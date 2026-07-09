/**
 * Design-system tokens for the canvas cards (sistema-diseno §2). Kept as
 * literals here because the renderers run on a raw <canvas> where CSS
 * variables aren't available.
 */
export const CARD_TOKENS = {
  bg: "#0B0B0D",
  surface1: "#141417",
  surface2: "#1C1C21",
  line: "#2E2E36",
  text: "#F4F3EE",
  text2: "#A9A8B2",
  text3: "#6C6B76",
  accent: "#D8FF3E",
  hot: "#FF2D55",
  radar: "#7AA2FF",
} as const;

/**
 * Grain + paper-tooth overlay (sistema-diseno §5): the analog-artifact detail
 * that separates "posteable" from AI slop. Deterministic per seed so the same
 * card always grains identically. `opacity` ~0.05–0.08. Draws monochrome
 * speckle scaled to the current canvas; call LAST so it sits over everything.
 */
export function drawGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity = 0.06,
  seed = 1,
) {
  const rand = mulberry32(seed);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = "overlay";
  // Sparse light/dark speckle — cheap fractal-noise stand-in on <canvas>
  const step = 3;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const n = rand();
      if (n < 0.5) continue;
      ctx.fillStyle = n > 0.75 ? "#ffffff" : "#000000";
      ctx.fillRect(x, y, step, step);
    }
  }
  ctx.restore();
}

/** Deterministic 32-bit string hash (FNV-1a). */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded PRNG — same seed, same sequence, on every device. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Trim with ellipsis until the text fits maxWidth in the current ctx.font. */
export function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  // A single word can exceed maxWidth on its own — ellipsize it in place
  return lines.map((l) =>
    ctx.measureText(l).width > maxWidth ? truncateToWidth(ctx, l, maxWidth) : l,
  );
}

/** Share footer: unclaimed usernames fall back to the bare domain. */
export function footerUrl(username: string): string {
  return username ? `baclog.app/${username}` : "baclog.app";
}

/**
 * Reaction glyph for the ticket/receipt — no me gusta renders nothing (no
 * negative signal on a shareable card), me gusta/me obsesiona get a single
 * vs. doubled mark (F3.6, replaces the old 1-5★ rating row).
 */
export function reactionGlyph(
  reaction: "disliked" | "liked" | "obsessed" | undefined,
): string {
  if (reaction === "obsessed") return "★ ★";
  if (reaction === "liked") return "★";
  return "";
}
