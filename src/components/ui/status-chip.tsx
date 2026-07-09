import type { ReactNode } from "react";

/**
 * Status chip (sistema-diseno §4, buttons prototype). The DOT carries the
 * hue — the chip fill stays neutral, so status color reads as a signal, not
 * a paint. `tone` maps to the status hues; `glass` uses the aura-safe glass
 * treatment for the public hero ribbon.
 */
export type ChipTone =
  | "radar"
  | "progress"
  | "completed"
  | "obsessed"
  | "neutral";

const DOT: Record<ChipTone, string> = {
  radar: "bg-radar",
  progress: "bg-obsessing",
  completed: "bg-completed",
  obsessed: "bg-obsessing",
  neutral: "bg-text-3",
};

export function StatusChip({
  tone = "neutral",
  glass = false,
  children,
  className = "",
}: {
  tone?: ChipTone;
  glass?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const shell = glass
    ? "bg-[var(--glass-bg)] border-[var(--glass-border)] backdrop-blur-[20px]"
    : "bg-surface-2 border-line";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border ${shell} px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-text ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}
