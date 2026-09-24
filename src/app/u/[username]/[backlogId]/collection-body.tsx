"use client";

import Link from "next/link";
import { useState } from "react";
import type { MediaType } from "@/modules/catalog/types";
import { Cover, type GlyphKind } from "@/app/u/kura/components";

/**
 * Kura · the body of a shared collection (flujos-v2 · 03 "Colección"):
 * the format pills under the header — glyph + count, one per format the
 * collection holds — FILTER the grid, and the grid is the `shelved` layout:
 * three columns of covers aligned to the base, each with its title in
 * Newsreader italic 14 and a mono line under it. Client-side only for the
 * filter state; everything else came rendered from the server.
 */

export interface ShelfItem {
  catalogItemId: string;
  title: string;
  sub: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
  glyph: GlyphKind | null;
  wait: string | null;
}

const FORMAT: { id: MediaType; label: string; icon: string }[] = [
  { id: "film", label: "Cine", icon: "M4 5h16v14H4zM4 9h16M4 15h16M9 5v14M15 5v14" },
  { id: "series", label: "Series", icon: "M3 6h18v11H3zM8 21h8M12 17v4" },
  { id: "album", label: "Música", icon: "M9 18V6l10-2v12M9 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM19 16a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" },
];

export function CollectionBody({
  items,
  username,
  backlogId,
}: {
  items: ShelfItem[];
  username: string;
  backlogId: string;
}) {
  // ?from carries the origin collection so the item page's back returns
  // HERE, not to the profile. Built client-side: a server→client prop can't
  // be a function.
  const itemHref = (id: string) => `/u/${username}/item/${id}?from=${backlogId}`;
  const [only, setOnly] = useState<MediaType | null>(null);
  const counts = FORMAT.map((f) => ({ ...f, n: items.filter((i) => i.mediaType === f.id).length })).filter((f) => f.n > 0);
  const shown = only ? items.filter((i) => i.mediaType === only) : items;

  return (
    <>
      {counts.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1.5 px-6 pb-7">
          {counts.map((f) => {
            const sel = only === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={sel}
                aria-label={`${f.label}, ${f.n}`}
                onClick={() => setOnly(sel ? null : f.id)}
                className={`inline-flex h-10 items-center gap-[7px] rounded-full px-3.5 font-mono text-[12px] text-text transition-colors duration-200 bl-press ${
                  sel ? "bg-white/[0.16]" : "bg-[var(--glass-bg)]"
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={f.icon} />
                </svg>
                {f.label} {f.n}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-3 items-end gap-x-3 gap-y-5 px-5">
        {shown.map((it) => (
          <Link key={it.catalogItemId} href={itemHref(it.catalogItemId)} className="flex min-w-0 flex-col gap-[7px] bl-press-lg">
            <Cover
              posterUrl={it.posterUrl}
              paletteHex={it.paletteHex}
              mediaType={it.mediaType}
              alt={it.title}
              glyph={it.glyph}
              wait={it.wait}
              className="w-full"
            />
            <span className="truncate font-brand text-[14px] italic leading-[1.15] text-text">{it.title}</span>
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">{it.sub}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
