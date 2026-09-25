"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Modal focus for a dialog panel (give it `tabIndex={-1}`):
 *  - on mount, focus moves INTO the panel — unless something inside already
 *    took it (an `autoFocus` field, a child effect focusing its input);
 *  - Tab / Shift+Tab cycle within the panel instead of walking out into the
 *    page behind the scrim;
 *  - on unmount (after the exit has played), focus returns to whatever held
 *    it before the dialog opened, if it's still in the document.
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && previous.isConnected && previous !== document.body) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [panelRef, enabled]);
}
