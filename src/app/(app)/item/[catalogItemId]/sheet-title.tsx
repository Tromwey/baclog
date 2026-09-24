import { Cover } from "@/components/kura/components";
import type { MediaType } from "@/modules/catalog/types";

/** What a ficha sheet shows of its title (19h / 26a header). */
export interface SheetWork {
  id: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  byline: string | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
}

const KIND: Record<MediaType, string> = { film: "Cine", series: "Serie", album: "Álbum" };

/** "Cine · 1997 · Miyazaki" — the sheet's mono line under the title. */
export function sheetMeta(work: SheetWork): string {
  return [KIND[work.mediaType], work.year, work.byline].filter(Boolean).join(" · ");
}

/**
 * The title block at the top of a ficha sheet (19h "guardar en", O10a
 * Opciones): the small cover (44 wide, native aspect), the title in Newsreader
 * italic 20 and the mono meta line.
 */
export function SheetTitleBlock({ work }: { work: SheetWork }) {
  return (
    <div className="flex items-center gap-3.5 px-2 pb-3">
      <Cover
        posterUrl={work.posterUrl}
        paletteHex={work.paletteHex}
        mediaType={work.mediaType}
        radius="rounded-[var(--r-cover-s)]"
        className="w-11"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="truncate font-serif text-[20px] italic leading-[1.1] text-text">{work.title}</span>
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {sheetMeta(work)}
        </span>
      </div>
    </div>
  );
}
