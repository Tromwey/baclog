"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatCountdown,
  releaseDayLabel,
  type CountdownParts,
} from "@/modules/catalog/release";

/**
 * F3.8 — the only living thing on the screen (design §0: "el número que cambia
 * es la única cosa viva"). Deliberately NOT animated: the design system bans
 * pulses, and a countdown is exactly what begs for one. Urgency comes from
 * scale, hierarchy and a change of type family in the last 24 h — never motion.
 *
 * HYDRATION (the AuraField lesson, AGENTS.md): the server renders with ITS
 * clock and the browser would render with a different one, so the first client
 * paint must reuse the server's instant, not Date.now(). `initialNow` is that
 * instant, the state starts null, and only after mount does the tick take over.
 * SSR output and first hydration render are byte-identical by construction.
 */

function useCountdown(
  releaseIso: string,
  initialNow: number,
  refreshOnRelease = false,
): CountdownParts {
  const [now, setNow] = useState<number | null>(null);
  const router = useRouter();
  // Seeded with the phase we OPENED on, not `false`: an album released in the
  // last 24 h is already "out" on the first render, so a naive guard would fire
  // router.refresh() on mount for every visit during that day — re-running the
  // whole server render (second iTunes lookup included) to fetch a page the
  // server had just produced. Only a crossing that happens while you're
  // watching is worth a refetch.
  const crossed = useRef(formatCountdown(releaseIso, initialNow).phase === "out");

  const parts = formatCountdown(releaseIso, now ?? initialNow);

  useEffect(() => {
    // Sub-second cadence only when seconds are actually on screen; otherwise a
    // lazy 30 s tick is enough to roll "13 días" over to "12 días" on time.
    // The first tick is also what corrects any drift from the server's instant
    // — deliberately NOT a synchronous setState here, which would cascade a
    // second render on every mount to fix a gap of a few hundred milliseconds.
    const period = parts.phase === "live" ? 1000 : 30_000;
    const id = setInterval(() => setNow(Date.now()), period);
    return () => clearInterval(id);
  }, [parts.phase]);

  useEffect(() => {
    // The crossing to zero: the copy swaps locally (no flash), and one refresh
    // goes and gets the real post-release page — the bar with Reproducir, the
    // full tracklist, the year in the meta line. Guarded so it fires once.
    if (parts.phase === "out" && refreshOnRelease && !crossed.current) {
      crossed.current = true;
      router.refresh();
    }
  }, [parts.phase, refreshOnRelease, router]);

  return parts;
}

/**
 * The mono-meta countdown — the string that takes the year's place in rows,
 * shelf cards, meta lines and public pages. In the last 24 h it steps up to
 * --text and tabular digits so the clock reads as a clock, and nothing else
 * about the row changes.
 */
export function CountdownMono({
  releaseDate,
  initialNow,
  className = "",
  liveClassName = "",
}: {
  releaseDate: string;
  initialNow: number;
  className?: string;
  liveClassName?: string;
}) {
  const parts = useCountdown(releaseDate, initialNow);
  if (!parts.mono) return null;
  const live = parts.phase === "live";
  return (
    <span
      className={`font-mono uppercase ${
        live ? `tabular-nums text-text ${liveClassName}` : className
      }`}
    >
      {parts.mono}
    </span>
  );
}

/**
 * The item page's editorial counter (design §1c — "el del prototipo"). Three
 * faces, one per phase:
 *  - days/hours: the number as display type (Bricolage 88px), unit + date beside
 *  - live: the family CHANGES to mono at 48px; that texture shift IS the urgency
 *  - out: "ya salió" in accent, with a 420 ms settle and nothing else moving
 */
export function CountdownHero({
  releaseDate,
  initialNow,
}: {
  releaseDate: string;
  initialNow: number;
}) {
  const parts = useCountdown(releaseDate, initialNow, true);

  if (parts.phase === "out") {
    return (
      <div className="bl-settle mt-5 flex flex-col items-center gap-1.5">
        <span className="font-serif text-4xl italic leading-none text-accent">
          ya salió
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
          {freshLabel(parts.sinceMs, releaseDate)}
        </span>
      </div>
    );
  }

  if (parts.phase === "live") {
    return (
      <div className="mt-5 flex flex-col items-center gap-[5px]">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-3">
          Faltan
        </span>
        <span className="font-mono text-5xl font-bold leading-[0.94] tracking-[-0.03em] tabular-nums text-text">
          {parts.clock}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
          Sale hoy · medianoche del Pacífico
        </span>
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-end justify-center gap-3">
      <span className="font-display text-[88px] font-extrabold leading-[0.78] tracking-[-0.045em] tabular-nums text-text">
        {parts.num}
      </span>
      <div className="flex flex-col gap-[3px] pb-2 text-left">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-2">
          {parts.unit}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
          Sale el {releaseDayLabel(releaseDate)}
        </span>
      </div>
    </div>
  );
}

/**
 * The bottom-bar slot (design §1e variant A, "RECOMENDADA"). The wait takes the
 * place of the action, because there is no action: the notice is automatic, so
 * the bar INFORMS it instead of asking for it.
 */
export function CountdownBar({
  releaseDate,
  initialNow,
}: {
  releaseDate: string;
  initialNow: number;
}) {
  const parts = useCountdown(releaseDate, initialNow);
  const live = parts.phase === "live";
  return (
    <div className="flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full bg-surface-2 px-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
        {live ? "Sale hoy" : `Te avisamos el ${releaseDayLabel(releaseDate)}`}
      </span>
      <span
        className={
          live
            ? "font-mono text-[19px] font-bold tracking-[0.02em] tabular-nums text-text"
            : "font-mono text-sm uppercase tracking-[0.06em] text-text"
        }
      >
        {parts.mono}
      </span>
    </div>
  );
}

/**
 * The countdown laid over album art (Novedades 6b/6c). Same two faces as the
 * hero — big number while it's days out, a mono clock in the last 24 h.
 *
 * DEVIATION FROM THE DESIGN, on purpose: the mock puts near-black digits on a
 * bright placeholder gradient. Real covers are photographs of anything, so
 * fixed dark text is a coin flip — here it's off-white over a bottom-up scrim
 * (a dark neutral gradient, which §7 exempts), which reads on any artwork.
 */
export function CountdownCover({
  releaseDate,
  initialNow,
  title,
}: {
  releaseDate: string;
  initialNow: number;
  title: string;
}) {
  const parts = useCountdown(releaseDate, initialNow);
  const live = parts.phase === "live";

  if (live) {
    return (
      <div className="relative flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/70">
          {title} · Faltan
        </span>
        <span className="font-mono text-[44px] font-bold leading-[0.94] tracking-[-0.03em] tabular-nums text-text">
          {parts.clock}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex items-end gap-3">
      <span className="font-display text-[78px] font-extrabold leading-[0.76] tracking-[-0.045em] tabular-nums text-text">
        {parts.num}
      </span>
      <div className="flex flex-col gap-[3px] pb-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text">
          {parts.unit}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-white/65">
          {title} · {releaseDayLabel(releaseDate)}
        </span>
      </div>
    </div>
  );
}

/** "HACE UN MOMENTO · 14 AGO" — the freshly-released line under "ya salió". */
function freshLabel(sinceMs: number, releaseDate: string): string {
  const mins = Math.floor(sinceMs / 60_000);
  const when = mins < 1 ? "Hace un momento" : `Hace ${mins} min`;
  return `${when} · ${releaseDayLabel(releaseDate)}`;
}
