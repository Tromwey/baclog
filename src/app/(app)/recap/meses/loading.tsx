import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /recap/meses skeleton — Volver 44, the mono "recap · mes año" over the
 * month in Newsreader 40, its three `--s1` tiles, then "meses anteriores"
 * and the collection-shaped card (spine + 108×192 miniatures). Needed
 * because loading.tsx boundaries nest: without one here the Recap skeleton
 * would paint.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance">
      <div className={SKELETON_PULSE}>
        <div className="px-6 pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="h-11 w-11 rounded-full bg-surface-1" />
        </div>
        <div className="flex flex-col gap-2.5 px-5 pt-4">
          <div className="h-3 w-32 rounded-full bg-surface-1" />
          <div className="h-10 w-40 rounded-full bg-surface-1" />
        </div>
        <div className="mx-5 mt-[18px] flex gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-2 rounded-[var(--r-surface)] bg-surface-1 p-4">
              <div className="h-7 w-8 rounded-[8px] bg-surface-2" />
              <div className="h-3 w-full max-w-[72px] rounded-full bg-surface-2" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 px-3 pb-[60px] pt-10">
          <div className="mx-2 h-6 w-44 rounded-full bg-surface-1" />
          <div className="flex overflow-hidden rounded-[var(--r-screen)] bg-surface-1">
            <div className="w-10 flex-none bg-black/[0.24]" />
            <div className="flex flex-1 gap-2.5 overflow-hidden px-4 py-[18px]">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-48 w-[108px] flex-none rounded-[var(--r-cover-l)] bg-surface-2" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
