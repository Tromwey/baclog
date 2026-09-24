/**
 * Recap (Kura, flujo 10) — the PURE half: the month shapes the screen and the
 * API share, the Spanish month labels, and the "lo más tuyo" pick. No
 * "server-only" on purpose: `perfil-screen.tsx` and the recap pages render
 * the labels, and the API smoke can parse these without a DB. The reads
 * (`getRecapMonths`, `getLatestRecapKey`) live in `./recap`.
 */

export type RecapMediaType = "film" | "series" | "album";

export interface RecapTitle {
  catalogItemId: string;
  title: string;
  byline: string | null;
  year: number | null;
  mediaType: RecapMediaType;
  posterUrl: string | null;
  paletteHex: string[];
  obsessed: boolean;
  completed: boolean;
  liked: boolean;
  /** Added to the library within this month (the "guardados" stat). */
  saved: boolean;
}

export interface RecapMonth {
  /** "2026-08" */
  key: string;
  titles: RecapTitle[];
  completed: number;
  obsessions: number;
  reviews: number;
  saved: number;
  /** The month's "lo más tuyo": obsession first, then a liked completion,
   *  then any completion, then the newest; preferring a title with art. */
  top: RecapTitle | null;
}

/** `YYYY-MM` — an era key as the recap URLs and the API spell it. */
export const ERA_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** UTC month of an instant as an era key ("2026-08"). */
export function monthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Lo más tuyo" for a month — see `RecapMonth.top`. */
export function pickTop(titles: RecapTitle[]): RecapTitle | null {
  const ranked = [
    (t: RecapTitle) => t.obsessed,
    (t: RecapTitle) => t.completed && t.liked,
    (t: RecapTitle) => t.completed,
    () => true,
  ];
  for (const test of ranked) {
    const hit = titles.find((t) => test(t) && t.posterUrl) ?? titles.find(test);
    if (hit) return hit;
  }
  return null;
}

/** "También en tu mes": the month's titles minus the top, capped — the rule
 *  the recap screen draws and `GET /recap/{era}` serializes. */
export const RECAP_ALSO_CAP = 12;
export function alsoInMonth(month: RecapMonth, cap = RECAP_ALSO_CAP): RecapTitle[] {
  const topId = month.top?.catalogItemId;
  return month.titles.filter((t) => t.catalogItemId !== topId).slice(0, cap);
}

const ES_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-08" → "agosto". */
export function monthName(key: string): string {
  return ES_MONTHS[Number(key.slice(5)) - 1] ?? "este mes";
}

/** "2026-08" → "agosto 2026". */
export function monthYear(key: string): string {
  return `${monthName(key)} ${key.slice(0, 4)}`;
}
