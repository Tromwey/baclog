import type { CSSProperties } from "react";

/**
 * The stroke glyphs of the Kura flows (design/kura/flujos-v2 · 02–05): menu
 * rows, sheet chips, format pills, avisos. Paths verbatim from the frames,
 * on the 24×24 grid. The FILLED state glyphs (llama, pulgar, check, reloj…)
 * stay in `Glyph` (components.tsx) — one glyph, one meaning.
 *
 * Server-safe (no hooks): a plain SVG.
 */
export const K = {
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  chevron: "M9 5l7 7-7 7",
  share: "M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  sort: "M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3",
  pencil: "M4 20h4L19 9l-4-4L4 16z",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  arrow: "M4 12h14M13 6l6 6-6 6",
  minus: "M5 12h14",
  review: "M4 4h16v12H9l-5 4z",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  story: "M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM12 8v8M8 12h8",
  globe:
    "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  wifiOff: "M2 8.5a15 15 0 0120 0M5.5 12a10 10 0 0113 0M9 15.5a5 5 0 016 0M12 19h.01M3 3l18 18",
  warning:
    "M12 8v5M12 16.5v.5M10.3 3.8L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.8a2 2 0 00-3.4 0z",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  /** Format pills (x.label · `FI`). */
  film: "M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4",
  series: "M3 7h18v12H3zM8 3l4 4 4-4",
  music: "M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z",
} as const;

export type KIconName = keyof typeof K;

export function KIcon({
  name,
  size = 18,
  strokeWidth = 2,
  className = "",
  style,
}: {
  name: KIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className}`}
      style={style}
      aria-hidden
    >
      <path d={K[name]} />
    </svg>
  );
}

/** ··· — Opciones (three filled dots, the frames' `circle r=2`). */
export function DotsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="flex-none" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/** Filled people glyph (Quién la ve · Seguidores) and filled padlock (Solo yo). */
export const PEOPLE_FILL =
  "M9 11a4 4 0 100-8 4 4 0 000 8zm7 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6H2zm15 0c0-2-.8-3.8-2.1-5.1.7-.2 1.4-.3 2.1-.3 2.8 0 5 1.9 5 4.4V20h-5z";
export const LOCK_FILL =
  "M7 10V7a5 5 0 0110 0v3h1a1 1 0 011 1v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h6V7a3 3 0 00-6 0v3z";

export function FillIcon({ d, size = 18, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`flex-none ${className}`} aria-hidden>
      <path d={d} />
    </svg>
  );
}
