/**
 * The glass chip recipes (Revamp UI, 2026-09-03) as a PLAIN module: server
 * components import these strings too, and a `"use client"` module's exports
 * become client references — so the recipes live here and `back-button.tsx`
 * re-exports them for existing callers.
 *
 * The mock's round chip: `var(--glass)` fill, no border, no blur (blur is
 * reserved to what FLOATS: dock, sheets, the floating action).
 */
export const glassChipClass =
  "flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-[var(--glass-bg)] text-text transition-colors hover:bg-white/[0.12]";

/** The text pill of the same glass: mono uppercase 10.5, 9/14 padding. */
export const glassPillClass =
  "inline-flex items-center gap-[7px] rounded-full bg-[var(--glass-bg)] px-3.5 py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-text transition-colors hover:bg-white/[0.12]";
