"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { spring, type SpringHandle } from "@/lib/spring";
import { clearZoomOrigin, readZoomOrigin } from "../../zoom-origin";
import { ZoomExitCtx } from "../../zoom-exit";

/** The mock's resting origin — used when nothing recorded a tap (keyboard
 *  activation, a programmatic push). */
const FALLBACK_ORIGIN = "50% 32%";
/** Scale the overlay blooms from (and shrinks back to). */
const FROM_SCALE = 0.86;

/**
 * The collection overlay's presence, driven by ONE spring `p` 0 → 1 written
 * straight to the DOM (scale + opacity around the recorded tap point):
 *  - entrance: critically damped, so it leaves at full speed and settles
 *    without a bounce — no ease-in dawdle before the bloom;
 *  - exit (Volver, via `ZoomExitCtx`): the same spring back to 0, from
 *    wherever it is, and `router.back()` only once it has landed.
 * At rest the transform is cleared, so the overlay stops being a containing
 * block for its `fixed` descendants. Reduced motion: a cross-fade.
 */
export function ZoomShell({ children }: { children: ReactNode }) {
  // Read once per mount: the shell mounts once per open (it lives in the
  // segment layout), so this is the tap that opened it.
  const [origin] = useState(() => {
    const o = readZoomOrigin();
    return o ? `${Math.round(o.x)}px ${Math.round(o.y)}px` : FALLBACK_ORIGIN;
  });
  // Cleared in an effect, not in the initializer: strict mode runs that twice.
  useEffect(() => {
    clearZoomOrigin();
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  const s = useRef({
    p: 0,
    reduce: false,
    leaving: false,
    handle: null as SpringHandle | null,
  }).current;

  const apply = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const p = s.p;
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
    el.style.transform =
      s.reduce || p === 1
        ? ""
        : `scale(${(FROM_SCALE + (1 - FROM_SCALE) * p).toFixed(4)})`;
  }, [s]);

  const animate = useCallback(
    (to: number, onRest?: () => void) => {
      const velocity = s.handle?.velocity() ?? 0;
      s.handle?.stop();
      s.handle = spring({
        from: s.p,
        to,
        velocity,
        damping: 1,
        response: to === 1 ? 0.42 : 0.3,
        precision: 0.002,
        onUpdate: (v) => {
          s.p = v;
          apply();
        },
        onRest,
      });
    },
    [s, apply],
  );

  useLayoutEffect(() => {
    s.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    apply(); // pre-paint: the first frame is already the start of the bloom
    animate(1);
    return () => s.handle?.stop();
    // Once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exit = useCallback(
    (then: () => void) => {
      if (s.leaving) return;
      s.leaving = true;
      const el = ref.current;
      if (el) el.style.pointerEvents = "none";
      animate(0, then);
    },
    [s, animate],
  );

  return (
    <ZoomExitCtx.Provider value={exit}>
      <div
        ref={ref}
        className="fixed inset-0 z-50 overflow-y-auto bg-bg"
        style={{ transformOrigin: origin }}
      >
        {children}
      </div>
    </ZoomExitCtx.Provider>
  );
}
