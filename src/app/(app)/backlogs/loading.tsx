/**
 * 15b Cargando (flujos-v2 02): the real header ("tus colecciones" + the 44
 * chip, so nothing jumps when the page lands) and four card silhouettes —
 * the spine's bar and covers of both formats, the first at 150, the rest at
 * 120 — on `--s1`, with the system's one allowed pulse (opacity, 1.6 s).
 * Shown only on the FIRST (uncached) visit; the detail and lens segments
 * define their own closer loading.tsx.
 */
const CARDS: { h: number; spine: number; w: number[] }[] = [
  { h: 150, spine: 96, w: [100, 150, 100] },
  { h: 120, spine: 64, w: [80, 120, 80, 120] },
  { h: 120, spine: 80, w: [120, 80, 120, 80] },
  { h: 120, spine: 72, w: [80, 80, 120, 80] },
];

export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <header className="flex items-end justify-between px-5 pb-[18px] pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
        <h1 className="font-brand text-[36px] font-normal leading-[1.02]">tus colecciones</h1>
        <span className="h-11 w-11 rounded-full bg-[var(--glass-bg)]" />
      </header>
      <div
        aria-busy="true"
        aria-label="Cargando colecciones"
        className="flex animate-[pulse_1.6s_ease-in-out_infinite] flex-col gap-3 px-3"
      >
        {CARDS.map((c, i) => (
          <div key={i} className="flex overflow-hidden rounded-[var(--r-screen)] bg-surface-1">
            <span className="flex w-10 flex-none items-center justify-center bg-black/[0.24]">
              <span className="w-2 rounded-full bg-surface-2" style={{ height: c.spine }} />
            </span>
            <div
              className="flex gap-2.5 overflow-hidden px-3.5"
              style={{ paddingBlock: c.h >= 150 ? 20 : 16 }}
            >
              {c.w.map((w, j) => (
                <span
                  key={j}
                  className="flex-none rounded-[var(--r-cover-l)] bg-surface-2"
                  style={{ height: c.h, width: w }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
