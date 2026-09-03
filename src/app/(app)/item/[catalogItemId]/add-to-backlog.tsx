"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui";
import { StrokeIcon } from "@/components/ui/stroke-icon";
import { CHECK_PATH } from "@/components/glyph-paths";
import { plural } from "@/lib/plural";
import { glassButtonClass } from "./glass";
import { useItemReaction } from "./reaction-state";

/**
 * "En 2 backlogs" (Revamp UI 06) — the flex-none glass button beside "Dónde
 * ver"/"Reproducir". Reads the live membership count off the provider, so it
 * updates the instant a reaction adds the title or the sheet toggles a row.
 */
export function BacklogsButton() {
  const { memberIds, openBacklogs } = useItemReaction();
  const n = memberIds.length;
  return (
    <button type="button" onClick={openBacklogs} className={`${glassButtonClass} flex-none`}>
      {n === 0 ? "Agregar a un backlog" : `En ${n} ${plural(n, "backlog", "backlogs")}`}
    </button>
  );
}

/**
 * The backlogs sheet, in two moods the provider decides:
 *  - manage: every backlog with a check on the ones this title is in; a tap
 *    toggles membership (leaving the last one drops the title from the
 *    library, and the provider mirrors the server's GC).
 *  - pick: "¿A cuál backlog?" before a reaction can be saved on a title that
 *    isn't in the library yet — one tap adds and resolves the waiting flow.
 * Portaled to <body> by Sheet (escapes the (app) wrapper's stacking context).
 */
export function BacklogsSheetHost() {
  const {
    backlogsSheet,
    backlogs,
    memberIds,
    busy,
    closeBacklogs,
    chooseBacklog,
    createBacklogAndAdd,
  } = useItemReaction();
  const [newName, setNewName] = useState("");

  if (!backlogsSheet) return null;
  const pick = backlogsSheet === "pick";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const ok = await createBacklogAndAdd(name);
    if (ok) setNewName("");
  }

  return (
    <Sheet onClose={closeBacklogs} label={pick ? "¿A cuál backlog?" : "Tus backlogs"}>
      <h2 className="font-display text-lg font-bold tracking-[-0.01em]">
        {pick ? "¿A cuál backlog?" : "Tus backlogs"}
      </h2>
      <p className="mt-1.5 text-xs text-text-3">
        {pick
          ? "Primero guárdalo en un backlog; tu reacción se aplica enseguida."
          : "Toca para agregar o quitar este título de cada backlog."}
      </p>

      <div className="mt-3 flex max-h-[46vh] flex-col gap-2 overflow-y-auto">
        {backlogs.map((b) => {
          const on = memberIds.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              disabled={busy}
              aria-pressed={pick ? undefined : on}
              onClick={() => void chooseBacklog(b.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-[var(--r-md)] px-4 py-3.5 text-left transition-colors disabled:opacity-40 ${
                on
                  ? "bg-accent-soft text-text"
                  : "bg-surface-2 text-text hover:bg-surface-3"
              }`}
            >
              <span className="truncate font-medium">{b.name}</span>
              {on && (
                <StrokeIcon
                  d={CHECK_PATH}
                  size={14}
                  strokeWidth={3.4}
                  className="flex-none text-accent"
                />
              )}
            </button>
          );
        })}
      </div>

      <form onSubmit={create} className="mt-3 flex gap-2">
        <input
          value={newName}
          maxLength={60}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={backlogs.length === 0 ? "Tu primer backlog…" : "Nuevo backlog…"}
          className="min-w-0 flex-1 rounded-[var(--r-md)] bg-surface-2 px-4 py-3.5 outline-none transition-colors placeholder:text-text-3 focus:bg-surface-3"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="rounded-[var(--r-md)] bg-accent px-4 font-semibold text-bg disabled:opacity-40"
        >
          Crear
        </button>
      </form>
    </Sheet>
  );
}
