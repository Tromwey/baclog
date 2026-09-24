import type { ReactNode } from "react";
import { SOLID_BUTTON } from "@/components/kura/components";

/**
 * Kura · the pieces the onboarding screens share (design/kura/flujos-v2
 * .dc.html, flujo 01 — O1b "elige tu usuario", 32a "elige 3", 32b "tu
 * gente", and the service step the mock doesn't draw, styled after 30b).
 *
 * No glow, no aura: the only colour on these screens is a flat tint of a
 * picked cover (`tint.ts`), and the chrome itself is glass or solid fills.
 */

/**
 * Two counters, as in the mock: the account ("2 de 2" on O1b — the email was
 * 1) and the profile seeding that follows. The mock's seeding is "1 de 2 ·
 * 2 de 2" (elige 3 · tu gente); the product keeps the service step the mock
 * doesn't draw, so it counts three.
 */
export const SEED_STEPS = 3;

/** The pinned bottom action, over a fade to the background (32a/32b). */
export function PinnedFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-[calc(34px+env(safe-area-inset-bottom))] pt-[18px]"
      style={{
        background:
          "linear-gradient(180deg, rgba(11,11,13,0), rgba(11,11,13,.92) 40%)",
      }}
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2.5">
        {children}
      </div>
    </div>
  );
}

/**
 * The flow's CTA: glass with the count left while it can't go on ("Elige 2
 * más"), solid once it can ("Continuar"). The waiting state is a real
 * `disabled` so a tap does nothing and assistive tech hears why.
 */
export function FlowCta({
  ready,
  busy = false,
  children,
  onClick,
  type = "button",
  form,
}: {
  ready: boolean;
  busy?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  form?: string;
}) {
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={!ready || busy}
      aria-busy={busy || undefined}
      className={
        ready
          ? `${SOLID_BUTTON} w-full`
          : "inline-flex h-[52px] w-full items-center justify-center rounded-full bg-[var(--glass-bg)] px-5 font-sans text-[16px] font-semibold text-text-2 transition-[background-color,color] duration-[220ms]"
      }
    >
      {children}
    </button>
  );
}

/** "Algo falló": the triangle + what happened and what to do. Never red. */
export function FailLine({
  children,
  align = "center",
  className = "",
}: {
  children: ReactNode;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={`flex items-center gap-2 text-[13px] leading-[1.5] text-text ${
        align === "center" ? "justify-center text-center" : "justify-start text-left"
      } ${className}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none text-text-2"
        aria-hidden
      >
        <path d={WARN_PATH} />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** The mock's step mark: Red Hat Mono 11, uppercase, +8 %, text-2. */
export function StepMark({ n, of }: { n: number; of: number }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
      {n} de {of}
    </span>
  );
}

/** Lupa of the mock's search field (32a). */
export const SEARCH_PATH = "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4";
/** Clear the search. */
export const CLEAR_PATH = "M6 6l12 12M18 6L6 18";
/** The error triangle (§patrones · error). */
const WARN_PATH = "M12 4l9 16H3zM12 10v4M12 17.5v.01";
/** 30b's check on the chosen service. */
export const RADIO_CHECK_PATH = "M5 12.5l4.5 4.5L19 7.5";

/** The 18 px stroked icon every glass control here uses. */
export function Stroke({
  d,
  size = 18,
  width = 2.2,
  className = "",
}: {
  d: string;
  size?: number;
  width?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className}`}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
