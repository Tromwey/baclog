"use client";

import { useRouter } from "next/navigation";
import { MEDIA_TYPE_LABEL, type MediaType } from "@/modules/catalog/types";
import { Sheet } from "@/components/ui";

export interface FirstItemCelebration {
  title: string;
  mediaType: MediaType;
  year: number | null;
  posterUrl: string | null;
  /** Cover-derived hexes — the aura this title is about to hand the backlog. */
  paletteHex: string[];
  backlogId: string;
  backlogName: string;
}

/**
 * The closing moment of step 2 — shown ONCE in the life of an account, when the
 * first title lands.
 *
 * It exists because the empty backlog promises "su color llenará el aura del
 * backlog" and, until now, nothing ever collected on that: the user got a ✓ in
 * a results list and no one walked them to the aura. So this sheet shows the
 * palette that was just extracted from the cover — the aura about to ignite —
 * and offers the two honest exits: go look at it, or keep adding.
 *
 * Only ever mounted after a SUCCESSFUL add. A failed add gets the retry line on
 * its own row instead; we don't celebrate what wasn't saved.
 */
export function FirstItemSheet({
  item,
  onDismiss,
}: {
  item: FirstItemCelebration;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const meta = [MEDIA_TYPE_LABEL[item.mediaType], item.year]
    .filter(Boolean)
    .join(" · ");
  // Albums are square; everything else is a poster (same rule as the item page).
  const coverSize =
    item.mediaType === "album" ? "h-[74px] w-[74px]" : "h-[90px] w-[66px]";

  return (
    // `center` (glass, centered) against the routine sheets' opaque bottom —
    // that contrast IS the signal: this is the one celebration in the flow.
    <Sheet
      onClose={onDismiss}
      variant="center"
      label="Tu primer título guardado"
    >
      <div>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-1.5 w-1.5 flex-none rounded-full bg-hot"
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-2">
            Primer título guardado
          </span>
        </div>

        <div className="mt-5 flex items-end gap-4">
          {item.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
            <img
              src={item.posterUrl}
              alt=""
              className={`flex-none rounded-[10px] object-cover shadow-[var(--shadow-card)] ${coverSize}`}
            />
          ) : (
            <div
              className={`flex flex-none items-center justify-center rounded-[10px] bg-surface-2 text-2xl text-text-3 ${coverSize}`}
            >
              {item.mediaType === "album" ? "♫" : "▶"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* The extracted palette IS the payoff preview — no palette (a
                  cover that wouldn't decode), no swatch row, and the sheet
                  still reads. */}
            {item.paletteHex.length > 0 && (
              <>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
                  Aura · paleta extraída
                </p>
                <div aria-hidden className="mt-2 flex gap-1">
                  {item.paletteHex.slice(0, 4).map((hex) => (
                    <span
                      key={hex}
                      className="h-[10px] flex-1 rounded-full"
                      style={{ background: hex }}
                    />
                  ))}
                </div>
              </>
            )}
            {meta && (
              <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
                {meta}
              </p>
            )}
          </div>
        </div>

        <p className="mt-[22px] font-serif text-[28px] italic leading-[1.1]">
          Tu backlog ya tiene color.
        </p>
        <p className="mt-3 text-[15px] leading-[1.5] text-text-2">
          {item.backlogName} tomó el color de {item.title}. Cada título que
          agregues mueve el aura.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={() => router.push(`/backlogs/${item.backlogId}`)}
            className="flex items-center justify-center rounded-full bg-accent px-5 py-4 text-base font-semibold text-bg transition-transform active:scale-[0.98]"
          >
            <span className="truncate">Ver {item.backlogName}</span>
          </button>
          <button
            onClick={onDismiss}
            className="flex items-center justify-center rounded-full bg-white/[0.06] px-5 py-3.5 text-[15px] font-medium text-text transition-colors hover:bg-white/[0.12]"
          >
            Seguir agregando
          </button>
        </div>
      </div>
    </Sheet>
  );
}
