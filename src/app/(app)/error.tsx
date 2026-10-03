"use client";

import Link from "next/link";
import { useEffect } from "react";
import { GLASS_BUTTON } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";

/**
 * The signed-in app's error boundary (Kura §patrones · error: "Sin guiño: es
 * un fallo nuestro" — the phrase in Newsreader, a literal indication, and
 * Reintentar in glass; no red, no illustration).
 *
 * It sits UNDER the (app) layout, so the dock stays: a screen that broke
 * never strands anyone — every other tab is one tap away. Segments with
 * something more specific to say keep their own (`/feed`, the ficha).
 *
 * This is the last net, not the plan: a write that fails says so where it
 * happened (`components/kura/attempt.ts`). What lands here is a render or a
 * read that threw. `retry` re-fetches and re-renders the segment (Next 16.3;
 * see node_modules/next/dist/docs/…/file-conventions/error.md).
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 bg-bg px-6 pb-dock-clearance text-text">
      <KIcon name="warning" size={22} className="text-text" />
      <h1 className="font-brand text-[32px] leading-[1.1] text-text text-balance">
        no pudimos cargar esta pantalla
      </h1>
      <p className="max-w-[320px] text-[15px] leading-[1.5] text-text-2 text-pretty">
        Lo que ya guardaste sigue ahí. Revisa tu conexión y vuelve a intentarlo.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => retry()} className={GLASS_BUTTON}>
          Reintentar
        </button>
        <Link
          href="/backlogs"
          className="flex min-h-11 items-center px-3 text-[15px] font-medium text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
        >
          Ir a tus colecciones
        </Link>
      </div>
    </main>
  );
}
