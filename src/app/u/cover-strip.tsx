import Link from "next/link";
import { CoverTile, coverAspect } from "@/components/cover-tile";
import type { MediaType } from "@/modules/catalog/types";

/**
 * A labelled strip of covers with the title printed on each (Revamp UI
 * 09/10, 2026-09-03): "Obsesiones actuales" on /perfil (170px), "En común
 * contigo" on a public profile (150px). Native aspect, radius 14, bleeding
 * to the screen edge with the mock's `pb-[34px] -mb-[26px]` so the shadows
 * have room without adding height. Renders nothing when empty.
 */
export interface StripTile {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
}

export function CoverStrip({
  label,
  items,
  height,
  itemHref,
  className = "",
}: {
  label: string;
  items: StripTile[];
  height: "h-[170px]" | "h-[150px]";
  itemHref: (catalogItemId: string) => string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-baseline gap-2.5 px-6">
        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
          {label}
        </h2>
      </div>
      <div className="bl-scroll -mb-[26px] flex gap-2.5 overflow-x-auto px-5 pb-[34px] pt-1">
        {items.map((it) => (
          <Link key={it.catalogItemId} href={itemHref(it.catalogItemId)} className="flex-none">
            <CoverTile
              posterUrl={it.posterUrl}
              paletteHex={it.paletteHex}
              alt={`Portada de ${it.title}`}
              title={it.title}
              radius="rounded-[14px]"
              className={`${height} ${coverAspect(it.mediaType)} shadow-[0_18px_40px_-12px_rgba(0,0,0,.7)]`}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
