"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_WIDTH,
  drawCard,
} from "@/modules/cards/render";
import type { CardStyle } from "@/modules/cards/types";
import {
  DoubleFeaturePreview,
  SAMPLE_DOUBLE_FEATURE,
} from "@/modules/cards/double-feature";
import { ALT_BACKLOG, DEMO_BACKLOG } from "./data";

type LabStyle = CardStyle | "double-feature";

const STYLES: { id: LabStyle; label: string }[] = [
  { id: "receipt", label: "Receipt" },
  { id: "ticket", label: "Ticket" },
  { id: "pattern", label: "Patrón" },
  { id: "double-feature", label: "Conexión" },
];

export default function PrototypePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<LabStyle>("receipt");
  const [ticketIndex, setTicketIndex] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
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
    // fonts.load() resolves with no matches if it runs before the Google
    // Fonts stylesheet is parsed — retry until check() passes (or time out
    // and draw with fallbacks rather than showing a skeleton forever).
    (async () => {
      const deadline = Date.now() + 6000;
      do {
        await Promise.all(
          CARD_FONTS.map((f) => document.fonts.load(f)),
        ).catch(() => {});
        if (CARD_FONTS.every((f) => document.fonts.check(f))) break;
        await new Promise((r) => setTimeout(r, 200));
      } while (!cancelled && Date.now() < deadline);
      if (!cancelled) setFontsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDoubleFeature = style === "double-feature";

  useEffect(() => {
    if (!fontsReady || isDoubleFeature) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawCard(
      ctx,
      style,
      backlog,
      backlog.items[ticketIndex % backlog.items.length],
    );
  }, [style, ticketIndex, fontsReady, backlog, isDoubleFeature]);

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
      // Downloads start async in Safari/Firefox — revoking now aborts them
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setToast("Tarjeta descargada (1080×1920)");
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2500);
    }, "image/png");
  }, [style]);

  const item = backlog.items[ticketIndex % backlog.items.length];

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 pb-8 pt-6 text-text">
      <header className="mb-4 text-center">
        <h1 className="font-mono text-lg font-bold tracking-[0.35em]">
          BACLOG
        </h1>
        <p className="text-xs text-text-2">card lab · prototipo M1</p>
      </header>

      <div className="mb-4 flex rounded-full bg-surface-2 p-1 text-sm">
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              style === s.id
                ? "bg-accent font-semibold text-bg"
                : "text-text-2"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative w-full max-w-[340px]">
        {isDoubleFeature ? (
          <DoubleFeaturePreview
            data={SAMPLE_DOUBLE_FEATURE}
            width={340}
            className="w-full"
          />
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              className="aspect-[9/16] w-full rounded-xl shadow-2xl shadow-black/60"
            />
            {!fontsReady && (
              <div className="absolute inset-0 animate-pulse rounded-xl bg-surface-2" />
            )}
          </>
        )}
      </div>

      {style === "ticket" && (
        <div className="mt-3 flex w-full max-w-[340px] items-center justify-between text-sm">
          <button
            aria-label="Ítem anterior"
            className="rounded-full bg-surface-2 px-4 py-2"
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
          <span className="truncate px-3 text-text-2">{item.title}</span>
          <button
            aria-label="Ítem siguiente"
            className="rounded-full bg-surface-2 px-4 py-2"
            onClick={() =>
              setTicketIndex((i) => (i + 1) % backlog.items.length)
            }
          >
            ►
          </button>
        </div>
      )}

      {!isDoubleFeature && (
        <button
          onClick={share}
          disabled={!fontsReady}
          className="mt-5 w-full max-w-[340px] rounded-full bg-accent py-3.5 font-semibold text-bg transition-opacity disabled:opacity-40"
        >
          Compartir tarjeta
        </button>
      )}

      {toast && (
        <p className="mt-3 rounded-full bg-surface-2 px-4 py-2 text-xs text-text-2">
          {toast}
        </p>
      )}
    </main>
  );
}
