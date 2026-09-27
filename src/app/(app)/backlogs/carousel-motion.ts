"use client";

import { useCallback, useLayoutEffect, useRef, type CSSProperties } from "react";
import { feedSurface, feedTail, mixHex } from "@/components/kura/tint";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  SpringValue,
  VelocityTracker,
  clamp01,
  project,
  rubberband,
  unrubberband,
} from "@/lib/spring";

/**
 * The motion of Tus colecciones' carousel (Colecciones · transiciones §1 —
 * "el carrusel sigue al dedo", design/kura/colecciones-transiciones.dc.html).
 *
 * ONE continuous position `pos` (0 = the first collection, 1 = the second…)
 * drives everything, so the fan, the strip of names and the page's gradient
 * move together and 1:1 with the finger:
 *  - fans sit 320 px apart, shrink 8 % and fade out by one step away;
 *  - names travel ±142 px (then 278 px per extra step), 30 → 22 px, dimming
 *    to .35 at one step and to 0 at two;
 *  - the background crosses the two neighbouring feed gradients by the
 *    fraction between them (and the bottom tone under the dock mixes too);
 *  - the body (line, credits, titles) fades out by half the travel, sliding
 *    48 px per step against the drag — the new one arrives 24 px from the
 *    other side.
 * Past either end the drag is rubber-banded (0.55 over 390 px). On release
 * the velocity is PROJECTED to pick the neighbour (a short flick is enough),
 * never more than one away from where the drag began, and the spring
 * inherits the finger's velocity: response 0.42, damping 1 — 0.86 when it
 * was thrown (> 1.5 collections/s).
 *
 * Everything is written straight to the DOM per frame; React only re-renders
 * when the rounded index changes (a new body mounts). Reduced motion keeps
 * the carousel 1:1 with the finger (it is the person's own movement) and
 * drops the body's slide: it only cross-fades.
 */

const STEP = 320;
const EDGE = 390;
const RESPONSE = 0.42;
const THROWN_DAMPING = 0.86;
/** Collections per second above which a release counts as a throw. */
const THROWN = 1.5;
/** A press becomes a drag after this many px sideways. */
const SLOP = 6;
/** Trackpad: one collection per swipe gesture. */
const WHEEL_GAP = 450;

export interface CarouselSlide {
  kind: string;
  hexes: readonly string[];
}

export function fanStyle(i: number, pos: number): CSSProperties {
  const d = i - pos;
  const a = Math.abs(d);
  return {
    transform: `translateX(${(d * STEP).toFixed(1)}px) scale(${(1 - 0.08 * Math.min(1, a)).toFixed(4)})`,
    opacity: clamp01(1 - a * 1.2),
  };
}

export function nameStyle(i: number, pos: number, ghost: boolean): CSSProperties {
  const d = i - pos;
  const a = Math.abs(d);
  const cd = Math.max(-1, Math.min(1, d));
  const px = 142 * cd + (a > 1 ? Math.sign(d) * (a - 1) * 278 : 0);
  const op = a <= 1 ? 1 - 0.65 * a : Math.max(0, 0.35 * (2 - a));
  // The ghost "nueva colección" reads quieter in the centre (.6).
  const quiet = ghost ? 0.6 + 0.4 * Math.min(1, a) : 1;
  return {
    transform: `translateX(calc(${(-50 + 50 * cd).toFixed(2)}% + ${px.toFixed(1)}px))`,
    fontSize: `${(30 - 8 * Math.min(1, a)).toFixed(2)}px`,
    opacity: op * quiet,
  };
}

export function bodyStyle(pos: number, count: number, reduced: boolean): CSSProperties {
  const bi = Math.max(0, Math.min(count - 1, Math.round(pos)));
  const fr = pos - bi;
  return {
    opacity: clamp01(1 - Math.abs(fr) * 2),
    // At rest: no transform — it would make the body a containing block for
    // its fixed descendants.
    transform: reduced || Math.abs(fr) < 1e-3 ? "" : `translateX(${(-fr * 48).toFixed(1)}px)`,
  };
}

export function backgroundAt(slides: readonly CarouselSlide[], pos: number) {
  const n = slides.length;
  const lo = Math.max(0, Math.min(n - 1, Math.floor(pos)));
  const hi = Math.min(n - 1, lo + 1);
  const t = clamp01(pos - lo);
  const A = slides[lo].hexes;
  const B = slides[hi].hexes;
  return {
    a: feedSurface(A, 760),
    b: feedSurface(B, 760),
    t,
    tail: mixHex(feedTail(A), feedTail(B), t),
  };
}

type Drag = {
  id: number;
  x0: number;
  y0: number;
  p0: number;
  moved: boolean;
  tracker: VelocityTracker;
  surface: HTMLElement;
};

export function useCarouselMotion(
  slides: readonly CarouselSlide[],
  idx: number,
  onIndex: (i: number) => void,
) {
  const reduced = useReducedMotion();
  const elsRef = useRef({
    surface: null as HTMLElement | null,
    main: null as HTMLElement | null,
    bg: null as HTMLElement | null,
    body: null as HTMLElement | null,
    tail: null as HTMLElement | null,
  });
  // What the frame loop reads — refreshed after every render.
  const live = useRef({ slides, idx, onIndex, reduced, a: "", b: "" });
  const spr = useRef<SpringValue | null>(null);
  const drag = useRef<Drag | null>(null);
  const swipedRef = useRef(false);
  const lastWheel = useRef(0);

  const apply = useCallback(() => {
    const els = elsRef.current;
    const L = live.current;
    const s = spr.current;
    if (!s) return;
    const pos = s.value;
    const n = L.slides.length;
    const fans = els.surface?.querySelectorAll<HTMLElement>("[data-carousel-fan]") ?? [];
    for (const el of fans) {
      const st = fanStyle(Number(el.dataset.carouselFan), pos);
      el.style.transform = String(st.transform);
      el.style.opacity = String(st.opacity);
    }
    const names = els.surface?.querySelectorAll<HTMLElement>("[data-carousel-name]") ?? [];
    for (const el of names) {
      const i = Number(el.dataset.carouselName);
      const st = nameStyle(i, pos, L.slides[i]?.kind === "ghost");
      el.style.transform = String(st.transform);
      el.style.fontSize = String(st.fontSize);
      el.style.opacity = String(st.opacity);
    }
    if (els.body) {
      const st = bodyStyle(pos, n, L.reduced);
      els.body.style.opacity = String(st.opacity);
      els.body.style.transform = String(st.transform);
    }
    const bg = backgroundAt(L.slides, pos);
    if (els.main) {
      if (bg.a !== L.a) {
        els.main.style.background = bg.a;
        L.a = bg.a;
      }
      els.main.style.backgroundColor = bg.tail;
    }
    if (els.bg) {
      if (bg.b !== L.b) {
        els.bg.style.background = bg.b;
        L.b = bg.b;
      }
      els.bg.style.opacity = String(bg.t);
    }
    if (els.tail) els.tail.style.background = `linear-gradient(transparent, ${bg.tail} 75%)`;

    const bi = Math.max(0, Math.min(n - 1, Math.round(pos)));
    if (bi !== L.idx) {
      L.idx = bi;
      L.onIndex(bi);
    }
  }, []);

  const spring = useCallback(() => {
    if (!spr.current) spr.current = new SpringValue(live.current.idx, apply);
    return spr.current;
  }, [apply]);

  // After every render: refresh what the loop reads, follow an index set from
  // outside (the remembered collection, a list that changed), and restyle —
  // React just rendered the resting frame, and the live one wins before paint.
  useLayoutEffect(() => {
    const L = live.current;
    L.slides = slides;
    L.idx = idx;
    L.onIndex = onIndex;
    L.reduced = reduced;
    L.a = "";
    L.b = "";
    const s = spring();
    if (!drag.current && !s.animating && Math.round(s.value) !== idx) s.set(idx);
    else apply();
  });

  useLayoutEffect(() => () => spr.current?.stop(), []);

  const go = useCallback(
    (i: number) => {
      const n = live.current.slides.length;
      spring().to(Math.max(0, Math.min(n - 1, i)), { response: RESPONSE });
    },
    [spring],
  );

  /** A drag that starts mid-rubber-band starts from the RAW travel. */
  const rawOf = (pos: number, max: number) =>
    pos < 0
      ? -unrubberband(-pos * STEP, EDGE) / STEP
      : pos > max
        ? max + unrubberband((pos - max) * STEP, EDGE) / STEP
        : pos;

  const settle = useCallback(
    (to?: number) => {
      const s = spring();
      const n = live.current.slides.length;
      s.to(Math.max(0, Math.min(n - 1, to ?? Math.round(s.value))), { response: RESPONSE });
    },
    [spring],
  );

  const move = useCallback(
    (e: PointerEvent) => {
      const g = drag.current;
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.moved) {
        if (Math.abs(dx) > SLOP && Math.abs(dx) >= Math.abs(dy)) g.moved = true;
        else return;
      }
      const max = live.current.slides.length - 1;
      let raw = g.p0 - dx / STEP;
      if (raw < 0) raw = -rubberband(-raw * STEP, EDGE) / STEP;
      else if (raw > max) raw = max + rubberband((raw - max) * STEP, EDGE) / STEP;
      g.tracker.add(e.clientX, performance.now());
      spring().set(raw);
    },
    [spring],
  );

  const release = useCallback(
    (e: PointerEvent, g: Drag) => {
      const s = spring();
      const n = live.current.slides.length;
      if (!g.moved) {
        if (e.type === "pointercancel") return settle();
        // A tap: the edges step to the neighbour (the names are buttons of
        // their own); anywhere else just lands where it is.
        const target = e.target as Element | null;
        const r = g.surface.getBoundingClientRect();
        const x = e.clientX - r.left;
        const c0 = Math.round(s.value);
        if (target?.closest("button")) return settle();
        return settle(x < 60 ? c0 - 1 : x > r.width - 60 ? c0 + 1 : c0);
      }
      // The click that ends a drag is not a tap on whatever is under it.
      swipedRef.current = true;
      setTimeout(() => (swipedRef.current = false), 0);
      if (e.type === "pointercancel") return settle();
      const vx = g.tracker.get(performance.now());
      const vi = -vx / STEP;
      const b = Math.max(0, Math.min(n - 1, Math.round(g.p0)));
      let tg = Math.round(s.value - project(vx) / STEP);
      tg = Math.max(0, Math.min(n - 1, Math.max(b - 1, Math.min(b + 1, tg))));
      s.to(tg, {
        velocity: vi,
        damping: Math.abs(vi) > THROWN ? THROWN_DAMPING : 1,
        response: RESPONSE,
      });
    },
    [settle, spring],
  );

  /** Removes the window listeners of the drag in progress, if any. */
  const unlisten = useRef<(() => void) | null>(null);
  useLayoutEffect(() => () => unlisten.current?.(), []);

  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      const s = spring();
      s.stop();
      const max = live.current.slides.length - 1;
      drag.current = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        p0: rawOf(s.value, max),
        moved: false,
        tracker: new VelocityTracker(),
        surface: e.currentTarget,
      };
      drag.current.tracker.add(e.clientX, performance.now());
      // Window listeners, not pointer capture: capture would retarget the
      // stream away from the fan, and its hold (9a) must still see the move
      // that cancels it.
      unlisten.current?.();
      const end = (ev: PointerEvent) => {
        const g = drag.current;
        if (!g || ev.pointerId !== g.id) return;
        drag.current = null;
        unlisten.current?.();
        release(ev, g);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      unlisten.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        unlisten.current = null;
      };
    },
    onWheel: (e: React.WheelEvent) => {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 8) return;
      if (e.timeStamp - lastWheel.current < WHEEL_GAP) return;
      lastWheel.current = e.timeStamp;
      go(Math.round(spring().value) + (e.deltaX > 0 ? 1 : -1));
    },
  };

  // Element setters for `ref={…}` (callbacks, not ref objects). The fans and
  // names are found under the surface by `data-carousel-fan` / `-name`.
  const bindSurface = useCallback((el: HTMLElement | null) => {
    elsRef.current.surface = el;
  }, []);
  const bindMain = useCallback((el: HTMLElement | null) => {
    elsRef.current.main = el;
  }, []);
  const bindBg = useCallback((el: HTMLElement | null) => {
    elsRef.current.bg = el;
  }, []);
  const bindBody = useCallback((el: HTMLElement | null) => {
    elsRef.current.body = el;
  }, []);
  const bindTail = useCallback((el: HTMLElement | null) => {
    elsRef.current.tail = el;
  }, []);
  const swiped = useCallback(() => swipedRef.current, []);

  return { go, reduced, handlers, swiped, bindSurface, bindMain, bindBg, bindBody, bindTail };
}
