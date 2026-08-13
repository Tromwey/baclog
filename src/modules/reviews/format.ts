import { parseHex, rgba } from "@/lib/color";
import { plural } from "@/lib/plural";
import type { MediaType } from "@/modules/catalog/types";
import type { ReviewMark } from "./types";

/**
 * F3.9 — pure formatters shared by the server render and the client cards.
 * Isomorphic on purpose (no "server-only"): the relative date is computed ONCE
 * on the server and threaded down as a string, so nothing here can drift
 * between SSR and hydration the way a `Date.now()` in a client component would.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/**
 * "ahora" · "hace 8 min" · "hace 3 h" · "hace 2 d" · "hace 3 sem" ·
 * "hace 5 meses" · "hace 2 años". Deliberately coarse: a review is not a
 * message, and the exact minute has never mattered to anyone reading one.
 */
export function relativeWhen(at: Date | string, now: number): string {
  const then = new Date(at).getTime();
  if (!Number.isFinite(then)) return "";
  const d = Math.max(0, now - then);

  if (d < MINUTE) return "ahora";
  if (d < HOUR) return `hace ${Math.floor(d / MINUTE)} min`;
  if (d < DAY) return `hace ${Math.floor(d / HOUR)} h`;
  if (d < WEEK) return `hace ${Math.floor(d / DAY)} d`;
  if (d < 5 * WEEK) return `hace ${Math.floor(d / WEEK)} sem`;

  const months = Math.floor(d / (30 * DAY));
  if (months < 12) return `hace ${months} ${plural(months, "mes", "meses")}`;
  const years = Math.floor(months / 12);
  return `hace ${years} ${plural(years, "año", "años")}`;
}

/** Third-person label for a feed card ("le gustó · hace 4 d"). */
export function markLabel(mark: ReviewMark): string | null {
  if (mark === "obsessed") return "le obsesiona";
  if (mark === "liked") return "le gustó";
  if (mark === "disliked") return "no le gustó";
  return null;
}

/** Second-person label for the viewer's own card ("te obsesiona · hace 1 h"). */
export function ownMarkLabel(mark: ReviewMark): string | null {
  if (mark === "obsessed") return "te obsesiona";
  if (mark === "liked") return "te gustó";
  if (mark === "disliked") return "no te gustó";
  return null;
}

/**
 * Whether a title can be spoiled at all.
 *
 * A film or a series has an ending someone can ruin. An album doesn't: there's
 * no plot to give away, and offering "Contiene spoiler" next to a record makes
 * the whole control look like boilerplate that was never thought about. So on
 * albums the switch isn't there, "Spoiler sin marcar" isn't in the report
 * sheet, and `saveReviewAction` forces the flag off — the UI hiding a control
 * is a courtesy, the server dropping the value is the rule.
 */
export function supportsSpoiler(mediaType: MediaType): boolean {
  return mediaType !== "album";
}

const UNITS = [
  "cero",
  "una",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
];

/**
 * The public page's one conversion line, right after the feed. The count is
 * spelled out up to twenty because it's a sentence, not a statistic — "Doce
 * personas ya escribieron la suya" is someone talking; "12 personas" is a
 * dashboard. Past twenty the digit reads better than the word.
 */
export function conversionLine(n: number): string | null {
  if (n <= 0) return null;
  if (n === 1) return "Una persona ya escribió la suya. La tuya cabe aquí.";
  const count = n <= 20 ? UNITS[n] : String(n);
  const shown = count.charAt(0).toUpperCase() + count.slice(1);
  return `${shown} personas ya escribieron la suya. La tuya cabe aquí.`;
}

/**
 * The 30 px avatar: two ADN colors bleeding over the raised surface, with the
 * initial punched out in the page background color. Same two-lobe recipe as the
 * profile orb, shrunk — no photos anywhere in Baclog.
 */
/** The lima/mauve pair an author falls back to when their ADN can't serve. */
export const FALLBACK_ADN: [string, string] = ["#D8FF3E", "#7C3F5E"];

/**
 * The avatar punches the initial out in the page background color (design
 * "La card, medida"), which only reads if the color behind it is light enough.
 * Plenty of posters are dominated by near-black; the profile orb gets away with
 * that (100px of aura, no text on it), a 30px disc with a letter on it does
 * not. Too-dark stops are skipped and the ADN falls back a color. Perceptual
 * luminance, not raw brightness.
 */
export function isLegibleBehindText(hex: string): boolean {
  const c = parseHex(hex);
  if (!c) return false;
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 >= 0.32;
}

/** The two ADN stops for an avatar, filtered for legibility and padded. */
export function legibleAdnPair(hexes: string[]): [string, string] {
  const usable = hexes.filter(isLegibleBehindText);
  return [usable[0] ?? FALLBACK_ADN[0], usable[1] ?? FALLBACK_ADN[1]];
}

export function avatarGradient([a, b]: readonly [string, string]): string {
  return [
    `radial-gradient(80% 90% at 30% 25%, ${a} 0%, ${rgba(a, 0)} 62%)`,
    `radial-gradient(85% 95% at 75% 80%, ${b} 0%, ${rgba(b, 0)} 64%)`,
    "var(--surface-2)",
  ].join(",");
}
