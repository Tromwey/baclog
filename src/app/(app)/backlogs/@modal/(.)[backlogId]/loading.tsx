/**
 * Overlay skeleton (Revamp UI 03) — shown the instant a backlog is tapped,
 * while the intercepted route's loader runs. The fixed shell + bl-zoom-in
 * bloom live in this segment's layout.tsx (NOT here — duplicating them made
 * the overlay visibly bloom twice: skeleton, then real content); this is just
 * the inner silhouette: header chips, the title block, the tabs and a 3×2
 * grid of covers. One shared pulse, no spinners.
 */
export default function Loading() {
  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md pb-[160px]">
      <div className="animate-pulse">
        <div className="flex items-center justify-between px-5 pt-[calc(12px+env(safe-area-inset-top))]">
          <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
          <div className="flex gap-2">
            <div className="h-[38px] w-[88px] rounded-full bg-surface-1" />
            <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
          </div>
        </div>

        <div className="flex flex-col gap-2 px-6 pt-[26px]">
          <div className="h-2.5 w-2/5 rounded-full bg-surface-1" />
          <div className="h-[52px] w-3/5 rounded-xl bg-surface-1" />
          <div className="mt-0.5 h-3 w-4/5 rounded-full bg-surface-1" />
        </div>

        <div className="px-5 pb-[18px] pt-[26px]">
          <div className="h-[41px] rounded-full bg-surface-1" />
        </div>

        <div className="grid grid-cols-3 gap-2.5 px-5 pt-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="aspect-[3/4] w-full rounded-[12px] bg-surface-1" />
              <div className="h-3 w-4/5 rounded-full bg-surface-1" />
              <div className="h-2 w-3/5 rounded-full bg-surface-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
