"use client";

import { useRouter } from "next/navigation";
import type { MediaType } from "@/modules/catalog/types";
import { Sheet, SheetClose } from "@/components/ui";
import { Cover, GLASS_BUTTON, SOLID_BUTTON } from "@/components/kura/components";
import { tintCard } from "@/components/kura/tint";
import { KIND_SHORT } from "./kura-bits";

export interface FirstItemCelebration {
  title: string;
  mediaType: MediaType;
  year: number | null;
  posterUrl: string | null;
  /** Cover-derived hexes — the colour this title is about to give the collection. */
  paletteHex: string[];
  backlogId: string;
  backlogName: string;
}

/**
 * The first title of an account — shown ONCE, right after it lands (and after
 * the sheet that saved it has left: never two sheets at a time).
 *
 * The empty collection promises that its covers will colour it (§color: "la
 * portada es la única fuente de color"); this is where that promise is kept
 * in view: the collection's own surface, tinted by the cover that just
 * arrived, with the cover on it. Two honest exits: go see it (solid — the
 * action that closes the moment), or keep saving.
 *
 * Only ever mounted after a SUCCESSFUL save; a failed one says so on its row.
 */
export function FirstItemSheet({
  item,
  onDismiss,
}: {
  item: FirstItemCelebration;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const meta = [KIND_SHORT[item.mediaType], item.year].filter(Boolean).join(" · ");

  return (
    <Sheet onClose={onDismiss} variant="center" label="Tu primer título guardado">
      <div className="flex flex-col">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          Primer título guardado
        </span>

        <div
          className="mt-4 flex items-end gap-4 rounded-[var(--r-surface)] p-4"
          style={{ background: tintCard(item.paletteHex) }}
        >
          <Cover
            posterUrl={item.posterUrl}
            paletteHex={item.paletteHex}
            mediaType={item.mediaType}
            alt={item.title}
            radius="rounded-[var(--r-cover-s)]"
            style={{ height: 90 }}
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
              {item.backlogName}
            </span>
            <span className="line-clamp-2 font-serif text-[19px] italic leading-[1.1] text-text">
              {item.title}
            </span>
            {meta && (
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
                {meta}
              </span>
            )}
          </div>
        </div>

        <p className="mt-5 font-display text-[22px] leading-[1.15] text-text text-balance">
          tu colección ya tiene color.
        </p>
        <p className="mt-2 text-[15px] leading-[1.5] text-text-2 text-pretty">
          {item.backlogName} toma el color de {item.title}. Cada portada que
          guardes lo va cambiando.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => router.push(`/backlogs/${item.backlogId}`)}
            className={`${SOLID_BUTTON} w-full`}
          >
            <span className="truncate">Ver {item.backlogName}</span>
          </button>
          <SheetClose className={`${GLASS_BUTTON} w-full`}>Seguir guardando</SheetClose>
        </div>
      </div>
    </Sheet>
  );
}
