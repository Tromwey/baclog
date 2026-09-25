import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /admin/palette-backfill skeleton — just the heading and the two-line
 * description; the runner is client-side and paints on its own. Own file so
 * the Pulso skeleton above doesn't paint here.
 */
export default function Loading() {
  return (
    <div className={`pt-1 ${SKELETON_PULSE}`}>
      <div className="h-7 w-56 rounded-full bg-surface-1" />
      <div className="mt-3 h-3.5 w-full rounded-full bg-surface-1" />
      <div className="mt-2 h-3.5 w-4/5 rounded-full bg-surface-1" />
    </div>
  );
}
