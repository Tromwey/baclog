"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui";
import { submitReportAction } from "@/app/actions/report-actions";

const REASONS = [
  { id: "spam", label: "Spam" },
  { id: "impersonation", label: "Se hace pasar por alguien" },
  { id: "harassment", label: "Acoso" },
  { id: "illegal_content", label: "Contenido ilegal" },
  { id: "other", label: "Otro" },
] as const;

/**
 * F2.21 — report a public profile. Restyled for the Revamp UI (2026-09-03):
 * a quiet mono trigger and the app's one Sheet (portaled, glass, borderless)
 * with the same reason rows the review report uses.
 */
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
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3 transition-colors hover:text-text-2"
      >
        Reportar perfil
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Reportar perfil">
          {sent ? (
            <p className="py-4 text-center text-sm text-text">
              Gracias. Lo revisaremos.
            </p>
          ) : (
            <>
              <div className="font-display text-[18px] font-bold tracking-[-0.01em] text-text">
                ¿Qué pasa con este perfil?
              </div>
              <div className="mt-[14px] flex flex-col gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={busy}
                    onClick={() => report(r.id)}
                    className="w-full rounded-[14px] bg-surface-2 px-4 py-[13px] text-left text-sm text-text transition-colors hover:bg-surface-3 disabled:opacity-40"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
