import { hashString, mulberry32 } from "../render/util";

/**
 * Palette helpers for the Double Feature discs (ADR-008: the extracted
 * palette is the ONLY bridge from cover art to the card — no pixels). All
 * derivations are deterministic per palette so the same pairing always
 * renders the same object.
 */

const FALLBACK = ["#C7462F", "#E8B23A", "#3A5A9B", "#7A2F5A", "#241C1A"];

/** Normalize to at least 5 usable hex colors, in dominance order. */
export function normalizePalette(palette: string[]): string[] {
  const clean = palette.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
  if (clean.length >= 3) {
    const out = [...clean];
    let i = 0;
    while (out.length < 5) out.push(clean[i++ % clean.length]);
    return out.slice(0, 6);
  }
  return FALLBACK;
}

/** Conic-gradient string for a generative disc face, seeded by the pairing. */
export function discFace(palette: string[], seed: string): string {
  const p = normalizePalette(palette);
  const rand = mulberry32(hashString(seed));
  const start = Math.floor(rand() * 360);
  return `conic-gradient(from ${start}deg, ${p[0]}, ${p[1]} 28%, ${p[2]} 58%, ${
    p[3] ?? p[0]
  } 80%, ${p[0]})`;
}

/** Two auras (top seed / bottom reco) from the two most dominant colors. */
export function auraColors(palette: string[]): { top: string; bottom: string } {
  const p = normalizePalette(palette);
  return { top: p[0], bottom: p[3] ?? p[1] };
}
