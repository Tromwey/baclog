import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /settings/musica skeleton — Volver 44, the "abrir música en" title, the
 * four 52 radio rows in one `--s1` group and the note under it. Needed
 * because loading.tsx boundaries nest: without one here the Ajustes skeleton
 * would paint.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance">
      <div className={SKELETON_PULSE}>
        <div className="px-6 pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="h-11 w-11 rounded-full bg-surface-1" />
        </div>
        <div className="flex flex-col gap-7 px-4 pt-4">
          <div className="mx-2 h-9 w-60 rounded-full bg-surface-1" />
          <div className="flex flex-col gap-2">
            <div className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex min-h-[52px] items-center px-4">
                  <div className="h-3.5 w-28 rounded-full bg-surface-2" />
                </div>
              ))}
            </div>
            <div className="mx-2 h-3 w-4/5 rounded-full bg-surface-1" />
          </div>
        </div>
      </div>
    </main>
  );
}
