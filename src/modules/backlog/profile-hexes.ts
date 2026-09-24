/**
 * The palette that tints YOUR profile (header, seal, Ajustes, Editar perfil):
 * the newest obsession that has a cover palette; without one, the library's
 * dominant hexes; without any, nothing (--bg — "sin portada no hay color").
 * The Revamp's lima ADN fallback is not a Kura colour and never counts.
 *
 * The mock's "obsesión destacada" (20f: you pick the title that tints) has no
 * column in the product; when it gets one, it goes first here.
 */
export function profileHexes(
  obsessions: readonly { paletteHex: string[] | null }[],
  libraryPalette: readonly string[],
): string[] {
  const featured = obsessions.find((o) => (o.paletteHex?.length ?? 0) > 0);
  return (featured?.paletteHex ?? [...libraryPalette]).filter(
    (h) => h.toLowerCase() !== "#d8ff3e",
  );
}
