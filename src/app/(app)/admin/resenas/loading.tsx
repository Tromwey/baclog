import { CardStackSkeleton } from "../ui";

/**
 * /admin/resenas skeleton — the Reportadas count card and the Cola card.
 * Own file so the Pulso skeleton above doesn't paint here.
 */
export default function Loading() {
  return <CardStackSkeleton bodies={[34, 220]} />;
}
