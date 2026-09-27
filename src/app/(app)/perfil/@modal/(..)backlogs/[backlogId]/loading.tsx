import { CollectionSkeleton } from "../../../../backlogs/[backlogId]/collection-skeleton";

/**
 * The overlay's silhouette while the loader runs — the flying fan waits over
 * its ghost (collection-overlay.tsx keeps the flight up until the real fan
 * is there). `overlay`: the overlay shell lifts the dock over itself.
 */
export default function Loading() {
  return <CollectionSkeleton overlay />;
}
