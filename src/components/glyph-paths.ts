/**
 * Raw SVG path data for the item-flow signal glyphs, extracted from the design
 * mock (design/item-flow/app-implementada.dc.html). Plain module — NEVER move
 * these into a "use server" file (an action file may only export async
 * functions; a const export builds fine but crashes the client bundle at
 * runtime with zero server logs).
 *
 * Both paths are authored on the same 24×24 grid ({@link GLYPH_VIEWBOX}).
 */

export const GLYPH_VIEWBOX = "0 0 24 24";

/** Llama = "me obsesiona" (Heroicons fire, solid). Drawn in hot #FF2D55. */
export const FLAME_PATH =
  "M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177A7.547 7.547 0 015.648 6.61a.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133.998a5.99 5.99 0 011.925-3.546 3.75 3.75 0 013.255 3.72z";

/** Destello (✦) 4-point star = "recomendado por IA" (provenance). Never reuse for obsession. */
export const SPARKLE_PATH =
  "M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z";

/* ---- Revamp UI (2026-09-03) — the mock's glyph set, verbatim. All on the
   same 24×24 grid. Stroke glyphs carry their stroke width at the call site
   (see components/ui/stroke-icon.tsx); fills draw with `fill`. ---- */

/** ✓ "completado" — STROKE, accent, width 3.4, round caps. */
export const CHECK_PATH = "M4.5 12.5l4.8 4.8L19.5 7";

/**
 * ✓ inside a filled badge — STROKE, width 3.2, drawn in `--bg` on an accent
 * circle. The mock keeps this SEPARATE from CHECK_PATH: it is tighter, so it
 * reads at the 12–14px a badge gives it. Use it for the onboarding pick badge
 * and the search sheet's "+"→"✓"; CHECK_PATH stays the state glyph.
 */
export const BADGE_CHECK_PATH = "M5 12.5l4.5 4.5L19 7";

/* ---- Feed v8 Stack (2026-09-21) — the pill vocabulary. Every state in the
   feed is a pill with a glyph, and these are drawn as FILLS at 13px, so they
   are separate from the stroke glyphs above even where the idea repeats. ---- */

/** ✓ "completo" — FILL, accent. The stroke CHECK_PATH is the cover glyph. */
export const CHECK_FILL_PATH =
  "M20.5 6.3a1.1 1.1 0 010 1.6l-9.6 9.6a1.1 1.1 0 01-1.6 0L4.6 12.8a1.1 1.1 0 011.6-1.6l3.9 3.9 8.8-8.8a1.1 1.1 0 011.6 0z";

/** 🔖 "agregó a {backlog}" — FILL, text-2. */
export const BOOKMARK_PATH =
  "M7 2.6h10a2.2 2.2 0 012.2 2.2v16.6L12 17.6l-7.2 3.8V4.8A2.2 2.2 0 017 2.6z";

/** ⏱ "no puede esperar · faltan N" — FILL, radar. */
export const CLOCK_PATH =
  "M12 2a10 10 0 100 20 10 10 0 000-20zm1.1 4.6v5.8l4.3 2.6-1.1 1.8-5.4-3.2V6.6h2.2z";

/** 💬 "reseñó" — FILL, text. */
export const REVIEW_PATH =
  "M4.2 3.4h15.6a1.6 1.6 0 011.6 1.6v10.2a1.6 1.6 0 01-1.6 1.6H9.4l-6.8 4.4V5a1.6 1.6 0 011.6-1.6z";

/** 👥 "sugerencia" — FILL, text-2. */
export const USERS_PATH =
  "M8.4 11.4a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2zm7.8-.4a3.1 3.1 0 100-6.2 3.1 3.1 0 000 6.2zM1.8 19.6c0-3.1 2.9-5.2 6.6-5.2s6.6 2.1 6.6 5.2H1.8zm14.9 0c0-2.1-.8-3.8-2.1-5 3.2.2 5.4 2.2 5.4 5h-3.3z";

/** 👍 "me gustó" — FILL, radar. Flip with scaleY(-1) in text-3 for "no me gustó". */
export const LIKE_PATH =
  "M7.5 10.5v9.5H4.2a1.2 1.2 0 01-1.2-1.2v-7.1a1.2 1.2 0 011.2-1.2h3.3zm2 9.5h7.6a2.2 2.2 0 002.16-1.78l1.24-6.2A2.2 2.2 0 0018.34 9.4H14.2l.7-3.3a2 2 0 00-3.6-1.5L9.5 8.6v11.4z";

/** ▶ play — FILL. */
export const PLAY_PATH = "M7 4.5v15l12-7.5z";

/* Stroke chrome glyphs (width 2.2–2.6, round caps). */
export const BACK_PATH = "M15 5l-7 7 7 7";
export const CHEVRON_RIGHT_PATH = "M9 5l7 7-7 7";
export const CHEVRON_DOWN_PATH = "M6 9l6 6 6-6";
export const PLUS_PATH = "M12 5v14M5 12h14";
export const SHARE_PATH = "M12 3v12M7 8l5-5 5 5M5 14v5h14v-5";
export const EXTERNAL_PATH = "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5";
export const GEAR_PATH =
  "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1";
/** The "Pública" visibility glyph: a sun/disc with four rays. */
export const PUBLIC_PATH = "M12 5a6 6 0 100 12 6 6 0 000-12zM2 12h3M19 12h3M12 2v3M12 19v3";
