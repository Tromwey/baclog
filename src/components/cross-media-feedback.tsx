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
 * item's reaction. Only renders when the item actually came from an AI reco
 * (sourceCrossMediaRecId set) and has a reaction to explain. Shared between the
 * backlog row (item-row.tsx) and the item detail page (item-status-controls.tsx).
 */
export function CrossMediaFeedback({
  backlogItemId,
  reaction,
  sourceCrossMediaRecId,
  variant = "mono",
}: {
  backlogItemId: string;
  reaction: string | null;
  sourceCrossMediaRecId: string | null;
  /** "mono" = uppercase mono-meta label (item detail page); "plain" = quiet sans label (backlog row) */
  variant?: "plain" | "mono";
}) {
  const [open, setOpen] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset any in-progress selection when the reaction itself changes — this
  // component stays mounted across reaction switches (all 3 reaction values
  // are truthy), so without this a tag picked under one reaction could ride
  // along and get submitted under a different one.
  const [lastReaction, setLastReaction] = useState(reaction);
  if (reaction !== lastReaction) {
    setLastReaction(reaction);
    setSelectedReasons([]);
    setOpen(false);
  }

  if (!reaction || !sourceCrossMediaRecId) return null;

  const reasonOptions = reaction === "disliked" ? NEGATIVE_REASONS : POSITIVE_REASONS;

  function toggleReason(tag: string) {
    setSelectedReasons((prev) =>
      prev.includes(tag) ? prev.filter((r) => r !== tag) : [...prev, tag],
    );
  }

  function submit() {
    setError(null);
    startTransition(() =>
      submitCrossMediaFeedbackAction(backlogItemId, selectedReasons)
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
        className={
          variant === "mono"
            ? "font-mono text-[10px] uppercase tracking-[0.12em] text-text-3"
            : "text-[11px] font-semibold text-text-3"
        }
      >
        {open ? "Ocultar ▴" : "¿Por qué? ▾"}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reasonOptions.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleReason(tag)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
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
