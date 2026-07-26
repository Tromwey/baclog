"use client";

import { useEffect, type RefObject } from "react";

/** How long after focus a page scroll still counts as the keyboard's doing. */
const KEYBOARD_SETTLE_MS = 1500;
/** iOS finishes its own scroll after the resize event, so re-check late too. */
const RECHECK_MS = [150, 400];

/**
 * Sibling of [useScrollIntoViewOnKeyboard]: that one pulls a field DOWN into
 * view, this one only undoes an upward scroll iOS did on its own.
 *
 * When the keyboard opens, iOS scrolls the document to clear the focused field
 * — and in a standalone PWA it never scrolls back, which parks a top-anchored
 * screen above the viewport with its header out of sight. Puts `anchor` back on
 * screen, but only in the beat right after focus: later on, a scrolled page is
 * the user scrolling their own content and must be left alone.
 */
export function useKeyboardScrollGuard(
  field: RefObject<HTMLElement | null>,
  anchor: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const input = field.current;
    if (!input) return;
    const vv = window.visualViewport;
    let timers: number[] = [];
    let openedAt = performance.now();

    const correct = () => {
      if (document.activeElement !== input) return;
      if (performance.now() - openedAt > KEYBOARD_SETTLE_MS) return;
      const r = anchor.current?.getBoundingClientRect();
      // Only when the anchor sits ABOVE the viewport — never a downward nudge.
      if (r && r.top < 0) window.scrollTo(0, 0);
    };
    const schedule = () => {
      correct();
      timers.forEach(clearTimeout);
      timers = RECHECK_MS.map((ms) => window.setTimeout(correct, ms));
    };
    const onFocus = () => {
      openedAt = performance.now();
      schedule();
    };

    schedule();
    input.addEventListener("focus", onFocus);
    vv?.addEventListener("resize", schedule);
    return () => {
      input.removeEventListener("focus", onFocus);
      vv?.removeEventListener("resize", schedule);
      timers.forEach(clearTimeout);
    };
  }, [field, anchor]);
}
