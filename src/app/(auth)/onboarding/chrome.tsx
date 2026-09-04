import type { ReactNode } from "react";
import { PaletteGlow } from "@/components/ui";

/**
 * The chrome the three onboarding steps share (Revamp UI, 2026-09-03 — mock
 * "01 · Onboarding"): a palette glow hanging off the top, the mock's 500px
 * highlight-and-fade overlay, the copy block (mono eyebrow · display headline
 * · serif lede), and a footer with the pager dots and the CTA.
 *
 * Two layouts, full-height `main`, no dock, no AuthAuraBackdrop either way:
 *  - `flow` (steps 1 and 3): the footer sits in flow (`mt-auto`) rather than
 *    `absolute bottom-[30px]` so on a short phone — or with the keyboard up —
 *    the button never covers the fields; on the mock's viewport it lands in
 *    the same place.
 *  - `scroll` (step 2, the endless pool): the copy block and the grid scroll
 *    inside `main`, and the footer is PINNED over a fade to the background
 *    (the mock's `absolute bottom:30px`), so the covers run under it. The
 *    scroller pads its bottom (`SCROLL_FOOTER_PAD`) so the last row clears it.
 */

export type OnboardingStep = 1 | 2 | 3;

/**
 * The fixed brand mix behind steps 1 and 3 (there's no content palette yet):
 * the three stops of ONBOARDING_AURA (aura-presets.ts).
 */
export const ONBOARDING_HEXES = ["#C7462F", "#3A5A9B", "#9B4DCA"] as const;

/** What the scroller reserves under its content for the pinned footer
 *  (pager 6 + gap 12 + CTA 54 + gap 12 + ghost 36 + pb 30 + a breath). */
const SCROLL_FOOTER_PAD = "pb-[calc(190px+env(safe-area-inset-bottom))]";

export function OnboardingShell({
  step,
  glowHexes,
  title,
  lede,
  layout = "flow",
  children,
  footer,
}: {
  step: OnboardingStep;
  glowHexes: readonly string[];
  title: string;
  lede: string;
  layout?: "flow" | "scroll";
  children: ReactNode;
  footer: ReactNode;
}) {
  const scroll = layout === "scroll";
  const copy = (
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
  );

  return (
    <main
      className={`relative isolate flex flex-col overflow-hidden bg-bg text-text ${
        scroll ? "h-dvh" : "min-h-lvh"
      }`}
    >
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

      {scroll ? (
        <div
          className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] ${SCROLL_FOOTER_PAD}`}
        >
          {copy}
          {children}
        </div>
      ) : (
        <>
          {copy}
          {children}
        </>
      )}

      <div
        className={`flex flex-col gap-3 px-5 pb-[calc(30px+env(safe-area-inset-bottom))] ${
          scroll ? "absolute inset-x-0 bottom-0 pt-14" : "relative mt-auto pt-6"
        }`}
        style={
          scroll
            ? { background: "linear-gradient(rgba(11,11,13,0), var(--bg) 45%)" }
            : undefined
        }
      >
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

/** The mock's text field: flat surface fill, focus = a lighter fill. */
export const INPUT_CLASS =
  "w-full rounded-[var(--r-md)] bg-surface-2 px-4 py-3 text-text outline-none transition-colors placeholder:text-text-3 focus:bg-surface-3";
