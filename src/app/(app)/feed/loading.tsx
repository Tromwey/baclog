/**
 * /feed skeleton — the v3 card anatomy (feed-card.tsx), so the first paint
 * doesn't reflow: a full-bleed hero (2:3, pill top-left, word panel at the
 * bottom), a compact row (124px cover on the LEFT, three lines), a burst
 * (header with two lines, a strip of 208px covers) and a fading compact
 * implying more below. Surfaceless like the cards: 36px of dark between.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div className="animate-pulse">
        <header className="px-5 pb-4 pt-[calc(22px+env(safe-area-inset-top))]">
          <div className="h-8 w-40 rounded-xl bg-surface-1" />
        </header>
        <div className="flex flex-col gap-9 pt-1.5">
          <SkeletonHero />
          <SkeletonCompact />
          <SkeletonBurst />
          <SkeletonCompact faded />
        </div>
      </div>
    </main>
  );
}

function SkeletonHero() {
  return (
    <div className="relative aspect-[2/3] w-full bg-surface-1">
      <div className="absolute left-3.5 top-3.5 flex items-center gap-2 rounded-full bg-surface-2 py-[5px] pl-[5px] pr-3">
        <div className="h-[22px] w-[22px] rounded-full bg-surface-3" />
        <div className="h-[9px] w-16 rounded-full bg-surface-3" />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 px-5 pb-[22px] pt-[18px]">
        <div className="h-[10px] w-20 rounded-full bg-surface-2" />
        <div className="h-7 w-4/5 rounded-full bg-surface-2" />
        <div className="h-7 w-1/2 rounded-full bg-surface-2" />
        <div className="h-[7px] w-24 rounded-full bg-surface-2" />
      </div>
    </div>
  );
}

function SkeletonCompact({ faded = false }: { faded?: boolean }) {
  return (
    <div className={`flex items-center gap-[18px] px-5 ${faded ? "opacity-50" : ""}`}>
      <div className="aspect-[2/3] w-[124px] flex-none rounded-[14px] bg-surface-1" />
      <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
        <div className="flex items-center gap-[7px]">
          <div className="h-[18px] w-[18px] flex-none rounded-full bg-surface-2" />
          <div className="h-[9px] w-3/5 rounded-full bg-surface-2" />
        </div>
        <div className="h-5 w-5/6 rounded-full bg-surface-2" />
        <div className="h-5 w-1/2 rounded-full bg-surface-2" />
        <div className="h-[7px] w-24 rounded-full bg-surface-2" />
      </div>
    </div>
  );
}

function SkeletonBurst() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-[9px] px-5">
        <div className="h-[26px] w-[26px] flex-none rounded-full bg-surface-2" />
        <div className="flex flex-col gap-[5px]">
          <div className="h-[9px] w-20 rounded-full bg-surface-2" />
          <div className="h-[9px] w-40 rounded-full bg-surface-2" />
        </div>
        <div className="ml-auto h-[7px] w-10 rounded-full bg-surface-2" />
      </div>
      <div className="flex items-end gap-2.5 overflow-hidden px-5 py-1">
        <div className="h-[208px] w-[139px] flex-none rounded-[14px] bg-surface-1" />
        <div className="h-[208px] w-[208px] flex-none rounded-[14px] bg-surface-1" />
        <div className="h-[208px] w-[139px] flex-none rounded-[14px] bg-surface-1" />
      </div>
      <div className="flex items-center px-5">
        <div className="h-[7px] w-28 rounded-full bg-surface-2" />
        <div className="ml-auto h-7 w-20 rounded-full bg-surface-2" />
      </div>
    </div>
  );
}
