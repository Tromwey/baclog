/**
 * The palette that tints YOUR profile (header, seal, Ajustes, Editar perfil):
 * the newest obsession that has a cover palette; without one, the library's
 * dominant hexes; without any, nothing (--bg — "sin portada no hay color").
 * The Revamp's lima ADN fallback is not a Kura colour and never counts.
 *
 * The mock's "obsesión destacada" (20f: you pick the title that tints) has no
 * column in the product; when it gets one, it goes first here.
 *
 * Pure (no "server-only"): the wire check exercises it under tsx.
 */

const LIMA_FALLBACK = "#d8ff3e";

export interface ProfileTint {
  hexes: string[];
  /**
   * The obsession that tints — the SAME title whose palette `hexes` came
   * from — or null when the hexes came from the library (or nowhere). The
   * app draws the featured title next to the tint, so the two can never
   * name different titles.
   */
  featuredTitleId: string | null;
}

export function profileTint(
  obsessions: readonly { catalogItemId: string; paletteHex: string[] | null }[],
  libraryPalette: readonly string[],
): ProfileTint {
  const featured = obsessions.find((o) => (o.paletteHex?.length ?? 0) > 0);
  const hexes = (featured?.paletteHex ?? [...libraryPalette]).filter(
    (h) => h.toLowerCase() !== LIMA_FALLBACK,
  );
  return { hexes, featuredTitleId: featured?.catalogItemId ?? null };
}

/** Just the colours — what the web screens draw. */
export function profileHexes(
  obsessions: readonly { paletteHex: string[] | null }[],
  libraryPalette: readonly string[],
): string[] {
  const featured = obsessions.find((o) => (o.paletteHex?.length ?? 0) > 0);
  return (featured?.paletteHex ?? [...libraryPalette]).filter(
    (h) => h.toLowerCase() !== LIMA_FALLBACK,
  );
}
