import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { BottomNav } from "./bottom-nav";

/**
 * Session gate for the whole authenticated tree. Row-level ownership is
 * still re-checked per mutation in src/authz — this only guarantees a
 * signed-in, onboarded, non-minor user.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user.name) redirect("/onboarding");
  return (
    <div className="pb-16">
      {children}
      <BottomNav />
    </div>
  );
}
