"use client";

import { useRef } from "react";

/**
 * "Mantener presionado" (flujos-v2 · 10 cards, 18c títulos): 450 ms on the
 * pointer — or the context menu (right click / iOS long-press menu) — opens
 * the thing's sheet. A move beyond 8 px is a scroll, not a hold. After a hold
 * the click that follows is swallowed, so the Link underneath doesn't also
 * navigate.
 *
 * Spread the returned handlers on the pressable element (a Link, usually)
 * and give it `select-none [-webkit-touch-callout:none]`.
 */
export function useHold(onHold: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    /** True right after a hold — for callers that also handle onClick. */
    firedRef: fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          timer.current = null;
          onHold();
        }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) cancel();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        cancel();
        fired.current = true;
        onHold();
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (fired.current) {
          e.preventDefault();
          e.stopPropagation();
          fired.current = false;
        }
      },
      draggable: false,
    },
  };
}
