/**
 * Single source of truth for the families/weights the card renderers draw
 * with. CARD_FONTS must list every family+weight any renderer uses:
 * document.fonts.load() only fetches the exact face requested, so a weight
 * missing here paints (and exports) in a synthesized fallback.
 */
export const MONO = (size: number, bold = false) =>
  `${bold ? "700" : "400"} ${size}px "Space Mono", monospace`;

export const OSWALD = (size: number, weight: 400 | 600 | 700 = 600) =>
  `${weight} ${size}px "Oswald", sans-serif`;

export const ARCHIVO = (size: number) =>
  `400 ${size}px "Archivo Black", sans-serif`;

export const CARD_FONTS = [
  MONO(16),
  MONO(16, true),
  OSWALD(16, 400),
  OSWALD(16, 600),
  OSWALD(16, 700),
  ARCHIVO(16),
];
