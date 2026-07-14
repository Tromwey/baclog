"use client";

import { useEffect, useState } from "react";
import { AuraField } from "@/components/ui";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { extractPalette } from "@/modules/cards/palette";
import { cacheItemPaletteAction } from "@/app/actions/palette-cache-actions";

/**
 * Hero aura behind the poster area (mock #p3: a tall color field fading into
 * the bg). Shared by both item surfaces — the in-app /item page and the public
 * shared-link page (u/[username]/item/[id]) — so both aura from the same
 * cover-derived palette. Colors come from the shared catalog row's persisted
 * paletteHex when present; otherwise we extract on-device on mount.
 *
 * Self-healing cache: pass `catalogItemId` and a signed-in viewer's extraction
 * is persisted to the shared catalog row (first-writer-wins) so the next viewer
 * — and the public page — reads it instead of re-extracting. Omit it (the
 * anonymous public page does) to stay DISPLAY-ONLY with zero write attempts on
 * that viral surface. The server never touches artwork (ADR-007/008): the
 * browser hotlinks the cover, extraction is on-device, only hex is stored.
 *
 * AuraField is deterministic (seed) and its animation classes already respect
 * prefers-reduced-motion.
 */
export function ItemHeroAura({
  paletteHex,
  posterUrl,
  seed,
  catalogItemId,
}: {
  paletteHex: string[] | null;
  posterUrl: string | null;
  seed: number;
  /** When set (in-app, authenticated), a fresh extraction backfills the shared
   * catalog palette. Omitted on the anonymous public page → display-only. */
  catalogItemId?: string;
}) {
  const persisted = paletteHex ?? [];
  const [extracted, setExtracted] = useState<string[]>([]);

  useEffect(() => {
    if (persisted.length > 0 || !posterUrl) return;
    let alive = true;
    // Degrades to [] on CORS/decode failure — the hero just stays dark.
    extractPalette(posterUrl).then((colors) => {
      if (!alive) return;
      setExtracted(colors);
      // Backfill the shared row so nobody re-extracts this title. The action
      // itself no-ops for anonymous callers and for an empty ([]) palette.
      // Fire-and-forget, but swallow rejections (a failed background write is
      // cosmetic — never an unhandled promise rejection in the console).
      if (catalogItemId && colors.length > 0) {
        cacheItemPaletteAction(catalogItemId, colors).catch(() => {});
      }
    });
    return () => {
      alive = false;
    };
  }, [posterUrl, persisted.length, catalogItemId]);

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
