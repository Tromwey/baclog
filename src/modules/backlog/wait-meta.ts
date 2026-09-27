/**
 * The mono line of the automatic "no puedo esperar" collection, from its
 * titles' `releaseLabel`s (components/kura/tint.ts). Plain module, no deps:
 * the carousel (10a) and its own page (10b) both print it.
 */

/** "4 d" → "en 4 d" · "17 oct" → "el 17 oct" · "oct 2026" / "2027" → "en …" · "hoy" stays.
 *  Only a concrete day takes "el" (twin of iOS `WaitingMeta.line`). */
export function nextLabel(label: string): string {
  if (label === "hoy") return "hoy";
  if (/^\d+ [hd]$/.test(label)) return `en ${label}`;
  return /^\d{1,2} \p{L}+\.?$/u.test(label) ? `el ${label}` : `en ${label}`;
}

/**
 * The mono line of "no puedo esperar" from its titles' `releaseLabel`s, in
 * order: "5 títulos · 1 ya salió · el próximo el 16 oct". A title that
 * already came out is counted apart and never becomes "el próximo" (critique
 * 2026-09-27: `nextLabel("ya salió")` printed "el próximo el ya salió").
 */
export function waitMeta(count: number, labels: readonly string[]): string {
  const parts = [`${count} ${count === 1 ? "título" : "títulos"}`];
  const out = labels.filter((l) => l === "ya salió").length;
  if (out > 0) parts.push(out === 1 ? "1 ya salió" : `${out} ya salieron`);
  const next = labels.find((l) => l !== "ya salió" && l !== "sin fecha");
  if (next) parts.push(`el próximo ${nextLabel(next)}`);
  return parts.join(" · ");
}
