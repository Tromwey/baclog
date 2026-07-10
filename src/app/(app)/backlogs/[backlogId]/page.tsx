import { notFound } from "next/navigation";
import { NotFoundError, UnauthorizedError } from "@/authz";
import { BacklogZoomView, loadBacklogZoom } from "../backlog-zoom-view";

/**
 * The shelf zoom as a full page — what a hard nav / refresh / shared URL
 * renders. Soft navs from /backlogs are intercepted into the overlay twin
 * (@modal/(.)[backlogId]) instead. No bl-zoom-* classes here: template.tsx
 * already animates page entry. A direct URL to a nonexistent backlog SHOULD
 * 404 (unlike the overlay twin, which redirects back to the list).
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
      <BacklogZoomView
        backlog={data.backlog}
        items={data.items}
        paletteHex={data.paletteHex}
      />
    </main>
  );
}
