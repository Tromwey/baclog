import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * Shared collection skeleton (page.tsx · 33b) — the kura lockup and Entrar
 * at 64, the 160×240 lead cover from 124, the Newsreader 24 name, the owner
 * row (seal 32 · "de @handle" · the 36 Seguir), then the one-shelf body:
 * covers at 132 with their italic title line (collection-body.tsx's Tile).
 * The format pills only exist when the collection mixes formats, so they
 * land with the page. Its own boundary so it doesn't inherit the public
 * profile's skeleton.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg">
      <div className={SKELETON_PULSE}>
        <div className="relative flex flex-col items-center gap-3 px-6 pb-7 pt-[calc(124px+env(safe-area-inset-top))]">
          <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))] flex items-center justify-between">
            <div className="flex h-11 items-center">
              <div className="h-[22px] w-20 rounded-full bg-surface-1" />
            </div>
            <div className="h-11 w-[84px] rounded-full bg-surface-1" />
          </div>
          <div className="h-[240px] w-[160px] rounded-[var(--r-cover-l)] bg-surface-1" />
          <div className="mt-2 h-6 w-1/2 rounded-full bg-surface-2" />
          <div className="mt-1 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-surface-1" />
            <div className="h-3.5 w-28 rounded-full bg-surface-1" />
            <div className="h-9 w-[76px] rounded-full bg-surface-1" />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-5 px-5 pb-14 pt-5">
          {[88, 88, 88, 88, 88, 88].map((w, i) => (
            <div key={i} className="flex flex-col gap-[7px]" style={{ width: w }}>
              <div className="h-[132px] rounded-[var(--r-cover-l)] bg-surface-1" />
              {/* Title line: Newsreader 14 × 1.15 ≈ 16 px. */}
              <div className="flex h-4 items-center">
                <div className="h-3 rounded-full bg-surface-1" style={{ width: w * 0.8 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
