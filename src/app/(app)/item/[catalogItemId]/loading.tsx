import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * Ficha skeleton (Kura §patrones · cargando: "Esqueleto con la forma real.
 * Pulso de opacidad de 1.6 s entre --s1 y --s2, sin shimmer ni spinner. La
 * pantalla nunca cambia de layout"). The real header's silhouette — Volver
 * and Opciones at 64/24, the 200×300 cover centred, title, byline, the mono
 * line, the three 44 px actions — then a section title and a few lines. No
 * tint: without the cover there is no colour yet. Drawn for film/series (the
 * common case); an album's square lands with the real page.
 */
export default function Loading() {
  return (
    <main aria-busy="true" className="relative mx-auto min-h-dvh w-full max-w-md bg-bg pb-14">
      <div className={SKELETON_PULSE}>
        <div className="relative flex flex-col items-center gap-3 px-6 pb-[30px] pt-[calc(124px+env(safe-area-inset-top))]">
          <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))] flex justify-between">
            <div className="h-11 w-11 rounded-full bg-surface-1" />
            <div className="h-11 w-11 rounded-full bg-surface-1" />
          </div>
          <div className="h-[300px] w-[200px] rounded-[var(--r-cover-l)] bg-surface-1" />
          <div className="mt-2.5 h-[30px] w-3/5 rounded-full bg-surface-2" />
          <div className="h-3.5 w-2/5 rounded-full bg-surface-1" />
          <div className="h-2.5 w-1/4 rounded-full bg-surface-1" />
          <div className="mt-2 flex gap-2">
            <div className="h-11 w-[116px] rounded-full bg-surface-1" />
            <div className="h-11 w-[104px] rounded-full bg-surface-1" />
            <div className="h-11 w-11 rounded-full bg-surface-1" />
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 pt-2.5">
          <div className="h-6 w-32 rounded-full bg-surface-2" />
          <div className="flex items-center gap-3.5 py-2">
            <div className="h-10 w-10 rounded-[10px] bg-surface-1" />
            <div className="h-4 w-28 rounded-full bg-surface-1" />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="h-3.5 w-full rounded-full bg-surface-1" />
            <div className="h-3.5 w-11/12 rounded-full bg-surface-1" />
            <div className="h-3.5 w-3/5 rounded-full bg-surface-1" />
          </div>
        </div>
      </div>
    </main>
  );
}
