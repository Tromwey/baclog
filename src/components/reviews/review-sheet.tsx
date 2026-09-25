"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { SOLID_BUTTON } from "@/components/kura/components";
import {
  KuraSheet,
  useKuraSheetDismiss,
} from "@/app/(app)/item/[catalogItemId]/kura-sheet";
import { REVIEW_MAX_LENGTH } from "@/modules/reviews/types";

/**
 * F3.9 — EDITING an existing review (writing a new one lives in the Completar
 * sheet, 26a). The Kura floating sheet: title in Newsreader 22, the field as
 * 26a draws it (white 6%, radius 18, 15/1.5), the system's 51×31 switch for
 * spoilers, the "142 / 280" counter, and the solid Guardar at the end.
 *
 * Nothing is ever truncated. The excess is tinted inside the field so you can see exactly what's over, and you decide what to cut.
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

  return (
    <KuraSheet onClose={onCancel} label="Edita tu reseña" className="px-5">
      <EditBody
        itemTitle={itemTitle}
        body={body}
        setBody={setBody}
        hasSpoiler={hasSpoiler}
        setHasSpoiler={setHasSpoiler}
        allowSpoiler={allowSpoiler}
        over={over}
        disabled={disabled}
        saving={saving}
        error={error}
        fieldRef={ref}
        mirrorRef={mirrorRef}
        onSave={onSave}
      />
    </KuraSheet>
  );
}

function EditBody({
  itemTitle,
  body,
  setBody,
  hasSpoiler,
  setHasSpoiler,
  allowSpoiler,
  over,
  disabled,
  saving,
  error,
  fieldRef,
  mirrorRef,
  onSave,
}: {
  itemTitle: string;
  body: string;
  setBody: (v: string) => void;
  hasSpoiler: boolean;
  setHasSpoiler: (fn: (v: boolean) => boolean) => void;
  allowSpoiler: boolean;
  over: boolean;
  disabled: boolean;
  saving: boolean;
  error: string | null;
  fieldRef: React.RefObject<HTMLTextAreaElement | null>;
  mirrorRef: React.RefObject<HTMLDivElement | null>;
  onSave: (body: string, hasSpoiler: boolean) => void;
}) {
  const dismiss = useKuraSheetDismiss();
  const fieldClasses =
    "w-full resize-none rounded-[var(--r-surface)] px-4 py-3.5 text-[15px] leading-[1.5] outline-none";

  return (
    <>
      <h2 className="pt-1 font-brand text-[22px] leading-[1.1] text-text">edita tu reseña</h2>
      <p className="mt-1.5 truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
        Sobre {itemTitle}
      </p>

      <div className="relative mt-3.5">
        {/* Painted BEHIND the textarea, which goes transparent (background and
            all — an opaque field would simply hide this) while over the limit. */}
        {over && (
          <div
            ref={mirrorRef}
            aria-hidden
            className={`${fieldClasses} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words bg-white/[0.06] text-text`}
          >
            {body.slice(0, REVIEW_MAX_LENGTH)}
            <span className="bg-white/[0.16] text-text">{body.slice(REVIEW_MAX_LENGTH)}</span>
          </div>
        )}
        <textarea
          ref={fieldRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe tu reseña"
          aria-label="Tu reseña"
          autoFocus
          className={`${fieldClasses} relative min-h-24 caret-text placeholder:text-text-2 ${
            over ? "bg-transparent text-transparent" : "bg-white/[0.06] text-text"
          }`}
        />
      </div>

      <div className="mt-1 flex min-h-[52px] items-center justify-between gap-3">
        {allowSpoiler ? (
          <button
            type="button"
            onClick={() => setHasSpoiler((v) => !v)}
            role="switch"
            aria-checked={hasSpoiler}
            className="flex flex-1 items-center gap-3.5 text-left"
          >
            <span className="flex-1 text-[16px] font-medium text-text">Contiene spoilers</span>
            <span
              aria-hidden
              className={`relative block h-[31px] w-[51px] flex-none rounded-full transition-colors duration-200 ${hasSpoiler ? "bg-text" : "bg-white/[0.16]"}`}
            >
              <span
                className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full transition-[translate,background-color] duration-200 ${hasSpoiler ? "translate-x-5 bg-bg" : "translate-x-0 bg-text"}`}
              />
            </span>
          </button>
        ) : (
          <span />
        )}
        <span className={`flex-none font-mono text-[11px] ${over ? "text-text" : "text-text-3"}`}>
          {body.length} / {REVIEW_MAX_LENGTH}
        </span>
      </div>

      {error && <p className="mt-1 text-[14px] leading-[1.4] text-text-2">{error}</p>}

      <button
        type="button"
        onClick={() => onSave(body.trim(), hasSpoiler)}
        disabled={disabled}
        className={`${SOLID_BUTTON} mt-3.5 w-full`}
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="mt-1 flex min-h-11 items-center self-center px-3 text-[15px] font-medium text-text-2 transition-opacity active:opacity-60"
      >
        Cancelar
      </button>
    </>
  );
}
