"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_WIDTH,
  drawCard,
} from "@/modules/cards/render";
import type { CardStyle } from "@/modules/cards/types";
import { ALT_BACKLOG, DEMO_BACKLOG } from "./data";

const STYLES: { id: CardStyle; label: string }[] = [
  { id: "receipt", label: "Receipt" },
  { id: "ticket", label: "Ticket" },
  { id: "pattern", label: "Patrón" },
];

export default function PrototypePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<CardStyle>("receipt");
  const [ticketIndex, setTicketIndex] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // ?alt=1 renders a second hardcoded backlog — proves the pattern style is
  // deterministic per backlog (F1.4). Safe as lazy init: no SSR markup
  // depends on the chosen backlog (the canvas only draws client-side).
  const [useAlt] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("alt"),
  );
  const backlog = useAlt ? ALT_BACKLOG : DEMO_BACKLOG;

  useEffect(() => {
    let cancelled = false;
    Promise.all(CARD_FONTS.map((f) => document.fonts.load(f)))
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!fontsReady) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawCard(
      ctx,
      style,
      backlog,
      backlog.items[ticketIndex % backlog.items.length],
    );
  }, [style, ticketIndex, fontsReady, backlog]);

  const share = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `baclog-${style}.png`, {
        type: "image/png",
      });
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      setToast("Tarjeta descargada (1080×1920)");
      setTimeout(() => setToast(null), 2500);
    }, "image/png");
  }, [style]);

  const item = backlog.items[ticketIndex % backlog.items.length];

  return (
    <main className="flex min-h-dvh flex-col items-center bg-neutral-950 px-4 pb-8 pt-6 text-neutral-100">
      <header className="mb-4 text-center">
        <h1 className="font-mono text-lg font-bold tracking-[0.35em]">
          BACLOG
        </h1>
        <p className="text-xs text-neutral-400">card lab · prototipo M1</p>
      </header>

      <div className="mb-4 flex rounded-full bg-neutral-800 p-1 text-sm">
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              style === s.id
                ? "bg-neutral-100 font-semibold text-neutral-900"
                : "text-neutral-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative w-full max-w-[340px]">
        <canvas
          ref={canvasRef}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          className="aspect-[9/16] w-full rounded-xl shadow-2xl shadow-black/60"
        />
        {!fontsReady && (
          <div className="absolute inset-0 animate-pulse rounded-xl bg-neutral-800" />
        )}
      </div>

      {style === "ticket" && (
        <div className="mt-3 flex w-full max-w-[340px] items-center justify-between text-sm">
          <button
            aria-label="Ítem anterior"
            className="rounded-full bg-neutral-800 px-4 py-2"
            onClick={() =>
              setTicketIndex(
                (i) =>
                  (i - 1 + backlog.items.length) %
                  backlog.items.length,
              )
            }
          >
            ◄
          </button>
          <span className="truncate px-3 text-neutral-300">{item.title}</span>
          <button
            aria-label="Ítem siguiente"
            className="rounded-full bg-neutral-800 px-4 py-2"
            onClick={() =>
              setTicketIndex((i) => (i + 1) % backlog.items.length)
            }
          >
            ►
          </button>
        </div>
      )}

      <button
        onClick={share}
        disabled={!fontsReady}
        className="mt-5 w-full max-w-[340px] rounded-full bg-neutral-100 py-3.5 font-semibold text-neutral-900 transition-opacity disabled:opacity-40"
      >
        Compartir tarjeta
      </button>

      {toast && (
        <p className="mt-3 rounded-full bg-neutral-800 px-4 py-2 text-xs text-neutral-300">
          {toast}
        </p>
      )}
    </main>
  );
}
