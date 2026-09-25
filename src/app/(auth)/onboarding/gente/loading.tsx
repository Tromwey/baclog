import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /onboarding/gente skeleton — 32b (gente-flow.tsx): step mark, the three
 * picks as 120-tall covers, the heading, the body line and a few 72 people
 * rows (seal 44, two lines, the Seguir pill). Its own boundary because the
 * parent /onboarding one is a different screen.
 */
export default function Loading() {
  return (
    <main className="relative h-dvh overflow-hidden bg-bg">
      <div className={SKELETON_PULSE}>
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-7 pt-[calc(72px+env(safe-area-inset-top))]">
          <div className="h-3 w-12 rounded-full bg-surface-1" />
          <div className="flex items-end justify-center gap-2.5 pb-1 pt-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[120px] w-20 rounded-[var(--r-cover-l)] bg-surface-1"
              />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-8 w-4/5 rounded-full bg-surface-1" />
            <div className="h-8 w-1/2 rounded-full bg-surface-1" />
          </div>
          <div className="h-3.5 w-3/4 rounded-full bg-surface-2" />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-col px-5 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex min-h-[72px] items-center gap-3.5">
              <div className="h-11 w-11 flex-none rounded-full bg-surface-1" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3.5 w-28 rounded-full bg-surface-1" />
                <div className="h-2.5 w-40 rounded-full bg-surface-2" />
              </div>
              <div className="h-9 w-[76px] rounded-full bg-surface-1" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
