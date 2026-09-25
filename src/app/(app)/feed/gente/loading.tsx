import { SKELETON_PULSE } from "@/components/kura/components";
import { PersonRowSkeleton } from "@/components/skeletons/people-skeleton";

/**
 * /feed/gente skeleton — Volver, the title, the search field and a few 72
 * rows (seal 44, two lines, the follow pill). Needed because loading.tsx
 * boundaries nest: without one here the feed's stack skeleton would paint.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance">
      <div className={SKELETON_PULSE}>
        <div className="flex px-6 pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="h-11 w-11 rounded-full bg-surface-1" />
        </div>
        <div className="px-6 pb-5 pt-4">
          <div className="h-9 w-36 rounded-full bg-surface-1" />
        </div>
        <div className="px-5 pb-10">
          <div className="h-12 rounded-full bg-surface-1" />
          <div className="mt-6 h-3 w-24 rounded-full bg-surface-1" />
          <div className="mt-1 flex flex-col">
            {[0, 1, 2, 3].map((i) => (
              <PersonRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
