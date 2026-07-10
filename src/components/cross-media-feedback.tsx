"use client";

import { useState, useTransition } from "react";
import { submitCrossMediaFeedbackAction } from "@/app/actions/crossmedia-feedback-actions";
import {
  NEGATIVE_REASONS,
  POSITIVE_REASONS,
  REASON_LABEL,
} from "@/modules/recs/feedback-reasons";

/**
 * F3.6 — structured "why" feedback ("¿por qué?" chips) on a cross-media-sourced
 * item's reaction. Only renders when the item came from an AI reco
 * (sourceCrossMediaRecId set) AND there is some reaction to explain — either a
 * verdict or an obsession (the two independent axes, F3.7). Rendered on the item
 * detail page (via reco-reasoning-panel.tsx's RecoFeedback wrapper, which feeds
 * it the live optimistic axes) — reaction editing lives ONLY there (HANDOFF §2),
 * so backlog rows no longer mount it. Chips speak the reasoning panel's mono
 * chip language (mock #p3).
 */
export function CrossMediaFeedback({
  catalogItemId,
  verdict,
  obsessed,
  sourceCrossMediaRecId,
}: {
  catalogItemId: string;
  verdict: string | null;
  obsessed: boolean;
  sourceCrossMediaRecId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset any in-progress selection when EITHER axis changes — this component
  // stays mounted across verdict/obsession switches, so without this a tag
  // picked under one state (e.g. positive chips while liked) could ride along
  // and get submitted after the verdict flips to disliked.
  const [lastVerdict, setLastVerdict] = useState(verdict);
  const [lastObsessed, setLastObsessed] = useState(obsessed);
  if (verdict !== lastVerdict || obsessed !== lastObsessed) {
    setLastVerdict(verdict);
    setLastObsessed(obsessed);
    setSelectedReasons([]);
    setOpen(false);
  }

  if ((!verdict && !obsessed) || !sourceCrossMediaRecId) return null;

  // Negative chips only when the sole signal is a "no me gusta" verdict; an
  // obsession (even alongside a disliked verdict) is a positive signal.
  const reasonOptions =
    verdict === "disliked" && !obsessed ? NEGATIVE_REASONS : POSITIVE_REASONS;

  function toggleReason(tag: string) {
    setSelectedReasons((prev) =>
      prev.includes(tag) ? prev.filter((r) => r !== tag) : [...prev, tag],
    );
  }

  function submit() {
    setError(null);
    startTransition(() =>
      submitCrossMediaFeedbackAction(catalogItemId, selectedReasons)
        .then((res) => {
          if ("error" in res) {
            setError("No se pudo enviar tu feedback.");
            return;
          }
          setOpen(false);
        })
        .catch(() => setError("No se pudo enviar tu feedback.")),
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-3"
      >
        {open ? "Ocultar ▴" : "¿Por qué? ▾"}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-[7px]">
          {reasonOptions.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleReason(tag)}
              className={`rounded-full px-[11px] py-[7px] font-mono text-[9px] uppercase tracking-[0.05em] ${
                selectedReasons.includes(tag)
                  ? "bg-accent text-bg"
                  : "bg-surface-2 text-text-2"
              }`}
            >
              {REASON_LABEL[tag]}
            </button>
          ))}
          <button
            onClick={submit}
            disabled={pending || selectedReasons.length === 0}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
