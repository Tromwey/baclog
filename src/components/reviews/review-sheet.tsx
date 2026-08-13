"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui";
import { REVIEW_MAX_LENGTH } from "@/modules/reviews/types";

/**
 * F3.9 — writing and editing. Reuses the app's one Sheet (bottom variant,
 * portaled to <body> so it clears the item page's fixed action bar); only the
 * contents are new.
 *
 * Two details carry the design's intent:
 *  - The counter lives next to the TITLE, not under the field — the top-right
 *    corner is where metadata is read everywhere else in the app. Past 280 it
 *    counts down in `--hot`.
 *  - Nothing is ever truncated. The excess is tinted with `--hot-soft` inside
 *    the field so you can see exactly what's over, and you decide what to cut.
 *    That tint needs a mirror layer behind a transparent-text textarea (a
 *    textarea can't style a range of its own value); the mirror only renders
 *    while over the limit, so the ordinary case is a plain textarea.
 */
export function ReviewSheet({
  itemTitle,
  initialBody,
  initialHasSpoiler,
  allowSpoiler,
  isEdit,
  saving,
  error,
  onCancel,
  onSave,
}: {
  itemTitle: string;
  initialBody: string;
  initialHasSpoiler: boolean;
  /**
   * False for albums, which have no ending to give away — the switch simply
   * isn't there and the flag saves as false (see `supportsSpoiler`).
   */
  allowSpoiler: boolean;
  isEdit: boolean;
  saving: boolean;
  /** Copy for a failed save. The sheet stays open and keeps the draft. */
  error: string | null;
  onCancel: () => void;
  onSave: (body: string, hasSpoiler: boolean) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [hasSpoiler, setHasSpoiler] = useState(
    allowSpoiler && initialHasSpoiler,
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const over = body.length > REVIEW_MAX_LENGTH;
  const empty = body.trim().length === 0;
  const disabled = over || empty || saving;

  // Grow with the text so the mirror never has to scroll-sync with the
  // textarea (they'd drift by a pixel and the tint would land on the wrong
  // words). Capped, then the field scrolls like any other.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
    if (mirrorRef.current) mirrorRef.current.style.height = el.style.height;
  }, [body]);

  const fieldClasses =
    "w-full resize-none rounded-[14px] p-[14px] text-[15px] leading-[1.5] outline-none";

  return (
    <Sheet onClose={onCancel} label={isEdit ? "Edita tu reseña" : "Tu reseña"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[18px] font-bold tracking-[-0.01em] text-text">
          {isEdit ? "Edita tu reseña" : "Tu reseña"}
        </span>
        <span
          className={`font-mono text-[11px] tracking-[0.04em] ${
            over ? "text-hot" : "text-text-3"
          }`}
        >
          {over
            ? `−${body.length - REVIEW_MAX_LENGTH}`
            : `${body.length}/${REVIEW_MAX_LENGTH}`}
        </span>
      </div>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
        Sobre {itemTitle}
      </p>

      <div className="relative mt-[14px]">
        {/* Painted BEHIND the textarea, which goes transparent (background and
            all — an opaque field would simply hide this) while over the limit. */}
        {over && (
          <div
            ref={mirrorRef}
            aria-hidden
            className={`${fieldClasses} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words bg-surface-2 text-text`}
          >
            {body.slice(0, REVIEW_MAX_LENGTH)}
            <span className="bg-[var(--hot-soft)] text-text">
              {body.slice(REVIEW_MAX_LENGTH)}
            </span>
          </div>
        )}
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="¿Qué se te quedó?"
          autoFocus
          className={`${fieldClasses} relative min-h-[104px] ${
            over
              ? "bg-transparent text-transparent caret-[var(--text)]"
              : "bg-surface-2 text-text"
          }`}
        />
      </div>

      {allowSpoiler && (
        <button
          onClick={() => setHasSpoiler((v) => !v)}
          role="switch"
          aria-checked={hasSpoiler}
          className="mt-3 flex w-full items-center gap-3 rounded-[14px] bg-surface-2 px-[14px] py-[13px] text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-text">Contiene spoiler</span>
            <span className="mt-[2px] block text-[11.5px] leading-[1.35] text-text-3">
              Se cubre hasta que alguien decida verlo.
            </span>
          </span>
          <span
            aria-hidden
            className={`relative block h-[26px] w-[44px] flex-none rounded-full transition-colors duration-[220ms] ease-[var(--ease-out)] ${
              hasSpoiler ? "bg-accent" : "bg-surface-3"
            }`}
          >
            <span
              className={`absolute top-[3px] h-5 w-5 rounded-full transition-[left] duration-[220ms] ease-[var(--ease-out)] ${
                hasSpoiler ? "left-[21px] bg-bg" : "left-[3px] bg-text-2"
              }`}
            />
          </span>
        </button>
      )}

      {error && (
        <p className="mt-3 text-[13px] leading-[1.45] text-hot">{error}</p>
      )}

      <div className="mt-4 flex gap-[10px]">
        <button
          onClick={onCancel}
          className="flex-none rounded-full px-5 py-[14px] text-[15px] font-semibold text-text-2"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(body.trim(), hasSpoiler)}
          disabled={disabled}
          className={`flex-1 rounded-full px-6 py-[14px] text-[15px] font-semibold text-bg transition-opacity ${
            disabled ? "bg-surface-3 opacity-50" : "bg-accent"
          }`}
        >
          {saving ? "…" : isEdit ? "Guardar" : "Publicar"}
        </button>
      </div>
    </Sheet>
  );
}
