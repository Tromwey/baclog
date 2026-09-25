import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * One person row's silhouette (20e / 32b, people-list.tsx · suggestions.tsx):
 * 72 tall, seal 44, the @handle and its context line (gap 4), the 36 glass
 * follow pill. The same object in Tu gente and in your lists, so the same
 * skeleton.
 */
export function PersonRowSkeleton() {
  return (
    <div className="flex min-h-[72px] items-center gap-3.5">
      <div className="h-11 w-11 flex-none rounded-full bg-surface-1" />
      <div className="flex flex-1 flex-col gap-1">
        <div className="h-4 w-28 rounded-full bg-surface-1" />
        <div className="h-2.5 w-36 rounded-full bg-surface-2" />
      </div>
      <div className="h-9 w-[76px] rounded-full bg-surface-1" />
    </div>
  );
}

/**
 * /perfil/seguidores · /perfil/siguiendo skeleton (people-screen.tsx):
 * Volver + the mono @handle, the 52 segmented pair with the current tab
 * lifted, Buscar gente at 48, then a handful of rows. Each list needs its
 * own loading.tsx — without one they'd inherit /perfil's profile skeleton.
 */
export function PeopleSkeleton({ active }: { active: "followers" | "following" }) {
  return (
    <main aria-busy="true" className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance">
      <div className={`flex flex-col gap-4 px-6 pt-[calc(16px+env(safe-area-inset-top))] ${SKELETON_PULSE}`}>
        <div className="flex items-center justify-between">
          <div className="h-11 w-11 rounded-full bg-surface-1" />
          <div className="h-3 w-24 rounded-full bg-surface-1" />
        </div>
        <div className="flex h-[52px] gap-1 rounded-full bg-surface-1 p-[5px]">
          <div className={`flex-1 rounded-full ${active === "followers" ? "bg-surface-2" : ""}`} />
          <div className={`flex-1 rounded-full ${active === "following" ? "bg-surface-2" : ""}`} />
        </div>
        <div className="h-12 rounded-full bg-surface-1" />
        <div className="flex flex-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <PersonRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}
