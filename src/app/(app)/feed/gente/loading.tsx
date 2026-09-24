/**
 * /feed/gente skeleton — Volver, the title, the search field and a few 72
 * rows (seal 44, two lines, the follow pill). Needed because loading.tsx
 * boundaries nest: without one here the feed's stack skeleton would paint.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance">
      <div className="animate-pulse">
        <div className="flex px-6 pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="h-11 w-11 rounded-full bg-surface-1" />
        </div>
        <div className="px-6 pb-5 pt-4">
          <div className="h-9 w-36 rounded-full bg-surface-1" />
        </div>
        <div className="px-5">
          <div className="h-12 rounded-full bg-surface-1" />
          <div className="mt-6 h-3 w-24 rounded-full bg-surface-1" />
          <div className="mt-2 flex flex-col">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex min-h-[72px] items-center gap-3.5">
                <div className="h-11 w-11 flex-none rounded-full bg-surface-1" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3.5 w-28 rounded-full bg-surface-1" />
                  <div className="h-2.5 w-36 rounded-full bg-surface-2" />
                </div>
                <div className="h-9 w-[76px] rounded-full bg-surface-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
