import type { ReactNode } from "react";
import { PaletteGlow } from "@/components/ui";

/**
 * The chrome the three onboarding steps share (Revamp UI, 2026-09-03 — mock
 * "01 · Onboarding"): a palette glow hanging off the top, the mock's 500px
 * highlight-and-fade overlay, the copy block (mono eyebrow · display headline
 * · serif lede), and a footer with the pager dots and the CTA.
 *
 * Full-height `main`, no dock, no AuthAuraBackdrop. The footer sits in flow
 * (`mt-auto`) rather than `absolute bottom-[30px]` so on a short phone — or
 * with the keyboard up on steps 1 and 3 — the button never covers the grid or
 * the fields; on the mock's viewport it lands in the same place.
 */

export type OnboardingStep = 1 | 2 | 3;

/**
 * The fixed brand mix behind steps 1 and 3 (there's no content palette yet):
 * the three stops of ONBOARDING_AURA (aura-presets.ts).
 */
export const ONBOARDING_HEXES = ["#C7462F", "#3A5A9B", "#9B4DCA"] as const;

export function OnboardingShell({
  step,
  glowHexes,
  title,
  lede,
  children,
  footer,
}: {
  step: OnboardingStep;
  glowHexes: readonly string[];
  title: string;
  lede: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative isolate flex min-h-lvh flex-col overflow-hidden bg-bg text-text">
      <PaletteGlow
        hexes={glowHexes.length > 0 ? glowHexes : ONBOARDING_HEXES}
        angle={110}
        opacity={0.55}
        blur={90}
        className="-inset-x-[60px] -top-[120px] h-[560px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[500px]"
        style={{
          background:
            "radial-gradient(120% 80% at 80% 0%, rgba(255,255,255,.12), transparent 60%), linear-gradient(rgba(11,11,13,0) 45%, var(--bg))",
        }}
      />

      <div className="relative flex flex-col gap-[18px] px-6 pt-[calc(20px+env(safe-area-inset-top))]">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-2">
          Paso {step} de 3
        </span>
        <h1 className="font-display text-[34px] font-extrabold leading-[0.98] tracking-[-0.02em] text-pretty">
          {title}
        </h1>
        <p className="font-serif text-[20px] italic leading-[1.2] text-text-2">
          {lede}
        </p>
      </div>

      {children}

      <div className="relative mt-auto flex flex-col gap-3 px-5 pb-[calc(30px+env(safe-area-inset-bottom))] pt-6">
        <Pager step={step} />
        {footer}
      </div>
    </main>
  );
}

/** The mock's three dots: 6px text-3, the current one an 18px accent bar. */
export function Pager({ step }: { step: OnboardingStep }) {
  return (
    <div aria-hidden className="flex justify-center gap-1.5">
      {([1, 2, 3] as const).map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-full ${
            n === step ? "w-[18px] bg-accent" : "w-1.5 bg-text-3"
          }`}
        />
      ))}
    </div>
  );
}

/** The mock's ghost line under the CTA: 14px, text-2, no fill. */
export function GhostButton({
  children,
  ...rest
}: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      {...rest}
      className="py-2 text-[14px] text-text-2 transition-colors hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The mock's CTA: full-width accent pill, 17px vertical padding, 16/600. */
export const CTA_CLASS = "w-full py-[17px] text-[16px]";
