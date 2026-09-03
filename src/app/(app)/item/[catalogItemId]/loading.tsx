/**
 * Item detail skeleton (Revamp UI 06) — the page's silhouette shown instantly
 * while the server page streams in: the full-bleed cover with its two chips
 * and the title block at its foot, then the reaction track, the two buttons
 * and a few lines of synopsis. Mirrors the real page's paddings so the swap
 * doesn't jump. One shared pulse (opacity only) — no spinners. The cover is
 * drawn 3:4 (films/series, the common case); an album's square lands with
 * the real page.
 */
export default function Loading() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md pb-[60px]">
      <div className="animate-pulse">
        <div className="relative aspect-[3/4] w-full bg-surface-1">
          <div className="absolute left-5 right-5 top-[calc(12px+env(safe-area-inset-top))] flex justify-between">
            <div className="h-[38px] w-[38px] rounded-full bg-surface-2" />
            <div className="h-[38px] w-[38px] rounded-full bg-surface-2" />
          </div>
          <div className="absolute bottom-0 left-6 right-6 flex flex-col gap-3">
            <div className="h-2.5 w-2/5 rounded-full bg-surface-2" />
            <div className="h-[48px] w-4/5 rounded-xl bg-surface-2" />
          </div>
        </div>

        <div className="flex flex-col gap-[22px] px-5 pt-[22px]">
          <div className="h-[58px] rounded-full bg-surface-1" />
          <div className="flex gap-2.5">
            <div className="h-[46px] flex-1 rounded-full bg-surface-1" />
            <div className="h-[46px] w-[130px] rounded-full bg-surface-1" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-3.5 w-full rounded-full bg-surface-1" />
            <div className="h-3.5 w-11/12 rounded-full bg-surface-1" />
            <div className="h-3.5 w-3/5 rounded-full bg-surface-1" />
          </div>
        </div>
      </div>
    </main>
  );
}
