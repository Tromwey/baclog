"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { createBacklogAction } from "@/app/actions/backlog-actions";

export function NewBacklogButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createBacklogAction({ name, vibe: vibe || undefined });
    setBusy(false);
    if ("id" in res) {
      setOpen(false);
      setName("");
      setVibe("");
      router.push(`/backlogs/${res.id}`);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Nuevo backlog"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-accent backdrop-blur-[24px] backdrop-saturate-[1.25]"
      >
        <span aria-hidden className="bl-grain" />
        <svg
          className="relative"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {/* Portaled to <body> so it escapes the (app) content wrapper's stacking
          context and sits ABOVE the dock. Centered floating glass modal. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          >
          <form
            onSubmit={create}
            onClick={(e) => e.stopPropagation()}
            className="bl-rise relative w-full max-w-sm overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.07] p-6 shadow-[var(--shadow-card)] backdrop-blur-[28px] backdrop-saturate-[1.25]"
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
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none transition-colors placeholder:text-text-3 focus:border-accent"
              />
              <input
                maxLength={80}
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                placeholder="Vibe (opcional)"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none transition-colors placeholder:text-text-3 focus:border-accent"
              />
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="w-full rounded-full bg-accent py-3.5 font-semibold text-bg shadow-[0_0_24px_var(--accent-soft)] transition-transform active:scale-[0.98] disabled:opacity-40"
              >
                {busy ? "Creando…" : "Crear"}
              </button>
            </div>
          </form>
          </div>,
          document.body,
        )}
    </>
  );
}
