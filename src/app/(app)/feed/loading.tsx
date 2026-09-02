/**
 * /feed skeleton — the v2 card anatomy (feed-card.tsx), so the first paint
 * doesn't reflow: a burst (header, sentence, strip of 64px covers), a compact
 * row (18px orb, two lines, small cover on the RIGHT), a gem (header, 64px
 * cover beside a serif title), and a fading compact implying more below.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance">
      <div className="animate-pulse">
        <header className="px-4 pb-[26px] pt-[calc(24px+env(safe-area-inset-top))]">
          <div className="h-8 w-40 rounded-xl bg-surface-1" />
        </header>
        <div className="flex flex-col gap-2 px-4">
          <SkeletonBurst />
          <SkeletonCompact />
          <SkeletonGem />
          <SkeletonCompact faded />
        </div>
      </div>
    </main>
  );
}

function SkeletonHeader() {
  return (
    <div className="flex items-center gap-[9px]">
      <div className="h-6 w-6 flex-none rounded-full bg-surface-2" />
      <div className="h-[9px] w-20 rounded-full bg-surface-2" />
      <div className="ml-auto h-[7px] w-10 rounded-full bg-surface-2" />
    </div>
  );
}

function SkeletonBurst() {
  return (
    <div className="flex flex-col gap-[10px] rounded-[18px] bg-surface-1 px-3.5 py-3">
      <SkeletonHeader />
      <div className="h-[10px] w-3/5 rounded-full bg-surface-2" />
      <div className="flex items-end gap-1.5 overflow-hidden py-0.5">
        <div className="h-24 w-16 flex-none rounded-[10px] bg-surface-2" />
        <div className="h-16 w-16 flex-none rounded-[10px] bg-surface-2" />
        <div className="h-24 w-16 flex-none rounded-[10px] bg-surface-2" />
        <div className="h-16 w-16 flex-none rounded-[10px] bg-surface-2" />
        <div className="h-24 w-16 flex-none rounded-[10px] bg-surface-2" />
      </div>
      <div className="h-[7px] w-28 rounded-full bg-surface-2" />
    </div>
  );
}

function SkeletonCompact({ faded = false }: { faded?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 ${
        faded ? "bg-surface-1/50 opacity-60" : "bg-surface-1"
      }`}
    >
      <div className="mt-px h-[18px] w-[18px] flex-none self-start rounded-full bg-surface-2" />
      <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
        <div className="h-[9px] w-1/2 rounded-full bg-surface-2" />
        <div className="h-[13px] w-3/4 rounded-full bg-surface-2" />
        <div className="h-[7px] w-16 rounded-full bg-surface-2" />
      </div>
      <div className="h-12 w-8 flex-none rounded-md bg-surface-2" />
    </div>
  );
}

function SkeletonGem() {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-surface-1 px-3.5 pb-4 pt-3.5">
      <SkeletonHeader />
      <div className="flex items-start gap-3.5">
        <div className="h-24 w-16 flex-none rounded-[10px] bg-surface-2" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <div className="h-[10px] w-20 rounded-full bg-surface-2" />
          <div className="h-5 w-5/6 rounded-full bg-surface-2" />
          <div className="h-4 w-1/2 rounded-full bg-surface-2" />
          <div className="h-[7px] w-14 rounded-full bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
