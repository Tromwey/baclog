import Link from "next/link";
import type { MediaType } from "@/modules/catalog/types";
import { releaseDayShort, shortWait } from "@/modules/catalog/release";
import { CoverTile } from "./cover-tile";
import { PaletteGlow, mixHexes } from "./ui/palette-glow";

/**
 * "No puede esperar" (F3.8, redrawn for the Revamp UI 2026-09-03): the titles
 * that haven't come out yet, nearest first, as a strip of 104×139 covers, each
 * wearing its wait as a lima pill ("faltan 12 d"), the title in serif under
 * it and the storefront day + kind in mono. The whole section sits on a glow
 * mixed from the covers' palettes (the mock's `waitGlow`, .3, blur 70).
 *
 * ONE form for every surface (backlogs list, a backlog, own profile, public
 * profile) — the wait should look like the wait wherever you meet it.
 *
 * NOTHING here is user-activated. An item enters and leaves purely by its own
 * date; when the clock hits zero it drops out and goes back to being an
 * ordinary cover. So there's no empty state and no "add" affordance: with
 * nothing upcoming, the section doesn't render at all.
 *
 * The strip bleeds to the screen edge on purpose (covers should run off it,
 * not stop short), so it carries its own px-5 and expects to sit in a
 * container WITHOUT horizontal padding. The mock's `padding-bottom:30px;
 * margin-bottom:-26px` trick gives the shadows room without adding height.
 */

export interface UpcomingItem {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex?: readonly string[] | null;
  /** ISO string — always in the future for anything in this list. */
  releaseDate: string;
}

const KIND: Record<MediaType, string> = {
  film: "cine",
  series: "serie",
  album: "álbum",
};

export function UpcomingShelf({
  items,
  initialNow,
  heading = "No puede esperar",
  itemHref = (id: string) => `/item/${id}`,
  className = "",
  /** The header's side padding: 20 on list screens, 24 on hero screens. */
  inset = "px-5",
}: {
  items: UpcomingItem[];
  initialNow: number;
  heading?: string;
  itemHref?: (catalogItemId: string) => string;
  className?: string;
  inset?: "px-5" | "px-6";
}) {
  if (items.length === 0) return null;

  const count = `${items.length} ${items.length === 1 ? "estreno" : "estrenos"}`;
  const glow = mixHexes(items.map((it) => it.paletteHex ?? []));

  return (
    <section className={`relative flex flex-col gap-3 pb-[30px] ${className}`}>
      <PaletteGlow hexes={glow} angle={110} opacity={0.3} className="inset-x-0 -inset-y-2.5" />
      <div className={`relative flex items-baseline gap-2 ${inset}`}>
        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent">
          {heading}
        </h2>
        <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
          {count}
        </span>
      </div>

      <div className="bl-scroll relative -mb-[26px] flex items-end gap-2.5 overflow-x-auto px-5 pb-[30px] pt-1">
        {items.map((it) => (
          <Link
            key={it.catalogItemId}
            href={itemHref(it.catalogItemId)}
            className="flex w-[104px] flex-none flex-col gap-[7px]"
          >
            <CoverTile
              posterUrl={it.posterUrl}
              paletteHex={it.paletteHex}
              alt={`Portada de ${it.title}`}
              wait={shortWait(it.releaseDate, initialNow)}
              waitAt="bottom"
              className="h-[139px] w-[104px]"
            />
            <span className="truncate font-serif text-[14px] italic leading-[1.1] text-text">
              {it.title}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
              {releaseDayShort(it.releaseDate)} · {KIND[it.mediaType]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
