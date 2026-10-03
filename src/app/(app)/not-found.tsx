import Link from "next/link";
import { GLASS_BUTTON } from "@/components/kura/components";
import { EndCoverFlight } from "@/components/kura/cover-flight";

/**
 * The signed-in app's 404 (`notFound()` from a collection, a lens, a card
 * page, the Torre for a non-admin…). It sits UNDER the (app) layout, so the
 * dock stays — same frame as `(app)/error.tsx`, minus Reintentar: asking
 * again gives the same answer.
 *
 * It never says WHICH thing is missing nor whether it exists: a collection
 * that isn't yours and the Torre for a non-admin answer exactly like a URL
 * that was never there. `EndCoverFlight` drops a cover flight's backdrop in
 * case a ficha route resolved here instead of to the ficha.
 */
export default function AppNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 bg-bg px-6 pb-dock-clearance text-text">
      <EndCoverFlight />
      <h1 className="font-brand text-[32px] leading-[1.1] text-text text-balance">
        esto no existe o es privado
      </h1>
      <p className="max-w-[320px] text-[15px] leading-[1.5] text-text-2 text-pretty">
        Este link no lleva a nada que puedas ver. Revisa que esté completo.
      </p>
      <div className="mt-3">
        <Link href="/backlogs" className={GLASS_BUTTON}>
          Ir a tus colecciones
        </Link>
      </div>
    </main>
  );
}
