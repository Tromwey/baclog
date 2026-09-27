import { notFound, redirect } from "next/navigation";
import { NotFoundError, UnauthorizedError } from "@/authz";
import { BacklogZoomView, loadBacklogZoom } from "../../../../backlogs/backlog-zoom-view";

/**
 * A collection opened from the profile (Colecciones · transiciones §2), as an
 * intercepted overlay: the URL becomes /backlogs/[id] (shareable) while the
 * profile stays mounted underneath. Same loader as the full page. The shell
 * (the flight, the staged entrance, the close) is this segment's layout.
 */
export default async function InterceptedCollection({
  params,
}: {
  params: Promise<{ backlogId: string }>;
}) {
  const { backlogId } = await params;
  let data;
  try {
    data = await loadBacklogZoom(backlogId);
  } catch (err) {
    // A just-deleted collection (a back-nav onto it): land quietly on the
    // profile instead of 404ing an overlay.
    if (err instanceof NotFoundError) redirect("/perfil");
    if (err instanceof UnauthorizedError) notFound();
    throw err;
  }
  return <BacklogZoomView data={data} overlay />;
}
