/**
 * The mock's glass button (Revamp UI 06): 13/16 padding, Hanken 600 14px,
 * the borderless glass fill. Plain module so the server page and the client
 * button share one string (a "use client" export would arrive at the server
 * page as a client reference, not a class list).
 */
export const glassButtonClass =
  "flex items-center justify-center gap-2 rounded-full bg-[var(--glass-bg)] px-4 py-[13px] text-[14px] font-semibold text-text transition-colors hover:bg-white/[0.12] active:scale-[0.98]";
