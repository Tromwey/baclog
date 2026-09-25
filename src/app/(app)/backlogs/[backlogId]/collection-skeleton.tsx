import { SKELETON_PULSE } from "@/components/kura/components";
import { HideDock } from "../hide-dock";

/**
 * The collection's silhouette (Kura · flujos-v2 03): Volver and Opciones at
 * 64/24, the 240 cover, the name, three format pills, then a shelf of 132
 * tiles (cover · Newsreader 14 title · mono 10 year line, the real Tile's
 * rows) — on `--s1`, with the one pulse the system allows (opacity, 1.6 s).
 * It always draws the SHELF body: whether the real one groups by format
 * (GroupedBody, 150) depends on the items, which aren't here yet.
 *
 * Mounts HideDock like the real view does (backlog-zoom-view.tsx), so the
 * dock doesn't sit over the skeleton and then fade when the page lands.
 * `lead="square"` is the automatic collection's 240×240 AutoCover.
 * Shared by the full page's loading.tsx, the intercepted overlay's and
 * lentes/no-puedo-esperar's.
 */
export function CollectionSkeleton({ lead = "portrait" }: { lead?: "portrait" | "square" }) {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando colección"
      className={`relative mx-auto min-h-dvh w-full max-w-md pb-14 ${SKELETON_PULSE}`}
    >
      <HideDock />
      <div className="absolute inset-x-6 top-[max(64px,calc(20px+env(safe-area-inset-top)))] flex justify-between">
        <span className="h-11 w-11 rounded-full bg-[var(--glass-bg)]" />
        <span className="h-11 w-11 rounded-full bg-[var(--glass-bg)]" />
      </div>
      <div className="flex flex-col items-center gap-3 px-6 pb-7 pt-[max(124px,calc(80px+env(safe-area-inset-top)))]">
        <span
          className={`h-[240px] rounded-[var(--r-cover-l)] bg-surface-1 ${
            lead === "square" ? "w-[240px]" : "w-[160px]"
          }`}
        />
        <span className="mt-2 h-6 w-40 rounded-lg bg-surface-1" />
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-10 w-[62px] rounded-full bg-[var(--glass-bg)]" />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-5 px-5 pt-6">
        {[88, 88, 132, 88, 132, 88].map((w, i) => (
          <div key={i} className="flex flex-col gap-[7px]" style={{ width: w }}>
            <span className="h-[132px] rounded-[var(--r-cover-l)] bg-surface-1" />
            {/* Title line: Newsreader 14 × 1.15 ≈ 16 px. */}
            <span className="flex h-4 items-center">
              <span className="h-3 rounded-full bg-surface-1" style={{ width: w * 0.8 }} />
            </span>
            {/* Year / format line: mono 10 × 1.5 = 15 px. */}
            <span className="flex h-[15px] items-center">
              <span className="h-2 rounded-full bg-surface-1" style={{ width: w * 0.4 }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
