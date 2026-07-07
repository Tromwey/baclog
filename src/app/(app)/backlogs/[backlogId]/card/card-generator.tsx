"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_WIDTH,
  drawCard,
} from "@/modules/cards/render";
import type { CardBacklog, CardStyle } from "@/modules/cards/types";
import {
  DoubleFeaturePreview,
  SAMPLE_DOUBLE_FEATURE,
} from "@/modules/cards/double-feature";
import { Button, MonoMeta } from "@/components/ui";

/**
 * "double-feature" is a preview-only lane in this group: it renders the ⭐
 * cross-media SHARE card with sample data so the style is visible + reviewable.
 * The F3.5.5 agent feeds real seed×reco data and wires its PNG export.
 */
type GeneratorStyle = CardStyle | "double-feature";

const STYLES: { id: GeneratorStyle; label: string }[] = [
  { id: "receipt", label: "Receipt" },
  { id: "ticket", label: "Ticket" },
  { id: "pattern", label: "Patrón" },
  { id: "double-feature", label: "Double Feature" },
];

/** F2.14/F2.16 — the M1 generator fed with real backlog data. */
export function CardGenerator({
  backlog,
  publicUrl,
}: {
  backlog: CardBacklog;
  publicUrl: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<GeneratorStyle>("receipt");
  const [ticketIndex, setTicketIndex] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDoubleFeature = style === "double-feature";

  useEffect(() => {
    let cancelled = false;
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
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

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
    // F3.4 — fire-and-forget share signal (keepalive survives navigation)
    fetch("/api/analytics/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "card_share" }),
      keepalive: true,
    }).catch(() => {});
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `baclog-${style}.png`, {
        type: "image/png",
      });
      try {
        if (navigator.canShare?.({ files: [file] })) {
          // F2.16: the public URL travels with the image where allowed
          await navigator.share({
            files: [file],
            ...(publicUrl ? { text: publicUrl } : {}),
          });
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
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setToast("Tarjeta descargada (1080×1920)");
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2500);
    }, "image/png");
  }, [style, publicUrl]);

  const item = backlog.items[ticketIndex % backlog.items.length];

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 pb-8 pt-6 text-text">
      <header className="mb-4 text-center">
        <MonoMeta className="text-text-2">{backlog.name}</MonoMeta>
        <p className="mt-1 text-xs text-text-3">elige estilo y comparte</p>
      </header>

      <div className="mb-4 flex flex-wrap justify-center gap-1 rounded-full bg-surface-2 p-1 text-sm">
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              style === s.id
                ? "bg-accent font-semibold text-bg"
                : "text-text-2 hover:text-text"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative w-full max-w-[340px]">
        {isDoubleFeature ? (
          <DoubleFeaturePreview
            data={{ ...SAMPLE_DOUBLE_FEATURE, username: backlog.username || "tu" }}
            width={340}
            className="w-full"
          />
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              className="aspect-[9/16] w-full rounded-[var(--r-lg)] shadow-[var(--shadow-card)]"
            />
            {!fontsReady && (
              <div className="absolute inset-0 animate-pulse rounded-[var(--r-lg)] bg-surface-2" />
            )}
          </>
        )}
      </div>

      {style === "ticket" && backlog.items.length > 1 && (
        <div className="mt-3 flex w-full max-w-[340px] items-center justify-between text-sm">
          <button
            aria-label="Ítem anterior"
            className="rounded-full bg-surface-2 px-4 py-2 text-text"
            onClick={() =>
              setTicketIndex(
                (i) => (i - 1 + backlog.items.length) % backlog.items.length,
              )
            }
          >
            ◄
          </button>
          <span className="truncate px-3 font-serif italic text-text-2">
            {item.title}
          </span>
          <button
            aria-label="Ítem siguiente"
            className="rounded-full bg-surface-2 px-4 py-2 text-text"
            onClick={() => setTicketIndex((i) => (i + 1) % backlog.items.length)}
          >
            ►
          </button>
        </div>
      )}

      {isDoubleFeature ? (
        <p className="mt-5 max-w-[340px] text-center text-xs text-text-3">
          Vista previa del estilo Double Feature. Se activa con una
          recomendación cross-media real desde el descubrimiento.
        </p>
      ) : (
        <>
          <Button
            onClick={share}
            disabled={!fontsReady}
            className="mt-5 w-full max-w-[340px]"
          >
            Compartir tarjeta
          </Button>
          {!publicUrl && (
            <p className="mt-2 max-w-[340px] text-center text-xs text-text-3">
              Reclama tu username en Ajustes para que tu link viaje con la tarjeta.
            </p>
          )}
        </>
      )}

      {toast && (
        <p className="mt-3 rounded-full bg-surface-2 px-4 py-2 text-xs text-text-2">
          {toast}
        </p>
      )}
    </main>
  );
}
