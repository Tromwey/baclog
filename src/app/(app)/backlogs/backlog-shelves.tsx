"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AuraField } from "@/components/ui";

export interface Shelf {
  id: string;
  name: string;
  itemCount: number;
  /** The backlog's ADN — dominant colors of its items (lima fallback). */
  paletteHex: string[];
  /** The backlog's items — the zoom IS the list; each row opens the item. */
  items: { catalogItemId: string; title: string }[];
}

/**
 * The Backlogs shelves + their zoom (M3.5). Each shelf is a band of the
 * backlog's ADN aura with its name; tapping it zooms into a detail overlay
 * where the aura blooms and the items are revealed. "Abrir" hands off to the
 * full /backlogs/[id] page for management.
 */
export function BacklogShelves({ shelves }: { shelves: Shelf[] }) {
  const [open, setOpen] = useState<Shelf | null>(null);

  return (
    <>
      <div className="px-[22px]">
        {shelves.map((sh) => (
          <button
            key={sh.id}
            onClick={() => setOpen(sh)}
            className="mt-4 block w-full text-left"
          >
            <div className="relative flex h-28 flex-col items-center justify-center overflow-hidden rounded-[26px] border border-white/10 bg-bg px-5 text-center">
              <AuraField variant="shelf" colors={sh.paletteHex} seed={seed(sh.id)} />
              <div className="relative font-serif text-[29px] italic leading-[1.04] text-text [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]">
                {sh.name}
              </div>
              <div className="relative mt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-text/80 [text-shadow:0_1px_10px_rgba(0,0,0,0.65)]">
                {meta(sh)}
              </div>
            </div>
          </button>
        ))}
      </div>
      {open && <ShelfDetail shelf={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ShelfDetail({ shelf, onClose }: { shelf: Shelf; onClose: () => void }) {
  return (
    <div
      className="bl-zoom-in fixed inset-0 z-50 overflow-y-auto bg-bg"
      style={{ transformOrigin: "50% 32%" }}
    >
      <div className="relative h-80 overflow-hidden">
        <div className="bl-zoom-aura absolute inset-0">
          <AuraField variant="ambient" colors={shelf.paletteHex} seed={seed(shelf.id)} />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,11,13,0.15) 0%, transparent 34%, rgba(11,11,13,0.55) 74%, #0B0B0D 100%)",
          }}
        />
        <div className="bl-zoom-content absolute inset-x-4 top-[calc(20px+env(safe-area-inset-top))] flex items-center justify-between">
          <button
            onClick={onClose}
            aria-label="Volver"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-text backdrop-blur-[10px]"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="w-9" />
        </div>
        <div className="bl-zoom-content absolute inset-x-[22px] bottom-5">
          <div className="font-serif text-[42px] italic leading-none">
            {shelf.name}
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.07em] text-text/80">
            {meta(shelf)}
          </div>
        </div>
      </div>

      <div className="bl-zoom-content px-[22px] pb-[calc(24px+env(safe-area-inset-bottom))] pt-[18px]">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
          En este backlog
        </div>
        <div className="mt-2">
          {shelf.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-3">
              Este backlog está vacío.
            </p>
          ) : (
            shelf.items.map((it, i) => (
              <div
                key={it.catalogItemId}
                className="flex items-center gap-2 border-b border-[#1f1f26]"
              >
                {/* Default tap → open in the user's preferred app (deep link). */}
                <a
                  href={`/api/links/resolve?catalogItemId=${it.catalogItemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-start gap-3 py-[11px]"
                >
                  <span className="w-[18px] shrink-0 pt-1.5 font-mono text-[9px] text-text-3">
                    {pad(i + 1)}
                  </span>
                  <span className="min-w-0 flex-1 font-serif text-[19px] italic">
                    {it.title}
                  </span>
                </a>
                {/* Chevron → the item's detail screen ("ver más"). */}
                <Link
                  href={`/item/${it.catalogItemId}`}
                  aria-label={`Ver más de ${it.title}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors hover:text-text"
                >
                  <ChevronRight size={18} />
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Deterministic seed from the backlog id, so the aura is stable per backlog. */
function seed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pad = (n: number) => String(n).padStart(2, "0");

const meta = (sh: Shelf) =>
  `${pad(sh.itemCount)} ${sh.itemCount === 1 ? "TÍTULO" : "TÍTULOS"}`;
