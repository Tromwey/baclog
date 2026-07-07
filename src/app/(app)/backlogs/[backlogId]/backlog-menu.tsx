"use client";

import { useState, useTransition } from "react";
import {
  deleteBacklogAction,
  renameBacklogAction,
} from "@/app/actions/backlog-actions";

export function BacklogMenu({
  backlogId,
  currentName,
}: {
  backlogId: string;
  currentName: string;
}) {
  const [mode, setMode] = useState<"closed" | "menu" | "rename" | "delete">(
    "closed",
  );
  const [name, setName] = useState(currentName);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setMode(mode === "closed" ? "menu" : "closed")}
        aria-label="Opciones del backlog"
        className="rounded-full bg-surface-1 px-3 py-1.5 text-text-2"
      >
        ⋯
      </button>

      {mode === "menu" && (
        <div className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-xl border border-line bg-surface-1 text-sm shadow-xl">
          <button
            onClick={() => setMode("rename")}
            className="block w-full px-4 py-2.5 text-left hover:bg-surface-2"
          >
            Renombrar
          </button>
          <button
            onClick={() => setMode("delete")}
            className="block w-full px-4 py-2.5 text-left text-red-400 hover:bg-surface-2"
          >
            Borrar
          </button>
        </div>
      )}

      {mode === "rename" && (
        <div className="absolute right-0 top-10 z-20 w-64 space-y-2 rounded-xl border border-line bg-surface-1 p-3 shadow-xl">
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              disabled={pending || !name.trim()}
              onClick={() =>
                startTransition(async () => {
                  await renameBacklogAction(backlogId, name);
                  setMode("closed");
                })
              }
              className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-bg disabled:opacity-40"
            >
              Guardar
            </button>
            <button
              onClick={() => setMode("closed")}
              className="rounded-lg border border-line px-3 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {mode === "delete" && (
        <div className="absolute right-0 top-10 z-20 w-64 space-y-2 rounded-xl border border-red-900 bg-surface-1 p-3 shadow-xl">
          <p className="text-sm">¿Borrar este backlog y todo su contenido?</p>
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() =>
                startTransition(() => deleteBacklogAction(backlogId))
              }
              className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? "Borrando…" : "Sí, borrar"}
            </button>
            <button
              onClick={() => setMode("closed")}
              className="rounded-lg border border-line px-3 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
