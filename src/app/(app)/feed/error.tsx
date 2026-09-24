"use client";

import Link from "next/link";
import { GLASS_BUTTON } from "@/components/kura/components";

/**
 * /feed error boundary (§patrones · error): says what happened and what to
 * do, no wink, the triangle beside it and "Reintentar" in glass. The promise
 * is real: nothing was lost, because the feed is derived — retry re-derives
 * the same one. "Reintentar" is Next's reset(); the quiet exit goes to your
 * collections.
 */
export default function FeedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <header className="flex h-[calc(76px+env(safe-area-inset-top))] items-end px-5 pb-[14px]">
        <h1 className="font-brand text-[36px] leading-none text-text">tu feed</h1>
      </header>
      <div className="flex flex-col gap-3 px-5 pt-10">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path d="M10.3 3.9a2 2 0 013.4 0l8 13.8A2 2 0 0120 20.7H4a2 2 0 01-1.7-3L10.3 3.9z" fill="var(--text)" />
          <path d="M12 9v4.5M12 17h.01" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <h2 className="font-brand text-[30px] leading-[1.1] text-text text-balance">
          no pudimos cargar tu feed.
        </h2>
        <p className="text-[15px] leading-[1.5] text-pretty text-text-2">
          Nada se perdió: la actividad de tu gente sigue ahí. Revisa tu conexión y vuelve a intentar.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={reset} className={GLASS_BUTTON}>
            Reintentar
          </button>
          <Link
            href="/backlogs"
            className="flex min-h-11 items-center px-3 text-[15px] font-medium text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
          >
            Ir a tus colecciones
          </Link>
        </div>
      </div>
    </main>
  );
}
