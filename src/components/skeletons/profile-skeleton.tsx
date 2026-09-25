import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * A profile's silhouette (Kura §patrones · cargando: the real shape, the one
 * opacity pulse, the layout never moves when the page lands). Shared by the
 * two profiles, which are one header drawn two ways:
 *
 *  - `own` (/perfil, perfil-screen.tsx): the header starts at 16 + safe,
 *    Compartir and Ajustes right-aligned, three stat pills; the dock is
 *    there, so the page clears it.
 *  - `public` (/u/[username]): the header starts at 64 + safe with Volver on
 *    the left, four pills (reseñas too), then Seguir + Compartir. Drawn for
 *    a signed-in visitor (Volver, the 44 honey Seguir) — the anonymous
 *    lockup and its 48 pill differ by a few px and land with the page.
 *
 * Body for both: two cover strips (a section title, covers at 150 tall) and
 * one compact collection card (spine + 104 covers). No tint: the header's
 * colour comes from the covers, which aren't here yet.
 */
export function ProfileSkeleton({ variant }: { variant: "own" | "public" }) {
  const own = variant === "own";
  return (
    <div
      aria-busy="true"
      className={`relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip bg-bg ${own ? "pb-dock-clearance" : ""}`}
    >
      <div className={SKELETON_PULSE}>
        <div
          className={`flex flex-col gap-[18px] px-6 pb-[34px] ${
            own ? "pt-[calc(16px+env(safe-area-inset-top))]" : "pt-[calc(64px+env(safe-area-inset-top))]"
          }`}
        >
          {own ? (
            <div className="flex items-center justify-end gap-2">
              <div className="h-11 w-11 rounded-full bg-surface-1" />
              <div className="h-11 w-11 rounded-full bg-surface-1" />
            </div>
          ) : (
            <div className="flex items-center">
              <div className="h-11 w-11 rounded-full bg-surface-1" />
            </div>
          )}

          <div className="h-32 w-32 rounded-full bg-surface-1" />

          <div className="flex flex-col gap-1.5">
            {/* Name: Newsreader 40, leading none. */}
            <div className="h-10 w-3/5 rounded-full bg-surface-2" />
            {/* @handle: mono 12 × 1.5. */}
            <div className="flex h-[18px] items-center">
              <div className="h-3 w-24 rounded-full bg-surface-1" />
            </div>
            {/* seguidores · siguiendo: 14 × 1.5. */}
            <div className="flex h-[21px] items-center gap-4">
              <div className="h-3.5 w-24 rounded-full bg-surface-1" />
              <div className="h-3.5 w-20 rounded-full bg-surface-1" />
            </div>
          </div>

          <div className="flex flex-wrap gap-[7px]">
            {(own ? [52, 52, 52] : [52, 52, 52, 52]).map((w, i) => (
              <div key={i} className="h-[26px] rounded-full bg-surface-1" style={{ width: w }} />
            ))}
          </div>

          {!own && (
            <div className="flex items-center gap-2">
              <div className="h-11 w-24 rounded-full bg-surface-1" />
              <div className="h-11 w-11 rounded-full bg-surface-1" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[30px] pt-2">
          {[0, 1].map((s) => (
            <div key={s} className="flex flex-col gap-3.5">
              <div className="px-5">
                <div className="h-[26px] w-36 rounded-full bg-surface-2" />
              </div>
              <div className="flex items-end gap-3 overflow-hidden px-5 pb-6">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-[150px] w-[100px] flex-none rounded-[var(--r-cover-l)] bg-surface-1" />
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-3.5">
            <div className="px-5">
              <div className="h-[26px] w-40 rounded-full bg-surface-2" />
            </div>
            <div className="px-3">
              <div className="flex overflow-hidden rounded-[var(--r-screen)] bg-surface-1">
                {/* The spine. */}
                <div className="w-10 flex-none bg-black/[0.24]" />
                <div className="flex flex-1 items-end gap-2.5 overflow-hidden px-3.5 py-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-[104px] w-[69px] flex-none rounded-[var(--r-cover-l)] bg-surface-2" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
