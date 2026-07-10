/**
 * Zoom-overlay skeleton — shown the instant a shelf card is tapped, while the
 * intercepted route's loader runs. The fixed shell + bl-zoom-in bloom live in
 * this segment's layout.tsx (NOT here — duplicating them made the overlay
 * visibly bloom twice: skeleton, then real content); this is just the inner
 * silhouette. One shared pulse, no spinners (item loading.tsx idiom).
 */
export default function Loading() {
  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div className="animate-pulse">
        {/* top bar silhouette: ‹ back + ⋯ menu chips */}
        <div className="flex items-center justify-between px-4 pt-[calc(24px+env(safe-area-inset-top))]">
          <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
          <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
        </div>

        {/* hero: name + meta line */}
        <div className="px-5 pt-[22px]">
          <div className="mt-[5px] h-[40px] w-3/5 rounded-xl bg-surface-1" />
          <div className="mt-2 h-2.5 w-2/5 rounded-full bg-surface-1" />
        </div>

        {/* a few item-row bars */}
        <div className="mt-[18px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-[58px] items-center gap-3 px-5">
              <div className="h-3 w-[18px] rounded bg-surface-1" />
              <div className="h-4 flex-1 rounded-full bg-surface-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
