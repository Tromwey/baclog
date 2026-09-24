import { CollectionSkeleton } from "../../[backlogId]/collection-skeleton";

/**
 * Overlay skeleton — shown the instant a collection is tapped, while the
 * intercepted route's loader runs. The fixed shell + bl-zoom-in bloom live in
 * this segment's layout.tsx (NOT here — duplicating them made the overlay
 * visibly bloom twice: skeleton, then real content); this is just the inner
 * silhouette, shared with the full page (collection-skeleton.tsx).
 */
export default function Loading() {
  return <CollectionSkeleton />;
}
