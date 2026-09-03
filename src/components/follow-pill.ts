/**
 * The hero "Seguir" pill recipes as a PLAIN module: the public profile (a
 * server component) renders the anonymous variant (a Link to /login) with the
 * same class as the real client button, and a `"use client"` module's string
 * exports become client references on the server (Revamp UI, 2026-09-03).
 */
export const HERO_PILL =
  "inline-flex flex-1 items-center justify-center rounded-full px-4 py-[13px] font-sans text-[14px] font-semibold leading-none transition-[background-color,color] duration-200 active:scale-[0.97]";

/** Same slot, same fill, same press state as the real button. */
export const followPillClass = `${HERO_PILL} bg-text text-bg`;
