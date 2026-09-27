/**
 * Client-side hand-off for the profile → collection transition (Colecciones ·
 * transiciones §2): the tapped row records WHICH fan was touched right before
 * its Link navigates; the intercepted overlay (`backlogs/collection-overlay.tsx`)
 * takes it once on mount and flies that fan into its header. Module scope,
 * like `nav-direction.ts`. The row's element is found again by
 * `[data-fan-source="<id>"]` (the Link) — its first child is the Fan.
 */
import type { FanCover } from "@/modules/backlog/fan";

let pending: { id: string; at: number; covers: readonly FanCover[]; lead: number } | null = null;

export interface FanFlight {
  /** The row's fan, still in the profile underneath. */
  el: HTMLElement;
  covers: readonly FanCover[];
  /** Its size (`Fan`'s `lead`): 186 the featured one, 99 the grid. */
  lead: number;
}

/** How long a recorded tap stays valid (the overlay mounts within a frame
 *  of the navigation — its loading.tsx is instant — but a cold dev compile
 *  can take seconds). */
const FRESH_MS = 5000;

export function recordFanFlight(id: string, covers: readonly FanCover[], lead: number) {
  pending = { id, at: performance.now(), covers, lead };
}

/** The recorded tap for `id` — once — if this open came from one. */
export function takeFanFlight(id: string): FanFlight | null {
  const p = pending;
  pending = null;
  if (!p || p.id !== id || performance.now() - p.at > FRESH_MS) return null;
  const el = fanSource(id);
  return el ? { el, covers: p.covers, lead: p.lead } : null;
}

export function fanSource(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-fan-source="${CSS.escape(id)}"] > span`);
}
