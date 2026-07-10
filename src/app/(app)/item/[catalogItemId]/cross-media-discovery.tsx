"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptRecoAction,
  acceptRecoToBacklogAction,
} from "@/app/actions/crossmedia-actions";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import {
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_WIDTH,
  drawDoubleFeature,
} from "@/modules/cards/render";
import type { DoubleFeatureData } from "@/modules/cards/types";
import { extractPalette } from "@/modules/cards/palette";
import { MEDIA_TYPE_LABEL } from "@/modules/catalog/types";

/**
 * F3.5.5 in-app discovery (FRAME B). Surfaces one cross-media reco on a loved
 * item: real covers (in-app artwork is allowed), the narrative as hero, and
 * accept (＋) / dismiss (×) / share (↗). The SHARE export rasterizes the
 * Double Feature card with ZERO covers — palette + grain only (ADR-008).
 */

export interface DiscoveryWork {
  catalogItemId: string;
  title: string;
  type: "film" | "series" | "album";
  byline: string | null;
  year: number | null;
  /** Real cover — in-app display ONLY, never exported (ADR-008). */
  posterUrl: string | null;
}

export interface DiscoveryBacklog {
  id: string;
  name: string;
  itemCount: number;
  /** Marks the seed's home backlog for the "donde vive X" hint. */
  isSeedHome?: boolean;
}

export interface CrossMediaDiscoveryProps {
  seed: DiscoveryWork;
  reco: DiscoveryWork;
  narrative: DoubleFeatureData["narrative"];
  username: string;
  /** Default target = seed's backlog (may be null → "Descubrimientos" on accept). */
  defaultBacklog: { id: string; name: string } | null;
  /** Recent backlogs for the "Cambiar" picker (seed's home flagged). */
  backlogs: DiscoveryBacklog[];
  /**
   * "panel" (default) = a self-contained bordered card, for embedding under
   * other content. "page" = full-bleed, chrome-free — the content IS the
   * screen, for the /para-ti destination (F3.5.6, avoids screen-in-a-screen).
   */
  variant?: "panel" | "page";
  /**
   * When provided (the /para-ti queue), the × advances to the next pairing
   * instead of showing a local "descartado" state — the discovery IS the
   * screen, so dismissing moves the whole screen forward.
   */
  onDismiss?: () => void;
}

type Status = "pending" | "accepted" | "dismissed";

export function CrossMediaDiscovery(props: CrossMediaDiscoveryProps) {
  const { seed, reco, narrative, username, defaultBacklog } = props;
  const isPage = props.variant === "page";
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState<Status>("pending");
  const [busy, setBusy] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(defaultBacklog?.name ?? null);
  const [toast, setToast] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [backlogs, setBacklogs] = useState(props.backlogs);
  const [sel, setSel] = useState<string | null>(defaultBacklog?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shareTimer.current) clearTimeout(shareTimer.current);
    };
  }, []);

  const accept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const paletteHex = reco.posterUrl ? await extractPalette(reco.posterUrl) : [];
      const res = await acceptRecoAction({
        seedCatalogItemId: seed.catalogItemId,
        targetCatalogItemId: reco.catalogItemId,
        paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
      });
      if ("error" in res) return;
      setStatus("accepted");
      setAddedTo(res.backlogName);
      setSel(res.backlogId);
      setToast(true);
      router.refresh();
    } catch {
      // Action threw (e.g. expired session, FK violation) — swallow so the
      // buttons re-enable via finally instead of getting stuck disabled.
    } finally {
      setBusy(false);
    }
  }, [busy, reco.catalogItemId, reco.posterUrl, seed.catalogItemId, router]);

  const dismiss = useCallback(() => {
    setStatus("dismissed");
    setToast(false);
  }, []);

  const reset = useCallback(() => setStatus("pending"), []);

  const share = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Extract palettes from BOTH covers on-device (ADR-008: colors only cross
    // into the export — never the pixels).
    const [seedPalette, recoPalette] = await Promise.all([
      seed.posterUrl ? extractPalette(seed.posterUrl) : Promise.resolve([]),
      reco.posterUrl ? extractPalette(reco.posterUrl) : Promise.resolve([]),
    ]);
    const palette = [...seedPalette, ...recoPalette].filter(Boolean);

    // Ensure the brand fonts are loaded before rasterizing.
    await Promise.all(CARD_FONTS.map((f) => document.fonts.load(f))).catch(() => {});

    const data: DoubleFeatureData = {
      seed: {
        title: seed.title,
        type: seed.type,
        creator: seed.byline ?? undefined,
        year: seed.year ?? undefined,
      },
      reco: {
        title: reco.title,
        type: reco.type,
        creator: reco.byline ?? undefined,
        year: reco.year ?? undefined,
      },
      palette: palette.length >= 3 ? palette : ["#C7462F", "#E8B23A", "#3A5A9B", "#7A2F5A", "#241C1A"],
      narrative,
      username,
    };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawDoubleFeature(ctx, data);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "baclog-double-feature.png", { type: "image/png" });
      const shareUrl = username ? `https://baclog.app/${username}` : undefined;
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], ...(shareUrl ? { text: shareUrl } : {}) });
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
      setShareToast(true);
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareToast(false), 4200);
    }, "image/png");
  }, [narrative, reco, seed, username]);

  // "Cambiar" → open picker preselected to the current target.
  const openSheet = useCallback(() => {
    setSel((s) => s ?? defaultBacklog?.id ?? null);
    setSheetOpen(true);
  }, [defaultBacklog?.id]);

  const applySheet = useCallback(async () => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      const paletteHex = reco.posterUrl ? await extractPalette(reco.posterUrl) : [];
      const res = await acceptRecoToBacklogAction({
        backlogId: sel,
        seedCatalogItemId: seed.catalogItemId,
        targetCatalogItemId: reco.catalogItemId,
        paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
      });
      if ("error" in res) return;
      setStatus("accepted");
      setAddedTo(res.backlogName);
      setToast(true);
      setSheetOpen(false);
      router.refresh();
    } catch {
      // Action threw — re-enable via finally rather than stay stuck disabled.
    } finally {
      setBusy(false);
    }
  }, [sel, busy, reco.catalogItemId, reco.posterUrl, seed.catalogItemId, router]);

  const createBacklog = useCallback(async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await createBacklogAction({ name });
      if ("error" in res) return;
      const b: DiscoveryBacklog = { id: res.id, name, itemCount: 0 };
      setBacklogs((prev) => [b, ...prev]);
      setSel(res.id);
      setCreating(false);
      setNewName("");
    } catch {
      // Action threw — re-enable via finally rather than stay stuck disabled.
    } finally {
      setBusy(false);
    }
  }, [newName, busy]);

  const accepted = status === "accepted";
  const dismissed = status === "dismissed";

  return (
    <section
      className={
        isPage
          ? "relative"
          : "relative mt-8 overflow-hidden rounded-[var(--r-lg)] bg-surface-1 p-5"
      }
    >
      {!isPage && <div aria-hidden className="bl-grain !opacity-[0.05]" />}

      {!isPage && (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-2">
          Descubrimiento
        </p>
      )}

      {/* Hook */}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
        {narrative.hookEyebrow}
      </p>
      <p className="mt-2 font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-text">
        {narrative.hookTitle}
      </p>

      {/* Discs with REAL covers (in-app artwork allowed) */}
      <div
        className={`relative flex items-center justify-center ${isPage ? "mt-10" : "mt-6"}`}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute font-display font-extrabold leading-none text-accent/[0.08] ${
            isPage ? "text-[200px]" : "text-[130px]"
          }`}
        >
          ×
        </span>
        <Cover work={seed} rotate="-rotate-6" z="z-20" big={isPage} />
        <Cover
          work={reco}
          rotate="rotate-6"
          z="z-10"
          faded={dismissed}
          big={isPage}
          className={isPage ? "-ml-6" : "-ml-4"}
        />
      </div>

      {/* Per-work metadata */}
      <div className="mt-4 flex items-start justify-between gap-4 font-mono text-[10px] tracking-[0.06em] text-text-2">
        <div className="flex-1">
          <p className="tracking-[0.14em] text-text-3">A · {MEDIA_TYPE_LABEL[seed.type]}</p>
          <p className="mt-1 font-serif text-[15px] not-italic italic tracking-normal text-text">
            {seed.title}
          </p>
          <p className="mt-0.5">{[seed.byline, seed.year].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex-1 text-right">
          <p className="tracking-[0.14em] text-accent">B · {MEDIA_TYPE_LABEL[reco.type]}</p>
          <p className="mt-1 font-serif text-[15px] italic tracking-normal text-text">
            {reco.title}
          </p>
          <p className="mt-0.5">{[reco.byline, reco.year].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      {/* Hero narrative */}
      <div className="mt-5 border-t border-line pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
          {narrative.resultEyebrow}
        </p>
        <p className="mt-2 font-display text-[20px] font-bold leading-snug tracking-[-0.01em] text-text">
          <span className="font-serif font-normal italic">{reco.title}</span>
          {reco.byline ? (
            <>
              , de <span className="text-accent">{reco.byline}</span>.
            </>
          ) : (
            "."
          )}{" "}
          {narrative.closer && (
            <span className="font-serif font-normal italic text-text-2">{narrative.closer}</span>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2.5">
        <button
          aria-label="Descartar"
          onClick={props.onDismiss ?? dismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg text-text-2 transition-colors hover:bg-surface-3 disabled:opacity-40"
          disabled={busy}
        >
          ×
        </button>
        <button
          onClick={accept}
          disabled={busy || accepted}
          className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full font-semibold transition-all disabled:opacity-70 ${
            accepted ? "bg-accent/90 text-bg" : "bg-accent text-bg active:scale-[0.97]"
          }`}
        >
          {accepted ? "✓ Añadido" : "＋ Añadir"}
        </button>
        <button
          aria-label="Compartir"
          onClick={share}
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 font-semibold text-text transition-colors hover:bg-surface-3 disabled:opacity-40"
          disabled={busy}
        >
          ↗ Compartir
        </button>
      </div>

      {dismissed && (
        <p className="mt-3.5 text-center font-mono text-[11px] tracking-[0.08em] text-text-3">
          DESCARTADO ·{" "}
          <button onClick={reset} className="text-accent">
            DESHACER
          </button>
        </p>
      )}

      <p className="mt-4 text-center font-mono text-[9px] leading-relaxed tracking-[0.1em] text-text-3">
        AL COMPARTIR SE EXPORTA SIN PORTADAS
        <br />— SOLO PALETA EXTRAÍDA + GRANO —
      </p>

      {/* Accept toast */}
      {toast && addedTo && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-bg">
              ✓
            </span>
            Añadido a <b className="font-semibold">{addedTo}</b>
          </span>
          <button
            onClick={openSheet}
            className="font-mono text-[11px] tracking-[0.08em] text-accent"
          >
            CAMBIAR
          </button>
        </div>
      )}

      {/* Share toast (download fallback) */}
      {shareToast && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs text-accent">
              ↗
            </span>
            Tarjeta lista — <b className="font-semibold text-accent">sin portadas</b>
          </span>
          <button
            onClick={() => setShareToast(false)}
            className="font-mono text-[11px] tracking-[0.08em] text-text-2"
          >
            OK
          </button>
        </div>
      )}

      {/* Off-screen canvas for the PNG export (1080×1920) */}
      <canvas
        ref={canvasRef}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        className="pointer-events-none absolute -left-[9999px] h-px w-px"
        aria-hidden
      />

      {/* Bottom-sheet "Añadir a backlog" (Nuevo / Recientes, MIXTO) */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
          onClick={() => setSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-surface-1 p-5 pb-8"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold tracking-[-0.01em]">
                Añadir a backlog
              </h2>
              <span className="font-mono text-[10px] tracking-[0.1em] text-text-3">
                MIXTO · CUALQUIER MEDIO
              </span>
            </div>

            {/* Nuevo backlog */}
            {creating ? (
              <div className="mt-4 flex gap-2">
                <input
                  value={newName}
                  maxLength={60}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre del backlog"
                  className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 py-3 outline-none focus:bg-surface-3"
                />
                <button
                  onClick={createBacklog}
                  disabled={busy || !newName.trim()}
                  className="shrink-0 rounded-xl bg-accent px-4 font-semibold text-bg disabled:opacity-40"
                >
                  Crear
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="mt-4 flex w-full items-center gap-2 rounded-xl bg-accent-soft px-3.5 py-3.5 font-semibold text-accent"
              >
                <span className="text-xl leading-none">＋</span> Nuevo backlog
              </button>
            )}

            {/* Recientes */}
            <p className="mb-2 mt-5 font-mono text-[10px] tracking-[0.12em] text-text-3">
              RECIENTES
            </p>
            <div className="space-y-2">
              {backlogs.length === 0 && (
                <p className="text-sm text-text-3">
                  Aún no tienes backlogs — crea uno arriba.
                </p>
              )}
              {backlogs.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSel(b.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors ${
                    sel === b.id ? "bg-accent-soft" : "bg-surface-2 hover:bg-surface-3"
                  }`}
                >
                  <span>
                    <span className="block font-semibold text-text">{b.name}</span>
                    <span className="block font-mono text-[9.5px] uppercase tracking-[0.06em] text-text-3">
                      {b.isSeedHome ? "donde vive el seed · " : ""}
                      {b.itemCount} items
                    </span>
                  </span>
                  <span
                    className={`h-3 w-3 rounded-full ${
                      sel === b.id ? "bg-accent" : "bg-surface-3"
                    }`}
                  />
                </button>
              ))}
            </div>

            <button
              onClick={applySheet}
              disabled={busy || !sel}
              className="mt-5 w-full rounded-full bg-accent py-3.5 font-semibold text-bg shadow-[0_0_26px_var(--accent-soft)] disabled:opacity-40"
            >
              Listo — añadir
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** In-app cover disc — real artwork (ADR-008: in-app only, never exported). */
function Cover({
  work,
  rotate,
  z,
  faded,
  big,
  className,
}: {
  work: DiscoveryWork;
  rotate: string;
  z: string;
  faded?: boolean;
  /** Larger disc for the full-screen /para-ti layout. */
  big?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative ${z} ${rotate} ${className ?? ""} ${
        big ? "h-44 w-44" : "h-32 w-32"
      } shrink-0 rounded-full transition-opacity ${faded ? "opacity-30" : ""}`}
      style={{ boxShadow: "0 14px 30px rgba(0,0,0,0.5)" }}
    >
      <div className="absolute inset-2 overflow-hidden rounded-full bg-surface-2">
        {work.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
          <img
            src={work.posterUrl}
            alt={`Portada de ${work.title}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-text-3">
            {work.type === "album" ? "♫" : "▶"}
          </div>
        )}
      </div>
      {/* spindle hole */}
      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg ring-2 ring-white/10" />
    </div>
  );
}
