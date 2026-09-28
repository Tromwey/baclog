/**
 * Kura has no ratings (founder, 2026-09-28): the conexión's eyebrow says only
 * what you watched — "viste F1 hasta la última vuelta" — never "· ★★★★★".
 * The generator no longer asks for stars, but rows cached before that still
 * carry them (the DB isn't rewritten), so every reader passes the eyebrow
 * through here: stars (★☆, any count) and the separator left dangling go.
 */
export function stripRating(eyebrow: string): string {
  return eyebrow
    .replace(/\s*[·•|—-]?\s*[★☆✩✪✫✬✭✮✯⭐]+\s*/gu, " ")
    .replace(/\s*[·•|—-]\s*$/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
