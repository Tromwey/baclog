"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { posterFallbackStyle } from "@/components/cover-tile";
import { prefersReducedMotion } from "@/hooks/use-reduced-motion";
import { SpringValue, clamp01, lerp } from "@/lib/spring";
import type { MediaType } from "@/modules/catalog/types";
import { feedDockBand, feedSurface, feedTail } from "./tint";

/**
 * "La portada se vuelve la ficha" (Colecciones · transiciones §4,
 * design/kura/colecciones-transiciones.dc.html): tapping a title's cover in
 * a collection's columns grows THAT cover from its cell into the ficha's
 * cover, keeping the radius visually right (the cell's 14 → the ficha's,
 * read from the real element) while the background takes the cover's tint.
 * Volver returns it to its cell. Open: response 0.42 · close: 0.3, damping 1.
 *
 * The ficha is a real route, so the old page unmounts on navigation: the
 * flight lives in ONE persistent layer (`CoverFlightLayer`, mounted by the
 * (app) layout, above the pages and the collection overlay, under the
 * sheets). Open: a backdrop — the ficha's exact ground, its page gradient —
 * fades in over the first 60 % (hiding the
 * swap underneath) and the cover flies to where the ficha's cover will be
 * (predicted from its geometry, re-targeted to the real element when the
 * ficha mounts its `CoverFlightTarget`); once the ficha is there the
 * backdrop dissolves from 40 % on, revealing its text — or right after
 * landing, if the ficha's data arrives later (the landed cover on its tint IS
 * the loading state then). Close (`returnCoverFlight`, from the ficha's
 * Volver): the backdrop covers the ficha at once, the route pops, and the
 * cover flies back to its cell (`[data-cover-flight]`) as the backdrop
 * fades. Reduced motion: no flight at all — the pages' own cross-fade.
 */

type Rect = { x: number; y: number; w: number; h: number };

interface Flight {
  key: string;
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
}

interface Layer {
  open: (f: Flight & { el: HTMLElement; mediaType: MediaType }) => void;
  back: (key: string, navigate: () => void) => boolean;
  target: (key: string, el: HTMLElement | null) => void;
}

let layer: Layer | null = null;

/** From a cell's click, right before its Link navigates. */
export function launchCoverFlight(f: Flight & { el: HTMLElement; mediaType: MediaType }) {
  layer?.open(f);
}

/**
 * From the ficha's Volver: flies the cover back if this ficha was opened by
 * a flight. `navigate` pops the route (the caller's router.back()). False =
 * nothing to fly; the caller navigates as usual.
 */
export function returnCoverFlight(key: string, navigate: () => void): boolean {
  return layer?.back(key, navigate) ?? false;
}

/** The ficha's cover — where a flight lands and where a return starts. */
export function CoverFlightTarget({
  flightKey,
  paletteHex,
  className,
  children,
}: {
  flightKey: string;
  /** For the return's backdrop (the tint behind the cover). */
  paletteHex: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    layer?.target(flightKey, ref.current);
    return () => layer?.target(flightKey, null);
  }, [flightKey]);
  return (
    <span ref={ref} data-cover-target={flightKey} data-palette={paletteHex.join(",")} className={className}>
      {children}
    </span>
  );
}

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const radiusOf = (el: Element | null, fallback: number) =>
  (el && parseFloat(getComputedStyle(el).borderTopLeftRadius)) || fallback;

let safeTop: number | null = null;
function safeAreaTop(): number {
  if (safeTop !== null) return safeTop;
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  safeTop = probe.getBoundingClientRect().height;
  probe.remove();
  return safeTop;
}

/** Where the ficha draws its cover (item/[id]/page.tsx: 200×300, an album
 *  240×240, centred, 124 px + the safe area from the top). */
function predictedTarget(mediaType: MediaType): Rect {
  const album = mediaType === "album";
  const w = album ? 240 : 200;
  const h = album ? 240 : 300;
  return { x: (window.innerWidth - w) / 2, y: 124 + safeAreaTop(), w, h };
}

export function CoverFlightLayer() {
  const [flight, setFlight] = useState<Flight | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const st = useRef({
    mode: null as null | "open" | "close",
    key: "",
    src: { x: 0, y: 0, w: 0, h: 0 } as Rect,
    dst: { x: 0, y: 0, w: 0, h: 0 } as Rect,
    srcR: 14,
    dstR: 14,
    cell: null as HTMLElement | null,
    target: null as HTMLElement | null,
    /** Where the ficha's page (its `<main>`) starts on screen: the backdrop
     *  anchors the page gradient there, so it IS the ficha's ground. */
    pageTop: 0,
    p: null as SpringValue | null,
    r: null as SpringValue | null,
    watchdog: 0 as ReturnType<typeof setTimeout> | 0,
    /** The last flight that opened a ficha: what Volver can fly back. */
    last: null as null | { key: string; src: Rect; srcR: number; from: string; item: string },
  });

  useEffect(() => {
    const s = st.current;

    const hide = (el: HTMLElement | null) => el && (el.style.visibility = "hidden");
    const show = (el: HTMLElement | null) => el && (el.style.visibility = "");

    const apply = () => {
      const p = s.p?.value ?? 0;
      const r = s.r?.value ?? 0;
      const bd = backdropRef.current;
      const fly = flyRef.current;
      if (!bd || !fly || !s.mode) return;
      let cover = clamp01(p / 0.6);
      if (s.mode === "open" && s.target) cover = Math.min(cover, 1 - Math.min(r, clamp01((p - 0.4) / 0.6)));
      bd.style.opacity = cover.toFixed(4);
      if (tintRef.current) tintRef.current.style.top = `${Math.round(s.pageTop)}px`;

      if (s.mode === "close" && !s.cell) {
        const cell = document.querySelector<HTMLElement>(`[data-cover-flight="${CSS.escape(s.key)}"]`);
        if (cell) {
          s.cell = cell;
          hide(cell);
          s.srcR = radiusOf(cell, s.srcR);
        }
      }
      // Live while the cell is on screen (a return lands on it even if the
      // page scrolls under it); an open keeps its start once the page goes.
      if (s.cell?.isConnected) s.src = rectOf(s.cell);
      if (s.mode === "open" && s.target) s.dst = rectOf(s.target);

      const landed = s.mode === "open" && s.target && p >= 0.999;
      if (landed) {
        fly.style.display = "none";
        show(s.target);
        return;
      }
      const x = lerp(s.src.x, s.dst.x, p);
      const y = lerp(s.src.y, s.dst.y, p);
      fly.style.display = "block";
      fly.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      fly.style.width = `${lerp(s.src.w, s.dst.w, p).toFixed(2)}px`;
      fly.style.height = `${lerp(s.src.h, s.dst.h, p).toFixed(2)}px`;
      fly.style.borderRadius = `${lerp(s.srcR, s.dstR, p).toFixed(2)}px`;
      // A return whose cell never showed up fades instead of landing on air.
      fly.style.opacity = s.mode === "close" && !s.cell ? String(clamp01(p / 0.3)) : "1";
    };

    const finish = () => {
      clearTimeout(s.watchdog);
      s.p?.stop();
      s.r?.stop();
      show(s.cell);
      show(s.target);
      s.mode = null;
      s.cell = null;
      s.target = null;
      if (backdropRef.current) backdropRef.current.style.display = "none";
      if (flyRef.current) flyRef.current.style.display = "none";
      setFlight(null);
    };

    const start = (f: Flight, mode: "open" | "close") => {
      clearTimeout(s.watchdog);
      s.p?.stop();
      s.r?.stop();
      show(s.cell);
      s.mode = mode;
      s.key = f.key;
      s.p = new SpringValue(mode === "open" ? 0 : 1, apply);
      s.r = new SpringValue(0, apply);
      setFlight(f);
      if (backdropRef.current) backdropRef.current.style.display = "block";
    };

    layer = {
      open(f) {
        if (prefersReducedMotion()) return;
        start(f, "open");
        s.cell = f.el;
        s.src = rectOf(f.el);
        s.srcR = radiusOf(f.el, 14);
        s.dst = predictedTarget(f.mediaType);
        s.dstR = 14;
        s.target = null;
        s.pageTop = 0;
        s.last = {
          key: f.key,
          src: s.src,
          srcR: s.srcR,
          from: window.location.pathname,
          item: `/item/${f.key}`,
        };
        hide(f.el);
        apply();
        s.p!.to(1, { response: 0.42 }, () => {
          // Landed before the ficha arrived: hold here, it's the loading
          // state. Give up (and let the skeleton/error show) after 6 s.
          if (!s.target) s.watchdog = setTimeout(finish, 6000);
          else if (!s.r!.animating && s.r!.value >= 1) finish();
        });
      },
      back(key, navigate) {
        const last = s.last;
        const target = document.querySelector<HTMLElement>(`[data-cover-target="${CSS.escape(key)}"]`);
        if (!last || last.key !== key || !target || prefersReducedMotion()) return false;
        s.last = null;
        const page = target.closest("main");
        start({ key, posterUrl: flightImage(target), paletteHex: flightPalette(target) }, "close");
        s.cell = null;
        s.src = last.src;
        s.srcR = last.srcR;
        s.dst = rectOf(target);
        s.dstR = radiusOf(target.firstElementChild, 14);
        s.pageTop = page ? page.getBoundingClientRect().top : 0;
        apply();
        navigate();
        s.p!.to(0, { response: 0.3 }, finish);
        return true;
      },
      target(key, el) {
        if (!el) {
          if (s.target && s.mode === "open") s.target = null;
          return;
        }
        if (s.mode !== "open" || key !== s.key) return;
        clearTimeout(s.watchdog);
        s.target = el;
        hide(el);
        s.dst = rectOf(el);
        s.dstR = radiusOf(el.firstElementChild, s.dstR);
        const page = el.closest("main");
        if (page) s.pageTop = page.getBoundingClientRect().top;
        // Reveal the ficha (its text) — during the flight from 40 %, or now
        // if the cover has already landed.
        s.r!.to(1, { response: 0.3 }, () => {
          if ((s.p?.value ?? 0) >= 0.999) finish();
        });
        apply();
      },
    };
    return () => {
      layer = null;
      finish();
    };
  }, []);

  // A flight can only be flown back from the ficha it opened, to where it
  // came from: anywhere else forgets it.
  useEffect(() => {
    const s = st.current;
    if (s.last && pathname !== s.last.item && pathname !== s.last.from) s.last = null;
  }, [pathname]);

  return (
    <>
      <div
        ref={backdropRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[45] hidden bg-bg"
      >
        {/* The ficha's own ground, exactly (páginas = degradado del feed):
            the page gradient anchored where its <main> starts, continuing in
            tone 2, and the band under the dock — so the reveal from 40 % only
            brings in the text, and landing never changes the colour. */}
        <div
          ref={tintRef}
          className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md"
          style={{
            background: feedSurface(flight?.paletteHex ?? [], 900),
            backgroundColor: feedTail(flight?.paletteHex ?? []),
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[150px]"
          style={{ background: feedDockBand(flight?.paletteHex ?? []) }}
        />
      </div>
      <div
        ref={flyRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[45] hidden overflow-hidden bg-surface-2 shadow-cover will-change-transform"
        style={flight && !flight.posterUrl ? posterFallbackStyle(flight.paletteHex) : undefined}
      >
        {flight?.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007); already cached by the cell
          <img src={flight.posterUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
    </>
  );
}

/** The ficha's cover image / palette, read back from the target (a return
 *  doesn't know them otherwise). */
function flightImage(target: HTMLElement): string | null {
  return target.querySelector("img")?.getAttribute("src") ?? null;
}
function flightPalette(target: HTMLElement): readonly string[] | null {
  const raw = target.dataset.palette;
  return raw ? raw.split(",") : null;
}
