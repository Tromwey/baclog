"use client";

import { useEffect } from "react";
import { GLASS_BUTTON, Wordmark } from "@/components/kura/components";

/**
 * The ROOT error boundary: everything that has no closer one — `(auth)`
 * (/login, /verify, /onboarding), `/c`, `/f`, `/party` and the marketing
 * pages. `(app)`, `/feed`, the ficha and `/u/**` keep their own, which say
 * more. Before this file a render or read that threw on those routes fell to
 * Next's built-in page: white, in English, with no way back.
 *
 * Same frame as `u/error.tsx` (Kura §patrones · error: literal, no wink, the
 * phrase in Newsreader, Reintentar in glass; no red, no illustration). It
 * never names the resource — some of these routes answer an identical 404
 * for private and nonexistent, and a boundary must not be the oracle.
 *
 * `retry` re-fetches and re-renders the segment — the prop the installed
 * Next (16.3) passes (node_modules/next/dist/docs/…/file-conventions/error.md).
 * It sits UNDER the root layout, so fonts and tokens are there; a failure of
 * the root layout itself is `global-error.tsx`.
 */
export default function RootError({
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
          no pudimos cargar esto
        </h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Algo falló de nuestro lado. Vuelve a intentarlo.
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
