"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  VelocityTracker,
  project,
  rubberband,
  spring,
  unrubberband,
  type SpringHandle,
} from "@/lib/spring";
import { KIcon } from "./icons";

/**
 * Confirmar y deshacer (sistema de diseño §patrones · 35b / O4b): everything
 * that isn't irreversible happens AT ONCE and says so in a `--s2` pill with
 * "Deshacer"; a failure says what happened, with a triangle and "Reintentar".
 * One at a time — a new one retires the old — and an undo lives 5 s.
 *
 * THE app's one toast (2026-09-24: the ficha's `ToastHost`, Descubrir's
 * `UndoToast` and the search sheet's inline pill all render this now).
 *
 * `onExpire` is the COMMIT hook for deferred writes: a remove that would lose
 * data if undone after the fact (the last membership GC's the title's state)
 * is only hidden optimistically and committed when its toast leaves WITHOUT
 * its action — by timeout, by a swipe down, by being replaced, or by the
 * screen unmounting. Pressing the action never commits.
 *
 * The 5 s are 5 s of the toast being LOOKED AT: the clock stops while the
 * page is hidden (visibilitychange), while the pill is hovered or holds
 * focus, and while a finger is on it. A page hide (pagehide) still commits:
 * on iOS it may be the last thing that runs.
 */

export interface ToastSpec {
  message: string;
  kind?: "undo" | "error";
  actionLabel?: string;
  /** May return a promise: the pill then stays up (action disabled) until it
   *  settles, and only then leaves — unless the action raised a new toast. */
  onAction?: () => void | Promise<unknown>;
  /** Runs once when the toast leaves WITHOUT its action being pressed. */
  onExpire?: () => void;
}

export type LiveToast = ToastSpec & { id: number };

type PauseReason = "hidden" | "hover" | "focus" | "drag" | "busy";

const UNDO_MS = 5000;
const ERROR_MS = 8000;

export interface ToastHost {
  toast: LiveToast | null;
  /** True while an async action of the current toast is running. */
  busy: boolean;
  show: (spec: ToastSpec) => void;
  act: () => void;
  /** Retire the current toast as if it expired (its `onExpire` runs). */
  dismiss: () => void;
  pause: (reason: PauseReason) => void;
  resume: (reason: PauseReason) => void;
}

export function useToast(): ToastHost {
  const [toast, setToast] = useState<LiveToast | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const current = useRef<(LiveToast & { acted?: boolean }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(0);
  const armedAt = useRef(0);
  const pauses = useRef(new Set<PauseReason>());
  const seq = useRef(0);

  const disarm = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(0, remaining.current - (Date.now() - armedAt.current));
  }, []);

  const retire = useCallback(
    (id?: number) => {
      const t = current.current;
      if (!t || (id !== undefined && t.id !== id)) return;
      current.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pauses.current.delete("busy");
      if (!t.acted) t.onExpire?.();
      setToast(null);
      setBusyId(null);
    },
    [],
  );

  const arm = useCallback(() => {
    const t = current.current;
    if (!t || timer.current || pauses.current.size > 0) return;
    armedAt.current = Date.now();
    timer.current = setTimeout(() => {
      timer.current = null;
      retire(t.id);
    }, remaining.current);
  }, [retire]);

  const pause = useCallback(
    (reason: PauseReason) => {
      pauses.current.add(reason);
      disarm();
    },
    [disarm],
  );

  const resume = useCallback(
    (reason: PauseReason) => {
      if (!pauses.current.delete(reason)) return;
      arm();
    },
    [arm],
  );

  const show = useCallback(
    (spec: ToastSpec) => {
      if (current.current) retire();
      seq.current += 1;
      const t = { ...spec, id: seq.current };
      current.current = t;
      // Pauses that belonged to the old pill's element go with it; the page
      // being hidden is about the page, and stays.
      const hidden = pauses.current.has("hidden");
      pauses.current.clear();
      if (hidden) pauses.current.add("hidden");
      remaining.current = spec.kind === "error" ? ERROR_MS : UNDO_MS;
      setToast(t);
      setBusyId(null);
      arm();
    },
    [retire, arm],
  );

  const act = useCallback(() => {
    const t = current.current;
    if (!t || t.acted) return;
    t.acted = true;
    const result = t.onAction?.();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setBusyId(t.id);
      pause("busy");
      void (result as Promise<unknown>).finally(() => retire(t.id));
    } else {
      // An action that raised its own toast (Reintentar → a new failure)
      // already replaced this one; `retire(id)` leaves that one alone.
      retire(t.id);
    }
  }, [pause, retire]);

  const dismiss = useCallback(() => retire(), [retire]);

  // Leaving the screen commits whatever is pending (and a page hide, which
  // on iOS may be the last thing that runs). A hidden page stops the clock.
  useEffect(() => {
    const onHide = () => retire();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause("hidden");
      else resume("hidden");
    };
    onVisibility();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      const t = current.current;
      current.current = null;
      if (timer.current) clearTimeout(timer.current);
      if (t && !t.acted) t.onExpire?.();
    };
  }, [retire, pause, resume]);

  const busy = toast !== null && busyId === toast.id;
  return useMemo(
    () => ({ toast, busy, show, act, dismiss, pause, resume }),
    [toast, busy, show, act, dismiss, pause, resume],
  );
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * The pill, portaled to <body> (the app shell traps fixed layers) — or, with
 * `contained`, absolutely positioned inside its nearest positioned ancestor
 * (the search sheet keeps its pill inside the panel, above the keyboard).
 * `bottom` = distance from the bottom edge: a number of px (plus the safe
 * area), or a raw CSS length. 40 on screens without the dock.
 *
 * Motion: a spring in, the SAME path out (it stays mounted while leaving and
 * unmounts at rest), and a swipe down that follows the finger and throws it
 * away by projected momentum — a dismissal, so `onExpire` commits. Reduced
 * motion: a fade, no travel.
 */
export function Toast({
  host,
  bottom = 40,
  contained = false,
}: {
  host: ToastHost;
  bottom?: number | string;
  contained?: boolean;
}) {
  const hydrated = useHydrated();
  const live = host.toast;
  const [shown, setShown] = useState<LiveToast | null>(live);
  // Derived during render: a new toast takes the slot at once; a retired one
  // stays in it (leaving) until its exit lands.
  if (live && live.id !== shown?.id) setShown(live);
  const gone = useCallback(
    (id: number) => setShown((s) => (s?.id === id ? null : s)),
    [],
  );

  if (!hydrated || !shown) return null;
  const leaving = !live || live.id !== shown.id;
  const bottomCss =
    typeof bottom === "number"
      ? `calc(${bottom}px + env(safe-area-inset-bottom))`
      : bottom;
  const pill = (
    <ToastPill
      key={shown.id}
      toast={shown}
      leaving={leaving}
      busy={host.busy && !leaving}
      bottom={bottomCss}
      contained={contained}
      host={host}
      onGone={gone}
    />
  );
  return contained ? pill : createPortal(pill, document.body);
}

/** Movement before a press on the pill becomes a swipe. */
const HYSTERESIS = 6;
/** Release speed (px/s) above which the settle-back earns a little bounce. */
const THROWN = 120;

function ToastPill({
  toast,
  leaving,
  busy,
  bottom,
  contained,
  host,
  onGone,
}: {
  toast: LiveToast;
  leaving: boolean;
  busy: boolean;
  bottom: string;
  contained: boolean;
  host: ToastHost;
  onGone: (id: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Mutable motion state, written per frame outside React. Only ever read
  // in handlers and effects (as `m.current`), never during render.
  const m = useRef({
    p: 0,
    y: 0,
    reduce: false,
    pSpring: null as SpringHandle | null,
    ySpring: null as SpringHandle | null,
    tracker: new VelocityTracker(),
    suppressClick: false,
    drag: null as null | { id: number; x: number; y: number; base: number; active: boolean },
  });

  const apply = useCallback(() => {
    const s = m.current;
    const el = ref.current;
    if (!el) return;
    const p = Math.min(1, Math.max(0, s.p));
    el.style.opacity = String(p);
    const y = (s.reduce ? 0 : (1 - p) * 24) + s.y;
    el.style.transform = y === 0 ? "" : `translate3d(0, ${y.toFixed(2)}px, 0)`;
  }, []);

  const animateP = useCallback(
    (to: number, onRest?: () => void) => {
      const s = m.current;
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
    [apply],
  );

  // Entrance, pre-paint: the first frame is already the start of it.
  useLayoutEffect(() => {
    const s = m.current;
    s.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    apply();
    animateP(1);
    return () => {
      s.pSpring?.stop();
      s.ySpring?.stop();
    };
    // Once per pill (keyed by toast id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exit: the entrance reversed, from wherever it is (a thrown pill keeps
  // its own y spring running alongside). Unmounts at rest.
  useEffect(() => {
    if (!leaving) return;
    m.current.drag = null;
    animateP(0, () => onGone(toast.id));
  }, [leaving, animateP, onGone, toast.id]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = m.current;
    s.suppressClick = false;
    // The pill owns this press — not a sheet it sits in (the search sheet's
    // drag-to-dismiss), nor a React ancestor across the portal.
    e.stopPropagation();
    if (leaving || !e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const midFlight = s.ySpring !== null;
    s.ySpring?.stop();
    s.ySpring = null;
    s.tracker.reset();
    // The raw (un-rubber-banded) offset is the base: an upward overshoot
    // caught mid-bounce must not be rubber-banded twice.
    s.drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      base: s.y < 0 && ref.current ? unrubberband(s.y, ref.current.offsetHeight) : s.y,
      active: midFlight,
    };
    host.pause("drag");
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = m.current;
    const d = s.drag;
    const el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) < HYSTERESIS) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        s.drag = null;
        host.resume("drag");
        return;
      }
      d.active = true;
      d.y = e.clientY; // track from here: crossing the threshold isn't a jump
      s.suppressClick = true;
      try {
        el.setPointerCapture(d.id);
      } catch {
        // pointer already gone
      }
      return;
    }
    const raw = d.base + (e.clientY - d.y);
    s.y = raw >= 0 ? raw : rubberband(raw, el.offsetHeight);
    s.tracker.add(s.y, e.timeStamp);
    apply();
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = m.current;
    const d = s.drag;
    const el = ref.current;
    if (!d || e.pointerId !== d.id) return;
    s.drag = null;
    host.resume("drag");
    if (!el || (!d.active && s.y === 0)) return;
    if (el.hasPointerCapture(d.id)) el.releasePointerCapture(d.id);
    const velocity = cancelled ? 0 : s.tracker.get(e.timeStamp);
    const landing = s.y + project(velocity);
    const away = velocity > -50 && landing > el.offsetHeight * 0.6;
    s.ySpring = spring({
      from: s.y,
      to: away ? el.offsetHeight + 48 : 0,
      velocity,
      damping: away || s.reduce || Math.abs(velocity) < THROWN ? 1 : 0.8,
      response: 0.3,
      onUpdate: (v) => {
        s.y = v;
        apply();
      },
      onRest: () => {
        s.ySpring = null;
      },
    });
    if (away) host.dismiss();
  };

  const error = toast.kind === "error";
  return (
    <div
      ref={ref}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") host.pause("hover");
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") host.resume("hover");
      }}
      onFocus={() => host.pause("focus")}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) host.resume("focus");
      }}
      onClickCapture={(e) => {
        const s = m.current;
        if (!s.suppressClick) return;
        s.suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`${contained ? "absolute" : "fixed"} inset-x-4 z-[60] mx-auto flex min-h-14 max-w-[calc(28rem-32px)] touch-none select-none items-center gap-3 rounded-full bg-surface-2 py-0 pl-5 pr-2 shadow-float will-change-transform ${
        leaving ? "pointer-events-none" : ""
      }`}
      style={{ bottom, opacity: 0 }}
    >
      {error && <KIcon name="warning" size={16} className="-ml-0.5 text-text" />}
      <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-text">{toast.message}</span>
      {toast.actionLabel && (
        <button
          type="button"
          onClick={host.act}
          disabled={busy || leaving}
          className={
            error
              ? "flex min-h-11 flex-none items-center px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text transition-opacity active:opacity-60 disabled:opacity-50"
              : "flex-none rounded-full bg-[var(--glass-bg)] px-3.5 py-2.5 font-sans text-[15px] font-semibold text-text bl-press disabled:opacity-50"
          }
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}
