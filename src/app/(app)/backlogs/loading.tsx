/**
 * /backlogs skeleton (Revamp UI 02) — the header with its chip, the segmented
 * filter and two backlog articles (name line, a strip of 150px covers, the
 * progress line). Shown only on the FIRST (uncached) visit; staleTimes keeps
 * revisits instant. NOTE: this boundary also covers the [backlogId]/lentes
 * segments' first paint, but those define their own closer loading.tsx, which
 * wins.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div className="animate-pulse">
        <header className="flex items-end justify-between px-5 pb-[18px] pt-[calc(20px+env(safe-area-inset-top))]">
          <div className="h-[30px] w-40 rounded-xl bg-surface-1" />
          <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
        </header>

        <div className="px-5 pb-[22px]">
          <div className="h-[41px] rounded-full bg-surface-1" />
        </div>

        <div className="flex flex-col gap-[30px]">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between px-5">
                <div className="h-7 w-32 rounded-lg bg-surface-1" />
                <div className="h-2.5 w-16 rounded-full bg-surface-1" />
              </div>
              <div className="flex gap-2 overflow-hidden px-5 pt-1">
                {[0, 1, 2, 3].map((j) => (
                  <div
                    key={j}
                    className={`h-[150px] flex-none rounded-[12px] bg-surface-1 ${
                      j === 2 ? "w-[150px]" : "w-[112px]"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2.5 px-5">
                <div className="h-[3px] flex-1 rounded-full bg-surface-1" />
                <div className="h-2.5 w-14 rounded-full bg-surface-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
