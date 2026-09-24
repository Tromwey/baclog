import Link from "next/link";
import type { MediaType } from "@/modules/catalog/types";
import { Cover } from "./kura/components";
import { releaseLabel } from "./kura/tint";

/**
 * "no puedo esperar" as a section (Kura, 2026-09-24): the titles that haven't
 * come out yet, nearest first, at ONE height (150) in their native format,
 * each wearing the countdown pill (lavender clock + "3 d" / "14 h" / "16 oct"
 * — `releaseLabel`), the title in italic under it. No glow: the covers are
 * the colour.
 *
 * NOTHING here is user-activated: an item enters and leaves by its own date,
 * so there's no empty state — with nothing upcoming the section is absent.
 * Tus colecciones shows the same set as the automatic collection card
 * (backlogs/collection-cards.tsx); this section form is for other screens.
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
  heading = "no puedo esperar",
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

  const count = `${items.length} ${items.length === 1 ? "título" : "títulos"}`;

  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className={`flex items-baseline justify-between gap-3 ${inset}`}>
        <h2 className="font-brand text-[24px] font-normal leading-[1.1] text-text">{heading}</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{count}</span>
      </div>

      <div className="bl-scroll flex items-end gap-2.5 overflow-x-auto px-5 pb-1">
        {items.map((it) => (
          <Link
            key={it.catalogItemId}
            href={itemHref(it.catalogItemId)}
            className="flex flex-none flex-col gap-[7px] bl-press-lg"
            style={{ width: it.mediaType === "album" ? 150 : 100 }}
          >
            <Cover
              posterUrl={it.posterUrl}
              paletteHex={it.paletteHex}
              mediaType={it.mediaType}
              alt={`Portada de ${it.title}`}
              wait={releaseLabel(it.releaseDate, initialNow)}
              style={{ height: 150 }}
            />
            <span className="truncate font-brand text-[14px] italic leading-[1.15] text-text">
              {it.title}
            </span>
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
              {KIND[it.mediaType]}
            </span>
          </Link>
        ))}
        <span className="w-2 flex-none" />
      </div>
    </section>
  );
}
