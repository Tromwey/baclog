"use client";

import Link from "next/link";
import { posterFallbackStyle } from "@/components/cover-tile";
import type { MediaType } from "@/modules/catalog/types";
import { Glyph, type GlyphKind } from "./components";
import { launchCoverFlight } from "./cover-flight";
import { useHold } from "./use-hold";

/**
 * "Títulos en columnas" (Colecciones formalizado): a collection's titles in
 * three independent columns — records 1:1 and posters 2:3 stack without gaps,
 * each title dealt in order to the shortest column (`dealColumns`) so the
 * reading runs along the rows and no column is left empty. Each tile: the
 * cover at its native form with the state glyph or the wait pill top-left,
 * the title in Newsreader italic 14 and the year in mono 10.
 *
 * Shared by Tus colecciones, the collection, the automatic one and the
 * shared web page. `onHold` (the owner's 18c sheet) is optional.
 */

export interface MasonryItem {
  key: string;
  href: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
  glyph: GlyphKind | null;
  /** "4 d" / "17 oct" — wins over the glyph. */
  wait: string | null;
  /** The mono line under the title: the year, else the format. */
  sub: string;
  /** The ficha this cover opens (its catalog id): tapping it flies the
   *  cover into the ficha and Volver flies it back (`cover-flight.tsx`). */
  flightKey?: string;
}

const GLYPH_LABEL: Partial<Record<GlyphKind, string>> = {
  obsessed: "Me obsesiona",
  liked: "Me gusta",
  completed: "Completo",
};

export function Masonry({
  items,
  onHold,
  className = "",
}: {
  items: readonly MasonryItem[];
  onHold?: (key: string) => void;
  className?: string;
}) {
  const cols = dealColumns(items);
  return (
    <div className={`flex items-start gap-x-3 px-5 ${className}`}>
      {cols.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col">
          {col.map((it) => (
            <Tile key={it.key} it={it} onHold={onHold} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A tile's height in column widths: the cover (1:1 record, 2:3 poster) plus
 *  the title + mono lines and the 18 px gap (~61 px at a ~104 px column on a
 *  375 phone). An estimate on purpose: measuring in the client would re-deal
 *  after hydration and make the grid jump. */
const TEXT_UNITS = 0.6;
const tileUnits = (it: MasonryItem) => (it.mediaType === "album" ? 1 : 1.5) + TEXT_UNITS;

/**
 * Deal the titles, in order, to the currently shortest of three columns (a
 * tie goes to the leftmost): 1→col 1, 2→col 2, 3→col 3, 4→the shortest…, so
 * the manual order reads along the rows and ≥ 3 titles never leave a column
 * empty (4 equal = 2·1·1). Founder, 2026-09-27 — replaced CSS `columns-3`,
 * which filled 4 records 2·2·0. Twin of iOS `ColumnsLayout` (Masonry.swift),
 * which uses the measured heights.
 */
export function dealColumns<T extends MasonryItem>(items: readonly T[], columns = 3): T[][] {
  const cols: T[][] = Array.from({ length: columns }, () => []);
  const tops = new Array<number>(columns).fill(0);
  for (const it of items) {
    let c = 0;
    for (let i = 1; i < columns; i++) if (tops[i] < tops[c] - 1e-6) c = i;
    cols[c].push(it);
    tops[c] += tileUnits(it);
  }
  return cols;
}

function Tile({ it, onHold }: { it: MasonryItem; onHold?: (key: string) => void }) {
  const { handlers } = useHold(() => onHold?.(it.key));
  return (
    <Link
      href={it.href}
      onClick={
        it.flightKey
          ? (e) => {
              const el = e.currentTarget.querySelector<HTMLElement>("[data-cover-flight]");
              // A new tab / window is not a flight.
              if (el && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey))
                launchCoverFlight({
                  key: it.flightKey!,
                  el,
                  posterUrl: it.posterUrl,
                  paletteHex: it.paletteHex,
                  mediaType: it.mediaType,
                });
            }
          : undefined
      }
      {...(onHold ? handlers : {})}
      className="mb-[18px] flex select-none flex-col gap-1.5 bl-press [-webkit-touch-callout:none]"
    >
      <span
        data-cover-flight={it.flightKey}
        className={`relative block w-full overflow-hidden rounded-[var(--r-cover-l)] bg-surface-2 shadow-cover ${
          it.mediaType === "album" ? "aspect-square" : "aspect-[2/3]"
        }`}
        style={it.posterUrl ? undefined : posterFallbackStyle(it.paletteHex)}
      >
        {it.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
          <img
            src={it.posterUrl}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {it.wait ? (
          <span
            role="img"
            aria-label={`Sale ${/^\d+ [hd]$/.test(it.wait) ? "en" : "el"} ${it.wait}`}
            className="absolute left-1.5 top-1.5 inline-flex h-6 items-center gap-[5px] rounded-full bg-glass-art px-2 font-mono text-[10px] uppercase leading-none tracking-[0.04em] text-text backdrop-blur-[14px]"
          >
            <Glyph kind="waiting" size={12} />
            {it.wait}
          </span>
        ) : it.glyph ? (
          <span
            role="img"
            aria-label={GLYPH_LABEL[it.glyph] ?? ""}
            className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-glass-art backdrop-blur-[14px]"
          >
            <Glyph kind={it.glyph} size={12} />
          </span>
        ) : null}
      </span>
      <span className="truncate font-brand text-[14px] italic leading-[1.15] text-text">{it.title}</span>
      <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">{it.sub}</span>
    </Link>
  );
}
