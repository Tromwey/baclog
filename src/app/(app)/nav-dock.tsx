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
 * The floating nav dock (M3.5 redesign, mock #p1) — three destinations in a
 * content-hugging glass pill: Backlogs · Discover · Perfil. Active = dark
 * inner pill + lima glyph (HANDOFF §7). It hides two different ways, on
 * purpose:
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
  { href: "/backlogs", label: "Backlogs", Icon: EstantesIcon },
  { href: "/descubrir", label: "Discover", Icon: DiscoverIcon },
  { href: "/perfil", label: "Perfil", Icon: PerfilIcon },
];

export function NavDock() {
  const pathname = usePathname();
  // The dock is always present now (fixed z-10). The backlog zoom overlay is
  // z-50 but trapped inside the content wrapper's z-10 stacking context, so
  // the dock (a later sibling) keeps painting above it — that's the intended
  // framing (mock #p2 shows the dock over the zoom). The context-hidden fade
  // stays as an opt-in for any future ephemeral case.
  const hidden = useContext(HiddenCtx);

  // Hard route boundary (see the doc comment above): the Torre de Control
  // (/admin) is a whole different screen, so the dock returns null — no
  // post-hydration fade, no flash on a hard load.
  if (pathname.startsWith("/admin")) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-offset)+env(safe-area-inset-bottom))] z-10 flex justify-center"
    >
      {/* Content-hugging pill (mock #p1): no border, no grain, no fixed width.
          Active destination = dark inner pill + lima glyph (HANDOFF §7 — never
          a lima background). */}
      <div
        className={`bl-dock-glass flex gap-1.5 rounded-full p-1.5 shadow-[0_14px_44px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.16)] transition-[opacity,transform] duration-300 ease-out ${
          hidden
            ? "pointer-events-none translate-y-1 opacity-0"
            : "pointer-events-auto translate-y-0 opacity-100"
        }`}
      >
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
              className={`flex flex-col items-center gap-[3px] rounded-full px-7 py-2.5 ${
                active ? "bg-black/40 text-accent" : "text-text-3"
              }`}
            >
              <Icon />
              {/* Hanken, sentence-case — UPPERCASE is reserved to mono-meta
                  (sistema-diseno §3), so nav labels don't shout. */}
              <span className="font-sans text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* Bespoke FILLED glyphs (verbatim from mock #p1's dock markup) — deliberately
   not the app's stroke-based lucide set; the dock is its own treatment. Active
   state is pill + color only, so there's no stroke weight to animate. */

function EstantesIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="4" y="4" width="16" height="6.6" rx="1.7" />
      <rect x="4" y="13.4" width="16" height="6.6" rx="1.7" />
    </svg>
  );
}

function DiscoverIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z" />
    </svg>
  );
}

function PerfilIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M5 20.5a7 7 0 0114 0z" />
    </svg>
  );
}
