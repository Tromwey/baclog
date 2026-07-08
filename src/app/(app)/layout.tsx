import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { getUserPalette } from "@/modules/backlog/queries";
import { AuraBackground } from "./aura-background";
import { NavDock, NavDockVisibilityProvider } from "./nav-dock";

/**
 * Session gate for the whole authenticated tree. Row-level ownership is
 * still re-checked per mutation in src/authz — this only guarantees a
 * signed-in, onboarded, non-minor user.
 *
 * Also hosts the persistent ADN aura (behind every page) and the nav dock, so
 * both survive client navigations — only {children} swaps.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user.name) redirect("/onboarding");
  const palette = await getUserPalette(user.id);
  // Each page owns its own bottom clearance (pb-dock-clearance) — the dock is
  // fixed, so padding on a flow sibling wouldn't clear it anyway. Page <main>s
  // stay transparent so the aura shows through.
  return (
    <NavDockVisibilityProvider>
      <AuraBackground colors={palette} />
      {/* z-10 keeps content above the aura; overflow-x-clip contains the page
          slide. This is a stacking context, so modals that must sit above the
          dock (fixed z-10) portal to <body> to escape it (see NewBacklogButton). */}
      <div className="relative z-10 overflow-x-clip">{children}</div>
      <NavDock />
    </NavDockVisibilityProvider>
  );
}
