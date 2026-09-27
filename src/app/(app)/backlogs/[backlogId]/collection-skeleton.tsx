import { SKELETON_PULSE } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { HideDock } from "../hide-dock";

/**
 * The collection's silhouette (Colecciones formalizado · 2a): Volver and the
 * two chips at 64/24, the ghost fan at 225, the mono label, the name, the
 * line and the credits, then "el orden" and a first run of three columns
 * (the real Masonry's tiles: cover · Newsreader 14 title · mono 10 year) —
 * on `--s1`, with the one pulse the system allows (opacity, 1.6 s).
 *
 * Mounts HideDock like the real view does (backlog-zoom-view.tsx), so the
 * dock doesn't sit over the skeleton and then fade when the page lands.
 * `auto` is the automatic collection (the "auto" pill instead of the label,
 * no chips for Compartir). Shared by the full page's loading.tsx, the
 * intercepted overlay's and lentes/no-puedo-esperar's.
 */
export function CollectionSkeleton({ auto = false }: { auto?: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando colección"
      className={`relative mx-auto min-h-dvh w-full max-w-md pb-14 ${SKELETON_PULSE}`}
    >
      <HideDock />
      <div className="absolute inset-x-6 top-[max(64px,calc(20px+env(safe-area-inset-top)))] flex justify-between">
        <span className="h-11 w-11 rounded-full bg-glass-art" />
        <span className="flex gap-2">
          {!auto && <span className="h-11 w-11 rounded-full bg-glass-art" />}
          <span className="h-11 w-11 rounded-full bg-glass-art" />
        </span>
      </div>
      <div className="flex flex-col items-center gap-2.5 px-6 pb-[26px] pt-[max(126px,calc(82px+env(safe-area-inset-top)))]">
        <Fan covers={[]} lead={225} ghost />
        <span className={`mt-1 rounded-full bg-surface-1 ${auto ? "h-[26px] w-16" : "h-2.5 w-24"}`} />
        <span className="h-9 w-48 rounded-lg bg-surface-1" />
        <span className="h-4 w-40 rounded-md bg-surface-1" />
        <span className="flex items-center gap-2">
          <span className="h-[26px] w-[26px] rounded-full bg-surface-1" />
          <span className="h-3.5 w-28 rounded-md bg-surface-1" />
        </span>
      </div>
      <div className="px-5 pb-3.5">
        <span className="block h-[22px] w-24 rounded-md bg-surface-1" />
      </div>
      <div className="grid grid-cols-3 gap-x-3 px-5">
        {["aspect-[2/3]", "aspect-square", "aspect-[2/3]"].map((a, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className={`${a} rounded-[var(--r-cover-l)] bg-surface-1`} />
            {/* Title line: Newsreader 14 × 1.15 ≈ 16 px. */}
            <span className="flex h-4 items-center">
              <span className="h-3 w-4/5 rounded-full bg-surface-1" />
            </span>
            {/* Year line: mono 10 × 1.5 = 15 px. */}
            <span className="flex h-[15px] items-center">
              <span className="h-2 w-2/5 rounded-full bg-surface-1" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
