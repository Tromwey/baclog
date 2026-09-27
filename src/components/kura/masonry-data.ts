import type { GlyphKind } from "./components";

/**
 * The data helpers of a Masonry tile — plain module (not "use client") so
 * server pages (the shared collection) can build their items with them.
 */

/** The state glyph a title wears (obsession > me gusta > completo). */
export function glyphFor(it: {
  obsessed: boolean | null;
  verdict: string | null;
  status: string | null;
}): GlyphKind | null {
  if (it.obsessed) return "obsessed";
  if (it.verdict === "liked") return "liked";
  if (it.status === "completed") return "completed";
  return null;
}

