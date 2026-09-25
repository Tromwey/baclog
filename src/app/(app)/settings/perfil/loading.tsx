import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /settings/perfil skeleton — the 44 Cancelar chip and the Guardar pill on
 * the top row, the 104 photo with "Cambiar foto", then one `--s1` group of
 * two 56 fields (Nombre, Usuario). Needed because loading.tsx boundaries
 * nest: without one here the Ajustes skeleton would paint.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance">
      <div className={SKELETON_PULSE}>
        <div className="flex flex-col items-center gap-3.5 px-5 pb-[30px] pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="mx-1 flex items-center justify-between self-stretch">
            <div className="h-11 w-11 rounded-full bg-surface-1" />
            <div className="h-11 w-[96px] rounded-full bg-surface-1" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-[104px] w-[104px] rounded-full bg-surface-1" />
            <div className="flex min-h-11 items-center">
              <div className="h-3.5 w-24 rounded-full bg-surface-1" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-3 pt-2">
          <div className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1">
            {[0, 1].map((i) => (
              <div key={i} className="flex min-h-14 items-center gap-3.5 px-4">
                <div className="h-3.5 w-16 flex-none rounded-full bg-surface-2" />
                <div className="ml-[28px] h-4 w-36 rounded-full bg-surface-2" />
              </div>
            ))}
          </div>
          <div className="mx-3 h-3 w-4/5 rounded-full bg-surface-1" />
        </div>
      </div>
    </main>
  );
}
