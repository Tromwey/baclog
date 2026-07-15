"use client";

import { useEffect, useRef } from "react";

/**
 * Standalone iOS PWAs don't reliably auto-scroll a focused input above the
 * keyboard the way a regular Safari tab does — the visual viewport shrinks
 * but nothing re-centers the focused element, so it stays hidden underneath.
 * Scrolls the element back into view on focus and on every subsequent
 * visualViewport resize (the keyboard's show animation fires this a beat
 * after focus) while it's still the active element.
 */
export function useScrollIntoViewOnKeyboard<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;

    function scrollToEl() {
      if (document.activeElement === el) {
        el!.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    el.addEventListener("focus", scrollToEl);
    vv.addEventListener("resize", scrollToEl);
    return () => {
      el.removeEventListener("focus", scrollToEl);
      vv.removeEventListener("resize", scrollToEl);
    };
  }, []);

  return ref;
}
