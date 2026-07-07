"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg"
      >
        + Nuevo
      </button>
      {open && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/60"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={create}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-t-2xl border-t border-line bg-surface-1 p-5 pb-8"
          >
            <h2 className="font-semibold">Nuevo backlog</h2>
            <input
              autoFocus
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (ej. Summer Era)"
              className="w-full rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-accent"
            />
            <input
              maxLength={80}
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="Vibe (opcional)"
              className="w-full rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="w-full rounded-full bg-accent py-3 font-semibold text-bg disabled:opacity-40"
            >
              {busy ? "Creando…" : "Crear"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
