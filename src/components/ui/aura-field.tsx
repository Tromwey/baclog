import type { CSSProperties } from "react";

/**
 * ADN aura — the signature "lava-lamp" light of the M3.5 nav redesign: soft
 * radial blobs of the user's extracted palette, slowly drifting + pulsing,
 * screen-blended, with grain over the top so it never reads as smooth AI-slop.
 *
 * Pure and deterministic (a seeded sine hash, no Math.random / no DOM), so it
 * renders identically on the server and hydrates without mismatch — colors
 * are already persisted (backlogItems.paletteHex); nothing is read from canvas
 * here. Animation lives on the .bl-aura-* classes (globals.css) so the
 * reduced-motion override can win.
 *
 * Lima (--accent) is ALWAYS blob 0 — the fixed brand signal (sistema-diseno
 * §2). Callers pass only their extracted colors; the component forces lima in
 * front and falls back to lima-only when the palette is empty.
 */

/** Brand signal — kept in sync with --accent (no CSS var access in this math). */
const LIMA = "#D8FF3E";

export type AuraVariant = "ambient" | "orb" | "left" | "shelf";

export interface AuraFieldProps {
  /** Extracted hex colors; the component prepends lima itself. */
  colors: string[];
  /** Deterministic integer — same seed + colors ⇒ same layout every render. */
  seed: number;
  variant?: AuraVariant;
  /** Extra positioning classes for the absolutely-positioned layer. */
  className?: string;
}

/** CSS type that also permits the --aura-* custom properties we set inline. */
type Style = CSSProperties & Record<`--${string}`, string | number>;

interface BlobGeom {
  w: number;
  h: number;
  left: number;
  top: number;
}

interface VariantConfig {
  count: number;
  grain: number;
  geom: (i: number, seed: number) => BlobGeom;
}

/** Seeded sine hash → [0,1). Quantized to 6 decimals because Math.sin differs
 * in its last ULPs between Node (SSR) and the browser; rounding the ONLY
 * transcendental output makes every downstream value pure IEEE arithmetic, so
 * server and client agree and AuraField (when SSR-ed in a client component)
 * doesn't trip a hydration mismatch. */
function rand(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  const f = x - Math.floor(x);
  return Math.round(f * 1e6) / 1e6;
}

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Per-variant blob counts + geometry, ported from `_heroAura`/`_orbAura`/`_leftAura`. */
const VARIANTS: Record<AuraVariant, VariantConfig> = {
  ambient: {
    count: 11,
    grain: 0.1,
    geom: (i, seed) => {
      const w = 170 + rand(i, seed + 1) * 180;
      return {
        w,
        h: w * (0.85 + rand(i, seed + 4) * 0.5),
        left: rand(i, seed + 2) * 100,
        top: rand(i, seed + 3) * 100,
      };
    },
  },
  orb: {
    count: 5,
    grain: 0.12,
    geom: (i, seed) => {
      const w = 52 + rand(i, seed + 1) * 46;
      return {
        w,
        h: w * (0.85 + rand(i, seed + 4) * 0.4),
        left: 15 + rand(i, seed + 2) * 70,
        top: 15 + rand(i, seed + 3) * 70,
      };
    },
  },
  left: {
    count: 3,
    grain: 0.1,
    geom: (i, seed) => {
      const w = 150 + rand(i, seed + 1) * 130;
      return {
        w,
        h: w * (0.7 + rand(i, seed + 4) * 0.5),
        left: -12 + rand(i, seed + 2) * 22,
        top: 50 + (rand(i, seed + 3) - 0.5) * 90,
      };
    },
  },
  // A backlog shelf band — blobs spread horizontally across the card.
  shelf: {
    count: 6,
    grain: 0.1,
    geom: (i, seed) => {
      const w = 118 + rand(i, seed + 1) * 104;
      return {
        w,
        h: w * (0.9 + rand(i, seed + 4) * 0.5),
        left: ((i + 0.5) / 6) * 100 + (rand(i, seed + 2) - 0.5) * 7,
        top: 50 + (rand(i, seed + 3) - 0.5) * 30,
      };
    },
  },
};

export function AuraField({
  colors,
  seed,
  variant = "ambient",
  className = "",
}: AuraFieldProps) {
  const rest = colors.filter((c) => c.toLowerCase() !== LIMA.toLowerCase());
  const palette = [LIMA, ...rest];
  const cfg = VARIANTS[variant];

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {Array.from({ length: cfg.count }, (_, i) => {
        const { w, h, left, top } = cfg.geom(i, seed);
        const color = palette[i % palette.length];
        const blur = Math.round(w * 0.2) + 5;

        const outer: Style = {
          position: "absolute",
          left: `${left}%`,
          top: `${top}%`,
          width: w,
          height: h,
          transform: "translate(-50%, -50%)",
        };
        const drift: Style = {
          width: "100%",
          height: "100%",
          "--aura-d-dur": `${(6 + rand(i, seed + 7) * 8).toFixed(2)}s`,
          "--aura-d-delay": `${(-rand(i, seed + 8) * 12).toFixed(2)}s`,
        };
        const beam: Style = {
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${rgba(color, 0.82)} 0%, ${rgba(
            color,
            0.4,
          )} 46%, transparent 74%)`,
          filter: `blur(${blur}px)`,
          mixBlendMode: "screen",
          "--aura-p-dur": `${(3 + rand(i, seed + 5) * 3).toFixed(2)}s`,
          "--aura-p-delay": `${(-rand(i, seed + 6) * 6).toFixed(2)}s`,
        };

        return (
          <div key={i} style={outer}>
            <div className="bl-aura-drift" style={drift}>
              <div className="bl-aura-beam" style={beam} />
            </div>
          </div>
        );
      })}
      <div className="bl-grain" style={{ opacity: cfg.grain }} />
    </div>
  );
}
