import type { CSSProperties } from "react";
import { rgba } from "@/lib/color";

/**
 * ADN aura — the signature "lava-lamp" light of the M3.5 nav redesign, built
 * with the mock's technique (design/item-flow/app-implementada.dc.html): each
 * aura is 1–2 LAYER divs, each layer a comma-joined multi-stop
 * radial-gradient. Softness comes from the gradient fade stops — there is NO
 * filter:blur anywhere — and the only animated property is the layer's
 * transform (auraDrift/auraBreathe curves), so the whole field composites
 * without repaints. Grain over the top keeps it from reading as smooth
 * AI-slop.
 *
 * CROSS-PLATFORM: the variant templates deliberately avoid mix-blend-mode —
 * iOS Safari drops blend modes on GPU-composited (transform-animated) layers
 * and across stacking-context boundaries, which silently killed the whole
 * screen-blended layer on mobile (the field read darker/flatter than desktop).
 * Over our near-black bg, screen(b≈0, t) ≈ t, so painting the layer normally
 * with a slightly higher opacity is visually equivalent AND deterministic on
 * every platform. The root also sets `isolate` so the one blend that remains
 * (the grain overlay) resolves inside one predictable context.
 *
 * Pure and deterministic (a seeded sine hash, no Math.random / no DOM), so it
 * renders identically on the server and hydrates without mismatch — colors
 * are already persisted (backlogItems.paletteHex); nothing is read from canvas
 * here. Animation lives on the .bl-aura-* classes (globals.css) so the
 * reduced-motion override can win.
 *
 * Two modes (discriminated by `layers`):
 * - Content-driven: `{ colors, seed, variant? }` — the caller's extracted
 *   palette poured into a per-variant ellipse template, jittered by seed.
 *   Lima (--accent) is the EMPTY-palette fallback only (a backlog/user with
 *   no extracted colors yet still auras lima-only), never mixed into a real
 *   palette — with screen blending a bright lima swamps the real cover-art
 *   colors (F3.6.1).
 * - Fixed: `{ layers }` — hand-authored gradients (lens identity, onboarding,
 *   empty shelf…; see aura-presets.ts) rendered through the same primitive.
 *
 * CRITICAL: every ellipse fades to the SAME color at alpha 0 (rgba(r,g,b,0)),
 * never the `transparent` keyword — `transparent` is rgba(0,0,0,0) and
 * interpolating toward black leaves a dark fringe around each bloom.
 */

/** Brand signal — kept in sync with --accent (no CSS var access in this math). */
export const LIMA = "#D8FF3E";

export type AuraVariant = "ambient" | "backdrop" | "shelf" | "gesture" | "orb";

/** One hand-authored aura layer (fixed mode) — see aura-presets.ts. */
export interface FixedAuraLayer {
  /** Comma-joined radial-gradient list (fade to same-color alpha 0). */
  background: string;
  opacity: number;
  animation: "drift" | "breathe";
  /** CSS time, e.g. "12s". */
  duration: string;
  /** Negative delays de-sync layers, e.g. "-3.5s". */
  delay?: string;
  /** Layer overscan (CSS inset) so drift never exposes edges. */
  inset?: string;
}

interface ContentProps {
  /** Extracted hex colors; falls back to lima-only when empty (no forced mix-in otherwise). */
  colors: string[];
  /** Deterministic integer — same seed + colors ⇒ same layout every render. */
  seed: number;
  variant?: AuraVariant;
  /** Extra positioning classes for the absolutely-positioned wrapper. */
  className?: string;
}

interface FixedProps {
  layers: FixedAuraLayer[];
  className?: string;
}

export type AuraFieldProps = ContentProps | FixedProps;

/** CSS type that also permits the --aura-* custom properties we set inline. */
type Style = CSSProperties & Record<`--${string}`, string | number>;

/** Fully resolved layer, ready to render. */
interface LayerSpec extends Omit<FixedAuraLayer, "inset"> {
  inset: string;
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

/** Base geometry of one ellipse in a variant template (percentages). */
interface EllipseBase {
  w: number;
  h: number;
  x: number;
  y: number;
  /** Gradient fade stop (%) — where the color reaches alpha 0. */
  fade: number;
}

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

/** One `radial-gradient(W% H% at X% Y%, HEX 0%, rgba(hex,0) FADE%)` stop-pair,
 * jittered by seed: centers ±4pp, radii ±10%. `gi` is the GLOBAL ellipse index
 * across the instance's layers, so colors rotate palette[gi % len] without a
 * layer restarting at the same hue in the same corner. */
function ellipse(
  base: EllipseBase,
  color: string,
  gi: number,
  seed: number,
  jitter: boolean,
): string {
  const w = jitter ? base.w * (0.9 + rand(gi, seed + 23) * 0.2) : base.w;
  const h = jitter ? base.h * (0.9 + rand(gi, seed + 24) * 0.2) : base.h;
  const x = jitter ? base.x + (rand(gi, seed + 21) - 0.5) * 8 : base.x;
  const y = jitter ? base.y + (rand(gi, seed + 22) - 0.5) * 8 : base.y;
  return `radial-gradient(${pct(w)} ${pct(h)} at ${pct(x)} ${pct(y)}, ${color} 0%, ${rgba(color, 0)} ${base.fade}%)`;
}

function gradients(
  bases: EllipseBase[],
  palette: string[],
  giStart: number,
  seed: number,
  jitter: boolean,
): string {
  return bases
    .map((b, i) =>
      ellipse(b, palette[(giStart + i) % palette.length], giStart + i, seed, jitter),
    )
    .join(", ");
}


/* Per-variant ellipse templates, ported from the mock's per-screen auras. */

/** Hero/ambient L1 (mock item hero, drift layer). */
const AMBIENT_MAIN: EllipseBase[] = [
  { w: 70, h: 78, x: 16, y: 10, fade: 56 },
  { w: 74, h: 78, x: 84, y: 14, fade: 58 },
  { w: 85, h: 85, x: 58, y: 94, fade: 60 },
  { w: 55, h: 65, x: 93, y: 65, fade: 56 },
];

/** Hero/ambient L2 (mock's breathe layer — screen in the mock, painted
 * normally here for iOS; opacity compensates, see header comment). */
const AMBIENT_BREATHE: EllipseBase[] = [
  { w: 58, h: 66, x: 24, y: 12, fade: 60 },
  { w: 52, h: 65, x: 79, y: 14, fade: 60 },
  { w: 50, h: 60, x: 60, y: 85, fade: 60 },
];

/** App-wide header backdrop L1 (mock backlogs-header aura, drift layer) —
 * smaller, quieter ellipses than the hero; the mock runs this at .62 with NO
 * extra wrapper clamp. */
const BACKDROP_MAIN: EllipseBase[] = [
  { w: 46, h: 58, x: 14, y: 6, fade: 56 },
  { w: 44, h: 56, x: 84, y: 10, fade: 58 },
  { w: 42, h: 54, x: 52, y: 2, fade: 56 },
  { w: 40, h: 54, x: 96, y: 44, fade: 56 },
  { w: 48, h: 60, x: 30, y: 40, fade: 58 },
  { w: 40, h: 54, x: 72, y: 52, fade: 58 },
];

/** App-wide header backdrop L2 (mock's .5 screen breathe layer, normal here). */
const BACKDROP_BREATHE: EllipseBase[] = [
  { w: 52, h: 62, x: 32, y: 10, fade: 60 },
  { w: 46, h: 58, x: 78, y: 6, fade: 60 },
  { w: 46, h: 58, x: 58, y: 48, fade: 60 },
];

/** Shelf card band (mock #p1 shelf cards, breathe layer). */
const SHELF: EllipseBase[] = [
  { w: 90, h: 130, x: 12, y: 6, fade: 52 },
  { w: 82, h: 130, x: 88, y: 18, fade: 55 },
  { w: 115, h: 145, x: 62, y: 130, fade: 58 },
  { w: 72, h: 100, x: 95, y: 90, fade: 52 },
];

/** Obsession button (mock #p3) — exact geometry, no jitter (mock-faithful). */
const GESTURE: EllipseBase[] = [
  { w: 46, h: 72, x: 16, y: 42, fade: 62 },
  { w: 52, h: 82, x: 62, y: 12, fade: 62 },
  { w: 46, h: 80, x: 92, y: 80, fade: 60 },
  { w: 40, h: 72, x: 44, y: 104, fade: 60 },
];

/** Small circular containers (~96px avatar orb) — no mock precedent; three
 * large overlapping ellipses so the circle reads as one bloom, not blobs. */
const ORB: EllipseBase[] = [
  { w: 90, h: 100, x: 25, y: 20, fade: 60 },
  { w: 85, h: 95, x: 78, y: 25, fade: 60 },
  { w: 100, h: 110, x: 50, y: 90, fade: 62 },
];

const dur = (min: number, span: number, i: number, seed: number) =>
  `${(min + rand(i, seed + 11) * span).toFixed(2)}s`;
const delay = (max: number, i: number, seed: number) =>
  `${(-rand(i, seed + 12) * max).toFixed(2)}s`;

function buildVariant(
  variant: AuraVariant,
  palette: string[],
  seed: number,
): { layers: LayerSpec[]; grain: number } {
  switch (variant) {
    case "ambient":
      return {
        grain: 0.06,
        layers: [
          {
            background: gradients(AMBIENT_MAIN, palette, 0, seed, true),
            opacity: 0.93,
            animation: "drift",
            duration: dur(10, 3, 0, seed),
            delay: delay(8, 0, seed),
            inset: "-12%",
          },
          {
            // Mock: .55 + screen. Painted normally for iOS; over the near-black
            // bg screen ≈ normal, the bump recovers the lost additive punch
            // where the layers overlap.
            background: gradients(AMBIENT_BREATHE, palette, 4, seed, true),
            opacity: 0.66,
            animation: "breathe",
            duration: dur(8, 1, 1, seed),
            delay: `${(-2 - rand(1, seed + 12) * 4).toFixed(2)}s`,
            inset: "-14%",
          },
        ],
      };
    case "backdrop":
      return {
        grain: 0.05,
        layers: [
          {
            background: gradients(BACKDROP_MAIN, palette, 0, seed, true),
            opacity: 0.62,
            animation: "drift",
            duration: dur(13, 3, 0, seed),
            delay: delay(8, 0, seed),
            inset: "-12%",
          },
          {
            // Mock: .5 + screen → normal + bump (same rationale as ambient L2).
            background: gradients(BACKDROP_BREATHE, palette, 6, seed, true),
            opacity: 0.58,
            animation: "breathe",
            duration: dur(8, 2, 1, seed),
            delay: `${(-2 - rand(1, seed + 12) * 4).toFixed(2)}s`,
            inset: "-14%",
          },
        ],
      };
    case "shelf":
      // No opaque base here — the card itself provides the dock's glass
      // surface (ShelfCard), so ellipse falloff exposes blurred backdrop
      // aura instead of pure black (which read as a dark border). Overscan
      // keeps the breathe scale from revealing an edge inside the clip.
      return {
        grain: 0.05,
        layers: [
          {
            background: gradients(SHELF, palette, 0, seed, true),
            opacity: 0.92,
            animation: "breathe",
            duration: dur(8, 1, 0, seed),
            delay: delay(6, 0, seed),
            inset: "-6% -6%",
          },
        ],
      };
    case "gesture":
      return {
        grain: 0.05,
        layers: [
          {
            // Mock: .95 + screen over #150710 — near-black, so normal paint is
            // visually identical and survives iOS compositing (header comment).
            background: gradients(GESTURE, palette, 0, seed, false),
            opacity: 0.95,
            animation: "drift",
            duration: "9s",
            delay: delay(6, 0, seed),
            // Overscanned like the mock so the drift never exposes an edge
            // inside the clipped button.
            inset: "-45% -20%",
          },
        ],
      };
    case "orb":
      return {
        grain: 0.05,
        layers: [
          {
            background: gradients(ORB, palette, 0, seed, true),
            opacity: 0.9,
            animation: "drift",
            duration: dur(11, 2, 0, seed),
            delay: delay(10, 0, seed),
            inset: "-15%",
          },
        ],
      };
  }
}

export function AuraField(props: AuraFieldProps) {
  const className = props.className ?? "";

  let layers: LayerSpec[];
  let grain: number;
  if ("layers" in props) {
    layers = props.layers.map((l) => ({ inset: "-10%", ...l }));
    grain = 0.05;
  } else {
    const palette = props.colors.length > 0 ? props.colors : [LIMA];
    ({ layers, grain } = buildVariant(
      props.variant ?? "ambient",
      palette,
      props.seed,
    ));
  }

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 isolate overflow-hidden ${className}`}
    >
      {layers.map((l, i) => {
        const style: Style = {
          inset: l.inset,
          opacity: l.opacity,
          background: l.background,
          "--aura-dur": l.duration,
        };
        if (l.delay) style["--aura-delay"] = l.delay;
        return (
          <div
            key={i}
            className={`absolute bl-aura-${l.animation}`}
            style={style}
          />
        );
      })}
      <div className="bl-grain" style={{ opacity: grain }} />
    </div>
  );
}
