import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /settings skeleton — Volver 44, the "ajustes" title, the you-group (the 76
 * row with its 52 seal + the Correo row), then privacidad / apps /
 * notificaciones: a mono label over a `--s1` group of 52 rows each.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance">
      <div className={SKELETON_PULSE}>
        <div className="px-6 pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="h-11 w-11 rounded-full bg-surface-1" />
        </div>
        <div className="flex flex-col gap-7 px-4 pt-4">
          <div className="mx-2 h-9 w-32 rounded-full bg-surface-1" />

          <div className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1">
            <div className="flex min-h-[76px] items-center gap-3.5 pl-4 pr-3.5">
              <div className="h-[52px] w-[52px] flex-none rounded-full bg-surface-2" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-28 rounded-full bg-surface-2" />
                <div className="h-3 w-20 rounded-full bg-surface-2" />
              </div>
              <div className="h-3.5 w-24 rounded-full bg-surface-2" />
            </div>
            <SkeletonRow />
          </div>

          {[3, 2, 2].map((rows, s) => (
            <div key={s} className="flex flex-col gap-2">
              <div className="mx-2 h-3 w-24 rounded-full bg-surface-1" />
              <div className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1">
                {Array.from({ length: rows }, (_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function SkeletonRow() {
  return (
    <div className="flex min-h-[52px] items-center gap-3 pl-4 pr-3.5">
      <div className="h-3.5 w-32 rounded-full bg-surface-2" />
      <div className="ml-auto h-3 w-16 rounded-full bg-surface-2" />
    </div>
  );
}
