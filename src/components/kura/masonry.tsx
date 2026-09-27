"use client";

import Link from "next/link";
import { posterFallbackStyle } from "@/components/cover-tile";
import type { MediaType } from "@/modules/catalog/types";
import { Glyph, type GlyphKind } from "./components";
import { useHold } from "./use-hold";

/**
 * "Títulos en columnas" (Colecciones formalizado): a collection's titles in
 * three independent columns — records 1:1 and posters 2:3 stack without gaps
 * (CSS columns, so the reading order runs down each column). Each tile: the
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
  return (
    <div className={`columns-3 gap-x-3 px-5 ${className}`}>
      {items.map((it) => (
        <Tile key={it.key} it={it} onHold={onHold} />
      ))}
    </div>
  );
}

function Tile({ it, onHold }: { it: MasonryItem; onHold?: (key: string) => void }) {
  const { handlers } = useHold(() => onHold?.(it.key));
  return (
    <Link
      href={it.href}
      {...(onHold ? handlers : {})}
      className="mb-[18px] flex select-none flex-col gap-1.5 [break-inside:avoid] bl-press [-webkit-touch-callout:none]"
    >
      <span
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
