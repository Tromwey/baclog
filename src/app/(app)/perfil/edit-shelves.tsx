"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil } from "lucide-react";
import { Sheet } from "@/components/ui";
import {
  VisibilitySegments,
  visibilityOf,
} from "@/components/backlog-visibility-segments";
import type { BacklogVisibility } from "@/app/actions/backlog-actions";
import {
  ShelfCard,
  shelfSeed,
} from "@/app/(app)/backlogs/backlog-shelf-card";
import { plural } from "@/lib/plural";

/**
 * F3.10.1 — the profile's "Tus backlogs" section AND its escaparate editor,
 * one client component so every affordance opens the same sheet: the Editar
 * chip in the header (a real chip now — the first pass hid it in 9.5px
 * tertiary mono and the founder couldn't find it), the "+N solo para ti"
 * line, and the empty-state note.
 *
 * The sheet holds up at volume: a live count summary orients ("2 en tu perfil
 * · 1 público · 4 privados"), and past 8 backlogs a filter input appears —
 * the house threshold where typing starts beating scanning (the
 * backlog-choice-list lesson). Row order stays stable on toggle (newest
 * first, same as everywhere): rows that jump between groups under your
 * finger are worse than no grouping.
 *
 * Optimistic per row, with the FollowButton lesson applied: the action can
 * REJECT (not just return {error}), so both paths revert. Closing after any
 * change refreshes the route so the server-rendered shelves match.
 */

interface EditableBacklog {
  id: string;
  name: string;
  itemCount: number;
  paletteHex: string[];
  isPublic: boolean;
  showOnProfile: boolean;
}

const FILTER_THRESHOLD = 8;

/** Case- and accent-insensitive, so "cancion" finds "Canción". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function ShelvesSection({ backlogs }: { backlogs: EditableBacklog[] }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [states, setStates] = useState<Record<string, BacklogVisibility>>(() =>
    Object.fromEntries(backlogs.map((b) => [b.id, visibilityOf(b)])),
  );
  const dirty = useRef(false);
  const router = useRouter();

  // The section's own view of "featured" follows the LIVE toggles, so the
  // shelves react while the sheet is still open — no stale mirror behind it.
  const featured = backlogs.filter((b) => states[b.id] === "featured");
  const hiddenCount = backlogs.length - featured.length;

  const counts = useMemo(() => {
    const all = Object.values(states);
    return {
      featured: all.filter((s) => s === "featured").length,
      public: all.filter((s) => s === "public").length,
      private: all.filter((s) => s === "private").length,
    };
  }, [states]);

  const shown = filter.trim()
    ? backlogs.filter((b) => fold(b.name).includes(fold(filter)))
    : backlogs;

  function close() {
    setOpen(false);
    setFilter("");
    if (dirty.current) {
      dirty.current = false;
      router.refresh();
    }
  }

  const editChip = (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-[7px] font-mono text-[9px] uppercase tracking-[0.1em] text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
    >
      <Pencil size={11} strokeWidth={2} />
      Editar
    </button>
  );

  return (
    <>
      <div className="mt-7 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-text-3">
          Tus backlogs
        </span>
        {editChip}
      </div>

      {featured.length > 0 ? (
        <div>
          {featured.map((b) => (
            <Link key={b.id} href={`/backlogs/${b.id}`} className="mt-3 block">
              <ShelfCard
                name={b.name}
                itemCount={b.itemCount}
                paletteHex={b.paletteHex}
                seed={shelfSeed(b.id)}
              />
            </Link>
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => setOpen(true)}
              className="mt-3 block w-full text-center font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-3 transition-colors hover:text-text-2"
            >
              +{hiddenCount}{" "}
              {plural(hiddenCount, "backlog solo para ti", "backlogs solo para ti")}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[13.5px] leading-[1.5] text-pretty text-text-2">
          Ninguno en tu perfil todavía — tus {backlogs.length}{" "}
          {plural(backlogs.length, "backlog vive", "backlogs viven")} solo para
          ti.{" "}
          <button
            onClick={() => setOpen(true)}
            className="text-text underline-offset-2 hover:underline"
          >
            Elige cuáles enseñar
          </button>
          .
        </p>
      )}

      {open && (
        <Sheet onClose={close} label="Editar tus backlogs">
          <div className="font-display text-[18px] font-bold tracking-[-0.01em] text-text">
            ¿Qué se ve de tus backlogs?
          </div>
          <p className="mt-1.5 text-[13px] leading-[1.5] text-pretty text-text-2">
            Privado no existe fuera de tu app. Público vive en su link pero no
            en tu perfil. Perfil es tu escaparate.
          </p>

          <p className="mt-3 font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-3">
            {counts.featured} en tu perfil · {counts.public}{" "}
            {plural(counts.public, "público", "públicos")} · {counts.private}{" "}
            {plural(counts.private, "privado", "privados")}
          </p>

          {backlogs.length > FILTER_THRESHOLD && (
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar por nombre…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-3 w-full rounded-full bg-surface-3 px-4 py-[9px] font-sans text-[13.5px] text-text outline-none placeholder:text-text-3"
            />
          )}

          <div className="mt-3 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
            {shown.map((b) => {
              const current = states[b.id];
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-[14px] bg-surface-2 py-[11px] pl-3.5 pr-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {current === "private" && (
                        <Lock size={11} className="flex-none text-text-3" />
                      )}
                      <span className="truncate text-[13.5px] font-semibold text-text">
                        {b.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-3">
                      {b.itemCount} {plural(b.itemCount, "ítem", "ítems")}
                    </span>
                  </span>
                  <VisibilitySegments
                    backlogId={b.id}
                    initial={current}
                    onSync={(next) => {
                      dirty.current = true;
                      setStates((s) => ({ ...s, [b.id]: next }));
                    }}
                  />
                </div>
              );
            })}
            {shown.length === 0 && (
              <p className="py-3 text-center text-[13px] text-text-3">
                Ningún backlog se llama así.
              </p>
            )}
          </div>

          <p className="mt-3 font-mono text-[8.5px] uppercase tracking-[0.1em] leading-[1.6] text-text-3">
            Lo que hagas con un título (completar, reseñar) sigue las reglas de
            tu cuenta, no del backlog
          </p>
        </Sheet>
      )}
    </>
  );
}
