/**
 * /feed/gente skeleton — back chip, title, the search pill and a few person
 * rows. Needed because loading.tsx boundaries nest: without one here the
 * feed's own skeleton (bursts and gems) would paint while this screen loads.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div className="animate-pulse">
        <div className="flex px-4 pt-[calc(24px+env(safe-area-inset-top))]">
          <div className="h-10 w-10 rounded-full bg-surface-1" />
        </div>
        <header className="px-4 pb-5 pt-[18px]">
          <div className="h-8 w-44 rounded-xl bg-surface-1" />
        </header>
        <div className="px-4">
          <div className="h-[42px] rounded-full bg-surface-3" />
          <div className="mt-6 h-[7px] w-16 rounded-full bg-surface-2" />
          <div className="mt-3 flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-[14px] bg-surface-1 py-[11px] pl-3.5 pr-3"
              >
                <div className="h-10 w-10 flex-none rounded-full bg-surface-2" />
                <div className="flex-1">
                  <div className="h-[11px] w-28 rounded-full bg-surface-2" />
                  <div className="mt-2 h-[7px] w-36 rounded-full bg-surface-2" />
                </div>
                <div className="h-7 w-[68px] rounded-full bg-surface-2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
