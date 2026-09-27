import { KANJI_FAMILY, kanjiFontBytes } from "./kanji-font";

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

/** Space Mono — the exportable cards' thermal-printer ink. Deliberately NOT
 *  the UI's --font-mono (Red Hat Mono since 2026-08-28): a card is a printed
 *  object and keeps its own voice; the document <link> in layout.tsx is what
 *  keeps this family loadable by name for the canvas. */
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

/** Newsreader — Kura's brand voice (the collection card, 4b). */
export const NEWS = (size: number, italic = false, weight: 400 | 500 = 400) =>
  `${italic ? "italic " : ""}${weight} ${size}px "Newsreader", serif`;

/** Red Hat Mono — Kura's data voice (the collection card's labels). */
export const RHMONO = (size: number) => `400 ${size}px "Red Hat Mono", monospace`;

/** 蔵 — the lockup's kanji (kanji-font.ts), registered below as a FontFace. */
export const KANJI = (size: number) => `400 ${size}px "${KANJI_FAMILY}", serif`;

/**
 * The kanji isn't on Google Fonts' stylesheet in layout.tsx, so it's added to
 * `document.fonts` here, at module load, before any exporter's
 * `document.fonts.load(CARD_FONTS)` asks for it. Browser-only, once.
 */
if (typeof document !== "undefined" && typeof FontFace !== "undefined") {
  const w = window as Window & { __kuraKanji?: boolean };
  if (!w.__kuraKanji) {
    w.__kuraKanji = true;
    const face = new FontFace(KANJI_FAMILY, kanjiFontBytes(), { weight: "400", style: "normal" });
    document.fonts.add(face);
    face.load().catch(() => {});
  }
}

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
  NEWS(16),
  NEWS(16, true),
  NEWS(16, true, 500),
  RHMONO(16),
  KANJI(16),
];
