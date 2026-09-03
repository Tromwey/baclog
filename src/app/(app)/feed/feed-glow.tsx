import type { CSSProperties } from "react";

/**
 * Feed v3 — the light behind every card, with the mock's values: a flat
 * LINEAR gradient of the palette (120° for one title, 110° for a mix) at the
 * card's opacity (.42 burst · .55 obsessed · .5 reviewed · .35 suggest · .4
 * compact), softened by `filter: blur(70px)` in the design.
 *
 * The blur is the one thing we don't copy: the aura rule (aura-field.tsx) is
 * NO filter:blur — iOS drops it on composited layers. What a 70px blur does
 * to a big flat rectangle is leave the interior at full color and feather
 * the edges, so that's what this reproduces: the same gradient, overscanned
 * and masked with an edge-centered feather (see BLEED/FEATHER). Static, painted once, no compositor
 * work — a feed of 12 drifting auras would be a screensaver.
 *
 * Absolutely positioned inside a `relative` card; the caller sizes it with
 * `className` (the hero bleeds past the card, the compact hugs its cover).
 * `aria-hidden` and `pointer-events-none` — light, never a target. Section 7
 * of the HANDOFF stays true: the aura is the only source of light.
 */

/**
 * A gaussian blur of radius r (σ ≈ r) turns each edge of a flat box into a
 * smooth ramp about 3σ wide, centered ON the edge: the light reaches ~1.5σ
 * past the box and is only at full strength ~1.5σ inside it. So the painted
 * box overscans the mock's by BLEED and feathers over FEATHER, edge-centered.
 */
const BLEED = "100px";
const FEATHER = "200px";

const FEATHER_MASK = [
  `linear-gradient(to right, transparent, #000 ${FEATHER}, #000 calc(100% - ${FEATHER}), transparent)`,
  `linear-gradient(to bottom, transparent, #000 ${FEATHER}, #000 calc(100% - ${FEATHER}), transparent)`,
].join(", ");

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
    inset: `-${BLEED}`,
    background: glowGradient(hexes, angle),
    opacity,
    maskImage: FEATHER_MASK,
    WebkitMaskImage: FEATHER_MASK,
    maskComposite: "intersect",
    WebkitMaskComposite: "source-in",
  };
  return (
    // The outer div is the mock's box (sized by the caller); the inner one
    // is the blurred light it would have cast.
    <div aria-hidden className={`pointer-events-none absolute ${className}`}>
      <div className="absolute" style={style} />
    </div>
  );
}
