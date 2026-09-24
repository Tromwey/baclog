/**
 * The collection's silhouette (Kura · flujos-v2 03): Volver and Opciones at
 * 64/24, the 240 cover, the name, three format pills, then a shelf of 132
 * covers — on `--s1`, with the one pulse the system allows (opacity, 1.6 s).
 * Shared by the full page's loading.tsx and the intercepted overlay's.
 */
export function CollectionSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando colección"
      className="relative mx-auto min-h-dvh w-full max-w-md animate-[pulse_1.6s_ease-in-out_infinite] pb-14"
    >
      <div className="absolute inset-x-6 top-[max(64px,calc(20px+env(safe-area-inset-top)))] flex justify-between">
        <span className="h-11 w-11 rounded-full bg-surface-1" />
        <span className="h-11 w-11 rounded-full bg-surface-1" />
      </div>
      <div className="flex flex-col items-center gap-3 px-6 pb-7 pt-[max(124px,calc(80px+env(safe-area-inset-top)))]">
        <span className="h-[240px] w-[160px] rounded-[var(--r-cover-l)] bg-surface-1" />
        <span className="mt-2 h-6 w-40 rounded-lg bg-surface-1" />
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-10 w-[62px] rounded-full bg-surface-1" />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-5 px-5 pt-6">
        {[88, 88, 132, 88, 132, 88].map((w, i) => (
          <div key={i} className="flex flex-col gap-[7px]">
            <span className="h-[132px] rounded-[var(--r-cover-l)] bg-surface-1" style={{ width: w }} />
            <span className="h-3 rounded-full bg-surface-1" style={{ width: w * 0.8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
