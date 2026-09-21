import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The segmented pill (Revamp UI, 2026-09-03): a track of `rgba(255,255,255,.07)`
 * holding equal-width segments in mono-meta uppercase; the active segment is a
 * lighter fill (`.08`) and full text, the rest text-3. Borderless — the mock's
 * `--pill-line` is transparent in its default (borderless) state, and §7 bans
 * the hairline anyway.
 *
 * Two densities, both verbatim from the mock:
 *  - `tabs`    p 5 · gap 4 · py 9  · 10.5px — filters (Todos · Cine · Series…)
 *  - `actions` p 6 · gap 6 · py 11 · 10.5px with a state glyph — the reaction
 *              row on an item (Me gustó · Obsesión · Completo)
 *
 * A segment is a Link when it has `href`, else a button; the control has no
 * state of its own, so a server component can render link segments and a
 * client component can drive `onSelect`. `scrollable` lets a long picker (the
 * "Agregar a" backlog row) run off the edge instead of squeezing.
 *
 * A single-select, equal-width track (`value`, not `scrollable`) draws ONE
 * indicator that SLIDES between segments, like the dock's pill — same look,
 * same behavior. It needs no measuring (so this stays hook-free and
 * server-safe): segments are `flex-1`, so the indicator's width and offset
 * are pure `calc()` from the count, the padding and the gap. A CSS transition
 * on `transform` retargets from wherever it is, so rapid taps never queue.
 *
 * `value` lights ONE segment (a picker). `values` lights ANY number of them —
 * the item's reaction row is three independent fields (me gustó · obsesión ·
 * completo) drawn in one track, so several can be on at once; it then reads
 * as a group of toggles (aria-pressed), not a tablist.
 */
export interface Segment {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  href?: string;
  /** Per-segment override (e.g. a lima "Completo" once it's done). */
  className?: string;
}

export function Segmented({
  segments,
  value = null,
  values,
  onSelect,
  variant = "tabs",
  scrollable = false,
  className = "",
  ariaLabel,
}: {
  segments: Segment[];
  value?: string | null;
  /** Multi-select highlight; wins over `value` when given. */
  values?: readonly string[];
  onSelect?: (key: string) => void;
  variant?: "tabs" | "actions";
  scrollable?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const track =
    variant === "actions" ? "gap-1.5 p-1.5" : "gap-1 p-[5px]";
  // Keep in sync with `track` — the indicator's geometry is derived from them.
  const pad = variant === "actions" ? 6 : 5;
  const gap = variant === "actions" ? 6 : 4;
  const seg =
    variant === "actions"
      ? "flex items-center justify-center gap-1.5 py-[11px]"
      : "py-[9px] text-center";
  const width = scrollable ? "flex-none px-4" : "flex-1 min-w-0";
  const multi = values !== undefined;
  const sliding = !multi && !scrollable;
  const activeIndex = sliding ? segments.findIndex((s) => s.key === value) : -1;
  const n = segments.length;
  return (
    <div
      role={onSelect && !multi ? "tablist" : undefined}
      aria-label={ariaLabel}
      className={`relative flex rounded-full bg-white/[0.07] ${track} ${
        scrollable ? "bl-scroll overflow-x-auto" : ""
      } ${className}`}
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-white/[0.08] transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{
            top: pad,
            bottom: pad,
            left: pad,
            width: `calc((100% - ${2 * pad + (n - 1) * gap}px) / ${n})`,
            transform: `translateX(calc(${activeIndex} * (100% + ${gap}px)))`,
          }}
        />
      )}
      {segments.map((s) => {
        const active = multi ? values.includes(s.key) : s.key === value;
        const cls = `${seg} ${width} relative whitespace-nowrap rounded-full font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors duration-[var(--dur-fast)] active:bg-white/[0.12] ${
          active ? `${sliding ? "" : "bg-white/[0.08] "}text-text` : "text-text-3"
        } ${s.className ?? ""}`;
        const body = (
          <>
            {s.icon}
            {s.label}
          </>
        );
        if (s.href) {
          return (
            <Link
              key={s.key}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={cls}
            >
              {body}
            </Link>
          );
        }
        return (
          <button
            key={s.key}
            type="button"
            role={onSelect && !multi ? "tab" : undefined}
            aria-selected={onSelect && !multi ? active : undefined}
            aria-pressed={onSelect && !multi ? undefined : active}
            onClick={onSelect ? () => onSelect(s.key) : undefined}
            className={cls}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
