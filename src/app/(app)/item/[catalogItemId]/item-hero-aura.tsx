"use client";

import { useEffect, useState } from "react";
import { AuraField } from "@/components/ui";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { extractPalette } from "@/modules/cards/palette";

/**
 * Hero aura behind the poster area (mock #p3: a tall color field fading into
 * the bg). Colors come from the logged entry's persisted palette when the item
 * is in a backlog; for an item the user hasn't logged we extract on-device on
 * mount for DISPLAY ONLY — nothing is persisted until the user actually adds
 * the item (add-to-backlog owns save-time extraction).
 *
 * AuraField is deterministic (seed) and its animation classes already respect
 * prefers-reduced-motion.
 */
export function ItemHeroAura({
  paletteHex,
  posterUrl,
  seed,
}: {
  paletteHex: string[] | null;
  posterUrl: string | null;
  seed: number;
}) {
  const persisted = paletteHex ?? [];
  const [extracted, setExtracted] = useState<string[]>([]);

  useEffect(() => {
    if (persisted.length > 0 || !posterUrl) return;
    let alive = true;
    // Degrades to [] on CORS/decode failure — the hero just stays dark.
    extractPalette(posterUrl).then((colors) => {
      if (alive) setExtracted(colors);
    });
    return () => {
      alive = false;
    };
  }, [posterUrl, persisted.length]);

  const colors = persisted.length > 0 ? persisted : extracted;
  if (colors.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[400px] overflow-hidden"
    >
      {/* Safari's status-bar band tints from theme-color — match the aura. */}
      <ThemeColorSync color={colors[0]} />
      <AuraField variant="ambient" colors={colors} seed={seed} />
      {/* Fade the field into the page bg so content below reads on solid. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(11,11,13,.2) 0%, rgba(11,11,13,.05) 40%, var(--bg) 97%)",
        }}
      />
    </div>
  );
}
