"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui";
import { REVIEW_MAX_LENGTH } from "@/modules/reviews/types";

/**
 * F3.9 — EDITING an existing review (Revamp UI, 2026-09-03: writing a new one
 * moved to the Completar sheet, 08). Reuses the app's one Sheet (bottom
 * variant, portaled to <body>); the field is the 08 glass card at the sheet's
 * scale — 16px/1.5 text, accent caret, the mock's 36×22 spoiler switch and
 * the "142 / 280" counter under it, hot past the limit.
 *
 * Nothing is ever truncated. The excess is tinted with `--hot-soft` inside
 * the field so you can see exactly what's over, and you decide what to cut.
 * That tint needs a mirror layer behind a transparent-text textarea (a
 * textarea can't style a range of its own value); the mirror only renders
 * while over the limit, so the ordinary case is a plain textarea.
 */
export function ReviewSheet({
  itemTitle,
  initialBody,
  initialHasSpoiler,
  allowSpoiler,
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
    "w-full resize-none rounded-[18px] p-4 text-[16px] leading-[1.5] outline-none";

  return (
    <Sheet onClose={onCancel} label="Edita tu reseña">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[18px] font-bold tracking-[-0.01em] text-text">
          Edita tu reseña
        </span>
      </div>
      <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
        Sobre {itemTitle}
      </p>

      <div className="relative mt-[14px]">
        {/* Painted BEHIND the textarea, which goes transparent (background and
            all — an opaque field would simply hide this) while over the limit. */}
        {over && (
          <div
            ref={mirrorRef}
            aria-hidden
            className={`${fieldClasses} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words bg-[var(--glass-bg)] text-text`}
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
          className={`${fieldClasses} relative min-h-[120px] caret-accent placeholder:text-text-3 ${
            over
              ? "bg-transparent text-transparent"
              : "bg-[var(--glass-bg)] text-text"
          }`}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between px-1">
        {allowSpoiler ? (
          <button
            type="button"
            onClick={() => setHasSpoiler((v) => !v)}
            role="switch"
            aria-checked={hasSpoiler}
            className="flex items-center gap-2.5"
          >
            <span
              aria-hidden
              className={`relative block h-[22px] w-9 flex-none rounded-full transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] ${
                hasSpoiler ? "bg-accent" : "bg-surface-2"
              }`}
            >
              <span
                className={`absolute top-[2px] rounded-full transition-[left,width,height] duration-[var(--dur-base)] ease-[var(--ease-out)] ${
                  hasSpoiler
                    ? "left-4 h-[18px] w-[18px] bg-bg"
                    : "left-[2px] h-4 w-4 bg-text-3"
                }`}
              />
            </span>
            <span className="text-[13px] text-text-2">Contiene spoiler</span>
          </button>
        ) : (
          <span />
        )}
        <span
          className={`font-mono text-[10.5px] uppercase tracking-[0.1em] ${
            over ? "text-hot" : "text-text-3"
          }`}
        >
          {body.length} / {REVIEW_MAX_LENGTH}
        </span>
      </div>

      {error && (
        <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-hot">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-[10px]">
        <button
          type="button"
          onClick={onCancel}
          className="flex-none rounded-full px-5 py-[13px] text-[14px] font-semibold text-text-2"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(body.trim(), hasSpoiler)}
          disabled={disabled}
          className={`flex-1 rounded-full px-6 py-[13px] text-[14px] font-semibold text-bg transition-opacity ${
            disabled ? "bg-surface-3 opacity-50" : "bg-accent"
          }`}
        >
          {saving ? "…" : "Guardar"}
        </button>
      </div>
    </Sheet>
  );
}
