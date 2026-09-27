import { notFound } from "next/navigation";
import { NotFoundError, UnauthorizedError } from "@/authz";
import { BacklogZoomView, loadBacklogZoom } from "../backlog-zoom-view";

/**
 * The collection (Kura · flujos-v2 03) as a full page — what a hard nav / refresh / shared URL
 * renders, and every soft nav EXCEPT from the profile (which intercepts it
 * into its overlay, perfil/@modal/(..)backlogs/[backlogId]). template.tsx
 * animates the page entry. A direct URL to a nonexistent backlog SHOULD
 * 404 (unlike the overlay twin, which redirects back to the profile).
 */
export default async function BacklogDetailPage({
  params,
}: {
  params: Promise<{ backlogId: string }>;
}) {
  const { backlogId } = await params;
  let data;
  try {
    data = await loadBacklogZoom(backlogId);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof UnauthorizedError) {
      notFound();
    }
    throw err;
  }

  return (
    <main>
      <BacklogZoomView data={data} />
    </main>
  );
}
