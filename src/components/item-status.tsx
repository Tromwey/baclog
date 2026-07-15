import type { ReactNode } from "react";
import { STATUS_LABEL } from "@/modules/backlog/status";
import { FLAME_PATH, GLYPH_VIEWBOX, SPARKLE_PATH } from "./glyph-paths";

/**
 * ItemStatus — THE single source for how a title's status × reaction ×
 * provenance renders across the two backlog-detail densities (B disciplinada).
 * Two modes:
 *
 * - `glyph` (private compact row): the reaction × provenance signal — the flame
 *   (obsessed) / dot (me gusta) / sparkle (IA) matrix, absorbed verbatim from
 *   the former ItemSignalGlyph (HANDOFF §3). Fixed-width slot keeps row columns
 *   aligned even when empty.
 * - `caption` (public poster card): a status dot + the Spanish STATUS_LABEL +
 *   the public reaction suffix. Never renders the ✦ provenance glyph.
 *
 * PRIVACY, CENTRALIZED HERE: public surfaces pass `hideProvenance`. The ✦/ember
 * "recomendado por IA" provenance NEVER appears on a public page (it would leak
 * that a title came from a private AI reco), and a `disliked` verdict is NEVER
 * surfaced (rows don't broadcast negativity). Caption mode enforces both by
 * construction; glyph mode honours `hideProvenance` too, so the rule lives in
 * one place instead of at every call site.
 */

/* Glyph palette (verbatim from item-signal-glyph — the mock's exact hues). */
const HOT = "#FF2D55"; // llama (me obsesiona)
const EMBER = "#FFE3B0"; // destello ember sobre la llama (obsesión + IA)
const WHITE = "#F4F3EE"; // destello blanco (me gusta + IA)
const GRAY = "#6C6B76"; // punto / destello gris

/** Optical-mass compensation for the 4-point star — 16px glyph → 18px star,
 *  exactly the slot width (HANDOFF §3's intent without overflowing the cell). */
const SPARKLE_SCALE = 1.125;

/** Caption status dot hues (public): radar → --radar, in_progress → --obsessing
 *  (an in-flight title reads "hot"), completed → --completed. */
const CAPTION_DOT: Record<string, string> = {
  on_my_radar: "bg-radar",
  in_progress: "bg-obsessing",
  completed: "bg-completed",
};

export interface ItemStatusProps {
  /** Required by `caption` mode (drives the dot hue + label); ignored by `glyph`
   *  mode (the signal is reaction × provenance, not status) so callers of the
   *  compact row don't thread an unused value through. */
  status?: string;
  /** me gusta / no me gusta — independent from obsession; disliked shows nothing. */
  verdict: "disliked" | "liked" | null;
  /** The obsession flag — wins over any verdict. */
  obsessed: boolean;
  /** Non-null = accepted from a cross-media AI reco (provenance). */
  sourceCrossMediaRecId: string | null;
  mode: "glyph" | "caption";
  /** Public surfaces pass true — suppresses the ✦/ember provenance signal so it
   *  can't appear on a public page (privacy rule lives in this atom). */
  hideProvenance?: boolean;
  /** Base glyph size in px (glyph mode only). Default 16. */
  size?: number;
}

export function ItemStatus({
  status,
  verdict,
  obsessed,
  sourceCrossMediaRecId,
  mode,
  hideProvenance = false,
  size = 16,
}: ItemStatusProps) {
  if (mode === "caption") {
    // "En el radar" is the DEFAULT backlog state — the whole list is the radar —
    // so labelling every row with it is redundant. Show the status only once it
    // DEVIATES (en progreso / completado); always show a surfaced reaction (F3.7:
    // obsession wins; else a settled "me gusta", only exposed on completed items;
    // "no me gusta" is never public). Nothing to say → null, matching the private
    // glyph row (which is empty for a plain radar item).
    const key = status ?? "on_my_radar";
    const showStatus = key !== "on_my_radar";
    // Obsession is signalled by the card's flame + hot wash, NOT a caption word —
    // like "en el radar", the word is redundant next to a distinctive glyph, and
    // dropping it lets the flame stay bold (no hot word to keep it small/in-line).
    // The caption only carries a settled "me gusta" (liked, exposed on completed
    // items; "no me gusta" is never public).
    const reactionLabel = !obsessed && verdict === "liked" ? "Me gusta" : null;
    if (!showStatus && !reactionLabel) return null;
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text-2">
        {showStatus && (
          <>
            <span
              className={`h-1.5 w-1.5 rounded-full ${CAPTION_DOT[key] ?? "bg-text-3"}`}
            />
            <span>{STATUS_LABEL[key] ?? STATUS_LABEL.on_my_radar}</span>
          </>
        )}
        {showStatus && reactionLabel && <span aria-hidden>·</span>}
        {reactionLabel && <span>{reactionLabel}</span>}
      </span>
    );
  }

  // glyph mode — reaction × provenance matrix (HANDOFF §3). `hideProvenance`
  // collapses the AI axis (sparkle/ember) so the same atom is safe on public.
  const fromAI = sourceCrossMediaRecId !== null && !hideProvenance;
  const slot = size + 2; // fixed-width slot keeps row alignment (mock: 18px @ 16px glyph)
  const sparkleSize = Math.round(size * SPARKLE_SCALE);

  let glyph: ReactNode = null;
  if (obsessed) {
    glyph = (
      <span className="relative inline-flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={GLYPH_VIEWBOX}
          fill={HOT}
          aria-hidden
        >
          <path d={FLAME_PATH} />
        </svg>
        {fromAI && (
          <svg
            width={Math.round(size * 0.56)}
            height={Math.round(size * 0.56)}
            viewBox={GLYPH_VIEWBOX}
            fill={EMBER}
            aria-hidden
            className="absolute -right-1 -top-[3px]"
          >
            <path d={SPARKLE_PATH} />
          </svg>
        )}
      </span>
    );
  } else if (verdict === "liked" && !fromAI) {
    glyph = (
      <span
        className="rounded-full"
        style={{
          width: Math.round(size * 0.69),
          height: Math.round(size * 0.69),
          background: GRAY,
        }}
      />
    );
  } else if (fromAI) {
    // liked + AI → white sparkle · no verdict (or disliked) + AI → gray sparkle
    glyph = (
      <svg
        width={sparkleSize}
        height={sparkleSize}
        viewBox={GLYPH_VIEWBOX}
        fill={verdict === "liked" ? WHITE : GRAY}
        aria-hidden
      >
        <path d={SPARKLE_PATH} />
      </svg>
    );
  }
  // manual + no verdict (or disliked) → empty slot, width preserved

  return (
    <span
      className="inline-flex flex-none items-center justify-center"
      style={{ width: slot, height: slot }}
    >
      {glyph}
    </span>
  );
}
