"use client";

import { ensureCardFonts } from "@/components/card-fonts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_WIDTH,
  drawCard,
  drawDoubleFeature,
} from "@/modules/cards/render";
import type { CardStyle } from "@/modules/cards/types";
import { SAMPLE_DOUBLE_FEATURE } from "@/modules/cards/double-feature";
import { ALT_BACKLOG, DEMO_BACKLOG, RECAP_SAMPLES } from "./data";
import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * The card lab (development only — `layout.tsx` 404s it in production).
 * Draws every shareable card through the SAME path the product uses
 * (`drawCard` / `drawDoubleFeature` on a 1080×1920 canvas) with the sample
 * data in `data.ts`.
 *
 * `?raw=<style>` renders just the canvas at 1:1 (1080×1920 CSS px, no
 * chrome) and flags `<html data-card-ready>` once drawn, so a headless
 * browser can screenshot each card: `&i=N` picks the title for the title
 * card and the recap sample for the recap card (`RECAP_SAMPLES`), `&alt=1`
 * swaps to the second sample collection.
 */

type LabStyle = CardStyle | "double-feature";

const STYLES: { id: LabStyle; label: string }[] = [
  { id: "title", label: "Título" },
  { id: "collection", label: "Colección" },
  { id: "recap", label: "Recap" },
  { id: "double-feature", label: "Conexión" },
];

function useCardFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureCardFonts();
      const deadline = Date.now() + 6000;
      do {
        await Promise.all(CARD_FONTS.map((f) => document.fonts.load(f))).catch(() => {});
        if (CARD_FONTS.every((f) => document.fonts.check(f))) break;
        await new Promise((r) => setTimeout(r, 200));
      } while (!cancelled && Date.now() < deadline);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

const noop = () => () => {};

export default function PrototypePage() {
  // The query only exists on the client; the server snapshot is null, so the
  // first (hydrating) render matches the server's empty one.
  const search = useSyncExternalStore(noop, () => window.location.search, () => null);
  if (search === null) return null;
  return <Lab query={new URLSearchParams(search)} />;
}

function Lab({ query }: { query: URLSearchParams }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fontsReady = useCardFonts();
  const raw = query.get("raw") as LabStyle | null;
  const [style, setStyle] = useState<LabStyle>(raw ?? "title");
  const [index, setIndex] = useState(() => Number(query.get("i") ?? 0) || 0);
  const backlog =
    style === "recap"
      ? RECAP_SAMPLES[index % RECAP_SAMPLES.length]
      : query.has("alt")
        ? ALT_BACKLOG
        : DEMO_BACKLOG;
  const item = backlog.items[index % backlog.items.length];
  const count = style === "recap" ? RECAP_SAMPLES.length : backlog.items.length;

  useEffect(() => {
    if (!fontsReady) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    if (style === "double-feature") drawDoubleFeature(ctx, SAMPLE_DOUBLE_FEATURE);
    else drawCard(ctx, style, backlog, item);
    document.documentElement.dataset.cardReady = "1";
  }, [style, fontsReady, backlog, item]);

  if (raw) {
    return (
      <canvas
        ref={canvasRef}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        style={{ position: "fixed", top: 0, left: 0, width: CARD_WIDTH, height: CARD_HEIGHT }}
      />
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 pb-8 pt-6 text-text">
      <header className="mb-4 text-center">
        <h1 className="font-brand text-[28px] leading-none">tarjetas</h1>
        <p className="mt-1 text-xs text-text-3">laboratorio · solo en desarrollo</p>
      </header>

      <div className="mb-4 flex rounded-full bg-surface-2 p-1 text-sm">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStyle(s.id)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              style === s.id ? "bg-text font-semibold text-bg" : "text-text-2"
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
          className="aspect-[9/16] w-full rounded-xl"
        />
        {!fontsReady && <div className={`absolute inset-0 rounded-xl bg-surface-2 ${SKELETON_PULSE}`} />}
      </div>

      {(style === "title" || style === "recap") && (
        <div className="mt-3 flex w-full max-w-[340px] items-center justify-between text-sm">
          <button
            type="button"
            aria-label="Anterior"
            className="h-11 rounded-full bg-surface-2 px-4"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
          >
            ‹
          </button>
          <span className="truncate px-3 text-text-2">{style === "recap" ? backlog.name : item.title}</span>
          <button
            type="button"
            aria-label="Siguiente"
            className="h-11 rounded-full bg-surface-2 px-4"
            onClick={() => setIndex((i) => (i + 1) % count)}
          >
            ›
          </button>
        </div>
      )}
    </main>
  );
}
