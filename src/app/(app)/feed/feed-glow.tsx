import type { CSSProperties } from "react";

/**
 * Feed v3 — the light behind every card, with the mock's values verbatim: a
 * flat LINEAR gradient of the palette (120° for one title, 110° for a mix)
 * at the card's opacity (.42 burst · .55 obsessed · .5 reviewed · .35
 * suggest · .4 compact), softened by `filter: blur(70px)` and promoted to its
 * own layer (`translateZ(0)`), exactly as the design draws it.
 *
 * Founder call 2026-09-02: the blur is the mock's, so it ships — knowing the
 * aura primitive (aura-field.tsx) avoids filter:blur because a 70px blur is
 * real GPU work per layer. It's static here (nothing animates), which is
 * what keeps a feed of a dozen glows scrollable; if it ever janks on a phone,
 * the mask-feathered version lives in git history (commit ebf4742).
 *
 * Absolutely positioned inside a `relative` card; the caller sizes it with
 * `className` (the hero bleeds past the card, the compact hugs its cover).
 * `aria-hidden` and `pointer-events-none` — light, never a target.
 */

export function glowGradient(hexes: readonly string[], angle: number): string {
  const colors = hexes.slice(0, 4);
  if (colors.length === 1) colors.push(colors[0]);
  return `linear-gradient(${angle}deg, ${colors.join(", ")})`;
}

export function FeedGlow({
  hexes,
  opacity = 0.42,
  /** 120° = the mock's single-title glow; pass 110 for a palette MIX. */
  angle = 120,
  className = "-inset-x-[10px] -inset-y-[30px]",
}: {
  hexes: readonly string[];
  opacity?: number;
  angle?: number;
  className?: string;
}) {
  if (hexes.length === 0) return null;
  const style: CSSProperties = {
    background: glowGradient(hexes, angle),
    opacity,
    filter: "blur(70px)",
    transform: "translateZ(0)",
  };
  return (
    <div aria-hidden className={`pointer-events-none absolute ${className}`} style={style} />
  );
}
