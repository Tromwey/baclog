/**
 * Client-side singleton for the shelf → detail zoom (same idea as
 * `nav-direction.ts`). The shelves record where the tap landed right before
 * navigating; the intercepted overlay's shell reads it once on mount and
 * blooms FROM that point — the detail grows out of the backlog you touched
 * instead of out of a fixed spot on the screen. Viewport coordinates, which
 * is the shell's own space (`fixed inset-0`).
 */
let pending: { x: number; y: number } | null = null;

export function setZoomOrigin(x: number, y: number) {
  pending = { x, y };
}

export function readZoomOrigin(): { x: number; y: number } | null {
  return pending;
}

/** An origin belongs to exactly one open. */
export function clearZoomOrigin() {
  pending = null;
}
