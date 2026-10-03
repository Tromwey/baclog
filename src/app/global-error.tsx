"use client";

import { useEffect } from "react";
import "./globals.css";
import { GLASS_BUTTON } from "@/components/kura/components";

/**
 * The last net: an error thrown by the ROOT LAYOUT itself. This file
 * REPLACES that layout while active, so it brings its own `<html>` and
 * `<body>` and imports `globals.css` itself (Next: a global error "must
 * define its own html and body tags, global styles, fonts" — node_modules/
 * next/dist/docs/…/file-conventions/error.md). The tokens (`bg-bg`, `text-*`,
 * the glass button) therefore resolve; the `next/font` variables the layout
 * sets on `<html>` do NOT, so the type falls back to each token's system
 * stack — which is why the wordmark is not drawn here (its lockup is
 * measured against Newsreader).
 *
 * Same words as `error.tsx`. No `metadata` export (client component): the
 * React `<title>` names the tab. `retry` is the 16.3 prop.
 */
export default function GlobalError({
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
    <html lang="es">
      <body className="bg-bg text-text antialiased">
        <title>kura</title>
        <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col justify-center gap-3 bg-bg px-6 pb-11 text-text">
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
        </main>
      </body>
    </html>
  );
}
