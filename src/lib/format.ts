/** Zero-pad a count to 2 digits ("03") — the mono index/count treatment. */
export const pad = (n: number) => String(n).padStart(2, "0");

/** Capitalize the first letter. Catalog genres are stored lowercased — both
 * sources (iTunes lowercases; TMDB's static GENRES map is lowercase too) — so
 * meta lines that render in mixed case (not CSS force-uppercased) normalize
 * through this before display. */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
