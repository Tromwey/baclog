/**
 * The "Seguir" pill recipes as a PLAIN module (a `"use client"` module's
 * string exports become client references on the server — see
 * learnings/2026-09-03-export-de-modulo-use-client-llamado-en-servidor.md),
 * so a server component can draw the anonymous twin (a Link to /login) with
 * exactly the class of the real client button.
 *
 * Kura (2026-09-24, §componentes · botones):
 *  - `FOLLOW_HONEY` — Seguir is THE honey action of a profile or a feed
 *    suggestion, 44 tall; "Siguiendo" drops to glass. No glow.
 *  - `FOLLOW_ROW` — the people rows (20e, 32b, E1): glass 36, 14/600;
 *    "Siguiendo" goes transparent in text-2. Honey appears once per screen,
 *    so a list of people never wears it.
 */
export const FOLLOW_HONEY_BASE =
  "inline-flex h-11 flex-none items-center justify-center rounded-full px-5 font-sans text-[15px] font-semibold bl-press";
export const FOLLOW_HONEY_ON = "bg-honey text-bg active:bg-honey-press";
export const FOLLOW_HONEY_OFF = "bg-[var(--glass-bg)] text-text hover:bg-white/[0.12]";

export const FOLLOW_ROW_BASE =
  "inline-flex h-9 flex-none items-center justify-center rounded-full px-4 font-sans text-[14px] font-semibold bl-press";
export const FOLLOW_ROW_ON = "bg-[var(--glass-bg)] text-text hover:bg-white/[0.12]";
export const FOLLOW_ROW_OFF = "bg-transparent text-text-2 hover:text-text";

/** The anonymous "Seguir" (a Link into the account flow), same honey pill. */
export const followPillClass = `${FOLLOW_HONEY_BASE} ${FOLLOW_HONEY_ON}`;
