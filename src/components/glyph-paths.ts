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
