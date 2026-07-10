/**
 * /backlogs skeleton — shelf-band silhouettes matching the real layout, shown
 * only on the FIRST (uncached) visit; staleTimes keeps revisits instant. NOTE:
 * this boundary also covers the [backlogId]/lentes segments' first paint, but
 * those define their own closer loading.tsx, which wins.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div className="animate-pulse">
        {/* header: title + subtitle + two lens chips */}
        <header className="flex items-start justify-between px-5 pb-1 pt-[calc(44px+env(safe-area-inset-top))]">
          <div>
            <div className="h-8 w-44 rounded-xl bg-surface-1" />
            <div className="mt-3 h-2.5 w-56 rounded-full bg-surface-1" />
            <div className="mt-1.5 h-2.5 w-40 rounded-full bg-surface-1" />
          </div>
          <div className="mt-1 flex gap-2">
            <div className="h-10 w-10 rounded-full bg-surface-1" />
            <div className="h-10 w-10 rounded-full bg-surface-1" />
          </div>
        </header>

        {/* shelf bands */}
        <div className="flex flex-col gap-3 px-5 pt-7">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[88px] rounded-[18px] bg-surface-1" />
          ))}
          <div className="h-[60px] rounded-[18px] bg-surface-1/50" />
        </div>
      </div>
    </main>
  );
}
