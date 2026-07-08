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
 * The floating nav dock (M3.5 redesign) — three destinations in a glass-icy
 * pill: Backlogs · Descubrir · Perfil. Active = lima, no pill/lens. It hides
 * two different ways, on purpose:
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

const DESTINATIONS: { href: string; label: string; Icon: () => ReactNode }[] = [
  { href: "/backlogs", label: "Backlogs", Icon: BacklogsIcon },
  { href: "/descubrir", label: "Descubrir", Icon: DescubrirIcon },
  { href: "/perfil", label: "Perfil", Icon: PerfilIcon },
];

export function NavDock() {
  const pathname = usePathname();
  // The dock is always present now (fixed z-10). Full-screen overlays (backlog
  // zoom) are opaque z-50 and simply cover it. The context-hidden fade stays as
  // an opt-in for any future ephemeral case.
  const hidden = useContext(HiddenCtx);

  return (
    <nav
      aria-label="Navegación principal"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(30px+env(safe-area-inset-bottom))] z-10 flex justify-center"
    >
      <div
        className={`relative flex h-[62px] w-[min(300px,calc(100vw-32px))] items-center overflow-hidden rounded-[26px] border border-white/10 bg-white/5 shadow-[var(--shadow-card)] backdrop-blur-[24px] backdrop-saturate-[1.25] transition-[opacity,transform] duration-300 ease-out ${
          hidden
            ? "pointer-events-none translate-y-1 opacity-0"
            : "pointer-events-auto translate-y-0 opacity-100"
        }`}
      >
        <div aria-hidden className="bl-grain" />
        {DESTINATIONS.map(({ href, label, Icon }, i) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                // Carousel direction: which way the destinations are ordered.
                const from = DESTINATIONS.findIndex((d) =>
                  pathname.startsWith(d.href),
                );
                setNavDirection(from >= 0 && from !== i ? Math.sign(i - from) : 0);
              }}
              className={`relative flex flex-1 flex-col items-center justify-center gap-[5px] ${
                active ? "text-accent" : "text-text-2"
              }`}
            >
              <Icon />
              {/* Hanken, sentence-case — UPPERCASE is reserved to mono-meta
                  (sistema-diseno §3), so nav labels don't shout. */}
              <span className="font-sans text-[9px] font-semibold tracking-[0.01em]">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* Bespoke FILLED glyphs (verbatim from the redesign prototype) — deliberately
   not the app's stroke-based lucide set; the dock is its own treatment. Active
   state is color-only, so there's no stroke weight to animate. */

function BacklogsIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="4" cy="6" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="4" cy="18" r="1.5" />
      <rect x="8" y="5" width="13" height="2.2" rx="1.1" />
      <rect x="8" y="10.9" width="13" height="2.2" rx="1.1" />
      <rect x="8" y="16.8" width="13" height="2.2" rx="1.1" />
    </svg>
  );
}

function DescubrirIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.4l2.1 7.5 7.5 2.1-7.5 2.1L12 21.6l-2.1-7.5L2.4 12l7.5-2.1L12 2.4Z" />
      <path d="M19.6 2.8l.7 2.5 2.5.7-2.5.7-.7 2.5-.7-2.5-2.5-.7 2.5-.7.7-2.5Z" />
    </svg>
  );
}

function PerfilIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M12 14c-4.4 0-8 2.6-8 6.2 0 .5.4.8.9.8h14.2c.5 0 .9-.3.9-.8 0-3.6-3.6-6.2-8-6.2Z" />
    </svg>
  );
}
