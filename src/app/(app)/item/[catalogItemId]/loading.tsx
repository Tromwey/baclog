/**
 * Item detail skeleton — the page's silhouette (top chips · cover · title ·
 * synopsis) shown instantly while the server page streams in. Mirrors the
 * real page's paddings so the swap doesn't jump; transparent bg keeps the
 * app-wide aura visible. One shared pulse (opacity only) — no spinners.
 */
export default function Loading() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md pb-44">
      <div className="animate-pulse">
        {/* top bar silhouette: ✕ close + (share · ⋯) chips */}
        <div className="flex items-center justify-between px-4 pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
          <div className="flex items-center gap-2.5">
            <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
            <div className="h-[38px] w-[38px] rounded-full bg-surface-1" />
          </div>
        </div>

        {/* cover — portrait silhouette (films/series, the common case); an
            album swaps to its 158px square only after the real page lands. */}
        <div className="mt-7 flex justify-center">
          <div className="h-[210px] w-[140px] rounded-2xl bg-surface-2" />
        </div>

        {/* title block: title bar + meta line + two synopsis lines */}
        <div className="px-5 pt-5">
          <div className="mx-auto h-[44px] w-3/5 rounded-xl bg-surface-1" />
          <div className="mx-auto mt-2.5 h-2.5 w-2/5 rounded-full bg-surface-1" />
          <div className="mx-auto mt-3.5 h-3.5 w-4/5 rounded-full bg-surface-1" />
          <div className="mx-auto mt-2 h-3.5 w-3/5 rounded-full bg-surface-1" />
        </div>
      </div>
    </main>
  );
}
