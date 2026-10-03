"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * The open modals, bottom to top. Only the LAST one traps Tab and answers
 * Escape: a sheet opened from a full-screen dialog (the collection overlay)
 * is portaled next to it, not inside it, so two independent traps would fight
 * — the lower one yanking focus back to its own ends and leaving the sheet's
 * middle controls unreachable by keyboard.
 */
const stack: HTMLElement[] = [];

/** Is this panel the topmost open dialog? (Escape handlers ask before closing.) */
export function isTopDialog(panel: HTMLElement | null): boolean {
  return !!panel && stack[stack.length - 1] === panel;
}

/**
 * The last few elements that took focus, newest last. A sheet whose field
 * carries `autoFocus` (or is focused by the tap that opens it) already owns
 * the focus by the time this hook's effect runs — React applies `autoFocus`
 * during commit, effects run after — so `document.activeElement` is the
 * field, not the opener. The opener is then the newest entry here that is
 * NOT inside the panel — and that did not later lose the focus to nothing
 * (see the `focusout` listener). Listening from module load (not from the effect) is
 * the point: the opener's own `focusin` happened before any dialog existed.
 */
const recent: HTMLElement[] = [];
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || recent[recent.length - 1] === el) return;
      recent.push(el);
      if (recent.length > 6) recent.shift();
    },
    true,
  );
  // An element that lost the focus to NOTHING (a tap on the page; Safari's
  // click on a button, which focuses nothing) is no longer where the user
  // was: without this, a field focused minutes ago would pass for the opener
  // of a sheet opened from a button Safari never focused, and closing the
  // sheet would send the focus there. Focus moving to ANOTHER element (the
  // opener handing over to the sheet's `autoFocus` field) has a
  // `relatedTarget` and keeps its entry.
  document.addEventListener(
    "focusout",
    (e) => {
      if (e.relatedTarget instanceof HTMLElement) return;
      // The tab/window going to the background blurs the element but keeps
      // it as `activeElement`: the focus comes back to it, the entry stays.
      if (!document.hasFocus()) return;
      const i = recent.lastIndexOf(e.target as HTMLElement);
      if (i >= 0) recent.splice(i, 1);
    },
    true,
  );
}

/** What held the focus before `panel` opened (see `recent`). */
function openerOf(panel: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && !panel.contains(active)) return active;
  for (let i = recent.length - 1; i >= 0; i--) {
    const el = recent[i];
    if (el.isConnected && !panel.contains(el)) return el;
  }
  return null;
}

const visible = (root: ParentNode) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);

/**
 * Modal focus for a dialog panel (give it `tabIndex={-1}`):
 *  - on mount, focus moves INTO the panel — unless something inside already
 *    took it (an `autoFocus` field, a child effect focusing its input) — the
 *    opener is still remembered in that case, from the focus history;
 *  - Tab / Shift+Tab cycle within the panel instead of walking out into the
 *    page behind the scrim — only while this is the TOP dialog of the stack;
 *  - on unmount (after the exit has played), focus returns to whatever held
 *    it before the dialog opened, if it's still in the document.
 *
 * Options (CSS selectors, resolved when the dialog opens):
 *  - `inert`: what the dialog covers. Made `inert` AFTER the opener is
 *    remembered and released BEFORE focus goes back to it — the other order
 *    blurs the opener on the way in and refuses the focus on the way out
 *    (it would land on <body>).
 *  - `also`: chrome that stays live around the dialog (the lifted dock). Its
 *    controls join the Tab cycle after the panel's, so the keyboard reaches
 *    what the pointer reaches.
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  enabled = true,
  options?: { inert?: string; also?: string },
) {
  const inertSel = options?.inert;
  const alsoSel = options?.also;
  useEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;
    const previous = openerOf(panel);
    const covered = inertSel
      ? Array.from(document.querySelectorAll<HTMLElement>(inertSel)).filter((el) => !el.hasAttribute("inert"))
      : [];
    for (const el of covered) el.setAttribute("inert", "");
    stack.push(panel);
    if (!panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !isTopDialog(panel)) return;
      const also = alsoSel ? document.querySelector<HTMLElement>(alsoSel) : null;
      const own = visible(panel);
      const items = also ? [...own, ...visible(also)] : own;
      if (items.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const at = active ? items.indexOf(active) : -1;
      const inside = !!active && (panel.contains(active) || !!also?.contains(active));
      const go = (el: HTMLElement) => {
        e.preventDefault();
        el.focus();
      };
      if (e.shiftKey) {
        if (!inside || active === panel || at === 0) go(items[items.length - 1]);
        // Crossing from the extra chrome back into the panel: the DOM order
        // between them is not the cycle's.
        else if (at === own.length) go(items[at - 1]);
      } else {
        if (!inside || at === items.length - 1) go(items[0]);
        else if (also && at === own.length - 1) go(items[at + 1]);
        else if (also && active === panel && own.length === 0) go(items[0]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const wasTop = isTopDialog(panel);
      const i = stack.lastIndexOf(panel);
      if (i >= 0) stack.splice(i, 1);
      for (const el of covered) el.removeAttribute("inert");
      // A dialog closing from UNDER another one must not pull the focus out
      // of the one on top.
      if (wasTop && previous && previous.isConnected && previous !== document.body) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [panelRef, enabled, inertSel, alsoSel]);
}
