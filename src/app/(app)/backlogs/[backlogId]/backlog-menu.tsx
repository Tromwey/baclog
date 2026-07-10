"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  deleteBacklogAction,
  renameBacklogAction,
} from "@/app/actions/backlog-actions";

/**
 * The zoom hero's ⋯ menu: Compartir (ticket) · Renombrar · Eliminar. Panels
 * portal to <body> so they escape the (app) content wrapper's stacking context
 * and sit ABOVE the dock (see new-backlog-button.tsx / AGENTS.md) — the dock
 * stays visible on zoom screens, so an in-place panel would slide under it.
 */
export function BacklogMenu({
  backlogId,
  currentName,
  hasItems = false,
}: {
  backlogId: string;
  currentName: string;
  hasItems?: boolean;
}) {
  const [mode, setMode] = useState<"closed" | "menu" | "rename" | "delete">(
    "closed",
  );
  const [name, setName] = useState(currentName);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        onClick={() => setMode(mode === "closed" ? "menu" : "closed")}
        aria-label="Opciones del backlog"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/[0.08] text-text backdrop-blur-[18px]"
      >
        <svg width="20" height="6" viewBox="0 0 22 6" fill="currentColor" aria-hidden>
          <circle cx="3" cy="3" r="2.5" />
          <circle cx="11" cy="3" r="2.5" />
          <circle cx="19" cy="3" r="2.5" />
        </svg>
      </button>

      {mode !== "closed" &&
        createPortal(
          <div
            className="fixed inset-0 z-50"
            onClick={() => setMode("closed")}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bl-rise absolute right-4 top-[calc(72px+env(safe-area-inset-top))] overflow-hidden rounded-[20px] bg-surface-2/90 shadow-[var(--shadow-card)] backdrop-blur-[28px] backdrop-saturate-[1.25]"
            >
              {mode === "menu" && (
                <div className="w-48 py-1.5 text-sm">
                  {hasItems && (
                    <Link
                      href={`/backlogs/${backlogId}/card`}
                      onClick={() => setMode("closed")}
                      className="block w-full px-4 py-2.5 text-left hover:bg-white/5"
                    >
                      Compartir
                    </Link>
                  )}
                  <button
                    onClick={() => setMode("rename")}
                    className="block w-full px-4 py-2.5 text-left hover:bg-white/5"
                  >
                    Renombrar
                  </button>
                  <button
                    onClick={() => setMode("delete")}
                    className="block w-full px-4 py-2.5 text-left text-hot hover:bg-white/5"
                  >
                    Eliminar
                  </button>
                </div>
              )}

              {mode === "rename" && (
                <div className="w-72 space-y-2 p-3">
                  <input
                    autoFocus
                    value={name}
                    maxLength={60}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-2xl bg-black/25 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-text-3 focus:bg-black/40"
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
                      className="flex-1 rounded-full bg-accent py-2 text-sm font-semibold text-bg disabled:opacity-40"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setMode("closed")}
                      aria-label="Cancelar"
                      className="rounded-full bg-white/5 px-3.5 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {mode === "delete" && (
                <div className="w-72 space-y-2 p-3">
                  <p className="text-sm">
                    ¿Eliminar este backlog y todo su contenido?
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={pending}
                      onClick={() =>
                        startTransition(() => deleteBacklogAction(backlogId))
                      }
                      className="flex-1 rounded-full bg-hot py-2 text-sm font-semibold text-text disabled:opacity-40"
                    >
                      {pending ? "Eliminando…" : "Sí, eliminar"}
                    </button>
                    <button
                      onClick={() => setMode("closed")}
                      aria-label="Cancelar"
                      className="rounded-full bg-white/5 px-3.5 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
