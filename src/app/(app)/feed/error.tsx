"use client";

import Link from "next/link";
import { Button, ScreenHeader } from "@/components/ui";

/**
 * /feed error boundary (design 1e). The copy promises what derived state
 * guarantees: nothing was lost, because nothing is stored — retry re-derives
 * the same feed. "Reintentar" is Next's reset(); the ghost exit goes home.
 */
export default function FeedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <ScreenHeader eyebrow="Feed" title="Tu feed" />
      <div className="px-4">
        <div className="rounded-[22px] bg-surface-1 p-[22px]">
          <div className="flex items-center gap-[9px] font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
            <span className="h-[7px] w-[7px] rounded-full bg-text-3" />
            Sin conexión con el servidor
          </div>
          <p className="mt-3.5 font-serif text-[23px] italic leading-[1.24] text-text">
            No pudimos cargar tu feed.
          </p>
          <p className="mt-2 text-[14.5px] leading-[1.52] text-pretty text-text-2">
            Nada se perdió: la actividad sigue ahí. Vuelve a intentar en un
            momento.
          </p>
          <div className="mt-5 flex flex-col gap-1">
            <Button onClick={reset} className="w-full">
              Reintentar
            </Button>
            <Link
              href="/backlogs"
              className="py-[13px] text-center text-[14.5px] text-text-2 transition-colors hover:text-text"
            >
              Ir a Backlogs
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
