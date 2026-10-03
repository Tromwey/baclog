import Link from "next/link";
import { Wordmark } from "@/components/kura/components";
import { PartyFan } from "./party-parts";

/**
 * "este link ya no funciona." (fiesta-app-v2 · revoked). ONE screen for a
 * revoked, unknown or malformed token, a block with the host, and the
 * feature not being live yet — the contract's no-oracle rule (§6.7), so it
 * never names the party or the host (the design's "la fiesta de eric" /
 * "@eric lo desactivó" would confirm the link once existed).
 */
export function DeadLinkScreen() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg text-text">
      <header className="flex h-14 items-center px-5 pt-[env(safe-area-inset-top)]">
        <Wordmark variant="C" size={26} />
      </header>
      <div className="flex flex-1 flex-col justify-center gap-3 px-7 pb-10">
        <PartyFan songs={[]} empty lead={90} />
        <span className="mt-[18px] font-brand text-[36px] leading-[1.02] tracking-[-0.015em] [text-wrap:balance]">
          este link ya no funciona.
        </span>
        <span className="font-sans text-[16px] leading-[1.45] text-text-2 [text-wrap:pretty]">
          Lo desactivaron o ya venció. Pide uno nuevo a quien te invitó y vuelve a abrirlo.
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
