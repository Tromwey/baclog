import type { FirstRunStep } from "@/modules/backlog/first-run";

/**
 * "Paso N de 3" + three ticks — the welcome onboarding's only chrome.
 *
 * Deliberately typographic: it speaks in the same mono voice as the coach marks
 * and the metadata lines, so it reads as part of the surface instead of a
 * progress widget bolted on top. Ticks are plain fills (no border, no glow —
 * HANDOFF §7); done and current both read lima, pending reads as the hairline.
 *
 * Never rendered at step 0 — an activated user sees no meter anywhere.
 */
export function StepMeter({ step }: { step: Exclude<FirstRunStep, 0> }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-3">
        Paso {step} de 3
      </span>
      <span aria-hidden className="flex gap-[3px]">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-[3px] w-[14px] rounded-full ${
              n <= step ? "bg-accent" : "bg-line"
            }`}
          />
        ))}
      </span>
    </div>
  );
}
