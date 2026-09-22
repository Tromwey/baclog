import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
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
 * it is load-bearing for the backlog-zoom overlay, not for the aura.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user.name) redirect("/onboarding");
  // Each page owns its own bottom clearance (pb-dock-clearance) — the dock is
  // fixed, so padding on a flow sibling wouldn't clear it anyway.
  return (
    <NavDockVisibilityProvider>
      {/* overflow-x-clip contains the page slide. This is a stacking context,
          so modals that must sit above the dock (fixed z-10) portal to <body>
          to escape it (see NewBacklogButton). The intercepted backlog-zoom
          overlay (backlogs/@modal) DEPENDS on this wrapper staying a stacking
          context to render UNDER the dock — do not remove relative/z-10. */}
      <div className="relative z-10 overflow-x-clip">{children}</div>
      <NavDock />
    </NavDockVisibilityProvider>
  );
}
