"use client";

import { useState } from "react";
import { submitReportAction } from "@/app/actions/report-actions";

const REASONS = [
  { id: "spam", label: "Spam" },
  { id: "impersonation", label: "Se hace pasar por alguien" },
  { id: "harassment", label: "Acoso" },
  { id: "illegal_content", label: "Contenido ilegal" },
  { id: "other", label: "Otro" },
] as const;

export function ReportButton({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function report(reason: (typeof REASONS)[number]["id"]) {
    setBusy(true);
    await submitReportAction({ username, reason });
    setBusy(false);
    setSent(true);
    setTimeout(() => setOpen(false), 1500);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-text-3 underline hover:text-text-2"
      >
        Reportar perfil
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
            {sent ? (
              <p className="py-4 text-center text-sm">
                Gracias. Lo revisaremos.
              </p>
            ) : (
              <>
                <h2 className="font-semibold">¿Qué pasa con este perfil?</h2>
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    disabled={busy}
                    onClick={() => report(r.id)}
                    className="block w-full rounded-xl bg-surface-2 px-4 py-3 text-left text-sm transition-colors hover:bg-surface-3 disabled:opacity-40"
                  >
                    {r.label}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
