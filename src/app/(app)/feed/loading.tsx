/**
 * /feed skeleton — the v10 stack's own shape, so the first paint doesn't
 * reflow: the header ("tu feed" + the 44 bell) at HDR_PX, then one card of
 * the M tier (author chip, a 2:3 cover centred, a pill and two title lines)
 * with the next card's edge showing under it. Skeletons pulse in opacity
 * between s1 and s2 (§patrones · cargando) — the one pulse the system allows.
 */
export default function Loading() {
  return (
    <main className="mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-bg">
      <div className="animate-pulse">
        <header className="flex h-[calc(76px+env(safe-area-inset-top))] items-end justify-between px-5 pb-[14px]">
          <div className="h-9 w-32 rounded-full bg-surface-1" />
          <div className="h-11 w-11 rounded-full bg-surface-1" />
        </header>
        <div className="flex h-[min(500px,58dvh)] flex-col gap-3.5 rounded-t-[26px] bg-surface-1 px-5 pt-[18px]">
          <div className="flex items-center gap-2 self-start rounded-full bg-surface-2 py-1 pl-1 pr-3">
            <div className="h-7 w-7 rounded-full bg-surface-1" />
            <div className="h-3 w-24 rounded-full bg-surface-1" />
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="aspect-[2/3] h-full rounded-[var(--r-cover-l)] bg-surface-2" />
          </div>
          <div className="flex flex-col gap-[9px] pb-5">
            <div className="h-[26px] w-36 rounded-full bg-surface-2" />
            <div className="h-6 w-3/4 rounded-full bg-surface-2" />
          </div>
        </div>
        <div className="-mt-1 h-24 rounded-t-[26px] bg-surface-2" />
      </div>
    </main>
  );
}
