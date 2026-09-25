import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /descubrir skeleton — the home (discover-home.tsx): the title, the search
 * pill, the format track (50), one "recomendado para ti" card (cover 132 tall,
 * 2:3) and three 76 trend rows (rank, 64-tall cover, two lines, the 44
 * Guardar). No bg-bg on main, like DescubrirScreen: the app aura shows through.
 */
export default function Loading() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-dock-clearance">
      <div className={SKELETON_PULSE}>
        <header className="px-5 pb-4 pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
          <div className="h-9 w-40 rounded-full bg-surface-1" />
        </header>

        <div className="px-5">
          <div className="h-12 rounded-full bg-surface-1" />
        </div>

        <div className="px-5 pt-3.5">
          <div className="h-[50px] rounded-full bg-surface-1" />
        </div>

        <div className="flex flex-col gap-[34px] pt-[26px]">
          <section className="flex flex-col gap-3.5">
            <div className="px-5">
              <div className="h-6 w-48 rounded-full bg-surface-1" />
            </div>
            <div className="px-3">
              <div className="flex w-[calc(100%-36px)] items-end gap-4 rounded-[var(--r-screen)] bg-surface-1 p-5">
                <div className="h-[132px] w-[88px] flex-none rounded-[var(--r-cover-l)] bg-surface-2" />
                <div className="flex flex-1 flex-col gap-2.5">
                  <div className="h-2.5 w-32 rounded-full bg-surface-2" />
                  <div className="h-6 w-full rounded-full bg-surface-2" />
                  <div className="h-3.5 w-24 rounded-full bg-surface-2" />
                  <div className="mt-1 h-11 w-[108px] rounded-full bg-surface-2" />
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3.5">
            <div className="px-5">
              <div className="h-6 w-32 rounded-full bg-surface-1" />
            </div>
            <div className="flex flex-col">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex min-h-[76px] items-center gap-3.5 px-5">
                  <div className="h-4 w-[22px] flex-none rounded-full bg-surface-1" />
                  <div className="flex w-12 flex-none justify-center">
                    <div className="h-16 w-[43px] rounded-[var(--r-cover-s)] bg-surface-1" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-4 w-36 rounded-full bg-surface-1" />
                    <div className="h-2.5 w-28 rounded-full bg-surface-2" />
                  </div>
                  <div className="h-11 w-11 flex-none rounded-full bg-surface-1" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
