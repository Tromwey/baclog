"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { setNavDirection } from "./nav-direction";

/**
 * The floating nav dock — four destinations in a content-hugging pill:
 * Colecciones · Descubrir · Feed · Perfil (Kura, 2026-09-24). It hides two
 * different ways, on purpose:
 *  - hard route boundaries (detail/full-bleed/export/admin) → `return null`,
 *    since the whole screen already unmounts on navigation.
 *  - ephemeral same-screen UI (a search input focused / an overlay open) →
 *    a ref-counted visibility context, so the dock fades out in place.
 */

interface HideApi {
  acquire: () => void;
  release: () => void;
}

const HideApiCtx = createContext<HideApi | null>(null);
const HiddenCtx = createContext(false);

export function NavDockVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const countRef = useRef(0);
  // Stable API (never re-created) so descendants' effects don't loop when the
  // hidden boolean flips.
  const [api] = useState<HideApi>(() => ({
    acquire: () => {
      countRef.current += 1;
      setHidden(countRef.current > 0);
    },
    release: () => {
      countRef.current = Math.max(0, countRef.current - 1);
      setHidden(countRef.current > 0);
    },
  }));

  return (
    <HideApiCtx.Provider value={api}>
      <HiddenCtx.Provider value={hidden}>{children}</HiddenCtx.Provider>
    </HideApiCtx.Provider>
  );
}

/** Any client descendant can hide the dock while `active` is true. Ref-counted,
 * so overlapping callers don't fight over one boolean. */
export function useHideNavDock(active: boolean) {
  const api = useContext(HideApiCtx);
  useEffect(() => {
    if (!active || !api) return;
    api.acquire();
    return () => api.release();
  }, [active, api]);
}

/**
 * The four tabs of the Kura dock (sistema de diseño §dock, flujos-v2 · NAV):
 * Colecciones · Descubrir · Feed · Perfil. Glyphs verbatim from the frames'
 * `NAV` paths (filled, 21 px). Routes keep their product names (/backlogs).
 */
const DESTINATIONS: {
  href: string;
  label: string;
  d: string;
  /** Extra prefixes that light this tab up — screens REACHED FROM it that
   *  aren't under its path (founder call: /settings lives behind Perfil's
   *  ajustes chip, so Perfil keeps the pill there). */
  also?: string[];
}[] = [
  {
    href: "/backlogs",
    label: "Colecciones",
    d: "M5.7 4h12.6A1.7 1.7 0 0120 5.7v3.2a1.7 1.7 0 01-1.7 1.7H5.7A1.7 1.7 0 014 8.9V5.7A1.7 1.7 0 015.7 4zm0 9.4h12.6a1.7 1.7 0 011.7 1.7v3.2a1.7 1.7 0 01-1.7 1.7H5.7A1.7 1.7 0 014 18.3v-3.2a1.7 1.7 0 011.7-1.7z",
  },
  { href: "/descubrir", label: "Descubrir", d: "M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z" },
  {
    href: "/feed",
    label: "Feed",
    d: "M8 7.8a4.2 4.2 0 110 8.4 4.2 4.2 0 010-8.4zm8 -.2h2.4a1.6 1.6 0 010 3.2H16a1.6 1.6 0 010-3.2zm0 5.6h.6a1.6 1.6 0 010 3.2H16a1.6 1.6 0 010-3.2z",
  },
  {
    href: "/perfil",
    label: "Perfil",
    d: "M12 4.7a3.8 3.8 0 110 7.6 3.8 3.8 0 010-7.6zM5 20.5a7 7 0 0114 0z",
    also: ["/settings"],
  },
];

function destinationIndex(pathname: string): number {
  return DESTINATIONS.findIndex(
    (d) =>
      pathname.startsWith(d.href) ||
      d.also?.some((p) => pathname.startsWith(p)),
  );
}

/**
 * The Kura dock: `.bl-dock-glass` (`rgba(20,20,26,.5)` + blur 26, saturate
 * 1.7 — a class so `prefers-contrast` / `prefers-reduced-transparency` can
 * reach it), the dark
 * float shadow, 34 above the bottom edge (`--dock-offset`). Active tab = a
 * `.1` white fill + `--text`; the rest `--text-3`. No accent in the dock —
 * miel is spent once per screen, by the screen.
 *
 * Motion (§movimiento): a tab change is 0 ms. The fill does not slide; it
 * answers the TAP (optimistic `pending`), not the navigation, so the dock
 * never reads as dead while the destination renders.
 *
 * `feedDot` — "punto en Feed con notificaciones nuevas". The product has no
 * notification signal yet, so the layout passes nothing and there's no dot;
 * the slot is here for when there is.
 */
export function NavDock({ feedDot = false }: { feedDot?: boolean }) {
  const pathname = usePathname();
  const hidden = useContext(HiddenCtx);

  const [pending, setPending] = useState<{ from: string; index: number } | null>(
    null,
  );
  if (pending && pending.from !== pathname) setPending(null);
  const routeIndex = destinationIndex(pathname);
  const activeIndex =
    pending && pending.from === pathname ? pending.index : routeIndex;

  // Hard route boundary: the Torre de Control (/admin) is a whole different
  // screen, so the dock returns null — no post-hydration fade.
  if (pathname.startsWith("/admin")) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-offset)+env(safe-area-inset-bottom))] z-10 flex justify-center"
    >
      <div
        className={`bl-dock-glass flex gap-1.5 rounded-full p-1.5 shadow-float transition-[opacity,transform] duration-300 ease-out ${
          hidden
            ? "pointer-events-none translate-y-1 opacity-0"
            : "pointer-events-auto translate-y-0 opacity-100"
        }`}
      >
        {DESTINATIONS.map(({ href, label, d }, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                // A modified click opens a new tab: nothing navigates here, so
                // nothing may be marked for this page's next template mount.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                // Re-tapping the tab you're on (at its root) = back to the top.
                if (pathname === href) {
                  e.preventDefault();
                  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
                  return;
                }
                // A tab change enters in 0 ms (page-slide.tsx).
                setNavDirection(routeIndex !== i ? 1 : 0);
                setPending({ from: pathname, index: i });
              }}
              // 22 px sides at ≥390 (the frame); 14 below so four tabs still
              // fit a 360 viewport without clipping the ends.
              className={`bl-press-sm relative flex flex-col items-center gap-[3px] rounded-full px-3.5 py-2.5 min-[390px]:px-[22px] ${
                active ? "bg-white/[0.1] text-text" : "text-text-3"
              }`}
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d={d} />
              </svg>
              <span className="font-sans text-[10px] font-medium">{label}</span>
              {href === "/feed" && feedDot && (
                <span
                  aria-label="Novedades en tu feed"
                  className="absolute right-[18px] top-2 h-1.5 w-1.5 rounded-full bg-text"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
