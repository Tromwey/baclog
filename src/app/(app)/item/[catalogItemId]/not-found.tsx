import { EndCoverFlight } from "@/components/kura/cover-flight";
import { BackChip } from "./close-chip";

/**
 * The ficha that doesn't exist (`notFound()` in page.tsx: an id that isn't in
 * the catalogue). Same frame as its `error.tsx` — Volver at 64/24, the phrase
 * in Newsreader, a literal indication — minus Reintentar: asking again gives
 * the same answer. `EndCoverFlight` drops the opening flight's backdrop,
 * which would otherwise cover this screen until its 6 s watchdog.
 */
export default function ItemNotFound() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg px-6 text-text">
      <EndCoverFlight />
      <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))]">
        <BackChip />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-brand text-[32px] leading-[1.1] text-text text-balance">
          esta ficha no existe
        </h1>
        <p className="max-w-[300px] text-[15px] leading-[1.5] text-text-2 text-pretty">
          El título ya no está en el catálogo o el link está incompleto.
        </p>
      </div>
    </main>
  );
}
