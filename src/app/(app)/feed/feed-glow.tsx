import { rgba } from "@/lib/color";

/**
 * Feed v3 — the light behind every card. The design blurs a flat gradient
 * (filter: blur(70px)); we can't: the aura rule (aura-field.tsx) is NO
 * filter:blur anywhere — softness comes from radial-gradient fade stops that
 * end at the same color at alpha 0, and that is what composites cleanly on
 * iOS. So the glow is three wide ellipses from the card's palette, painted
 * once, static (a feed of 12 drifting auras would be a screensaver).
 *
 * Absolutely positioned inside a `relative` card; the caller sizes it with
 * `className` (the hero bleeds past the card, the compact hugs its cover).
 * `aria-hidden` and `pointer-events-none` — light, never a target. Section 7
 * of the HANDOFF stays true: the aura is the only source of light.
 */

const ELLIPSES = [
  "70% 80% at 22% 30%",
  "70% 80% at 80% 62%",
  "60% 70% at 50% 92%",
  "50% 60% at 8% 88%",
] as const;

export function glowGradient(hexes: readonly string[]): string {
  const colors = hexes.slice(0, ELLIPSES.length);
  return colors
    .map(
      (hex, i) =>
        `radial-gradient(${ELLIPSES[i]}, ${hex} 0%, ${rgba(hex, 0)} 66%)`,
    )
    .join(", ");
}

export function FeedGlow({
  hexes,
  opacity = 0.42,
  className = "-inset-x-[10px] -inset-y-[30px]",
}: {
  hexes: readonly string[];
  opacity?: number;
  className?: string;
}) {
  if (hexes.length === 0) return null;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute ${className}`}
      style={{ background: glowGradient(hexes), opacity }}
    />
  );
}
