"use client";

import { useEffect, useState } from "react";
import { extractPalette } from "@/modules/cards/palette";
import { tintSurfaceVertical } from "@/components/kura/tint";

/**
 * The Double Feature screen's surface (replaces the old `FeatureAura`): the
 * two covers' tones as ONE flat tinted surface, 180°, fused into `--bg` over
 * its last third (§color · superficie teñida). No radial light, no glow, no
 * blur — "la portada es la única fuente de color".
 *
 * The feed items carry no cached palette, so the tones are read on-device
 * (ADR-008: only colours cross, never the artwork). image.tmdb.org sends no
 * CORS headers, so a film/series poster often can't be read: then the surface
 * is tinted by the side that could, and with neither it simply stays `--bg`
 * ("sin portada no hay color"). The tint arrives with a 240 ms fade.
 */
export function DoubleFeatureTint({
  seedPosterUrl,
  recoPosterUrl,
}: {
  seedPosterUrl: string | null;
  recoPosterUrl: string | null;
}) {
  const [hexes, setHexes] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [seed, reco] = await Promise.all([
        seedPosterUrl ? extractPalette(seedPosterUrl) : Promise.resolve([]),
        recoPosterUrl ? extractPalette(recoPosterUrl) : Promise.resolve([]),
      ]);
      if (!alive) return;
      setHexes([seed[0], reco[0]].filter((h): h is string => Boolean(h)));
    })();
    return () => {
      alive = false;
    };
  }, [seedPosterUrl, recoPosterUrl]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[78%] transition-opacity duration-[240ms]"
      style={{
        background: tintSurfaceVertical(hexes),
        opacity: hexes.length > 0 ? 1 : 0,
      }}
    />
  );
}
