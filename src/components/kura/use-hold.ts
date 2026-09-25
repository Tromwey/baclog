"use client";

import { useEffect, useRef } from "react";

/**
 * "Mantener presionado" (flujos-v2 · 10 cards, 18c títulos): 450 ms on the
 * pointer — or the context menu (right click / iOS long-press menu) — opens
 * the thing's sheet. A move beyond 8 px is a scroll, not a hold. After a hold
 * the click that follows is swallowed, so the Link underneath doesn't also
 * navigate. A hold that fires ticks the haptics where the device has them
 * (`navigator.vibrate` — Android; iOS Safari has none, so it's a no-op).
 *
 * Only the primary pointer counts (a second finger, a right/middle button
 * don't start a hold), and a context menu that arrives AFTER the timer
 * already fired (Android sends one on long-press) is swallowed instead of
 * opening the sheet a second time.
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

  // A hold pending when the element unmounts must not fire into the void.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const fire = () => {
    fired.current = true;
    try {
      navigator.vibrate?.(10);
    } catch {
      // no haptics here
    }
    onHold();
  };

  return {
    /** True right after a hold — for callers that also handle onClick. */
    firedRef: fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (!e.isPrimary) return;
        cancel();
        // Every new press re-arms, a right-click included (its contextmenu
        // must open the sheet even right after a hold).
        fired.current = false;
        if (e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          timer.current = null;
          fire();
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
        // The long-press already opened it; this menu is the same gesture.
        if (fired.current) return;
        cancel();
        fire();
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
