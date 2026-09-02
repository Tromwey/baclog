"use client";

import { useEffect, useState } from "react";

/**
 * How many pixels of the layout viewport the on-screen keyboard is covering
 * right now. 0 with no keyboard (and on browsers without visualViewport).
 *
 * Third sibling of the keyboard hooks: `useScrollIntoViewOnKeyboard` brings a
 * PAGE input into view, `useKeyboardScrollGuard` undoes iOS's own scroll —
 * this one exists for FIXED surfaces (the portaled <Sheet>), which iOS lays
 * out against the LAYOUT viewport: the keyboard shrinks only the VISUAL
 * viewport, so a bottom-anchored sheet stays exactly where the keyboard now
 * is. The sheet reads this inset and lifts itself by it.
 *
 * `offsetTop` is part of the math on purpose: when iOS also scrolls the page
 * to reveal a focused field, the visual viewport slides down inside the
 * layout viewport, and ignoring that over-lifts the sheet.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setInset(
        Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)),
      );
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
