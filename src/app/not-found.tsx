import Link from "next/link";
import { GLASS_BUTTON, Wordmark } from "@/components/kura/components";

/**
 * The ROOT 404: a `notFound()` with no closer boundary (`/c/[id]`, `/f`,
 * `/party`, marketing) and every URL that matches no route at all. Before
 * this file both fell to Next's built-in page: white, in English.
 *
 * Same frame as `u/not-found.tsx`, and the same rule: it never names the
 * resource — several of these routes answer an identical 404 for private and
 * nonexistent, and this screen must not be the oracle. The way out is `/`,
 * which sends a session to its collections and everyone else to the door.
 * `(app)` keeps its own (the dock stays), and so do `/u/**` and the ficha.
 */
export default function RootNotFound() {
  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark />
      </header>
      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="font-brand text-[40px] leading-none text-text text-balance">
          esto no existe o es privado
        </h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Este link no lleva a nada que puedas ver. Revisa que esté completo.
        </p>
        <div className="mt-3">
          <Link href="/" className={GLASS_BUTTON}>
            Entrar a kura
          </Link>
        </div>
      </div>
    </main>
  );
}
