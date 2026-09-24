"use client";

import Link from "next/link";
import { useState } from "react";
import type { MediaType } from "@/modules/catalog/types";
import { Cover, type GlyphKind } from "@/app/u/kura/components";

/**
 * Kura · the body of a shared collection (flujos-v2 · 33b, same rules as the
 * app's 17a/b/c): the format pills under the header — glyph + count, one per
 * format the collection holds — FILTER what is shown; and the layout adapts:
 * when two or more formats are shown and each has at least three titles, the
 * shelf GROUPS by format (a Newsreader 24 header and a strip of covers at
 * 150 per format); otherwise it is one shelf, covers at 132 aligned to the
 * base, each with its title in Newsreader italic 14. Client-side only for
 * the filter state; everything else came rendered from the server.
 */

export interface ShelfItem {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
  glyph: GlyphKind | null;
  wait: string | null;
}

const FORMAT: { id: MediaType; label: string; group: string; icon: string }[] = [
  { id: "film", label: "películas", group: "cine", icon: "M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4" },
  { id: "series", label: "series", group: "series", icon: "M3 7h18v12H3zM8 3l4 4 4-4" },
  { id: "album", label: "álbumes", group: "álbumes", icon: "M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z" },
];

function Tile({ item, height, href }: { item: ShelfItem; height: number; href: string }) {
  const w = item.mediaType === "album" ? height : Math.round((height * 2) / 3);
  return (
    <Link href={href} className="flex flex-none flex-col gap-[7px] bl-press-lg" style={{ width: w }}>
      <Cover
        posterUrl={item.posterUrl}
        paletteHex={item.paletteHex}
        mediaType={item.mediaType}
        alt={item.title}
        glyph={item.glyph}
        wait={item.wait}
        style={{ width: w, height }}
      />
      <span className="truncate font-brand text-[14px] italic leading-[1.15] text-text">{item.title}</span>
    </Link>
  );
}

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
  const present = FORMAT.map((f) => ({ ...f, n: items.filter((i) => i.mediaType === f.id).length })).filter((f) => f.n > 0);
  const shown = only ? items.filter((i) => i.mediaType === only) : items;
  const kindsShown = present.filter((f) => shown.some((i) => i.mediaType === f.id));
  const grouped = kindsShown.length >= 2 && kindsShown.every((f) => shown.filter((i) => i.mediaType === f.id).length >= 3);

  return (
    <>
      {present.length > 1 && (
        <div className="-mt-4 flex flex-wrap justify-center gap-1.5 px-6 pb-7">
          {present.map((f) => {
            const sel = only === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={sel}
                aria-label={`Filtrar: ${f.n} ${f.label}`}
                onClick={() => setOnly(sel ? null : f.id)}
                className={`inline-flex h-10 items-center gap-[7px] rounded-full px-3.5 font-mono text-[12px] text-text transition-colors duration-200 bl-press ${
                  sel ? "bg-white/[0.24]" : "bg-[var(--glass-bg)]"
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={f.icon} />
                </svg>
                {f.n}
              </button>
            );
          })}
        </div>
      )}

      {grouped ? (
        <div className="flex flex-col gap-[30px] pb-2 pt-1">
          {kindsShown.map((f) => (
            <section key={f.id} className="flex flex-col gap-3">
              <h2 className="px-5 font-brand text-[24px] leading-[1.1] text-text">{f.group}</h2>
              <div className="bl-scroll flex items-end gap-3 overflow-x-auto px-5 pb-6">
                {shown
                  .filter((i) => i.mediaType === f.id)
                  .map((it) => (
                    <Tile key={it.catalogItemId} item={it} height={150} href={itemHref(it.catalogItemId)} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-5 px-5 pb-2 pt-1">
          {shown.map((it) => (
            <Tile key={it.catalogItemId} item={it} height={132} href={itemHref(it.catalogItemId)} />
          ))}
        </div>
      )}
    </>
  );
}
