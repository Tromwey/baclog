import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /recap/meses skeleton — Volver 44, "meses anteriores" in Newsreader 40, the
 * newest month's `--s1` block (label + the recap's 2×2 of numbers), then the
 * row of 108×192 miniatures. Needed because loading.tsx boundaries nest:
 * without one here the Recap skeleton would paint.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance">
      <div className={SKELETON_PULSE}>
        <div className="px-6 pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="h-11 w-11 rounded-full bg-surface-1" />
        </div>
        <div className="px-5 pt-4">
          <div className="h-10 w-64 rounded-full bg-surface-1" />
        </div>
        <div className="mx-5 mt-[22px] flex flex-col gap-3 rounded-[var(--r-surface)] bg-surface-1 p-4">
          <div className="h-3 w-40 rounded-full bg-surface-2" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-[18px] py-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="h-8 w-10 rounded-[8px] bg-surface-2" />
                <div className="h-3 w-full max-w-[88px] rounded-full bg-surface-2" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2.5 overflow-hidden px-5 pb-[60px] pt-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 w-[108px] flex-none rounded-[var(--r-cover-l)] bg-surface-1" />
          ))}
        </div>
      </div>
    </main>
  );
}
