import { CollectionSkeleton } from "../../[backlogId]/collection-skeleton";

/**
 * The automatic collection is a CollectionScreen (mode="auto") with no dock,
 * not a lens list — without this file it inherited /backlogs' card list and
 * its dock. Same silhouette as any collection, with the square AutoCover.
 */
export default function Loading() {
  return <CollectionSkeleton lead="square" />;
}
