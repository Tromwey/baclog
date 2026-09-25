import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * Public ficha skeleton (page.tsx) — the in-app ficha's header geometry
 * (top row at 64, the 200×300 cover from 124), but this row is the kura
 * lockup and Entrar, and the actions are the 48 Guardar pill + the 48
 * Compartir chip. Then "dónde ver" with its 56 row and the synopsis. No
 * HideDock: /u lives outside (app), there is no nav dock here. Needed as
 * its own boundary so it doesn't inherit the public profile's skeleton.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg pb-14">
      <div className={SKELETON_PULSE}>
        <div className="relative flex flex-col items-center gap-3 px-6 pb-[30px] pt-[calc(124px+env(safe-area-inset-top))]">
          <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))] flex items-center justify-between">
            <div className="flex h-11 items-center">
              <div className="h-[22px] w-20 rounded-full bg-surface-1" />
            </div>
            <div className="h-11 w-[84px] rounded-full bg-surface-1" />
          </div>
          <div className="h-[300px] w-[200px] rounded-[var(--r-cover-l)] bg-surface-1" />
          <div className="mt-2 h-[30px] w-3/5 rounded-full bg-surface-2" />
          <div className="h-3.5 w-2/5 rounded-full bg-surface-1" />
          <div className="h-2.5 w-1/4 rounded-full bg-surface-1" />
          <div className="mt-0.5 h-[18px] w-24 rounded-full bg-surface-1" />
          <div className="mt-2 flex items-center gap-2">
            <div className="h-12 w-[120px] rounded-full bg-surface-1" />
            <div className="h-12 w-12 rounded-full bg-surface-1" />
          </div>
        </div>

        <div className="flex flex-col gap-[30px] px-6 pt-1">
          <div className="flex flex-col gap-1">
            <div className="h-[26px] w-32 rounded-full bg-surface-2" />
            <div className="flex min-h-14 items-center gap-3.5">
              <div className="h-10 w-10 rounded-[10px] bg-surface-1" />
              <div className="h-4 w-28 rounded-full bg-surface-1" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-3.5 w-full rounded-full bg-surface-1" />
            <div className="h-3.5 w-11/12 rounded-full bg-surface-1" />
            <div className="h-3.5 w-3/5 rounded-full bg-surface-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
