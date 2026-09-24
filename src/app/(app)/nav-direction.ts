/**
 * Client-side singleton for the page transition (M3.5 → Kura). The nav dock
 * sets a direction (+1 forward, -1 back, 0 none) right before navigating; the
 * per-navigation template (page-slide) reads it once on mount: a tab change
 * (non-zero) enters in 0 ms, anything else fades. Module scope = shared across template remounts.
 */
let pending = 0;

export function setNavDirection(dir: number) {
  pending = dir;
}

export function readNavDirection(): number {
  return pending;
}

export function clearNavDirection() {
  pending = 0;
}
