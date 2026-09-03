"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { removeMembershipAction } from "@/app/actions/backlog-item-actions";
import { CoverTile } from "@/components/cover-tile";
import { CHECK_PATH, PLUS_PATH } from "@/components/glyph-paths";
import { Segmented, StrokeIcon, coverState } from "@/components/ui";
import type { MediaType } from "@/modules/catalog/types";
import { isUpcoming, shortWait } from "@/modules/catalog/release";

/**
 * The backlog detail's body (Revamp UI screen 03, 2026-09-03): the tabs
 * (Pendientes · Completos · Estrenos), the "Seleccionar" row, the 3-column
 * grid of covers and — floating over the bottom fade — the "Agregar título"
 * button, which turns into "Quitar N" while selecting.
 *
 * Client because the tab and the selection are local state. Selection
 * replaces the old swipe-to-remove rows: tap covers to pick them, "Quitar N"
 * drops each membership (removeMembershipAction — per-backlog, the title's
 * state survives in its other backlogs) and refreshes.
 *
 * There is no reorder (the mock's "Mantén pulsado para reordenar"): nothing
 * persists an order yet, so the left slot of that row is left empty rather
 * than promising a gesture that does nothing.
 *
 * The floating layer is PORTALED to <body>: the intercepted overlay's shell
 * keeps a transform after its bloom (bl-zoom-in, fill both), which would
 * turn a `fixed` child into an absolute one that scrolls away.
 */

export interface GridItem {
  backlogItemId: string;
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
  status: string;
  verdict: "liked" | "disliked" | null;
  obsessed: boolean;
  /** ISO string or null. */
  releaseDate: string | null;
}

type Tab = "pending" | "done" | "upcoming";

const KIND: Record<MediaType, string> = {
  film: "Cine",
  series: "Serie",
  album: "Álbum",
};

const EMPTY: Record<Tab, string> = {
  pending: "Todo completo por aquí.",
  done: "Aún no completas nada de este backlog.",
  upcoming: "Nada por estrenarse en este backlog.",
};

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function BacklogGrid({
  backlogId,
  items,
  now,
  className = "",
}: {
  backlogId: string;
  items: GridItem[];
  /** The render instant every wait pill is measured from. */
  now: number;
  className?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();

  const tabOf = (it: GridItem): Tab =>
    isUpcoming(it.releaseDate, now)
      ? "upcoming"
      : it.status === "completed"
        ? "done"
        : "pending";
  const counts: Record<Tab, number> = { pending: 0, done: 0, upcoming: 0 };
  for (const it of items) counts[tabOf(it)] += 1;
  const shown = items.filter((it) => tabOf(it) === tab);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  function removeSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      for (const id of ids) {
        await removeMembershipAction(id);
      }
      exitSelect();
      router.refresh();
    });
  }

  const hasItems = items.length > 0;

  return (
    <div className={className}>
      {hasItems && (
        <>
          <div className="px-5 pb-[18px]">
            <Segmented
              ariaLabel="Filtrar títulos"
              segments={[
                { key: "pending", label: `Pendientes · ${counts.pending}` },
                { key: "done", label: `Completos · ${counts.done}` },
                { key: "upcoming", label: `Estrenos · ${counts.upcoming}` },
              ]}
              value={tab}
              onSelect={(k) => setTab(k as Tab)}
            />
          </div>

          <div className="flex items-center justify-between px-6 pb-3">
            {/* Left slot: the mock's reorder hint. Empty until an order exists. */}
            <span />
            <button
              type="button"
              onClick={() => (selecting ? exitSelect() : setSelecting(true))}
              className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-2 transition-colors hover:text-text"
            >
              {selecting ? "Listo" : "Seleccionar"}
            </button>
          </div>

          {shown.length === 0 ? (
            <p className="px-6 pt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
              {EMPTY[tab]}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 px-5">
              {shown.map((it) => {
                const upcoming = isUpcoming(it.releaseDate, now);
                const wait =
                  upcoming && it.releaseDate ? shortWait(it.releaseDate, now) : null;
                const meta = [KIND[it.mediaType], it.year, wait]
                  .filter((v) => v !== null && v !== undefined)
                  .join(" · ");
                const isDone = it.status === "completed";
                const isSelected = selected.has(it.backlogItemId);
                const tile = (
                  <CoverTile
                    posterUrl={it.posterUrl}
                    paletteHex={it.paletteHex}
                    alt={`Portada de ${it.title}`}
                    wait={wait}
                    state={coverState(it)}
                    done={selecting ? !isSelected : isDone}
                    className="aspect-[3/4] w-full"
                  >
                    {selecting && isSelected && (
                      <span className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent text-bg">
                        <StrokeIcon d={CHECK_PATH} size={12} strokeWidth={3.2} />
                      </span>
                    )}
                  </CoverTile>
                );
                const text = (
                  <>
                    <span className="truncate font-serif text-[14px] italic leading-[1.1] text-text">
                      {it.title}
                    </span>
                    <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
                      {meta}
                    </span>
                  </>
                );
                return selecting ? (
                  <button
                    key={it.backlogItemId}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggle(it.backlogItemId)}
                    className="flex min-w-0 flex-col gap-1.5 text-left"
                  >
                    {tile}
                    {text}
                  </button>
                ) : (
                  <Link
                    key={it.backlogItemId}
                    href={`/item/${it.catalogItemId}`}
                    className="flex min-w-0 flex-col gap-1.5"
                  >
                    {tile}
                    {text}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {!hasItems && (
        /* Backlog en blanco — the mock defers empty states; the copy stays,
           laid out in this screen's voice. The floating button below is the
           add affordance. */
        <div className="flex flex-col items-center px-[30px] pt-6 text-center">
          <p className="font-serif text-[26px] italic leading-[1.2]">
            Este backlog está en blanco.
          </p>
          <p className="mt-3 max-w-[30ch] text-sm leading-[1.55] text-text-2">
            Agrega una película, serie o álbum — su color llenará el aura del
            backlog.
          </p>
          <Link
            href="/para-ti"
            className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-2 transition-colors hover:text-text"
          >
            Explorar Para ti
          </Link>
        </div>
      )}

      <FloatingAction
        selecting={selecting}
        count={selected.size}
        pending={pending}
        onRemove={removeSelected}
        addHref={`/descubrir?buscar=1&to=${backlogId}`}
      />
    </div>
  );
}

const FLOAT =
  "pointer-events-auto flex items-center gap-2 rounded-full bg-[rgba(20,20,26,.45)] px-[26px] py-4 font-sans text-[14px] font-semibold text-text shadow-[0_14px_44px_rgba(0,0,0,.55)] backdrop-blur-[26px] backdrop-saturate-[1.7]";

/**
 * The bottom fade + the floating button (mock 129), portaled to <body>. The
 * fade is 140px of bg rising from the screen's bottom edge; the button sits
 * 34px above it, plus the safe area.
 */
function FloatingAction({
  selecting,
  count,
  pending,
  onRemove,
  addHref,
}: {
  selecting: boolean;
  count: number;
  pending: boolean;
  onRemove: () => void;
  addHref: string;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[140px]"
        style={{ background: "linear-gradient(rgba(11,11,13,0), var(--bg) 70%)" }}
      />
      <div className="relative mb-[calc(34px+env(safe-area-inset-bottom))]">
        {selecting ? (
          <button
            type="button"
            disabled={count === 0 || pending}
            onClick={onRemove}
            className={`${FLOAT} disabled:opacity-40`}
          >
            {pending ? "Quitando…" : `Quitar ${count}`}
          </button>
        ) : (
          <Link href={addHref} className={FLOAT}>
            <StrokeIcon d={PLUS_PATH} size={14} strokeWidth={2.6} />
            Agregar título
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
}
