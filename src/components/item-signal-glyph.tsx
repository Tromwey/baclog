import type { ReactNode } from "react";
import { FLAME_PATH, GLYPH_VIEWBOX, SPARKLE_PATH } from "./glyph-paths";

/**
 * Read-only reaction × provenance signal for backlog rows (HANDOFF §3).
 * Presentational and server-safe (no hooks, no handlers) — rows never edit
 * inline; editing lives only in the item detail.
 *
 * Matrix (procedencia × reacción):
 *
 * |               | manual            | recomendado (IA)              |
 * |---------------|-------------------|-------------------------------|
 * | sin reacción  | nada (slot vacío) | destello gris                 |
 * | me gusta      | punto gris        | destello blanco               |
 * | me obsesiona  | llama roja        | llama roja + destello ember   |
 *
 * `disliked` renders as no-reaction on purpose — rows don't surface
 * negativity; the verdict lives in the detail's ⋯ menu.
 *
 * The sparkle is drawn ~12% larger than the dot/flame to equalize optical
 * mass (a 4-point star reads smaller than its bounding box, HANDOFF §3) —
 * capped so it fills, but never overflows, the fixed slot (mock #p2 draws it
 * 16–17px in an 18px cell). The empty manual/no-reaction case still occupies
 * the fixed-width slot so row columns stay aligned.
 */

const HOT = "#FF2D55"; // llama (me obsesiona)
const EMBER = "#FFE3B0"; // destello ember sobre la llama (obsesión + IA)
const WHITE = "#F4F3EE"; // destello blanco (me gusta + IA)
const GRAY = "#6C6B76"; // punto / destello gris

/** Optical mass compensation for the 4-point star — 16px glyph → 18px star,
 *  exactly the slot width (HANDOFF §3's intent without overflowing the cell). */
const SPARKLE_SCALE = 1.125;

export interface ItemSignalGlyphProps {
  reaction: "disliked" | "liked" | "obsessed" | null;
  /** Non-null = the item was accepted from a cross-media AI reco. */
  sourceCrossMediaRecId: string | null;
  /** Base glyph size in px (flame/sparkle-before-compensation). Default 16. */
  size?: number;
}

export function ItemSignalGlyph({
  reaction,
  sourceCrossMediaRecId,
  size = 16,
}: ItemSignalGlyphProps) {
  const fromAI = sourceCrossMediaRecId !== null;
  const slot = size + 2; // fixed-width slot keeps row alignment (mock: 18px @ 16px glyph)
  const sparkleSize = Math.round(size * SPARKLE_SCALE);

  let glyph: ReactNode = null;
  if (reaction === "obsessed") {
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
  } else if (reaction === "liked" && !fromAI) {
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
    // liked + AI → white sparkle · no reaction (or disliked) + AI → gray sparkle
    glyph = (
      <svg
        width={sparkleSize}
        height={sparkleSize}
        viewBox={GLYPH_VIEWBOX}
        fill={reaction === "liked" ? WHITE : GRAY}
        aria-hidden
      >
        <path d={SPARKLE_PATH} />
      </svg>
    );
  }
  // manual + no reaction (or disliked) → empty slot, width preserved

  return (
    <span
      className="inline-flex flex-none items-center justify-center"
      style={{ width: slot, height: slot }}
    >
      {glyph}
    </span>
  );
}
