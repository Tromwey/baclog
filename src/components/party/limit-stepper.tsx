"use client";

import { KIcon } from "@/components/kura/icons";

/**
 * "Canciones por invitado" (fiesta-app-v2 · create): − value + on a `--s1`
 * track. The steps are the contract's `perGuestLimit`: 0 = solo ver · 1..5 ·
 * null = ilimitadas.
 */
export const LIMIT_STEPS: readonly (number | null)[] = [0, 1, 2, 3, 4, 5, null];

export function limitLabel(v: number | null): string {
  if (v === null) return "ilimitadas";
  if (v === 0) return "solo podrán ver la colección";
  return String(v);
}

const STEP =
  "flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/[0.12] bl-press-sm disabled:pointer-events-none";

export function LimitStepper({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const i = Math.max(0, LIMIT_STEPS.indexOf(value));
  const canDec = i > 0;
  const canInc = i < LIMIT_STEPS.length - 1;
  return (
    <div className="flex h-[60px] items-center justify-between rounded-[18px] bg-[var(--glass-bg)] px-2">
      <button
        type="button"
        aria-label="Menos"
        disabled={!canDec}
        onClick={() => onChange(LIMIT_STEPS[i - 1])}
        className={`${STEP} ${canDec ? "text-text" : "text-text-3"}`}
      >
        <KIcon name="minus" size={14} />
      </button>
      <span
        aria-live="polite"
        className="min-w-0 flex-1 text-center font-mono text-[15px] font-medium text-text [text-wrap:balance]"
      >
        {limitLabel(value)}
      </span>
      <button
        type="button"
        aria-label="Más"
        disabled={!canInc}
        onClick={() => onChange(LIMIT_STEPS[i + 1])}
        className={`${STEP} ${canInc ? "text-text" : "text-text-3"}`}
      >
        <KIcon name="plus" size={14} />
      </button>
    </div>
  );
}
