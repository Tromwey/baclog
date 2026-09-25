"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  clearVerdictAction,
  setObsessedAction,
  setStatusAction,
} from "@/app/actions/backlog-item-actions";
import { completeItemAction, type CompleteReaction } from "@/app/actions/complete-actions";
import { SOLID_BUTTON } from "@/components/kura/components";
import { BG, mixHex } from "@/components/kura/tint";
import { CHECK_FILL_PATH, FLAME_PATH, LIKE_PATH } from "@/components/glyph-paths";
import { REVIEW_MAX_LENGTH } from "@/modules/reviews/types";
import { VelocityTracker, project, spring, type SpringHandle } from "@/lib/spring";
import { KuraSheet, useKuraSheetDismiss } from "./kura-sheet";
import { TriangleGlyph } from "./toast";
import { useItemReaction, type ItemVerdictValue } from "./reaction-state";

/**
 * 26a · Completar (Kura, flujos-v2 `RX` / `mkS('sa','fill')`) — a floating
 * sheet whose whole question is ONE slider with three magnetic stops:
 *
 *   Completo → Me gusta → Me obsesiona
 *
 * The track fills up to the thumb in the stop's own colour (mixed 55% toward
 * --bg); the 56 px thumb carries the glyph, in the state hue; the label above
 * it grows a little at the obsession. Drag anywhere on the track (1:1, pointer
 * captured); the release PROJECTS the throw (VelocityTracker + `project`) and
 * a spring carries the thumb to the nearest stop to that landing — with a
 * little bounce only when the release was actually thrown, none after a slow
 * drag. The dots are tap targets; ←/→ move one stop. A tick of haptics on
 * each new stop where the device has it. The thumb and fill move by
 * `transform` (compositor-only), never `left` / `clip-path`.
 *
 * Then the optional review (280, the column's real limit), the spoiler switch
 * (films/series only) and the solid Guardar. "Quitar completado" when the
 * title is already complete.
 *
 * WRITES — `completeItemAction` stays the one call for status + reaction +
 * review (every rule it composes still applies). Stop → reaction:
 *   Me obsesiona → "obsessed" (sets the flag, leaves the verdict)
 *   Me gusta     → "liked"    (verdict liked, clears the flag)
 *   Completo     → null       (status only) and THEN, if the title was liked
 *                  or obsessed, those are cleared: moving the slider down to
 *                  Completo means "just completed".
 * Kura has no "no me gustó": a legacy dislike stays on the row untouched (it
 * reads as Completo here, and it keeps the review unlocked, F3.9).
 *
 * The review needs a reaction (F3.9, re-checked by saveReviewAction): with
 * text on the plain Completo stop the sheet says so and keeps Guardar off
 * rather than letting the server refuse.
 *
 * On an unsaved title, Guardar first asks "guardar en" (pick mode) — this
 * sheet stays mounted and hidden meanwhile (one sheet at a time).
 */

type Stop = 0 | 1 | 2;

const STOPS: { id: "completed" | "liked" | "obsessed"; label: string; d: string; color: string; hex: string }[] = [
  { id: "completed", label: "Completo", d: CHECK_FILL_PATH, color: "var(--st-completed)", hex: "#a0cba0" },
  { id: "liked", label: "Me gusta", d: LIKE_PATH, color: "var(--st-liked)", hex: "#9cbae1" },
  { id: "obsessed", label: "Me obsesiona", d: FLAME_PATH, color: "var(--st-obsessed)", hex: "#ec8e76" },
];

/** Mounted from the page; renders the sheet while the provider says it's open. */
export function CompleteSheetHost({ allowSpoiler }: { allowSpoiler: boolean }) {
  const { completeOpen, closeComplete, saveSheet } = useItemReaction();
  if (!completeOpen) return null;
  return (
    <KuraSheet onClose={closeComplete} label="Completar" hidden={saveSheet === "pick"} className="px-3">
      <CompleteBody allowSpoiler={allowSpoiler} />
    </KuraSheet>
  );
}

function CompleteBody({ allowSpoiler }: { allowSpoiler: boolean }) {
  const router = useRouter();
  const dismiss = useKuraSheetDismiss();
  const {
    catalogItemId,
    verdict,
    obsessed,
    completed,
    ownReview,
    setOwnReview,
    settleFromComplete,
    ensureInLibrary,
    showToast,
  } = useItemReaction();

  const [value, setValue] = useState<number>(obsessed ? 2 : verdict === "liked" ? 1 : 0);
  const [dragging, setDragging] = useState(false);
  const stop = Math.min(2, Math.max(0, Math.round(value))) as Stop;
  const lastStop = useRef<Stop>(stop);
  // The live value for handlers (a spring or a release may run before React
  // re-renders with the last `set`).
  const valueRef = useRef(value);
  const trackRef = useRef<HTMLDivElement>(null);
  // Track width in px: the thumb and fill translate by it (a % in translate
  // is the element's own size, not the track's).
  const [trackW, setTrackW] = useState(0);
  const settleRef = useRef<SpringHandle | null>(null);
  const tracker = useRef(new VelocityTracker()).current;

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const sync = () => setTrackW(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => settleRef.current?.stop(), []);

  const [body, setBody] = useState(ownReview?.body ?? "");
  const [hasSpoiler, setHasSpoiler] = useState(allowSpoiler && (ownReview?.hasSpoiler ?? false));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function set(v: number) {
    const s = Math.round(v) as Stop;
    if (s !== lastStop.current) {
      lastStop.current = s;
      try {
        navigator.vibrate?.(s === 2 ? 18 : 8);
      } catch {
        // no haptics here
      }
    }
    valueRef.current = v;
    setValue(v);
  }

  /** Spring the thumb to `target` (a stop), carrying `velocity` (stops/s).
   *  Bounce (damping .8) is earned by a throw; a slow release lands dead. */
  function settleTo(target: Stop, velocity = 0) {
    settleRef.current?.stop();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const thrown = Math.abs(velocity) > 0.8;
    settleRef.current = spring({
      from: valueRef.current,
      to: target,
      velocity,
      damping: thrown && !reduce ? 0.8 : 1,
      response: 0.32,
      precision: 0.002,
      onUpdate: set,
      onRest: () => {
        settleRef.current = null;
      },
    });
  }

  function release(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (!dragging) return;
    setDragging(false);
    const velocity = cancelled ? 0 : tracker.get(e.timeStamp);
    const landing = valueRef.current + project(velocity);
    settleTo(Math.min(2, Math.max(0, Math.round(landing))) as Stop, velocity);
  }

  function at(e: PointerEvent<HTMLDivElement>): number {
    const el = trackRef.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left - 32) / (r.width - 64))) * 2;
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      settleTo(Math.min(2, stop + 1) as Stop);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      settleTo(Math.max(0, stop - 1) as Stop);
    }
  }

  const X = STOPS[stop];
  const over = body.length > REVIEW_MAX_LENGTH;
  const hasText = body.trim().length > 0;
  // After saving, the review is unlocked iff there's a reaction left: the
  // slider's, or a legacy dislike the plain Completo stop leaves in place.
  const needsReaction = hasText && stop === 0 && verdict !== "disliked";
  const canSave = !saving && !over && !needsReaction;

  function save() {
    if (!canSave) return;
    setError(null);
    startSaving(async () => {
      if (!(await ensureInLibrary())) {
        setError("Elige una colección para guardarla.");
        return;
      }
      const reaction: CompleteReaction = stop === 2 ? "obsessed" : stop === 1 ? "liked" : null;
      const res = await completeItemAction({
        catalogItemId,
        reaction,
        body: body.trim(),
        hasSpoiler: allowSpoiler && hasSpoiler,
      });
      if ("error" in res) {
        setError(
          res.error === "link"
            ? "Los enlaces no van en una reseña. Quítalo y vuelve a intentarlo."
            : res.error === "locked"
              ? "Para publicar tu reseña, elige Me gusta o Me obsesiona."
              : "No se pudo guardar. Tu texto sigue aquí: inténtalo otra vez.",
        );
        return;
      }

      let nextVerdict: ItemVerdictValue = verdict;
      let nextObsessed = obsessed;
      if (stop === 2) nextObsessed = true;
      else if (stop === 1) {
        nextVerdict = "liked";
        nextObsessed = false;
      } else {
        // Down to plain Completo: drop what the slider no longer says.
        if (obsessed) {
          await setObsessedAction(catalogItemId, false).catch(() => null);
          nextObsessed = false;
        }
        if (verdict === "liked") {
          await clearVerdictAction(catalogItemId).catch(() => null);
          nextVerdict = null;
        }
      }
      settleFromComplete({ verdict: nextVerdict, obsessed: nextObsessed, completed: true });
      if (hasText) {
        setOwnReview({
          id: ownReview?.id ?? "own",
          body: body.trim(),
          hasSpoiler: allowSpoiler && hasSpoiler,
          mark: nextObsessed ? "obsessed" : nextVerdict,
          when: "ahora",
          // Client clock, on purpose: the optimistic copy lives until the
          // refresh below brings the server's instants.
          createdAt: ownReview?.createdAt ?? new Date(),
          updatedAt: new Date(),
          // Editing never re-publishes a hidden review (founder, 2026-09-02).
          hidden: ownReview?.hidden ?? false,
        });
      }
      dismiss();
      router.refresh();
    });
  }

  function uncomplete() {
    setError(null);
    startSaving(async () => {
      const res = await setStatusAction(catalogItemId, "on_my_radar").catch(() => null);
      if (!res || "error" in res) {
        setError("No se pudo quitar el completado. Inténtalo otra vez.");
        return;
      }
      settleFromComplete({ verdict, obsessed, completed: false });
      dismiss();
      showToast("Quitaste el completado.", {
        label: "Deshacer",
        run: () => {
          void setStatusAction(catalogItemId, "completed").then((r) => {
            if (!("error" in r)) settleFromComplete({ verdict, obsessed, completed: true });
          });
        },
      });
    });
  }

  // 26a geometry: the thumb's left edge travels 4 → (width − 60px); the fill
  // ends 64 px past the start so it always wraps the thumb. The fill is a
  // full-width pill slid left inside a clipping, rounded track — the same
  // shape the old `clip-path: inset(… round 999px)` cut, on the compositor.
  const travel = Math.max(0, trackW - 64) * (value / 2);
  const fillShift = travel + 64 - trackW;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-col gap-1.5 px-2.5 pb-4 pt-1">
        <h2 className="font-brand text-[22px] leading-[1.1] text-text">Listo. ¿Cómo te dejó?</h2>
      </div>

      <div className="flex flex-col items-center gap-3 px-1 pb-1 pt-1.5">
        <div className="flex h-11 items-center">
          <span
            aria-hidden
            className="font-brand text-[28px] leading-none text-text transition-transform duration-[280ms] ease-[cubic-bezier(.2,.9,.3,1.4)] motion-reduce:transition-none"
            style={{ transform: stop === 2 ? "scale(1.06)" : "scale(1)" }}
          >
            {X.label}
          </span>
        </div>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Cómo te dejó"
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={stop}
          aria-valuetext={X.label}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            // The slider owns this drag, not the sheet's drag-to-dismiss.
            e.stopPropagation();
            if (!e.isPrimary) return;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // pointer already gone
            }
            // Grabbed mid-settle: the finger takes over from here.
            settleRef.current?.stop();
            settleRef.current = null;
            setDragging(true);
            tracker.reset();
            const v = at(e);
            tracker.add(v, e.timeStamp);
            set(v);
          }}
          onPointerMove={(e) => {
            if (!dragging) return;
            const v = at(e);
            tracker.add(v, e.timeStamp);
            set(v);
          }}
          onPointerUp={(e) => release(e, false)}
          onPointerCancel={(e) => release(e, true)}
          className="relative h-16 cursor-pointer select-none self-stretch rounded-full bg-white/[0.07] outline-none touch-none focus-visible:bg-white/[0.1]"
        >
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <span
              className="absolute inset-0 rounded-full motion-reduce:transition-none!"
              style={{
                background: mixHex(X.hex, BG, 0.55),
                transform: `translate3d(${fillShift.toFixed(2)}px, 0, 0)`,
                transition: "background 200ms",
              }}
            />
          </span>
          {STOPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              tabIndex={-1}
              aria-label={s.label}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => settleTo(i as Stop)}
              className="absolute top-1/2 -ml-[22px] -mt-[22px] flex h-11 w-11 items-center justify-center"
              style={{ left: `calc((100% - 64px) * ${i / 2} + 32px)` }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden style={{ fill: i <= value + 0.02 ? "var(--text)" : "rgba(255,255,255,.3)", transition: "fill 200ms" }}>
                <path d={s.d} />
              </svg>
            </button>
          ))}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1 top-1 h-14 w-14"
            style={{ transform: `translate3d(${travel.toFixed(2)}px, 0, 0)` }}
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.5)] motion-reduce:transition-none!"
              style={{
                background: X.color,
                transform: stop === 2 ? "scale(1.12)" : "scale(1)",
                transition: "background 200ms, transform 260ms cubic-bezier(.2,.9,.3,1.4)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill={BG}>
                <path d={X.d} />
              </svg>
            </span>
          </span>
        </div>
      </div>

      <div className="relative mx-1 mt-3.5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe tu reseña (opcional)"
          aria-label="Tu reseña"
          rows={3}
          className="block min-h-24 w-full resize-none rounded-[var(--r-surface)] bg-white/[0.06] px-4 py-3.5 text-[15px] leading-[1.5] text-pretty text-text caret-text outline-none transition-colors placeholder:text-text-2 focus:bg-white/[0.09]"
        />
        {(hasText || over) && (
          <span className={`pointer-events-none absolute bottom-2.5 right-3.5 font-mono text-[11px] ${over ? "text-text" : "text-text-3"}`}>
            {body.length} / {REVIEW_MAX_LENGTH}
          </span>
        )}
      </div>

      {allowSpoiler && (
        <button
          type="button"
          role="switch"
          aria-checked={hasSpoiler}
          onClick={() => setHasSpoiler((v) => !v)}
          className="mx-1 mt-1.5 flex min-h-[52px] items-center gap-3.5 px-1 text-left"
        >
          <span className="flex-1 text-[16px] font-medium text-text">Contiene spoilers</span>
          <Switch on={hasSpoiler} />
        </button>
      )}

      {(needsReaction || over || error) && (
        <p role="status" className="mx-1 flex items-start gap-2 px-1 pt-1 text-[14px] leading-[1.4] text-text-2">
          {error && <TriangleGlyph />}
          {error ??
            (over
              ? `Tu reseña pasa de ${REVIEW_MAX_LENGTH} caracteres. Recórtala para guardarla.`
              : "Para publicar tu reseña, elige Me gusta o Me obsesiona.")}
        </p>
      )}

      <button type="button" onClick={save} disabled={!canSave} className={`${SOLID_BUTTON} mx-1 mt-3.5`}>
        {saving ? "Guardando…" : "Guardar"}
      </button>

      {completed && (
        <button
          type="button"
          onClick={uncomplete}
          disabled={saving}
          className="mt-1 flex min-h-11 items-center self-center px-3 text-[15px] font-medium text-text-2 transition-opacity active:opacity-60 disabled:opacity-40"
        >
          Quitar completado
        </button>
      )}
    </div>
  );
}

/** The 51×31 switch of the system: `--text` track when on, the knob in --bg. */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative block h-[31px] w-[51px] flex-none rounded-full transition-colors duration-200 ${on ? "bg-text" : "bg-white/[0.16]"}`}
    >
      <span
        className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full transition-[translate,background-color] duration-200 ${on ? "translate-x-5 bg-bg" : "translate-x-0 bg-text"}`}
      />
    </span>
  );
}
