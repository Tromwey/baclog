/**
 * Client-side singleton for the page transition (M3.5 → Kura). The nav dock
 * sets a direction (+1 forward, -1 back, 0 none) right before navigating; the
 * per-navigation template (page-slide) reads it once on mount: a tab change
 * (non-zero) enters in 0 ms, anything else fades. Module scope = shared across template remounts.
 *
 * Back/forward (popstate) also enters in 0 ms: on iOS the edge-swipe already
 * showed the destination sliding in, and replaying a fade after it lands
 * reads as the page loading twice. A popstate marks the NEXT template mount;
 * any tap in between (a new navigation starting) clears a mark that no
 * remount consumed — so a same-page history pop can't swallow a later fade.
 */
let pending = 0;

/** Marker for "this navigation came from the browser's history". */
const POP = -2;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    pending = POP;
  });
  window.addEventListener(
    "pointerdown",
    () => {
      if (pending === POP) pending = 0;
    },
    true,
  );
}

export function setNavDirection(dir: number) {
  pending = dir;
}

export function readNavDirection(): number {
  return pending;
}

export function clearNavDirection() {
  pending = 0;
}
