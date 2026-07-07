"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_WIDTH,
  drawCard,
} from "@/modules/cards/render";
import type { CardBacklog, CardStyle } from "@/modules/cards/types";
import { Button, MonoMeta } from "@/components/ui";

/**
 * F3.5.7 — the contextual card exporter. Each share context renders exactly ONE
 * style (no generic picker): backlog → receipt, item → ticket, monthly era →
 * pattern. The Double Feature (reco) card has its own surface (F3.5.6). Reuses
 * the exact M1/M2 rasterization path (drawCard → canvas.toBlob → Web Share), so
 * every export is 9:16 PNG with ZERO copyrighted artwork (ADR-008: CardItem has
 * no image field — enforced by shape).
 */
export function CardExporter({
  backlog,
  style,
  publicUrl,
  eyebrow,
  subtitle,
}: {
  backlog: CardBacklog;
  style: CardStyle;
  publicUrl: string | null;
  /** Small mono label above the preview (defaults to the backlog name). */
  eyebrow?: string;
  /** One-line context under the eyebrow. */
  subtitle?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!fontsReady) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // The ticket style renders backlog.items[0]; receipt/pattern ignore it.
    drawCard(ctx, style, backlog, backlog.items[0]);
  }, [style, fontsReady, backlog]);

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

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 pb-8 pt-6 text-text">
      <header className="mb-4 text-center">
        <MonoMeta className="text-text-2">{eyebrow ?? backlog.name}</MonoMeta>
        {subtitle && <p className="mt-1 text-xs text-text-3">{subtitle}</p>}
      </header>

      <div className="relative w-full max-w-[340px]">
        <canvas
          ref={canvasRef}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          className="aspect-[9/16] w-full rounded-[var(--r-lg)] shadow-[var(--shadow-card)]"
        />
        {!fontsReady && (
          <div className="absolute inset-0 animate-pulse rounded-[var(--r-lg)] bg-surface-2" />
        )}
      </div>

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

      {toast && (
        <p className="mt-3 rounded-full bg-surface-2 px-4 py-2 text-xs text-text-2">
          {toast}
        </p>
      )}
    </main>
  );
}
