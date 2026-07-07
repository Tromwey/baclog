"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import { addItemAction } from "@/app/actions/backlog-item-actions";
import { extractPalette } from "@/modules/cards/palette";

interface BacklogOption {
  id: string;
  name: string;
}

export function AddToBacklog({
  catalogItemId,
  posterUrl,
  backlogs,
}: {
  catalogItemId: string;
  posterUrl: string | null;
  backlogs: BacklogOption[];
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
    if ("id" in res || res.error === "duplicate") {
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
    }
    setBusy(false);
  }

  if (added) {
    return (
      <button
        onClick={() => router.push(`/backlogs/${added}`)}
        className="w-full rounded-full bg-emerald-700 py-3.5 font-semibold text-white"
      >
        ✓ Agregado — ver backlog
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-full bg-accent py-3.5 font-semibold text-bg"
      >
        Agregar a un backlog
      </button>

      {open && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-2 rounded-t-2xl border-t border-line bg-surface-1 p-5 pb-8"
          >
            <h2 className="font-semibold">¿A cuál backlog?</h2>
            {backlogs.map((b) => (
              <button
                key={b.id}
                disabled={busy}
                onClick={() => addTo(b.id)}
                className="block w-full rounded-xl border border-line bg-bg px-4 py-3 text-left hover:border-accent disabled:opacity-40"
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
                  backlogs.length === 0 ? "Tu primer backlog…" : "Nuevo backlog…"
                }
                className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-accent"
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
        </div>
      )}
    </>
  );
}
