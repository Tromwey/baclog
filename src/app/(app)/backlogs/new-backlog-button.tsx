"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import { Sheet } from "@/components/ui";

/**
 * Any "create a backlog" entry point: renders the caller's button (the dashed
 * "+" chip on /backlogs, the lima CTA on the #p8 first-use screen)
 * and owns the create modal it opens. The modal is portaled to <body> so it
 * escapes the (app) content wrapper's stacking context and sits ABOVE the
 * dock (see AGENTS.md).
 */
export function NewBacklogTrigger({
  className,
  children,
  ariaLabel,
}: {
  className: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </button>
      {open && <NewBacklogModal onClose={() => setOpen(false)} />}
    </>
  );
}

/** The create-backlog sheet — shape and portaling live in <Sheet>. */
function NewBacklogModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createBacklogAction({ name, vibe: vibe || undefined });
    setBusy(false);
    if ("id" in res) {
      onClose();
      router.push(`/backlogs/${res.id}`);
    }
  }

  return (
    <Sheet onClose={onClose} label="Nuevo backlog">
      <form onSubmit={create}>
        <div className="space-y-3">
          <h2 className="font-display text-xl font-bold tracking-[-0.01em]">
            Nuevo backlog
          </h2>
          <input
            autoFocus
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej. Summer Era)"
            // Surface fills, not black alphas: the sheet is opaque now, so
            // translucent blacks that were tuned against glass would read as
            // muddy. Selection/focus stays a fill change (never an outline).
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
            disabled={busy || !name.trim()}
            className="w-full rounded-full bg-accent py-3.5 font-semibold text-bg transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? "Creando…" : "Crear"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
