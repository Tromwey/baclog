"use client";

import { useState } from "react";
import { CrossMediaFeedback } from "@/components/cross-media-feedback";
import { glassPillClass } from "@/components/ui/glass";
import { FillIcon, StrokeIcon } from "@/components/ui/stroke-icon";
import { CHEVRON_DOWN_PATH, SPARKLE_PATH } from "@/components/glyph-paths";
import { useItemReaction } from "./reaction-state";

/**
 * AI provenance on the item detail (Revamp UI 06). The mock has no eyebrow
 * over the title, so the provenance is one glass row in the body —
 * "Recomendado por IA · ¿Por qué?" with the F3.5.8 honesty label — that
 * expands to the stored narrative (seed chip, hook, result, closer) and the
 * user's own why-feedback chips (CrossMediaFeedback). Rendered only for
 * AI-sourced entries; hides when the user picks "ocultar" (optimistic).
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

export function RecoProvenance({
  narrative,
  sourceCrossMediaRecId,
}: {
  narrative: RecNarrative;
  sourceCrossMediaRecId: string | null;
}) {
  const { catalogItemId, verdict, obsessed, recoHidden } = useItemReaction();
  const [open, setOpen] = useState(false);
  if (recoHidden) return null;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-[18px] bg-[var(--glass-bg)] px-4 py-3.5 text-left"
      >
        <FillIcon d={SPARKLE_PATH} size={12} className="flex-none text-accent" />
        <span className="min-w-0 truncate font-mono text-[10.5px] uppercase tracking-[0.1em] text-text">
          Recomendado por IA
          <span className="text-text-2"> · ¿Por qué?</span>
        </span>
        <span
          className={`ml-auto flex-none font-mono text-[10px] uppercase tracking-[0.16em] ${
            narrative.linkKind === "factual" ? "text-accent" : "text-text-3"
          }`}
        >
          {narrative.linkKind === "factual" ? "conexión real" : "misma vibra"}
        </span>
        <StrokeIcon
          d={CHEVRON_DOWN_PATH}
          size={14}
          strokeWidth={2.4}
          className={`flex-none text-text-3 transition-transform duration-[var(--dur-base)] ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="bl-rise-soft flex flex-col gap-3 px-1">
          <div className="flex flex-wrap gap-[7px]">
            <span className={glassPillClass}>
              <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-accent" />
              De {narrative.seedTitle}
            </span>
            <span className={`${glassPillClass} text-text-2`}>{narrative.hookTitle}</span>
            <span className={`${glassPillClass} text-text-2`}>
              {narrative.resultEyebrow}
            </span>
          </div>
          {narrative.closer && (
            <p className="font-serif text-[15px] italic leading-snug text-pretty text-text-2">
              {narrative.closer}
            </p>
          )}
          <CrossMediaFeedback
            catalogItemId={catalogItemId}
            verdict={verdict}
            obsessed={obsessed}
            sourceCrossMediaRecId={sourceCrossMediaRecId}
          />
        </div>
      )}
    </div>
  );
}
