"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  deleteBacklogAction,
  renameBacklogAction,
  type BacklogVisibility,
} from "@/app/actions/backlog-actions";
import { VisibilitySegments } from "@/components/backlog-visibility-segments";
import { PUBLIC_PATH } from "@/components/glyph-paths";
import { Sheet, StrokeIcon, glassPillClass } from "@/components/ui";

/**
 * The backlog detail's controls (Revamp UI screen 03, 2026-09-03) — what used
 * to be the ⋯ menu, spread over the screen the way the mock lays it out:
 *
 *  - Visibilidad: the glass pill in the header AND the settings row at the
 *    bottom open the same bottom sheet holding the F3.10.1 triad. Both read
 *    one state (this file's context) so they can't disagree after a change.
 *  - "editar" after the vibe: name + vibe sheet.
 *  - "Eliminar backlog": the two-step confirm in a sheet.
 *
 * Every sheet is <Sheet>, portaled to <body> (AGENTS.md: the (app) content
 * wrapper traps fixed layers).
 */

const LABEL: Record<BacklogVisibility, string> = {
  private: "Privado",
  public: "Pública",
  featured: "Perfil",
};

interface VisibilityApi {
  visibility: BacklogVisibility;
  open: () => void;
}

const VisibilityCtx = createContext<VisibilityApi | null>(null);

function useVisibility(): VisibilityApi {
  const api = useContext(VisibilityCtx);
  if (!api) throw new Error("useVisibility outside BacklogVisibilityProvider");
  return api;
}

export function BacklogVisibilityProvider({
  backlogId,
  initial,
  children,
}: {
  backlogId: string;
  initial: BacklogVisibility;
  children: ReactNode;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(initial);
  const [open, setOpen] = useState(false);

  return (
    <VisibilityCtx.Provider value={{ visibility, open: () => setOpen(true) }}>
      {children}
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Visibilidad del backlog">
          <div className="space-y-3">
            <h2 className="font-display text-xl font-bold tracking-[-0.01em]">
              Visibilidad
            </h2>
            <p className="text-sm leading-[1.5] text-text-2">
              Privado: solo tú. Público: quien tenga el link. Perfil: además
              aparece en tu perfil público.
            </p>
            <VisibilitySegments
              backlogId={backlogId}
              initial={visibility}
              className="w-fit"
              // The list behind the overlay and the profile's escaparate read
              // the same axes — refresh so they react without leaving here.
              onSync={(next) => {
                setVisibility(next);
                router.refresh();
              }}
            />
          </div>
        </Sheet>
      )}
    </VisibilityCtx.Provider>
  );
}

/** The header pill: sun glyph in accent when public, the state's label. */
export function VisibilityPill() {
  const { visibility, open } = useVisibility();
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Visibilidad: ${LABEL[visibility]}`}
      className={glassPillClass}
    >
      {visibility !== "private" && (
        <StrokeIcon d={PUBLIC_PATH} size={11} strokeWidth={2.6} className="text-accent" />
      )}
      {LABEL[visibility]}
    </button>
  );
}

const ROW =
  "flex w-full items-center justify-between rounded-[18px] bg-[var(--glass-bg)] px-4 py-3.5 text-left text-[14px] font-semibold transition-colors hover:bg-white/[0.12]";

/** The settings row: "Visibilidad" + the state, in accent when public. */
export function VisibilityRow() {
  const { visibility, open } = useVisibility();
  return (
    <button type="button" onClick={open} className={`${ROW} text-text`}>
      Visibilidad
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
          visibility === "private" ? "text-text-2" : "text-accent"
        }`}
      >
        {LABEL[visibility]}
      </span>
    </button>
  );
}

/** "editar" after the vibe line → the name + vibe sheet. */
export function EditBacklogTrigger({
  backlogId,
  name: currentName,
  vibe: currentVibe,
}: {
  backlogId: string;
  name: string;
  vibe: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [vibe, setVibe] = useState(currentVibe ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await renameBacklogAction(backlogId, name, vibe);
      if ("ok" in res) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(currentName);
          setVibe(currentVibe ?? "");
          setOpen(true);
        }}
        className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3 transition-colors hover:text-text"
      >
        editar
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Editar backlog">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-3"
          >
            <h2 className="font-display text-xl font-bold tracking-[-0.01em]">
              Editar backlog
            </h2>
            <input
              autoFocus
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              className="w-full rounded-[var(--r-md)] bg-surface-3 px-4 py-3.5 outline-none transition-colors placeholder:text-text-3"
            />
            <input
              maxLength={80}
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="Vibe (opcional)"
              className="w-full rounded-[var(--r-md)] bg-surface-2 px-4 py-3.5 outline-none transition-colors placeholder:text-text-3 focus:bg-surface-3"
            />
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="w-full rounded-full bg-accent py-3.5 font-semibold text-bg transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}

/** "Eliminar backlog" row → two-step confirm → deleteBacklogAction. */
export function DeleteBacklogRow({ backlogId }: { backlogId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${ROW} text-hot`}>
        Eliminar backlog
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Eliminar backlog">
          <div className="space-y-3">
            <h2 className="font-display text-xl font-bold tracking-[-0.01em]">
              ¿Eliminar este backlog?
            </h2>
            <p className="text-sm leading-[1.5] text-text-2">
              Se va con todo su contenido. No se puede deshacer.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => deleteBacklogAction(backlogId))}
                className="flex-1 rounded-full bg-hot py-3.5 font-semibold text-text disabled:opacity-40"
              >
                {pending ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-white/5 px-5 py-3.5 font-semibold text-text"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
