"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { discoverNextRecoAction } from "@/app/actions/crossmedia-actions";

/**
 * F3.5.6 — the ONLY generation trigger on /para-ti besides the first bounded
 * auto-generation. Keeps the page share-oriented (deliberate taps), not an
 * infinite browse feed, and shows the monthly meter so the cap is legible.
 */
export function DiscoverMore({
  remaining,
  cap,
}: {
  remaining: number;
  cap: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const atCap = remaining <= 0;

  const onClick = () => {
    setMsg(null);
    start(async () => {
      const { result } = await discoverNextRecoAction();
      if (result === "generated") {
        router.refresh();
      } else if (result === "cap_reached") {
        setMsg("Llegaste a tu límite del mes. Volvemos el mes que viene.");
      } else if (result === "no_more") {
        setMsg("Ya exploramos todo lo que amas. Ama algo nuevo y volvemos.");
      } else {
        setMsg("No dimos con una conexión esta vez. Intenta de nuevo.");
      }
    });
  };

  return (
    <div className="mt-8 flex flex-col items-center gap-3 text-center">
      <button
        onClick={onClick}
        disabled={pending || atCap}
        className="flex h-12 w-full max-w-[340px] items-center justify-center gap-2 rounded-full border border-line font-semibold text-text transition-colors hover:border-accent disabled:opacity-40"
      >
        {pending
          ? "Buscando una conexión…"
          : atCap
            ? "Límite del mes alcanzado"
            : "＋ Descubre otra conexión"}
      </button>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
        {remaining} de {cap} descubrimientos restantes este mes
      </p>
      {msg && (
        <p className="max-w-[340px] text-sm text-text-2">{msg}</p>
      )}
    </div>
  );
}
