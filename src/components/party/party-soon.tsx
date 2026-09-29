import Link from "next/link";
import { Wordmark } from "@/components/kura/components";
import { PartyFan } from "./party-parts";

/**
 * "las fiestas llegan muy pronto." — /f/{token} and /c/{id} while migration
 * 0033 isn't live (contract C1; iOS draws the same words). NOT the dead-link
 * screen: a guest holding a perfectly good link must not be told it's dead.
 * Shown for every token and every id alike, so it confirms nothing.
 */
export function PartySoonScreen() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg text-text">
      <header className="flex h-14 items-center px-5 pt-[env(safe-area-inset-top)]">
        <Wordmark variant="C" size={26} />
      </header>
      <div className="flex flex-1 flex-col justify-center gap-3 px-7 pb-10">
        <PartyFan songs={[]} empty lead={90} />
        <span className="mt-[18px] font-brand text-[36px] leading-[1.02] tracking-[-0.015em] [text-wrap:balance]">
          las fiestas llegan muy pronto.
        </span>
        <span className="font-sans text-[16px] leading-[1.45] text-text-2 [text-wrap:pretty]">
          Estamos terminando de prepararlas. Guarda el link y vuelve a abrirlo en unos días.
        </span>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-[calc(30px+env(safe-area-inset-bottom))] pt-3">
        <Link
          href="/"
          className="flex h-14 items-center justify-center rounded-full bg-honey font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press"
        >
          Conocer kura
        </Link>
      </div>
    </main>
  );
}
