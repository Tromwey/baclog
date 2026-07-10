"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createBacklogAction } from "@/app/actions/backlog-actions";

/**
 * Any "create a backlog" entry point: renders the caller's button (the dashed
 * "Nuevo estante" ghost card on #p1, the lima CTA on the #p8 first-use screen)
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

/** The create-backlog modal — centered floating glass, portaled to <body>. */
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <form
        onSubmit={create}
        onClick={(e) => e.stopPropagation()}
        className="bl-rise relative w-full max-w-sm overflow-hidden rounded-[28px] bg-white/[0.07] p-6 shadow-[var(--shadow-card)] backdrop-blur-[28px] backdrop-saturate-[1.25]"
      >
        <div aria-hidden className="bl-grain" />
        <div className="relative space-y-3">
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
            className="w-full rounded-2xl bg-black/25 px-4 py-3 outline-none transition-colors placeholder:text-text-3 focus:bg-black/40"
          />
          <input
            maxLength={80}
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="Vibe (opcional)"
            className="w-full rounded-2xl bg-black/25 px-4 py-3 outline-none transition-colors placeholder:text-text-3 focus:bg-black/40"
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
    </div>,
    document.body,
  );
}
