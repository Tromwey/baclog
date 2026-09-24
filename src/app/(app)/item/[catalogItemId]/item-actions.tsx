"use client";

import { Glyph, type GlyphKind } from "@/components/kura/components";
import { REVIEW_PATH } from "@/components/glyph-paths";
import { SaveButton } from "./add-to-backlog";
import { useItemReaction } from "./reaction-state";

/**
 * Where a title stands in time (§patrones · aviso de estreno):
 *  - `waiting` — before the release: Guardar and the clock, NO Completar
 *    ("Reloj y Completar nunca conviven"); "La vi en preestreno" lives in
 *    Opciones.
 *  - `today`   — the release day: the clock goes out and Completar appears,
 *    solid (the screen's one accent action).
 *  - `out`     — everything else.
 */
export type ReleasePhase = "waiting" | "today" | "out";

const GLASS_44 =
  "inline-flex h-11 flex-none items-center gap-2 rounded-full bg-[var(--glass-bg)] px-4 text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12]";

/**
 * The ficha's three fixed actions (sistema §componentes · cabecera · obra):
 * [Completar | tu reacción] · [Guardar | En N colecciones] · Reseñar (44
 * round). Completar and your reaction open the Completar sheet; before the
 * release the row is Guardar + the clock line. Under the row, one mono line:
 * the release sentence ("Sale el 16 oct" / "Sale en 14 h" — lavender with the
 * clock when you asked to be told, i.e. the title is saved), or the airing
 * series note.
 */
export function ItemActions({
  phase,
  releaseLine,
  note,
}: {
  phase: ReleasePhase;
  /** `releaseSentence(...)` — only while waiting. */
  releaseLine: string | null;
  /** A quiet mono line when there's no release line ("En emisión"). */
  note: string | null;
}) {
  const {
    verdict,
    obsessed,
    completed,
    inLibrary,
    ownReview,
    openComplete,
    setReviewSheet,
  } = useItemReaction();

  const reaction: { kind: GlyphKind; label: string } | null = obsessed
    ? { kind: "obsessed", label: "Me obsesiona" }
    : completed && verdict === "liked"
      ? { kind: "liked", label: "Me gusta" }
      : completed
        ? { kind: "completed", label: "Completo" }
        : verdict === "liked"
          ? { kind: "liked", label: "Me gusta" }
          : null;

  function review() {
    // An existing review is edited in place (Completar would also re-mark the
    // status); otherwise writing happens in Completar, with the review field.
    if (ownReview) setReviewSheet("edit");
    else openComplete();
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-2.5">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Before the release there is no Completar — but a title completed
            in preestreno still shows how it left you. */}
        {(phase !== "waiting" || (completed && reaction)) &&
          (reaction ? (
            <button type="button" onClick={openComplete} className={`${GLASS_44} pl-3.5`}>
              <Glyph kind={reaction.kind} size={16} />
              {reaction.label}
            </button>
          ) : phase === "today" ? (
            <button
              type="button"
              onClick={openComplete}
              className="inline-flex h-11 flex-none items-center rounded-full bg-text px-[18px] text-[15px] font-semibold text-bg bl-press"
            >
              Completar
            </button>
          ) : (
            <button type="button" onClick={openComplete} className={GLASS_44}>
              Completar
            </button>
          ))}
        <SaveButton />
        {phase !== "waiting" && (
          <button
            type="button"
            onClick={review}
            aria-label={ownReview ? "Editar tu reseña" : "Reseñar"}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--glass-bg)] text-text bl-press-sm hover:bg-white/[0.12]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={ownReview ? "var(--text)" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
              <path d={REVIEW_PATH} />
            </svg>
          </button>
        )}
      </div>

      {phase === "waiting" && releaseLine ? (
        inLibrary ? (
          // The clock is an INDICATOR — "pediste que te avisáramos" — never a button.
          <span className="inline-flex items-center gap-[7px] font-mono text-[11px] uppercase tracking-[0.08em] text-st-waiting">
            <Glyph kind="waiting" size={13} />
            {releaseLine}
          </span>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{releaseLine}</span>
        )
      ) : note ? (
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{note}</span>
      ) : null}
    </div>
  );
}
