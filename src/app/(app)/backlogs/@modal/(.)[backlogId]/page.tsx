import { notFound, redirect } from "next/navigation";
import { NotFoundError, UnauthorizedError } from "@/authz";
import { BacklogZoomView, loadBacklogZoom } from "../../backlog-zoom-view";

/**
 * The shelf zoom as an intercepted overlay — a soft nav from /backlogs lands
 * here (URL becomes /backlogs/[id], shareable) while the shelf list stays
 * mounted underneath. Same loader as the full-page twin. The fixed shell +
 * bl-zoom-in bloom live in this segment's layout.tsx so they play ONCE and
 * survive the loading→page swap; `zoom` here only adds the inner content
 * staggers. Dismiss = router.back() (the hero's ZoomBackButton).
 */
export default async function InterceptedBacklogZoom({
  params,
}: {
  params: Promise<{ backlogId: string }>;
}) {
  const { backlogId } = await params;
  let data;
  try {
    data = await loadBacklogZoom(backlogId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      // Back-nav onto a just-deleted backlog: land quietly on the list instead
      // of 404ing an overlay (the full-page twin still 404s on direct URLs).
      redirect("/backlogs");
    }
    if (err instanceof UnauthorizedError) notFound();
    throw err;
  }

  return (
    <BacklogZoomView
      backlog={data.backlog}
      items={data.items}
      paletteHex={data.paletteHex}
      zoom
    />
  );
}
