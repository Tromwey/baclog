/**
 * Single source of truth for the families/weights the card renderers draw
 * with. CARD_FONTS must list every family+weight any renderer uses:
 * document.fonts.load() only fetches the exact face requested, so a weight
 * missing here paints (and exports) in a synthesized fallback.
 *
 * These are the design-system families (sistema-diseno §3). The card <canvas>
 * needs REAL document fonts (next/font's hashed names are unusable there), so
 * root layout also loads them via a plain <link> stylesheet kept in sync here.
 */

/** Space Mono — receipt/ticket/archive "data voice". */
export const MONO = (size: number, bold = false) =>
  `${bold ? "700" : "400"} ${size}px "Space Mono", monospace`;

/** Bricolage Grotesque — display / headlines. */
export const DISPLAY = (size: number, weight: 600 | 700 | 800 = 700) =>
  `${weight} ${size}px "Bricolage Grotesque", sans-serif`;

/** Instrument Serif — expressive titles + one hero line per card. */
export const SERIF = (size: number, italic = true) =>
  `${italic ? "italic " : ""}400 ${size}px "Instrument Serif", serif`;

/** Hanken Grotesk — body / UI copy on a card. */
export const SANS = (size: number, weight: 400 | 500 | 600 | 700 = 500) =>
  `${weight} ${size}px "Hanken Grotesk", sans-serif`;

export const CARD_FONTS = [
  MONO(16),
  MONO(16, true),
  DISPLAY(16, 600),
  DISPLAY(16, 700),
  DISPLAY(16, 800),
  SERIF(16),
  SERIF(16, false),
  SANS(16, 500),
  SANS(16, 600),
];
