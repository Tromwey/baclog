/**
 * F3.8 "No puedo esperar" — the countdown clock, as pure arithmetic.
 *
 * NO "server-only" here on purpose: the same function formats the string the
 * server renders and the string the client re-renders on every tick. One
 * implementation is what keeps SSR and the first client paint byte-identical
 * (see the hydration note in components/countdown.tsx).
 *
 * The thresholds ARE the design (doc §1c): days until 48 h out, hours until
 * 24 h out, then a live hh:mm:ss for the last day. A seconds counter running
 * for three months is noise; one running for the last night is the whole point.
 */

export type CountdownPhase = "days" | "hours" | "live" | "out";

export interface CountdownParts {
  phase: CountdownPhase;
  /** Mono-meta string for rows, cards and the meta line: "FALTAN 13 DÍAS". */
  mono: string;
  /** Same value in the product's own voice: "faltan 13 días". */
  phrase: string;
  /** Just the number, for the editorial display treatment. */
  num: string;
  /** "DÍAS" / "DÍA" / "HORAS" / "HORA" — empty in the live and out phases. */
  unit: string;
  /** Zero-padded hh:mm:ss — only meaningful in the live phase. */
  clock: string;
  /** ms since release; 0 unless the phase is "out". */
  sinceMs: number;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

const pad2 = (v: number) => String(v).padStart(2, "0");

/**
 * The zone a release DAY label is printed in: UTC. Every `release_date` we
 * store is an instant INSIDE its release day's UTC calendar day — iTunes
 * sends 07:00Z / 08:00Z (midnight Los Angeles, PDT/PST), 12:00Z (older
 * albums) or 00:00Z (the charts feed's bare date), and video is stored at
 * 06:00Z (see `RELEASE_DAY_UTC_HOUR`) — so the UTC date IS the day, for
 * every provider. Printing in America/Los_Angeles (the old pin) turned the
 * 00:00Z/06:00Z shapes into "the day before". The countdown itself is
 * absolute (a timestamp difference); only these human-readable labels need
 * the pin. `components/kura/tint.ts` keeps the same constant for the same
 * reason — change both or neither. Same rule as the iOS app, which reads a
 * `day` by its UTC components (`KuraJSON.dayAtNoon`).
 */
const STOREFRONT_TZ = "UTC";

/**
 * The hour (UTC) at which a DAY-granular release date is stored: 06:00Z =
 * 00:00 in America/Mexico_City (fixed UTC−6, no DST since 2022) — the
 * product's home zone, the same one the feed's "hoy/ayer" uses. TMDB (film
 * `release_date`, series `first_air_date`) only knows the calendar day, and
 * the whole feature derives from `releaseDate > now` (`isUpcoming`, `setMark`'s
 * `not_released`, the feed, the release cron), so the instant decides WHEN the
 * day starts: at 06:00Z the ficha flips from "sale el …" to "hoy" exactly at
 * midnight in CDMX — never the evening before (00:00Z would be 18:00 CDMX of
 * the previous day) and never hours into the day (12:00Z would 409 a mark at
 * 02:00 CDMX that the app, which compares by local calendar day, allows).
 * West of CDMX the day starts a little early (lenient); east of it, late.
 * Albums keep the instant iTunes gives (midnight Los Angeles).
 */
export const RELEASE_DAY_UTC_HOUR = 6;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A provider's calendar day (`YYYY-MM-DD`, TMDB) → the stored instant (that
 * day at `RELEASE_DAY_UTC_HOUR` UTC). Anything else — TMDB's "" for unknown,
 * a timestamp, garbage, or an impossible day like 2024-02-30 (which
 * `Date.UTC` would silently roll into March) — is null: no date beats a
 * wrong one, and a null never erases a known date in the catalog upsert.
 */
export function releaseDayInstant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = YMD_RE.exec(value);
  if (!m) return warnUnparsedDay(value);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d, RELEASE_DAY_UTC_HOUR));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
    ? t
    : warnUnparsedDay(value);
}

let warnedUnparsedDay = false;

/**
 * "TMDB doesn't know" and "TMDB changed its format" both end in null, but only
 * the first is normal: `""` (and a missing field) is TMDB's unknown and stays
 * silent; a NON-EMPTY string we can't read means every film/series stops
 * getting a date — countdowns, 409s and release emails vanish without an
 * error anywhere. Warned ONCE per process: this runs per search hit, and one
 * line with a sample is the signal; a thousand is noise.
 */
function warnUnparsedDay(value: string): null {
  if (value !== "" && !warnedUnparsedDay) {
    warnedUnparsedDay = true;
    console.warn(
      `[catalog] releaseDayInstant: unparseable non-empty day ${JSON.stringify(value.slice(0, 40))} — not a real YYYY-MM-DD day; further ones are not logged in this process`,
    );
  }
  return null;
}

export function formatCountdown(
  releaseDate: Date | string,
  now: number,
): CountdownParts {
  const target = new Date(releaseDate).getTime();
  const d = target - now;

  if (!Number.isFinite(target)) {
    return { phase: "out", mono: "", phrase: "", num: "", unit: "", clock: "", sinceMs: 0 };
  }

  if (d <= 0) {
    return {
      phase: "out",
      mono: "YA SALIÓ",
      phrase: "ya salió",
      num: "",
      unit: "",
      clock: "00:00:00",
      sinceMs: -d,
    };
  }

  if (d > 2 * DAY) {
    // FLOOR, not ceil: "faltan N días" means N whole days still remain, so it
    // never overstates the wait. Ceil also made "2 DÍAS" unreachable — the days
    // phase starts just above 48 h, where ceil already returns 3, so the
    // sequence read 3 DÍAS → 48 HORAS with nothing in between.
    const n = Math.floor(d / DAY);
    const unit = n === 1 ? "DÍA" : "DÍAS";
    return {
      phase: "days",
      mono: `FALTAN ${n} ${unit}`,
      phrase: `faltan ${n} ${unit.toLowerCase()}`,
      num: String(n),
      unit,
      clock: "",
      sinceMs: 0,
    };
  }

  if (d > DAY) {
    const n = Math.ceil(d / HOUR);
    const unit = n === 1 ? "HORA" : "HORAS";
    return {
      phase: "hours",
      mono: `FALTAN ${n} ${unit}`,
      phrase: `faltan ${n} ${unit.toLowerCase()}`,
      num: String(n),
      unit,
      clock: "",
      sinceMs: 0,
    };
  }

  const clock =
    `${pad2(Math.floor(d / HOUR))}:` +
    `${pad2(Math.floor((d % HOUR) / 60_000))}:` +
    `${pad2(Math.floor((d % 60_000) / 1000))}`;
  return {
    phase: "live",
    mono: clock,
    phrase: `faltan ${clock}`,
    num: clock,
    unit: "",
    clock,
    sinceMs: 0,
  };
}

/**
 * The instant a server render happened, to be threaded into every countdown on
 * the page. Two reasons this exists instead of a bare Date.now() at each call
 * site: the whole page must agree on one clock (a shelf card and the row below
 * it computing "13 días" from different milliseconds can disagree), and the
 * value has to reach the client so its first paint matches the server's HTML.
 *
 * Async because reading the clock is an impure read — legitimate in an async
 * server component, but `react-hooks/purity` (rightly) rejects it inline in
 * anything that looks like a render body.
 */
export async function getRenderInstant(): Promise<number> {
  return Date.now();
}

/** "14 AGO" — the storefront day, for "SALE EL …" / "TE AVISAMOS EL …". */
export function releaseDayLabel(releaseDate: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: STOREFRONT_TZ,
  })
    .format(new Date(releaseDate))
    .replace(".", "")
    .toUpperCase();
}

/**
 * When the rest of an unreleased album's tracks arrive: "esta noche" once the
 * clock is inside its last day (a date would be pedantic when it's hours away),
 * else "el 14 de agosto". Lives here, not at the call sites, because both item
 * pages need the identical sentence and the threshold is already a named
 * concept — phase "live" IS "inside the last day".
 */
export function restArrivesLabel(
  releaseDate: Date | string,
  now: number,
): string {
  return formatCountdown(releaseDate, now).phase === "live"
    ? "esta noche"
    : `el ${releaseDayLong(releaseDate)}`;
}

/** "14 de agosto" — the same day, spelled out for prose and email. ONLY for
 *  a stored release date: an arbitrary instant (when someone added a title)
 *  is a local moment, not a day — print that with `homeDayLong`. */
export function releaseDayLong(releaseDate: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    timeZone: STOREFRONT_TZ,
  }).format(new Date(releaseDate));
}

/** "3 de septiembre" — the calendar day an INSTANT fell on in the product's
 *  home zone (America/Mexico_City, as the feed's "hoy/ayer"). For the release
 *  email's "lo guardaste el …": an add at 20:00 CDMX is already the next day
 *  in UTC, so `releaseDayLong` would print the wrong day for it. */
export function homeDayLong(instant: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    timeZone: "America/Mexico_City",
  }).format(new Date(instant));
}

/**
 * THE predicate the whole feature derives from — for albums AND video (film,
 * series: since 2026-09-24 the TMDB day is persisted, see
 * `RELEASE_DAY_UTC_HOUR` for when that day "starts"). Null-safe by design: a
 * missing date means the countdown, the shelf entry, the suppressed action
 * bar and the notice all simply don't happen, and the item renders exactly as
 * it does today.
 */
export function isUpcoming(
  releaseDate: Date | string | null | undefined,
  now: number,
): boolean {
  if (!releaseDate) return false;
  const t = new Date(releaseDate).getTime();
  return Number.isFinite(t) && t > now;
}

/**
 * "Just released" — the one-day window where the item page keeps saying
 * "ya salió" in accent before it becomes an ordinary title again (design §1g).
 */
export function isFreshlyReleased(
  releaseDate: Date | string | null | undefined,
  now: number,
): boolean {
  if (!releaseDate) return false;
  const t = new Date(releaseDate).getTime();
  return Number.isFinite(t) && t <= now && now - t < DAY;
}

/**
 * The wait as the cover pill spells it (Revamp UI, 2026-09-03): "faltan 12 d",
 * "faltan 6 sem", "faltan 9 m", "faltan 5 h", "hoy". Rounded to the coarsest
 * unit that still reads — a pill on a 104px cover has room for one number.
 * Static (computed once with the server's instant), unlike the ticking
 * CountdownMono: a strip of covers doesn't need to count seconds.
 */
export function shortWait(releaseDate: Date | string, now: number): string {
  const t = new Date(releaseDate).getTime();
  const d = t - now;
  if (!Number.isFinite(t) || d <= 0) return "ya salió";
  if (d < DAY) return d < HOUR ? "hoy" : `faltan ${Math.ceil(d / HOUR)} h`;
  const days = Math.floor(d / DAY);
  if (days < 14) return `faltan ${days} d`;
  if (days < 60) return `faltan ${Math.round(days / 7)} sem`;
  return `faltan ${Math.round(days / 30)} m`;
}

/** "19 dic" — the storefront day, lowercase, for the line under a cover. */
export function releaseDayShort(releaseDate: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: STOREFRONT_TZ,
  })
    .format(new Date(releaseDate))
    .replace(".", "");
}
