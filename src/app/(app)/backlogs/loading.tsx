import { SKELETON_PULSE } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";

/**
 * 6c Cargando (Colecciones formalizado): the real header ("tus colecciones"
 * + the two 44 chips, Compartir and Opciones, so nothing jumps when the page
 * lands), then the carousel's
 * shape — the ghost fan at 225 in the same 290 band, the name's bar, the
 * meta's bar, and a first row of three columns (póster · disco · póster) —
 * on `--s1`, with the system's one allowed pulse (opacity, 1.6 s).
 * Shown only on the FIRST (uncached) visit. Every child segment that isn't
 * this list — a collection, a lens, no-puedo-esperar, the share card —
 * defines its own loading.tsx; a new one should too, or it inherits this.
 */
export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <header className="flex items-end justify-between px-5 pb-[18px] pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
        <h1 className="font-brand text-[36px] font-normal leading-[1.02]">tus colecciones</h1>
        <span className="flex gap-2">
          <span className="h-11 w-11 rounded-full bg-[var(--glass-bg)]" />
          <span className="h-11 w-11 rounded-full bg-[var(--glass-bg)]" />
        </span>
      </header>
      <div aria-busy="true" aria-label="Cargando colecciones" className={`flex flex-col items-center ${SKELETON_PULSE}`}>
        <div className="flex h-[290px] items-start pt-3.5">
          <Fan covers={[]} lead={225} ghost />
        </div>
        <span className="mt-1 flex h-11 items-center">
          <span className="h-[26px] w-[200px] rounded-lg bg-surface-1" />
        </span>
        <span className="mt-3 h-3.5 w-[150px] rounded-md bg-surface-1" />
        <div className="mt-[34px] grid w-full grid-cols-3 gap-3 px-5">
          <span className="aspect-[2/3] rounded-[var(--r-cover-l)] bg-surface-1" />
          <span className="aspect-square rounded-[var(--r-cover-l)] bg-surface-1" />
          <span className="aspect-[2/3] rounded-[var(--r-cover-l)] bg-surface-1" />
        </div>
      </div>
    </main>
  );
}
