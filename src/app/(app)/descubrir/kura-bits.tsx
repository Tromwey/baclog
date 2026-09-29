import type { ReactNode } from "react";
import type { MediaType } from "@/modules/catalog/types";
import { Cover } from "@/components/kura/components";

/**
 * Descubrir's local Kura pieces (flujos-v2 · 19a–19h, 27a/27b). Things the
 * shared `src/components/kura/` doesn't have yet and that only this area
 * draws: the format filter in its two shapes, the search glyphs, the list row
 * cover, the mono meta line. Server-safe (no hooks).
 */

/* ------------------------------------------------------------- formato */

export type KindTab = "all" | MediaType;

export const KIND_TABS: { key: KindTab; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "film", label: "Cine" },
  { key: "series", label: "Series" },
  { key: "album", label: "Música" },
];

/** The mock's short kind names for meta lines ("Cine · 2001 · Miyazaki"). */
export const KIND_SHORT: Record<MediaType, string> = {
  film: "Cine",
  series: "Serie",
  album: "Álbum",
};

/** "Cine · 2001 · Miyazaki" / "Álbum · 2016 · ZAYN" — set in mono caps by CSS. */
export function workMeta(w: {
  mediaType: MediaType;
  year: number | null;
  byline: string | null;
}): string {
  return [KIND_SHORT[w.mediaType], w.year, w.byline].filter(Boolean).join(" · ");
}

/**
 * 19a — the format track: one glass track, four equal segments in mono, the
 * selected one a lighter fill. Todo is Descubrir's home; Cine, Series and
 * Música open that format's own page in place (format-pages.tsx, 2a–2c).
 */
export function KindTrack({
  value,
  onSelect,
  surface = "bg-[var(--glass-bg)]",
}: {
  value: KindTab;
  onSelect: (k: KindTab) => void;
  /** The track's fill — Todo (3a) sets it on dark glass so its tint shows through. */
  surface?: string;
}) {
  return (
    <div role="tablist" aria-label="Formato" className={`flex gap-1 rounded-full p-[5px] ${surface}`}>
      {KIND_TABS.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(t.key)}
            className={`min-h-10 flex-1 rounded-full font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
              on ? "bg-white/[0.1] text-text" : "text-text-2 hover:text-text"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 19f / 27a — the filter as separate pills. `tone="glass"` is the search
 * screen's (selected = a stronger glass); `tone="solid"` is the add sheet's
 * (selected = `--text` on `--bg`, 36 tall).
 */
export function KindPills({
  value,
  onSelect,
  tone = "glass",
  className = "",
}: {
  value: KindTab;
  onSelect: (k: KindTab) => void;
  tone?: "glass" | "solid";
  className?: string;
}) {
  const solid = tone === "solid";
  return (
    <div role="tablist" aria-label="Formato" className={`bl-scroll flex gap-2 overflow-x-auto ${className}`}>
      {KIND_TABS.map((t) => {
        const on = t.key === value;
        const skin = solid
          ? on
            ? "bg-text text-bg"
            : "bg-white/[0.08] text-text hover:bg-white/[0.12]"
          : on
            ? "bg-white/[0.2] text-text"
            : "bg-[var(--glass-bg)] text-text-2 hover:bg-white/[0.12]";
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(t.key)}
            className={`flex flex-none items-center rounded-full font-mono text-[11px] uppercase transition-colors ${
              solid ? "min-h-9 px-3.5 tracking-[0.08em]" : "h-10 px-4 tracking-[0.1em]"
            } ${skin}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- glifos */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden className="flex-none">
      <path d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" />
    </svg>
  );
}

export function CloseGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden className="flex-none">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function RecentGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" {...STROKE} aria-hidden className="flex-none">
      <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2" />
    </svg>
  );
}

export function PlusGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden className="flex-none">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckStroke({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} strokeWidth={2.4} aria-hidden className="flex-none">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The failure triangle (§estados · error) — neutral ink, never red. */
export function TriangleGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden className="flex-none">
      <path d="M12 4l9 16H3zM12 10v4M12 17.2v.1" />
    </svg>
  );
}

/* ---------------------------------------------------------------- filas */

/**
 * A row's cover, centered in a fixed slot so titles line up whatever the
 * format: 44×66 poster / 44×44 disc in a 48 slot (19f), 40×60 / 44×44 in a
 * 44×60 slot (27a/27b).
 */
export function RowCover({
  posterUrl,
  paletteHex,
  mediaType,
  size = "result",
}: {
  posterUrl: string | null;
  paletteHex?: readonly string[] | null;
  mediaType: MediaType;
  size?: "result" | "add";
}) {
  const album = mediaType === "album";
  const h = size === "result" ? (album ? 44 : 66) : album ? 44 : 60;
  return (
    <span className={`flex flex-none items-center justify-center ${size === "result" ? "w-12" : "h-[60px] w-11"}`}>
      <Cover
        posterUrl={posterUrl}
        paletteHex={paletteHex}
        mediaType={mediaType}
        radius="rounded-[var(--r-cover-s)]"
        style={{ height: h }}
      />
    </span>
  );
}

/**
 * The typed text in a title, the rest dimmed (19e / 27b): the match in
 * `--text` 600, everything else `--text-2`. No match → the plain title.
 */
export function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return text;
  return (
    <span className="text-text-2">
      {text.slice(0, at)}
      <b className="font-semibold text-text">{text.slice(at, at + q.length)}</b>
      {text.slice(at + q.length)}
    </span>
  );
}

/** The skeleton's pulse — shared from `kura/components` (re-exported for
 *  Descubrir's existing imports). */
export { SKELETON_PULSE } from "@/components/kura/components";
