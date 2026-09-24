/**
 * Kura colour math (design/kura/sistema-de-diseno.dc.html §color — "superficie
 * teñida" — and §marca — "sello kura"). Plain module, server-safe, no deps:
 * the public pages are server components and compute their tint once.
 *
 * "La paleta de una portada (dos tonos extraídos) entra a la interfaz de una
 * sola forma: mezclada hacia negro en un degradado de 168°, tono 1 con k =
 * 0.65 arriba y tono 2 con k = 0.73 abajo. Fuera del feed, se funde a --bg en
 * su último tercio." The k values are the system's own: 1 − 0.45 × 0.78.
 */

import { parseHex } from "@/lib/color";

export const BG = "#0b0b0d";
const TOP_INK = "#101013";
const BOTTOM_INK = "#0c0c10";
const TEXT = "#f4f3ee";
/** The tint depth of the whole system (the mock's `tint` = 45%). */
export const K = 1 - 0.45 * 0.78;

/** Blend `a` toward `b` by `k` (0 = a, 1 = b) — `#rrggbb`. */
export function mixHex(a: string, b: string, k: number): string {
  const A = parseHex(a) ?? parseHex(BG)!;
  const B = parseHex(b) ?? parseHex(BG)!;
  const ch = (x: number, y: number) =>
    Math.round(x * (1 - k) + y * k)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(A.r, B.r)}${ch(A.g, B.g)}${ch(A.b, B.b)}`;
}

/** The two ends of a tinted surface: tone 1 pulled toward black, tone 2 further. */
export function tintEnds(hexes: readonly string[]): [string, string] {
  const a = hexes[0];
  const b = hexes[1] ?? hexes[0];
  if (!a) return [BG, BG];
  return [mixHex(a, TOP_INK, K), mixHex(b, BOTTOM_INK, Math.min(1, K + 0.08))];
}

/**
 * The surface behind a header (collection, work, person): 168° from the two
 * ends, then fused into the page background over its last third. Without a
 * palette there is no colour — the surface is `--bg`.
 */
export function tintSurface(hexes: readonly string[]): string {
  if (!hexes[0]) return BG;
  const [top, bottom] = tintEnds(hexes);
  return `linear-gradient(168deg, ${top} 0%, ${bottom} 66%, ${BG} 100%)`;
}

/** The ficha's vertical variant (24a: 180°, ends at 0 / 66 / 100). */
export function tintSurfaceVertical(hexes: readonly string[]): string {
  if (!hexes[0]) return BG;
  const [top, bottom] = tintEnds(hexes);
  return `linear-gradient(180deg, ${top} 0%, ${bottom} 66%, ${BG} 100%)`;
}

/** A collection card's own surface (no fade — the card IS the object). */
export function tintCard(hexes: readonly string[]): string {
  if (!hexes[0]) return "var(--surface-1)";
  const [top, bottom] = tintEnds(hexes);
  return `linear-gradient(168deg, ${top} 0%, ${bottom} 100%)`;
}

function invert(hex: string): string {
  const c = parseHex(hex);
  if (!c) return TEXT;
  const ch = (v: number) => (255 - v).toString(16).padStart(2, "0");
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
}

/**
 * The seal (§marca): "Fondo: el tono oscuro de la obsesión destacada,
 * invertido y mezclado 72% hacia --bg. Iniciales: su tono claro invertido,
 * mezclado 55% hacia --text. Sin obsesión, el sello va sobre --s2 con --text."
 */
export function sealColors(hexes: readonly string[]): { bg: string; fg: string } {
  const light = hexes[0];
  const dark = hexes[1] ?? hexes[0];
  if (!light || !dark) return { bg: "var(--surface-2)", fg: "var(--text)" };
  return {
    bg: mixHex(invert(dark), BG, 0.72),
    fg: mixHex(invert(light), TEXT, 0.55),
  };
}

/** Two lowercase initials from a display name or handle ("mariel ortega" → "mo"). */
export function sealInitials(name: string): string {
  const words = name
    .trim()
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return "·";
  const first = Array.from(words[0])[0] ?? "";
  const second = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? "" : Array.from(words[0])[1] ?? "";
  return (first + second).toLowerCase();
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
const STOREFRONT_TZ = "America/Los_Angeles";

/**
 * The release as Kura writes it (notes-no-puedo-esperar, agreed with the
 * founder 2026-09-24): ≤ 7 days a mono countdown ("3 d", last day "14 h");
 * further out the date ("17 jul", with the year only when it isn't this
 * year); the release day "hoy"; afterwards "ya salió".
 */
export function releaseLabel(releaseDate: Date | string, now: number): string {
  const t = new Date(releaseDate).getTime();
  if (!Number.isFinite(t)) return "sin fecha";
  const d = t - now;
  if (d <= 0) return now - t < DAY ? "hoy" : "ya salió";
  if (d < DAY) return `${Math.max(1, Math.ceil(d / HOUR))} h`;
  if (d <= 7 * DAY) return `${Math.ceil(d / DAY)} d`;
  const date = new Date(t);
  const sameYear =
    new Intl.DateTimeFormat("es-MX", { year: "numeric", timeZone: STOREFRONT_TZ }).format(date) ===
    new Intl.DateTimeFormat("es-MX", { year: "numeric", timeZone: STOREFRONT_TZ }).format(new Date(now));
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: STOREFRONT_TZ,
  })
    .format(date)
    .replace(/\./g, "")
    .replace(" de ", " ");
}

/** "Sale el 16 oct" / "Sale en 14 h" — the neutral form the ficha uses. */
export function releaseSentence(releaseDate: Date | string, now: number): string {
  const label = releaseLabel(releaseDate, now);
  if (label === "hoy") return "Sale hoy";
  if (label === "ya salió") return "Ya salió";
  if (/^\d+ [hd]$/.test(label)) return `Sale en ${label}`;
  return `Sale el ${label}`;
}
