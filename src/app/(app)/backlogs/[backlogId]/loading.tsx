import { CollectionSkeleton } from "./collection-skeleton";

/** A hard nav / refresh of a collection: its own silhouette, not the list's. */
export default function Loading() {
  return <CollectionSkeleton />;
}
