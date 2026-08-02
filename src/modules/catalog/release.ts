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
 * The storefront's own timezone. iTunes hands us 07:00Z, which is midnight in
 * America/Los_Angeles — the date is a US storefront date, not a local one, so
 * formatting the LABEL in any other zone would print a day the store doesn't
 * agree with. The countdown itself is absolute (a timestamp difference), so
 * only this human-readable label needs pinning.
 */
const STOREFRONT_TZ = "America/Los_Angeles";

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
    const n = Math.ceil(d / DAY);
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

/** "14 de agosto" — the same day, spelled out for prose and email. */
export function releaseDayLong(releaseDate: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    timeZone: STOREFRONT_TZ,
  }).format(new Date(releaseDate));
}

/**
 * THE predicate the whole feature derives from. Null-safe by design: a missing
 * date means the countdown, the shelf entry, the suppressed action bar and the
 * notice all simply don't happen, and the item renders exactly as it does today.
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
