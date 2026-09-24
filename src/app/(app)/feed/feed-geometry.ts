/**
 * The stack's load-bearing numbers as a PLAIN module: the server page sizes
 * its header with HDR_PX, and a `"use client"` module's exports become client
 * references on the server (learnings/2026-09-03-export-de-modulo-use-client-
 * llamado-en-servidor.md) — so they cannot live in feed-card.tsx.
 */

/**
 * Sticky header height — what every card pins under. Feed v10: 18 top + the
 * 44 bell chip row ("tu feed" Newsreader 36 sits on its baseline) + 14
 * bottom. The header in page.tsx is sized to exactly this.
 */
export const HDR_PX = 76;
/** How far a card's body runs past its own height (the mock's EXTB). */
export const EXT_BOTTOM = 120;

export const STICKY_TOP = `calc(${HDR_PX}px + env(safe-area-inset-top))`;
