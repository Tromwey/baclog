"use client";

import { useState, useTransition } from "react";
import { setStatusAction } from "@/app/actions/backlog-item-actions";
import { useLongPress } from "@/hooks/use-long-press";

/**
 * The single progress control in the bottom action bar (HANDOFF §1):
 * tap → en progreso · mantener presionado (500ms) → completado. Tap always
 * sets in_progress — even from completed (re-watching); there is no UI path
 * back to on_my_radar (that's the implicit default of being logged).
 *
 * Ring states: on_my_radar = neutral outline · in_progress = solid lima arc
 * (~63%) over a grey track (mock #p3) · completed = solid lima + check. While
 * holding, a lima ring "charges" over the threshold as the long-press
 * affordance.
 */

const HOLD_MS = 500;
const R = 9;
const CIRC = 2 * Math.PI * R; // ≈ 56.5 on the 24×24 grid

const STATUS_LABEL: Record<string, string> = {
  on_my_radar: "En el radar",
  in_progress: "En progreso",
  completed: "Completado",
};

export function ProgressGesture({
  catalogItemId,
  initialStatus,
}: {
  catalogItemId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function apply(next: "in_progress" | "completed") {
    if (status === next) return;
    setError(null);
    const prev = status;
    setStatus(next); // optimistic — revert on failure
    // Compare-before-revert (mirrors reaction-state.tsx): only roll back if
    // OUR optimistic value is still current — a slow failing request must not
    // clobber a newer write (e.g. tap → hold while the tap is in flight).
    const revert = () => {
      setStatus((current) => (current === next ? prev : current));
      setError("No se pudo actualizar.");
    };
    startTransition(() =>
      setStatusAction(catalogItemId, next)
        .then((res) => {
          if ("error" in res) revert();
        })
        .catch(revert),
    );
  }

  const longPress = useLongPress(
    () => apply("in_progress"),
    () => apply("completed"),
    { threshold: HOLD_MS },
  );

  const label = STATUS_LABEL[status] ?? STATUS_LABEL.on_my_radar;
  const lit = status === "in_progress" || status === "completed";

  return (
    <div className="flex w-[64px] flex-none flex-col items-center gap-1.5">
      {/* Label ABOVE the ring: below, it hung under the action bar and ate the
          bottom space (esp. installed, no Safari toolbar). Ring stays last so it
          bottom-aligns with Agregar/Reproducir (the bar uses items-end). */}
      <span
        className={`text-center font-mono text-[8.5px] uppercase leading-tight tracking-[0.08em] ${
          lit ? "text-accent" : "text-text-3"
        }`}
      >
        {label}
      </span>
      {error && (
        <span className="text-center text-[9px] leading-tight text-red-400">
          {error}
        </span>
      )}
      <button
        type="button"
        aria-label="Progreso — toca para «en progreso», mantén presionado para «completado»"
        onPointerDown={(e) => {
          // Mirror the hook's primary-pointer guard so the charging ring only
          // shows for presses that can actually complete.
          if (e.isPrimary && (e.pointerType !== "mouse" || e.button === 0)) {
            setHolding(true);
          }
          longPress.onPointerDown(e);
        }}
        onPointerUp={(e) => {
          setHolding(false);
          longPress.onPointerUp(e);
        }}
        onPointerLeave={() => {
          setHolding(false);
          longPress.onPointerLeave();
        }}
        onPointerCancel={() => {
          setHolding(false);
          longPress.onPointerCancel();
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="flex h-[52px] w-[52px] touch-manipulation select-none items-center justify-center rounded-full bg-surface-2 transition-colors [-webkit-touch-callout:none] hover:bg-surface-3"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          {status === "completed" ? (
            <>
              <circle cx="12" cy="12" r={R} stroke="var(--accent)" strokeWidth="2.5" />
              <path
                d="M8.4 12.3l2.4 2.4 4.8-5.3"
                stroke="var(--accent)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              <circle cx="12" cy="12" r={R} stroke="#3a3a44" strokeWidth="2.5" />
              {/* in_progress: solid lima arc (~63%) over the grey track (mock #p3). */}
              {status === "in_progress" && (
                <circle
                  cx="12"
                  cy="12"
                  r={R}
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="56.5"
                  strokeDashoffset="21"
                  transform="rotate(-90 12 12)"
                />
              )}
              {/* Hold-to-complete "charging" fill — sweeps over HOLD_MS. */}
              <circle
                cx="12"
                cy="12"
                r={R}
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={holding ? 0 : CIRC}
                style={{
                  transition: holding
                    ? `stroke-dashoffset ${HOLD_MS}ms linear`
                    : "none",
                }}
                transform="rotate(-90 12 12)"
              />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
