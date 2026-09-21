"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  VelocityTracker,
  project,
  rubberband,
  spring,
  type SpringHandle,
} from "@/lib/spring";

/** Movement before a press becomes a drag — below it, it's still a tap. */
const HYSTERESIS = 10;

/** Capture keeps the drag alive outside the panel. It throws if the pointer
 *  is already gone (lifted between events) — the drag just ends normally then. */
function capture(el: HTMLElement, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // no active pointer with that id
  }
}

/**
 * The motion of every sheet in the app: a spring-driven entrance, the SAME
 * path back out, and a drag-to-dismiss that tracks the finger 1:1.
 *
 * Two values drive everything, written straight to the DOM (no re-render per
 * frame):
 *  - `p`     presence, 0 → 1. Entrance and the non-gesture exit (scrim tap,
 *            Escape, a Cancel button) are the same spring run both ways, so
 *            the sheet leaves along the path it arrived on.
 *  - `dragY` the finger's offset. 1:1 downward, rubber-banded upward (there
 *            is nothing up there — resistance says so without a dead stop).
 *
 * On release the landing point is PROJECTED from the release velocity, so a
 * short flick throws the sheet away and a slow long drag that reverses comes
 * back — and whichever spring runs next inherits that velocity, so there is
 * no seam between dragging and animating. Both springs read the live value
 * when interrupted: grab a sheet mid-exit and it follows the finger again.
 *
 * Gesture arbitration (decided at pointerdown, the press stays a tap until it
 * has moved HYSTERESIS px mostly-vertically):
 *  - inside `[data-sheet-handle]` → always drags;
 *  - inside a text field → never (the caret and selection own that drag);
 *  - inside a scroller that actually overflows → never (it scrolls);
 *  - anywhere else on the panel → drags.
 * CONSUMERS: the panel (and any non-overflowing scroller in it) needs
 * `touch-action: none`, or a touch browser claims the vertical pan for itself
 * and cancels the pointer stream. <Sheet> handles this; see it for the recipe.
 *
 * Reduced motion keeps the drag (it is the user's own movement) but drops the
 * travel, the scale and the bounce: presence becomes a cross-fade.
 */
export function useSheetMotion({
  onClose,
  enterOffset = 18,
  enterScale = 0.97,
  draggable = true,
  enabled = true,
}: {
  /** Fires AFTER the exit has played. The caller unmounts the sheet here. */
  onClose: () => void;
  /** How far below its rest position the panel starts. `"full"` = from under
   *  the bottom edge (an edge-attached sheet), and then it doesn't fade. */
  enterOffset?: number | "full";
  enterScale?: number;
  draggable?: boolean;
  /** False while the panel isn't in the DOM yet (a portal waiting on
   *  hydration); the entrance plays when it flips to true. */
  enabled?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const s = useRef({
    p: 0,
    dragY: 0,
    enterPx: 0,
    exitPx: 1,
    reduce: false,
    closing: false,
    suppressClick: false,
    pSpring: null as SpringHandle | null,
    ySpring: null as SpringHandle | null,
    tracker: new VelocityTracker(),
    drag: null as null | {
      id: number;
      startX: number;
      startY: number;
      base: number;
      offset: number;
      active: boolean;
    },
  }).current;

  const fade = enterOffset !== "full";

  const apply = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const p = Math.min(1, Math.max(0, s.p));
    const atRest = p === 1 && s.dragY === 0;
    if (atRest) {
      // No lingering transform: it would make the panel a containing block
      // for fixed descendants and costs a layer for nothing.
      panel.style.transform = "";
    } else {
      const y = (s.reduce ? 0 : (1 - p) * s.enterPx) + s.dragY;
      const scale = s.reduce ? 1 : enterScale + (1 - enterScale) * p;
      panel.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    }
    panel.style.opacity = fade || s.reduce ? String(p) : "1";
    const scrim = scrimRef.current;
    if (scrim) {
      const gone = Math.min(1, Math.max(0, s.dragY / s.exitPx));
      scrim.style.opacity = String(p * (1 - gone));
    }
  }, [s, fade, enterScale]);

  const animateP = useCallback(
    (to: number, onRest?: () => void) => {
      const velocity = s.pSpring?.velocity() ?? 0;
      s.pSpring?.stop();
      s.pSpring = spring({
        from: s.p,
        to,
        velocity,
        damping: 1,
        response: to === 1 ? 0.35 : 0.25,
        precision: 0.005,
        onUpdate: (v) => {
          s.p = v;
          apply();
        },
        onRest,
      });
    },
    [s, apply],
  );

  /** Distance from the rest position to fully under the bottom edge. */
  const measureExit = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const current = (s.reduce ? 0 : (1 - s.p) * s.enterPx) + s.dragY;
    const restTop = panel.getBoundingClientRect().top - current;
    s.exitPx = Math.max(1, window.innerHeight - restTop + 24);
  }, [s]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return;
    s.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.style.transform = "";
    s.exitPx = Math.max(
      1,
      window.innerHeight - panel.getBoundingClientRect().top + 24,
    );
    s.enterPx = enterOffset === "full" ? s.exitPx : enterOffset;
    apply(); // pre-paint: the first frame is already the start of the entrance
    animateP(1);
    return () => {
      s.pSpring?.stop();
      s.ySpring?.stop();
    };
    // Once per mount: the entrance plays once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  /** The non-gesture exit: the entrance, reversed. Then `onClose`. */
  const dismiss = useCallback(() => {
    if (s.closing) return;
    s.closing = true;
    animateP(0, () => onCloseRef.current());
  }, [s, animateP]);

  const settle = useCallback(
    (velocity: number) => {
      const panel = panelRef.current;
      if (!panel) return;
      measureExit();
      const height = panel.offsetHeight;
      const landing = s.dragY + project(velocity);
      // Velocity SIGN decides a reversal; the projection decides the rest.
      const away = velocity > -50 && landing > Math.min(height * 0.5, 280);
      s.ySpring?.stop();
      if (away) {
        s.closing = true;
        s.ySpring = spring({
          from: s.dragY,
          to: s.exitPx,
          velocity,
          damping: 1,
          response: 0.3,
          precision: 3,
          onUpdate: (v) => {
            s.dragY = v;
            apply();
          },
          onRest: () => onCloseRef.current(),
        });
      } else {
        s.ySpring = spring({
          from: s.dragY,
          to: 0,
          velocity,
          // The bounce is earned: a gesture threw this. Not under reduced motion.
          damping: s.reduce ? 1 : 0.8,
          response: 0.3,
          onUpdate: (v) => {
            s.dragY = v;
            apply();
          },
          onRest: () => {
            s.ySpring = null;
          },
        });
      }
    },
    [s, apply, measureExit],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      s.suppressClick = false;
      if (!draggable || !e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const panel = panelRef.current;
      const target = e.target as HTMLElement;
      if (!panel) return;

      if (!target.closest("[data-sheet-handle]")) {
        if (target.closest("input, textarea, select, [contenteditable='true']")) {
          return;
        }
        for (
          let el: HTMLElement | null = target;
          el && el !== panel;
          el = el.parentElement
        ) {
          const overflowY = getComputedStyle(el).overflowY;
          if (
            (overflowY === "auto" || overflowY === "scroll") &&
            el.scrollHeight > el.clientHeight + 1
          ) {
            return;
          }
        }
      }

      // Grabbed mid-flight: take over from the live value — no waiting for
      // the animation to finish, and no hysteresis (it is already moving).
      const midFlight = s.ySpring !== null;
      s.ySpring?.stop();
      s.ySpring = null;
      if (s.closing) {
        s.closing = false;
        animateP(1);
      }
      s.tracker.reset();
      s.drag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        base: s.dragY,
        offset: 0,
        active: midFlight,
      };
      if (midFlight) capture(panel, e.pointerId);
    },
    [s, draggable, animateP],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = s.drag;
      const panel = panelRef.current;
      if (!d || !panel || e.pointerId !== d.id) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.active) {
        if (Math.abs(dy) < HYSTERESIS) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          s.drag = null; // a horizontal intent — not ours
          return;
        }
        d.active = true;
        // Start tracking from HERE, so crossing the threshold isn't a jump.
        d.offset = Math.sign(dy) * HYSTERESIS;
        s.suppressClick = true;
        capture(panel, d.id);
        panel.style.userSelect = "none";
      }
      const raw = d.base + dy - d.offset;
      s.dragY = raw >= 0 ? raw : rubberband(raw, panel.offsetHeight);
      s.tracker.add(s.dragY, e.timeStamp);
      apply();
    },
    [s, apply],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const d = s.drag;
      const panel = panelRef.current;
      if (!d || e.pointerId !== d.id) return;
      s.drag = null;
      if (!d.active || !panel) return;
      if (panel.hasPointerCapture(d.id)) panel.releasePointerCapture(d.id);
      panel.style.userSelect = "";
      settle(cancelled ? 0 : s.tracker.get(e.timeStamp));
    },
    [s, settle],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => endDrag(e, false),
    [endDrag],
  );
  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => endDrag(e, true),
    [endDrag],
  );

  // A drag that ends over a button must not also press it.
  const onClickCapture = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!s.suppressClick) return;
      s.suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    [s],
  );

  return {
    panelRef,
    scrimRef,
    dismiss,
    panelHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
    },
  };
}

/**
 * The other half of the `touch-action` recipe. The sheet panel is
 * `touch-action: none` so a touch drag reaches the motion hook instead of
 * being claimed as a page pan; a scroller inside it opts back into native
 * panning ONLY while it actually overflows — an empty scroller would swallow
 * the drag and scroll nothing.
 */
export function useScrollerTouchAction(
  ref: RefObject<HTMLElement | null>,
  /** Same meaning as `useSheetMotion`'s: false until the scroller is mounted. */
  enabled = true,
) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const sync = () => {
      el.style.touchAction =
        el.scrollHeight > el.clientHeight + 1 ? "pan-y" : "none";
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    // Content growing inside a fixed-height scroller doesn't resize the
    // scroller itself — watch the children too.
    const mo = new MutationObserver(sync);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref, enabled]);
}
