import type { CSSProperties } from "react";

/**
 * The light behind a card or a section (Feed v3 → Revamp UI, 2026-09-03): a
 * flat LINEAR gradient of the palette — 120° for one title's two hexes, 110°
 * for a MIX of several titles' dominant hexes — at the opacity the mock gives
 * each surface, softened by `filter: blur(70px)` (80/90 on the page-wide
 * heroes) and promoted to its own layer (`translateZ(0)`), exactly as the
 * design draws it.
 *
 * Founder call 2026-09-02: the blur is the mock's, so it ships — knowing the
 * aura primitive (aura-field.tsx) avoids filter:blur because a 70px blur is
 * real GPU work per layer. It's static (nothing animates), which is what keeps
 * a page of a dozen glows scrollable; if it ever janks on a phone, the
 * mask-feathered version lives in git history (commit ebf4742).
 *
 * Absolutely positioned inside a `relative` parent; the caller sizes it with
 * `className` (a card bleeds past its box, a section hugs its rows, a page
 * hero hangs off the top edge). `aria-hidden` and `pointer-events-none` —
 * light, never a target.
 */

export function glowGradient(hexes: readonly string[], angle: number): string {
  const colors = hexes.slice(0, 4);
  if (colors.length === 1) colors.push(colors[0]);
  return `linear-gradient(${angle}deg, ${colors.join(", ")})`;
}

/**
 * The mock's `glowMix`: the FIRST (dominant) hex of up to four titles, in
 * order, deduped case-insensitively — the light of a strip of covers. Titles
 * without a palette are skipped; an empty result means "no glow".
 */
export function mixHexes(palettes: ReadonlyArray<readonly string[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of palettes) {
    const hex = p[0];
    if (!hex) continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hex);
    if (out.length === 4) break;
  }
  return out;
}

export function PaletteGlow({
  hexes,
  opacity = 0.42,
  /** 120° = the mock's single-title glow; pass 110 for a palette MIX. */
  angle = 120,
  /** The mock's blur radius: 70 on cards/sections, 80–90 on page heroes. */
  blur = 70,
  className = "-inset-x-[10px] -inset-y-[30px]",
}: {
  hexes: readonly string[];
  opacity?: number;
  angle?: number;
  blur?: number;
  className?: string;
}) {
  if (hexes.length === 0) return null;
  const style: CSSProperties = {
    background: glowGradient(hexes, angle),
    opacity,
    filter: `blur(${blur}px)`,
    transform: "translateZ(0)",
  };
  return (
    <div aria-hidden className={`pointer-events-none absolute ${className}`} style={style} />
  );
}
