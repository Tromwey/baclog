"use client";

import { useEffect } from "react";
import { GLASS_BUTTON } from "@/components/kura/components";
import { BackChip } from "./close-chip";
import { HideDock } from "./hide-dock";

/**
 * E4 · la ficha no cargó (Kura §patrones · error: "Sin guiño: es un fallo
 * nuestro. Frase en Newsreader («no pudimos traer esta ficha.») y una
 * indicación literal. Reintentar en vidrio."). No tint — there's no cover to
 * take colour from. Volver stays where it always is, at 64/24, so the way
 * out doesn't move. `unstable_retry` (Next 16.2) re-fetches the segment.
 */
export default function ItemError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg px-6 text-text">
      <HideDock />
      <div className="absolute inset-x-6 top-[calc(64px+env(safe-area-inset-top))]">
        <BackChip />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-brand text-[32px] leading-[1.1] text-text text-balance">
          no pudimos traer esta ficha.
        </h1>
        <p className="max-w-[300px] text-[15px] leading-[1.5] text-text-2 text-pretty">
          Revisa tu conexión y vuelve a intentarlo.
        </p>
        <button type="button" onClick={() => unstable_retry()} className={`${GLASS_BUTTON} mt-2`}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
