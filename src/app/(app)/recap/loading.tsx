import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /recap skeleton — Volver 44 with the mono "recap · mes año" centered, the
 * month in Newsreader 64, the "lo más tuyo" row (a 128 2:3 cover, label,
 * title, byline), the 2×2 of the month and Compartir tarjeta. Plain `--bg`:
 * the tint belongs to the month's top title, unknown until it loads.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg">
      <div
        className={`flex flex-col gap-[22px] px-6 pb-dock-clearance pt-[calc(16px+env(safe-area-inset-top))] ${SKELETON_PULSE}`}
      >
        <div className="flex items-center justify-between">
          <div className="h-11 w-11 rounded-full bg-surface-1" />
          <div className="h-3 w-36 rounded-full bg-surface-1" />
          <span className="w-11" aria-hidden />
        </div>

        <div className="h-16 w-48 rounded-full bg-surface-1" />

        <div className="flex items-end gap-4">
          <div className="aspect-[2/3] w-[128px] flex-none rounded-[var(--r-cover-l)] bg-surface-1" />
          <div className="flex flex-1 flex-col gap-2.5">
            <div className="h-3 w-24 rounded-full bg-surface-1" />
            <div className="h-6 w-[85%] rounded-full bg-surface-1" />
            <div className="h-3.5 w-28 rounded-full bg-surface-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-[18px] py-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-12 w-14 rounded-[10px] bg-surface-1" />
              <div className="h-3 w-24 rounded-full bg-surface-1" />
            </div>
          ))}
        </div>

        <div className="pt-1">
          <div className="h-12 w-44 rounded-full bg-surface-1" />
        </div>
      </div>
    </main>
  );
}
