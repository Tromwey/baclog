"use client";

import { useEffect } from "react";
import { GLASS_BUTTON, Wordmark } from "@/components/kura/components";

/**
 * The public surfaces' error boundary (`/u/**`: profile, collection, public
 * ficha). Same frame as the web block next door (`not-found.tsx`) so the two
 * read as one family — but this one is OUR failure, and says so (Kura
 * §patrones · error: literal, no wink, Reintentar in glass).
 *
 * It never says whether the profile exists: a boundary that named the
 * resource would be an enumeration oracle the 404 was built to avoid.
 * `retry` re-fetches the segment (Next 16.3).
 */
export default function PublicError({
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
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark />
      </header>
      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="font-brand text-[40px] leading-none text-text text-balance">
          no pudimos cargar esto.
        </h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Algo falló de nuestro lado, no del link. Vuelve a intentarlo.
        </p>
        <div className="mt-3">
          <button type="button" onClick={() => retry()} className={GLASS_BUTTON}>
            Reintentar
          </button>
        </div>
      </div>
    </main>
  );
}
