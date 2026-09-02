/**
 * /feed skeleton (design 1d) — card silhouettes with the feed's own anatomy:
 * cover slab, verb bar, title bar, meta bar. The third one carries the two
 * extra text lines of a review card; the fourth fades, implying more below.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div className="animate-pulse">
        <header className="px-4 pb-[26px] pt-[calc(24px+env(safe-area-inset-top))]">
          <div className="h-8 w-40 rounded-xl bg-surface-1" />
        </header>
        <div className="flex flex-col gap-2 px-4">
          <SkeletonCard tall />
          <SkeletonCard />
          <SkeletonCard tall review />
          <div className="flex gap-3 rounded-[18px] bg-surface-1/50 px-3.5 pb-3.5 pt-3">
            <div className="h-[66px] w-11 flex-none rounded-lg bg-surface-2 opacity-60" />
            <div className="flex-1 pt-[3px]">
              <div className="h-[9px] w-[90px] rounded-full bg-surface-2 opacity-60" />
              <div className="mt-3 h-[15px] w-2/3 rounded-full bg-surface-2 opacity-60" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function SkeletonCard({
  tall = false,
  review = false,
}: {
  tall?: boolean;
  review?: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-[18px] bg-surface-1 px-3.5 pb-3.5 pt-3">
      <div
        className={`w-11 flex-none rounded-lg bg-surface-2 ${
          tall ? "h-[66px]" : "h-11"
        }`}
      />
      <div className="flex-1 pt-[3px]">
        <div className="h-[9px] w-24 rounded-full bg-surface-2" />
        <div className="mt-3 h-[15px] w-3/4 rounded-full bg-surface-2" />
        <div className="mt-[9px] h-[7px] w-12 rounded-full bg-surface-2" />
        {review && (
          <>
            <div className="mt-3.5 h-2 w-full rounded-full bg-surface-2" />
            <div className="mt-[7px] h-2 w-[88%] rounded-full bg-surface-2" />
          </>
        )}
      </div>
    </div>
  );
}
