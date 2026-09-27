import type { ReactNode } from "react";
import { CollectionOverlay } from "../../../../backlogs/collection-overlay";

/**
 * The collection overlay's shell. It lives in the LAYOUT (not page/loading)
 * so the fan's flight plays exactly ONCE per open: layouts persist across the
 * Suspense swap from loading.tsx to page.tsx.
 */
export default async function InterceptedCollectionShell({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ backlogId: string }>;
}) {
  const { backlogId } = await params;
  return <CollectionOverlay backlogId={backlogId}>{children}</CollectionOverlay>;
}
