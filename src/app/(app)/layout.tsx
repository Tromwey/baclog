import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { isOnboarded } from "@/auth/user-row";
import { CoverFlightLayer } from "@/components/kura/cover-flight";
import { NavDock, NavDockVisibilityProvider } from "./nav-dock";

/**
 * Session gate for the whole authenticated tree. Row-level ownership is
 * still re-checked per mutation in src/authz — this only guarantees a
 * signed-in, onboarded, non-minor user.
 *
 * Also hosts the nav dock, so it survives client navigations — only
 * {children} swaps.
 *
 * There is no app-wide aura any more (founder call, 2026-09-21: the ADN aura
 * was removed from every screen). The `relative z-10` wrapper below stays:
 * it keeps page content (and the page slide) in one stacking context.
 *
 * `CoverFlightLayer` is the persistent layer a collection's cover flies in
 * when it opens a ficha (Colecciones · transiciones §4): it has to outlive
 * the navigation, so it lives here, next to the dock.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Name AND birth year (F2.2). An older account with a name but no year is
  // sent to /onboarding too: its user step asks for both and never bounces
  // back here until they are saved (see (auth)/onboarding/page.tsx).
  if (!isOnboarded(user)) redirect("/onboarding");
  // Each page owns its own bottom clearance (pb-dock-clearance) — the dock is
  // fixed, so padding on a flow sibling wouldn't clear it anyway.
  return (
    <NavDockVisibilityProvider>
      {/* overflow-x-clip contains the page slide. This is a stacking context,
          so modals that must sit above the dock (fixed z-10) portal to <body>
          to escape it (see NewBacklogButton, and the profile's collection
          overlay, backlogs/collection-overlay.tsx). */}
      <div className="relative z-10 overflow-x-clip">{children}</div>
      <NavDock />
      <CoverFlightLayer />
    </NavDockVisibilityProvider>
  );
}
