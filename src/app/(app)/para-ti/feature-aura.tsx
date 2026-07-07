"use client";

import { useEffect, useState } from "react";
import { extractPalette } from "@/modules/cards/palette";

/**
 * F3.5.6 — the /para-ti screen's dual aura: the top is tinted by Side A (the
 * loved seed), the bottom by Side B (the reco), mirroring the Double Feature
 * card's two auras (double-feature.ts `radialAura`). Colors are extracted
 * on-device (ADR-008: only colors cross, never the artwork).
 *
 * Two constraints shape this:
 *  - We pick the most VIBRANT palette entry, not the most frequent — poster
 *    backgrounds are usually near-black, which would make an invisible aura.
 *  - image.tmdb.org does NOT send CORS headers, so a film/series poster can't
 *    be read into a canvas (and ADR-007 forbids proxying it). When one side
 *    can't be extracted, we derive it by hue-rotating the side that could, so
 *    the screen always shows a cohesive two-tone frame. Degrades to no aura
 *    only if neither side is readable.
 */
export function FeatureAura({
  seedPosterUrl,
  recoPosterUrl,
}: {
  seedPosterUrl: string | null;
  recoPosterUrl: string | null;
}) {
  const [colors, setColors] = useState<{ top: HSL; bottom: HSL } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [seed, reco] = await Promise.all([
        seedPosterUrl ? extractPalette(seedPosterUrl) : Promise.resolve([]),
        recoPosterUrl ? extractPalette(recoPosterUrl) : Promise.resolve([]),
      ]);
      if (!alive) return;
      let top = pickVibrant(seed);
      let bottom = pickVibrant(reco);
      // One side unreadable (typically the TMDB video poster) → derive it from
      // the readable side so the frame still reads as two distinct tones.
      if (top && !bottom) bottom = rotate(top, -42);
      if (bottom && !top) top = rotate(bottom, 42);
      if (top && bottom) setColors({ top, bottom });
    })();
    return () => {
      alive = false;
    };
  }, [seedPosterUrl, recoPosterUrl]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-700"
      style={{ opacity: colors ? 1 : 0 }}
    >
      {/* Exact dual gradient from "Double Feature - Final" (frame 1d, in-app):
          Side A from the top-left (22% 0%, ~50% tall), Side B from the
          bottom-right (80% 100%, ~54% tall) — each an OPAQUE source color →
          a darker shade of it → the bg/transparent. Strong + diagonal. */}
      <div
        className="absolute inset-x-0 top-0 h-1/2"
        style={{
          background: colors
            ? `radial-gradient(120% 88% at 22% 0%, ${src(colors.top)} 0%, ${shade(colors.top)} 34%, #0B0B0D 74%)`
            : undefined,
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[54%]"
        style={{
          background: colors
            ? `radial-gradient(120% 82% at 80% 100%, ${src(colors.bottom)} 0%, ${shade(colors.bottom)} 32%, rgba(11,11,13,0) 70%)`
            : undefined,
        }}
      />
    </div>
  );
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

/** Most vibrant palette entry (saturation × mid-lightness), not most frequent. */
function pickVibrant(hexes: string[]): HSL | null {
  let best: HSL | null = null;
  let bestScore = -1;
  for (const hex of hexes) {
    const c = hexToHsl(hex);
    if (!c) continue;
    const score = c.s * (1 - Math.abs(c.l - 0.55) * 1.4);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best && bestScore > 0.06) return best;
  // Near-grayscale poster: lift the dominant color into a visible range.
  const first = hexes[0] ? hexToHsl(hexes[0]) : null;
  return first ? { h: first.h, s: Math.max(0.25, first.s), l: 0.5 } : null;
}

/** Opaque source stop — the vivid color at the aura's origin (matches the design). */
function src(c: HSL): string {
  return hslToRgba({ h: c.h, s: Math.max(0.5, c.s), l: clamp(c.l, 0.42, 0.54) }, 1);
}

/** Darker shade stop — same hue, ~half lightness (e.g. #C7462F → #5a231a). */
function shade(c: HSL): string {
  return hslToRgba(
    { h: c.h, s: Math.max(0.45, c.s * 0.92), l: clamp(c.l, 0.42, 0.54) * 0.46 },
    1,
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function rotate(c: HSL, deg: number): HSL {
  return { h: (c.h + deg + 360) % 360, s: Math.max(0.4, c.s), l: c.l };
}

function hexToHsl(hex: string): HSL | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let h = 0;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgba({ h, s, l }: HSL, a: number): string {
  const hue = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const r = Math.round(ch(hue + 1 / 3) * 255);
  const g = Math.round(ch(hue) * 255);
  const b = Math.round(ch(hue - 1 / 3) * 255);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
