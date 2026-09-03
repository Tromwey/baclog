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
  value,
  onSelect,
  variant = "tabs",
  scrollable = false,
  className = "",
  ariaLabel,
}: {
  segments: Segment[];
  value: string | null;
  onSelect?: (key: string) => void;
  variant?: "tabs" | "actions";
  scrollable?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const track =
    variant === "actions" ? "gap-1.5 p-1.5" : "gap-1 p-[5px]";
  const seg =
    variant === "actions"
      ? "flex items-center justify-center gap-1.5 py-[11px]"
      : "py-[9px] text-center";
  const width = scrollable ? "flex-none px-4" : "flex-1 min-w-0";
  return (
    <div
      role={onSelect ? "tablist" : undefined}
      aria-label={ariaLabel}
      className={`flex rounded-full bg-white/[0.07] ${track} ${
        scrollable ? "bl-scroll overflow-x-auto" : ""
      } ${className}`}
    >
      {segments.map((s) => {
        const active = s.key === value;
        const cls = `${seg} ${width} whitespace-nowrap rounded-full font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors duration-[var(--dur-fast)] ${
          active ? "bg-white/[0.08] text-text" : "text-text-3"
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
            role={onSelect ? "tab" : undefined}
            aria-selected={onSelect ? active : undefined}
            aria-pressed={onSelect ? undefined : active}
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
