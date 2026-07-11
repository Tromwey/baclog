import { redirect } from "next/navigation";
import { requireAdmin } from "@/modules/admin/guard";

/**
 * F3.4's /admin/analytics grew into the Torre de Control's Tráfico tab —
 * this stub keeps old bookmarks working. It re-checks the founder gate
 * itself: layout and page render in parallel, so an ungated redirect could
 * surface a 307 to a non-founder before the layout's notFound() lands (the
 * enumeration oracle this page always avoided).
 */
export default async function AnalyticsRedirect() {
  await requireAdmin();
  redirect("/admin/trafico");
}
