"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Fan } from "@/components/kura/fan";
import { fanSource, takeFanFlight } from "@/components/kura/fan-flight";
import { isTopDialog, useDialogFocus } from "@/hooks/use-dialog-focus";
import { prefersReducedMotion } from "@/hooks/use-reduced-motion";
import type { FanCover } from "@/modules/backlog/fan";
import { SpringValue, VelocityTracker, clamp01, lerp } from "@/lib/spring";
import { useLiftNavDock } from "../nav-dock";
import { OverlayExitCtx } from "./overlay-exit";

/**
 * A collection opened from the profile (Colecciones · transiciones §2 and §3,
 * design/kura/colecciones-transiciones.dc.html). Replaces the old zoom
 * (scale .86 from the tap + `bl-zoom-content`).
 *
 * ONE spring `p` (0 = the profile, 1 = the collection) drives everything:
 *  - the fan of the tapped row IS the header's fan: a flying twin leaves the
 *    row and grows into the header (position and `lead` interpolated, so the
 *    fan's radius and shadow are right at both ends) while both originals
 *    hide;
 *  - behind it, the collection's gradient (and its chips) appears in the
 *    first 60 %, and the profile underneath recedes 4 %;
 *  - the name block rises 16 px from 35 %; the titles, from 50 %.
 * Open: response 0.42, damping 1. Volver runs the SAME spring back to 0 from
 * wherever it is (response 0.3): the titles leave first and the fan lands in
 * its row — even if the collection was scrolled — and only then the route
 * pops. Dragging from the left edge (≤ 32 px) moves `p` with the finger
 * (320 px = the whole transition); on release, if the projection (p + v·0.2)
 * is under 70 % it closes carrying the finger's velocity, else it goes back.
 *
 * The staged pieces live in `CollectionScreen`, which reads the CSS
 * variables this shell writes on its root. Reduced motion: no flight, no
 * rise, no recede — one cross-fade on the same spring.
 *
 * Portaled to <body> (AGENTS.md: the (app) wrapper is a stacking context):
 * z-40 covers the page and stays under the sheets (z-50) and the toast
 * (z-60). The dock stays OVER it (`useLiftNavDock`: z-41 while this is
 * mounted — founder, 2026-09-27); the screen clears it (pb-dock-clearance).
 * An open that didn't come from a recorded tap (a back-nav restoring the
 * overlay) appears at rest.
 */

const OPEN = 0.42;
const CLOSE = 0.3;
/** px of finger per whole transition when dragging from the edge. */
const EDGE_TRAVEL = 320;
const EDGE_ZONE = 32;
const SLOP = 6;
/** The header's fan (`lead` 225) and its box. */
const HERO_LEAD = 225;
const HERO_W = 300;

type Fly = { x: number; y: number; lead: number; covers: readonly FanCover[] } | null;
type FlyHandle = { set: (f: Fly) => void };

const noop = () => () => {};

export function CollectionOverlay({ backlogId, children }: { backlogId: string; children: ReactNode }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<FlyHandle>(null);
  useLiftNavDock(true);

  const st = useRef({
    p: null as SpringValue | null,
    reduce: false,
    src: null as HTMLElement | null,
    srcLead: 186,
    covers: [] as readonly FanCover[],
    underlay: null as HTMLElement | null,
    closing: false,
    landed: false,
    rec: undefined as ReturnType<typeof takeFanFlight> | undefined,
  });

  const apply = useCallback(() => {
    const s = st.current;
    const root = rootRef.current;
    if (!root || !s.p) return;
    const p = s.p.value;
    const rd = s.reduce;
    const bg = rd ? clamp01(p) : clamp01(p / 0.6);
    const a = rd ? clamp01(p) : clamp01((p - 0.35) / 0.65);
    const b = rd ? clamp01(p) : clamp01((p - 0.5) / 0.5);
    const rise = (x: number) => (rd || x >= 1 ? "none" : `0 ${((1 - x) * 16).toFixed(2)}px`);
    root.style.setProperty("--cx-bg", bg.toFixed(4));
    root.style.setProperty("--cx-a", a.toFixed(4));
    root.style.setProperty("--cx-a-t", rise(a));
    root.style.setProperty("--cx-b", b.toFixed(4));
    root.style.setProperty("--cx-b-t", rise(b));

    // The real fan (not the skeleton's ghost): the flight waits over the
    // ghost until it's there.
    const hero = root.querySelector<HTMLElement>('[data-overlay-hero]:not([data-overlay-hero="skeleton"])');
    const flying = !rd && !!s.src && !s.landed && (p < 0.999 || !hero);
    if (flying && s.src) {
      const from = s.src.getBoundingClientRect();
      const target = hero ?? root.querySelector<HTMLElement>("[data-overlay-hero]");
      const to = target?.getBoundingClientRect();
      const toX = to ? to.left : (window.innerWidth - HERO_W) / 2;
      const toY = to ? to.top : 126 - (scrollRef.current?.scrollTop ?? 0);
      flyRef.current?.set({
        x: lerp(from.left, toX, p),
        y: lerp(from.top, toY, p),
        lead: lerp(s.srcLead, HERO_LEAD, p),
        covers: s.covers,
      });
      root.style.setProperty("--cx-hero", "hidden");
    } else {
      flyRef.current?.set(null);
      root.style.setProperty("--cx-hero", "visible");
    }

    // The profile recedes 4 % around 40 % of the screen it's showing.
    const u = s.underlay;
    if (u) {
      if (rd || p <= 0 || p >= 1) u.style.transform = "";
      else {
        u.style.transformOrigin = `50% ${(window.scrollY + window.innerHeight * 0.4).toFixed(0)}px`;
        u.style.transform = `scale(${(1 - 0.04 * p).toFixed(4)})`;
      }
    }
  }, []);

  /** Gives the row its fan back and the profile its scale. */
  const restore = useCallback(() => {
    const s = st.current;
    if (s.src) s.src.style.visibility = "";
    if (s.underlay) s.underlay.style.transform = "";
  }, []);

  const leave = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/perfil");
  }, [router]);

  const close = useCallback(
    (velocity = 0, then?: () => void) => {
      const s = st.current;
      if (s.closing || !s.p) return;
      s.closing = true;
      if (rootRef.current) rootRef.current.style.pointerEvents = "none";
      // The row may have re-rendered while the collection was open.
      if (s.src && !s.src.isConnected) s.src = fanSource(backlogId);
      if (s.src && !s.reduce) s.src.style.visibility = "hidden";
      s.p.to(0, { response: CLOSE, velocity }, () => {
        s.landed = true;
        restore();
        apply();
        (then ?? leave)();
      });
    },
    [apply, backlogId, leave, restore],
  );

  // It IS a modal: a full-screen layer over the profile. Focus moves in and
  // cycles inside (and returns to the row on close), Escape closes — unless
  // a sheet opened from the collection is on top (the dialog stack: it owns
  // Tab and Escape then) — and the profile underneath is inert, so neither
  // Tab nor a screen reader can wander into a page nobody sees. The hook
  // owns `inert` so the order is right: opener remembered → inert on; inert
  // off → focus back to the row.
  // The dock is NOT inert: it is lifted above the overlay on purpose
  // (`useLiftNavDock`) and the pointer reaches it, so the keyboard does too —
  // its tabs join the Tab cycle after the collection's controls. That is why
  // this dialog doesn't claim `aria-modal`: the dock is live beside it, and
  // what IS hidden (the profile) is hidden by `inert`, which is what
  // assistive tech actually honours.
  useDialogFocus(rootRef, mounted, { inert: "[data-collection-underlay]", also: '[data-nav-dock="on"]' });
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (isTopDialog(rootRef.current)) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, close]);

  // Once per open: take the recorded tap, hide its fan, and fly.
  useLayoutEffect(() => {
    if (!mounted) return;
    const s = st.current;
    s.reduce = prefersReducedMotion();
    s.underlay = document.querySelector<HTMLElement>("[data-collection-underlay]");
    // Taken once per instance: strict mode runs this effect twice, and the
    // second run must still see the tap the first one consumed.
    if (s.rec === undefined) s.rec = takeFanFlight(backlogId);
    const rec = s.rec;
    s.p = new SpringValue(rec ? 0 : 1, apply);
    if (rec) {
      s.src = rec.el;
      s.srcLead = rec.lead;
      s.covers = rec.covers;
      if (!s.reduce) rec.el.style.visibility = "hidden";
    }
    apply(); // pre-paint: the first frame is already the start
    if (rec) s.p.to(1, { response: OPEN });

    // The page streams in under a skeleton: re-check for the real fan.
    const mo = new MutationObserver(() => apply());
    if (scrollRef.current) mo.observe(scrollRef.current, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      s.p?.stop();
      restore();
    };
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  /* ------------------------------------------------ the edge drag (§3) */

  const edge = useRef<{ id: number; x0: number; y0: number; p0: number; on: boolean; v: VelocityTracker } | null>(
    null,
  );
  const onPointerDown = (e: React.PointerEvent) => {
    const s = st.current;
    if (!e.isPrimary || s.closing || !s.p || e.clientX > EDGE_ZONE) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: s.p.value, on: false, v: new VelocityTracker() };
    edge.current = g;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== g.id || !s.p) return;
      const dx = ev.clientX - g.x0;
      if (!g.on) {
        if (Math.abs(ev.clientY - g.y0) > SLOP && Math.abs(ev.clientY - g.y0) > Math.abs(dx)) return end(ev);
        if (dx <= SLOP) return;
        g.on = true;
        s.p.stop();
        g.p0 = s.p.value;
      }
      g.v.add(ev.clientX, performance.now());
      s.p.set(clamp01(g.p0 - dx / EDGE_TRAVEL));
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== g.id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      edge.current = null;
      if (!g.on || !s.p) return;
      // The click that ends the drag is not a tap on a title.
      const swallow = (c: MouseEvent) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      const vp = -g.v.get(performance.now()) / EDGE_TRAVEL;
      if (s.p.value + vp * 0.2 < 0.7) close(vp);
      else s.p.to(1, { response: OPEN, velocity: vp });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  if (!mounted) return null;
  return createPortal(
    <OverlayExitCtx.Provider value={(then) => close(0, then)}>
      <div
        ref={rootRef}
        role="dialog"
        aria-label="Colección"
        tabIndex={-1}
        className="fixed inset-0 z-40 outline-none"
        onPointerDown={onPointerDown}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-bg" style={{ opacity: "var(--cx-bg, 1)" }} />
        <div ref={scrollRef} className="absolute inset-0 touch-pan-y overflow-y-auto overscroll-contain">
          {children}
        </div>
        <FlyingFan ref={flyRef} />
      </div>
    </OverlayExitCtx.Provider>,
    document.body,
  );
}

/** The fan in flight: re-rendered per frame at an interpolated `lead`, so
 *  its radius, shadow and floor are the real ones at both ends. */
function FlyingFan({ ref }: { ref: Ref<FlyHandle> }) {
  const [f, setF] = useState<Fly>(null);
  useImperativeHandle(ref, () => ({ set: setF }), []);
  if (!f) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 will-change-transform"
      style={{ transform: `translate3d(${f.x.toFixed(2)}px, ${f.y.toFixed(2)}px, 0)` }}
    >
      <Fan covers={f.covers} lead={f.lead} ghost={f.covers.length === 0} />
    </div>
  );
}
