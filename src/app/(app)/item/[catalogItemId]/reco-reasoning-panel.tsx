"use client";

import { useState } from "react";
import { CrossMediaFeedback } from "@/components/cross-media-feedback";
import { GLYPH_VIEWBOX, SPARKLE_PATH } from "@/components/glyph-paths";
import { useItemReaction } from "./reaction-state";

/**
 * "¿Por qué esta recomendación?" — the read-only explanation of the pairing
 * (the rec's stored narrative), rendered only for AI-sourced entries. Distinct
 * from CrossMediaFeedback below it, which is the USER'S why-feedback on their
 * own reaction. Both hide when the user picks "Ocultar recomendación".
 */

export interface RecNarrative {
  hookEyebrow: string;
  hookTitle: string;
  resultEyebrow: string;
  closer: string | null;
  seedTitle: string;
  /**
   * F3.5.8 honesty label: "factual" = the rec narrates a VERIFIED link
   * (soundtrack/score edge), "thematic" = the deep-cut vibe fallback.
   */
  linkKind: "factual" | "thematic";
}

export function RecoReasoningPanel({ narrative }: { narrative: RecNarrative }) {
  const { recoHidden } = useItemReaction();
  const [open, setOpen] = useState(false);
  if (recoHidden) return null;

  return (
    <div className="rounded-[22px] bg-[#0F0F13] p-[18px]">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3"
      >
        <span className="inline-flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-accent">
          <svg width="12" height="12" viewBox={GLYPH_VIEWBOX} fill="currentColor" aria-hidden>
            <path d={SPARKLE_PATH} />
          </svg>
          ¿Por qué esta recomendación?
        </span>
        {/* F3.5.8 honesty label — same voice as /para-ti's discovery card */}
        <span
          className={`ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] ${
            narrative.linkKind === "factual" ? "text-accent" : "text-text-3"
          }`}
        >
          {narrative.linkKind === "factual" ? "conexión real" : "misma vibra"}
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={`flex-none text-text-3 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-[7px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-[11px] py-[7px] font-mono text-[9px] uppercase tracking-[0.05em] text-text">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              De {narrative.seedTitle}
            </span>
            <span className="rounded-full bg-surface-2 px-[11px] py-[7px] font-mono text-[9px] uppercase tracking-[0.05em] text-text-2">
              {narrative.hookTitle}
            </span>
            <span className="rounded-full bg-surface-2 px-[11px] py-[7px] font-mono text-[9px] uppercase tracking-[0.05em] text-text-2">
              {narrative.resultEyebrow}
            </span>
          </div>
          {narrative.closer && (
            <p className="mt-3 font-serif text-[15px] italic leading-snug text-text-2">
              {narrative.closer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ✦ provenance eyebrow over the title (mock #p3: "Recomendado · porque amaste
 * {seed}"). Client so the optimistic "ocultar" wipes it too.
 */
export function RecoEyebrow({ seedTitle }: { seedTitle: string }) {
  const { recoHidden } = useItemReaction();
  if (recoHidden) return null;
  return (
    <span className="inline-flex items-center gap-[7px] rounded-full bg-[var(--hot-soft)] px-[11px] py-[5px] font-mono text-[9px] uppercase tracking-[0.08em] text-[#FF7A98]">
      <svg width="11" height="11" viewBox={GLYPH_VIEWBOX} fill="currentColor" aria-hidden>
        <path d={SPARKLE_PATH} />
      </svg>
      Recomendado · porque amaste {seedTitle}
    </span>
  );
}

/**
 * The user's own "¿por qué?" feedback chips, fed the LIVE reaction from the
 * shared context (it self-gates on reaction && sourceCrossMediaRecId).
 */
export function RecoFeedback({
  catalogItemId,
  sourceCrossMediaRecId,
}: {
  catalogItemId: string;
  sourceCrossMediaRecId: string | null;
}) {
  const { verdict, obsessed, recoHidden } = useItemReaction();
  return (
    <CrossMediaFeedback
      catalogItemId={catalogItemId}
      verdict={verdict}
      obsessed={obsessed}
      sourceCrossMediaRecId={recoHidden ? null : sourceCrossMediaRecId}
    />
  );
}
