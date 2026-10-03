"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui";
import { submitReportAction } from "@/app/actions/report-actions";
import { attempt } from "@/components/kura/attempt";

const REASONS = [
  { id: "spam", label: "Spam" },
  { id: "impersonation", label: "Se hace pasar por otra persona" },
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
  const [failed, setFailed] = useState(false);

  async function report(reason: (typeof REASONS)[number]["id"]) {
    setBusy(true);
    setFailed(false);
    // The action answers `{ ok: true }` always (it never confirms anything);
    // what CAN happen is that it never answers — then the rows come back and
    // the sheet says the report did not go out.
    const res = await attempt(() => submitReportAction({ username, reason }));
    setBusy(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setSent(true);
    setTimeout(() => setOpen(false), 1500);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-3 transition-[color,opacity] hover:text-text-2 active:opacity-60"
      >
        Reportar perfil
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label="Reportar perfil">
          {sent ? (
            <p className="py-4 text-center text-sm text-text">
              Gracias. Lo revisamos.
            </p>
          ) : (
            <>
              <div className="font-brand text-[22px] text-text">
                ¿qué pasa con este perfil?
              </div>
              <div className="mt-[14px] flex flex-col gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={busy}
                    onClick={() => report(r.id)}
                    className="min-h-[52px] w-full rounded-[14px] bg-surface-2 px-4 text-left text-[15px] font-medium text-text transition-colors hover:bg-surface-3 active:bg-white/[0.12] disabled:opacity-40"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {failed && (
                <p role="alert" className="mt-3 text-[13px] leading-[1.5] text-text">
                  No se envió tu reporte. Revisa tu conexión y vuelve a intentarlo.
                </p>
              )}
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
