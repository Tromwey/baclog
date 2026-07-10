"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import { addItemAction } from "@/app/actions/backlog-item-actions";
import { extractPalette } from "@/modules/cards/palette";

interface BacklogOption {
  id: string;
  name: string;
}

/**
 * The circular "+" of the fixed bottom action bar (mock #p3). Opens the
 * "¿A cuál backlog?" sheet — portaled to <body> (escapes the (app) wrapper's
 * stacking context) and z-50 so it rises above the z-40 action bar.
 */
export function AddToBacklog({
  catalogItemId,
  posterUrl,
  backlogs,
  inBacklogName,
}: {
  catalogItemId: string;
  posterUrl: string | null;
  backlogs: BacklogOption[];
  /** The backlog this item already lives in, if any — flips the copy. */
  inBacklogName?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  async function addTo(backlogId: string) {
    setBusy(true);
    // F2.15: palette extracted on-device at save time; [] on CORS failure
    const paletteHex = posterUrl ? await extractPalette(posterUrl) : [];
    const res = await addItemAction({
      backlogId,
      catalogItemId,
      paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
    });
    setBusy(false);
    setOpen(false);
    if ("id" in res) {
      setAdded(backlogId);
      router.refresh();
    }
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createBacklogAction({ name: newName });
    const newId = "id" in res ? res.id : null;
    if (newId) {
      const paletteHex = posterUrl ? await extractPalette(posterUrl) : [];
      await addItemAction({
        backlogId: newId,
        catalogItemId,
        paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
      });
      setAdded(newId);
      setOpen(false);
      router.refresh();
    }
    setBusy(false);
  }

  if (added) {
    // Just added — the + becomes a lima check that jumps to the backlog.
    return (
      <button
        onClick={() => router.push(`/backlogs/${added}`)}
        aria-label="Agregado — ver backlog"
        title="Agregado — ver backlog"
        className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-accent text-bg transition-transform active:scale-[0.96]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 12l5 5 11-12"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={
          inBacklogName ? "Agregar a otro backlog" : "Agregar a un backlog"
        }
        title={inBacklogName ? "Agregar a otro backlog" : "Agregar a un backlog"}
        className="relative flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-surface-2 text-text transition-colors hover:bg-surface-3 active:scale-[0.96]"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {/* Ya está en un backlog — visible antes de abrir el sheet. */}
        {inBacklogName && (
          <span
            aria-hidden
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent"
          />
        )}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bl-rise w-full max-w-md space-y-2 rounded-t-[22px] bg-surface-1 p-5 pb-[calc(28px+env(safe-area-inset-bottom))]"
            >
              <h2 className="font-display text-lg font-bold tracking-[-0.01em]">
                ¿A cuál backlog?
              </h2>
              {inBacklogName && (
                <p className="text-xs text-text-3">
                  Ya está en{" "}
                  <span className="text-text-2">{inBacklogName}</span> — puedes
                  agregarlo a otro.
                </p>
              )}
              {backlogs.map((b) => (
                <button
                  key={b.id}
                  disabled={busy}
                  onClick={() => addTo(b.id)}
                  className="block w-full rounded-xl bg-surface-2 px-4 py-3 text-left transition-colors hover:bg-surface-3 disabled:opacity-40"
                >
                  {b.name}
                </button>
              ))}
              <form onSubmit={createAndAdd} className="flex gap-2 pt-1">
                <input
                  value={newName}
                  maxLength={60}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={
                    backlogs.length === 0
                      ? "Tu primer backlog…"
                      : "Nuevo backlog…"
                  }
                  className="min-w-0 flex-1 rounded-xl bg-surface-2 px-4 py-3 outline-none placeholder:text-text-3 focus:bg-surface-3"
                />
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="rounded-xl bg-accent px-4 font-semibold text-bg disabled:opacity-40"
                >
                  Crear
                </button>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
