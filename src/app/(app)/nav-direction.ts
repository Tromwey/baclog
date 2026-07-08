/**
 * Client-side singleton for the carousel page transition (M3.5). The nav dock
 * sets a direction (+1 forward, -1 back, 0 none) right before navigating; the
 * per-navigation template (page-slide) reads it once on mount to pick the slide
 * direction, then clears it. Module scope = shared across template remounts.
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
