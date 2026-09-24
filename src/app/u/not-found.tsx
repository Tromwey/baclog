import Link from "next/link";
import { GLASS_BUTTON, Wordmark } from "@/app/u/kura/components";

/**
 * Kura · the web block (§patrones · privacidad, "Sin cuenta · web": a private
 * or nonexistent collection/profile reads "No existe o es privada"). One
 * screen for both, on purpose — the 404 is identical so nothing can be
 * enumerated (src/modules/backlog/public.ts).
 */
export default function PublicNotFound() {
  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark size={30} />
      </header>
      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="font-brand text-[40px] leading-none text-text text-balance">
          no existe o es privada.
        </h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Este link no lleva a nada que puedas ver. Si te lo compartieron,
          pídele a esa persona que lo haga público.
        </p>
        <div className="mt-3">
          <Link href="/login" className={GLASS_BUTTON}>
            Entrar a kura
          </Link>
        </div>
      </div>
    </main>
  );
}
