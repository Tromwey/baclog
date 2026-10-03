"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SITE_URL } from "@/lib/site";
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
import { COLLECTION_NAME_MAX } from "@/modules/backlog/name-limit";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import {
  ChoiceRow,
  MenuRow,
  SHEET_FIELD,
  SHEET_SOLID,
  SheetTitle,
} from "@/components/kura/sheet-parts";
import { GLASS_BUTTON } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";
import { attempt, WRITE_FAILED } from "@/components/kura/attempt";
import { ensureCardFonts } from "@/components/card-fonts";

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
  /**
   * F3.5.8 honesty label: "factual" = the pairing narrates a VERIFIED link
   * (soundtrack/score edge from the graph); "thematic" = the deep-cut path
   * (an honest vibe, not a checked fact). Omitted → no label (legacy embeds).
   */
  linkKind?: "factual" | "thematic";
}

type Status = "pending" | "accepted" | "dismissed";

export function CrossMediaDiscovery(props: CrossMediaDiscoveryProps) {
  const { seed, reco, narrative, username, defaultBacklog, linkKind } = props;
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
  // What the last write said when it didn't land: never a silent no-op.
  const [failed, setFailed] = useState<null | "accept" | "sheet">(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shareTimer.current) clearTimeout(shareTimer.current);
    };
  }, []);

  // Warm the export's fonts on mount: `navigator.share` needs the tap's user
  // activation, which a cold stylesheet fetch inside `share` could outlive.
  useEffect(() => {
    void ensureCardFonts();
  }, []);

  const accept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    // The palette is a nicety (on-device, from the cover): a cover that won't
    // decode must not cost the save.
    const paletteHex = reco.posterUrl
      ? await extractPalette(reco.posterUrl).catch(() => [] as string[])
      : [];
    const res = await attempt(() =>
      acceptRecoAction({
        seedCatalogItemId: seed.catalogItemId,
        targetCatalogItemId: reco.catalogItemId,
        paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
      }),
    );
    setBusy(false);
    if (!res.ok) {
      setFailed("accept");
      return;
    }
    setStatus("accepted");
    setAddedTo(res.value.backlogName);
    setSel(res.value.backlogId);
    setToast(true);
    router.refresh();
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

    // Ensure the brand fonts are loaded before rasterizing: the families'
    // stylesheet first (card-fonts.ts), then each face.
    await ensureCardFonts();
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
      // Each cover paints with its own palette (the card's no-art covers).
      ...(seedPalette.length && recoPalette.length ? { palettes: { seed: seedPalette, reco: recoPalette } } : {}),
      narrative,
      username,
      linkKind,
    };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawDoubleFeature(ctx, data);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "kura-una-conexion.png", { type: "image/png" });
      const shareUrl = username ? `${SITE_URL}/${username}` : undefined;
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
  }, [narrative, reco, seed, username, linkKind]);

  // "Cambiar" → open picker preselected to the current target.
  const openSheet = useCallback(() => {
    setSel((s) => s ?? defaultBacklog?.id ?? null);
    setSheetOpen(true);
  }, [defaultBacklog?.id]);

  /** The sheet's solid action. Resolves true when the title landed. */
  const applySheet = useCallback(
    async (backlogId: string): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setFailed(null);
      const paletteHex = reco.posterUrl
        ? await extractPalette(reco.posterUrl).catch(() => [] as string[])
        : [];
      const res = await attempt(() =>
        acceptRecoToBacklogAction({
          backlogId,
          seedCatalogItemId: seed.catalogItemId,
          targetCatalogItemId: reco.catalogItemId,
          paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
        }),
      );
      setBusy(false);
      if (!res.ok) {
        setFailed("sheet");
        return false;
      }
      setStatus("accepted");
      setAddedTo(res.value.backlogName);
      setSel(backlogId);
      setToast(true);
      router.refresh();
      return true;
    },
    [busy, reco.catalogItemId, reco.posterUrl, seed.catalogItemId, router],
  );

  /** "Nueva colección" inside the sheet. Resolves the new row, or null. */
  const createBacklog = useCallback(
    async (name: string): Promise<DiscoveryBacklog | null> => {
      if (busy) return null;
      setBusy(true);
      setFailed(null);
      const res = await attempt(() => createBacklogAction({ name }));
      setBusy(false);
      if (!res.ok) {
        setFailed("sheet");
        return null;
      }
      const b: DiscoveryBacklog = { id: res.value.id, name, itemCount: 0 };
      setBacklogs((prev) => [b, ...prev]);
      return b;
    },
    [busy],
  );

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
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-text-2">
        {narrative.hookEyebrow}
      </p>
      <p className="mt-2 font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-text">
        {narrative.hookTitle.replace(/\.$/, "")}
      </p>

      {/* Discs with REAL covers (in-app artwork allowed) */}
      <div
        className={`relative flex items-center justify-center ${isPage ? "mt-10" : "mt-6"}`}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute font-display font-extrabold leading-none text-text/[0.05] ${
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
          <p className="tracking-[0.14em] text-text-3">B · {MEDIA_TYPE_LABEL[reco.type]}</p>
          <p className="mt-1 font-serif text-[15px] italic tracking-normal text-text">
            {reco.title}
          </p>
          <p className="mt-0.5">{[reco.byline, reco.year].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      {/* Hero narrative */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-2">
            {narrative.resultEyebrow}
          </p>
          {props.linkKind && (
            <p
              className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] ${
                props.linkKind === "factual" ? "text-text" : "text-text-3"
              }`}
            >
              {props.linkKind === "factual" ? "conexión real" : "misma vibra"}
            </p>
          )}
        </div>
        <p className="mt-2 font-display text-[20px] font-bold leading-snug tracking-[-0.01em] text-text">
          <span className="font-serif font-normal italic">{reco.title}</span>
          {reco.byline ? (
            <>
              , de {reco.byline}.
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg text-text-2 bl-press-sm hover:bg-surface-3 disabled:opacity-40"
          disabled={busy}
        >
          ×
        </button>
        <button
          onClick={accept}
          disabled={busy || accepted}
          className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full font-semibold bl-press disabled:opacity-70 ${
            accepted ? "bg-accent/90 text-bg" : "bg-accent text-bg active:bg-accent-press"
          }`}
        >
          {accepted ? "Guardado" : "Guardar"}
        </button>
        <button
          aria-label="Compartir"
          onClick={share}
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 font-semibold text-text bl-press hover:bg-surface-3 disabled:opacity-40"
          disabled={busy}
        >
          ↗ Compartir
        </button>
      </div>

      {failed === "accept" && (
        <p role="alert" className="mt-3.5 flex items-center gap-2 text-[14px] leading-[1.4] text-text-2">
          <KIcon name="warning" size={16} className="flex-none text-text" />
          {WRITE_FAILED}
        </p>
      )}

      {dismissed && (
        <p className="mt-1 text-center font-mono text-[11px] tracking-[0.08em] text-text-3">
          DESCARTADO ·{" "}
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center px-2 text-text transition-opacity active:opacity-60"
          >
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
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 py-1 pl-4 pr-1 text-sm">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-text text-xs font-bold text-bg">
              ✓
            </span>
            Guardado en <b className="font-semibold">{addedTo}</b>
          </span>
          <button
            type="button"
            onClick={openSheet}
            className="inline-flex min-h-11 flex-none items-center px-3 font-mono text-[11px] tracking-[0.08em] text-text transition-opacity active:opacity-60"
          >
            CAMBIAR
          </button>
        </div>
      )}

      {/* Share toast (download fallback) */}
      {shareToast && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 py-1 pl-4 pr-1 text-sm">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--glass-bg)] text-xs text-text">
              ↗
            </span>
            Tarjeta lista — <b className="font-semibold text-text">sin portadas</b>
          </span>
          <button
            type="button"
            onClick={() => setShareToast(false)}
            className="inline-flex min-h-11 flex-none items-center px-3 font-mono text-[11px] tracking-[0.08em] text-text-2 transition-opacity active:opacity-60"
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

      {/* "guardar en" — the app's one sheet: portaled over the dock, a real
          dialog (Escape, focus in and back to "Cambiar"). */}
      {sheetOpen && (
        <Sheet
          onClose={() => {
            setSheetOpen(false);
            setFailed((f) => (f === "sheet" ? null : f));
          }}
          label={`Guardar ${reco.title}`}
        >
          <SaveInBody
            seedTitle={seed.title}
            backlogs={backlogs}
            initial={sel}
            busy={busy}
            failed={failed === "sheet"}
            onCreate={createBacklog}
            onApply={applySheet}
          />
        </Sheet>
      )}
    </section>
  );
}

/**
 * The inside of "guardar en" (Kura §hoja): the title, "Nueva colección", one
 * radio row per collection and the solid action. No honey: the screen's one
 * accent is the pairing's "Guardar".
 */
function SaveInBody({
  seedTitle,
  backlogs,
  initial,
  busy,
  failed,
  onCreate,
  onApply,
}: {
  seedTitle: string;
  backlogs: DiscoveryBacklog[];
  initial: string | null;
  busy: boolean;
  failed: boolean;
  onCreate: (name: string) => Promise<DiscoveryBacklog | null>;
  onApply: (backlogId: string) => Promise<boolean>;
}) {
  const dismiss = useSheetDismiss();
  const [sel, setSel] = useState<string | null>(initial);
  const [creating, setCreating] = useState(backlogs.length === 0);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    const made = await onCreate(name);
    if (!made) return; // the name stays in the field; the note says why
    setSel(made.id);
    setNewName("");
    setCreating(false);
  };

  const apply = async () => {
    if (!sel || busy) return;
    if (await onApply(sel)) dismiss?.();
  };

  return (
    <>
      <SheetTitle>guardar en</SheetTitle>

      {creating ? (
        <form onSubmit={create} className="mt-3 flex items-center gap-2">
          <input
            ref={inputRef}
            value={newName}
            maxLength={COLLECTION_NAME_MAX}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre de la colección"
            aria-label="Nombre de la nueva colección"
            enterKeyHint="done"
            className={`${SHEET_FIELD} min-w-0 flex-1`}
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className={`${GLASS_BUTTON} flex-none disabled:pointer-events-none disabled:opacity-40`}
          >
            Crear
          </button>
        </form>
      ) : (
        <div className="-mx-1.5 mt-2">
          <MenuRow icon="plus" label="Nueva colección" onClick={() => setCreating(true)} />
        </div>
      )}

      {backlogs.length === 0 ? (
        <p className="mt-4 text-[15px] leading-[1.5] text-text-2">
          Todavía no tienes colecciones. Crea la primera arriba.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Colección" className="mt-2 flex flex-col">
          {backlogs.map((b) => (
            <ChoiceRow
              key={b.id}
              label={b.name}
              description={`${b.isSeedHome ? `Aquí está ${seedTitle} · ` : ""}${b.itemCount} ${
                b.itemCount === 1 ? "título" : "títulos"
              }`}
              on={sel === b.id}
              onSelect={() => setSel(b.id)}
            />
          ))}
        </div>
      )}

      {failed && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-[14px] leading-[1.4] text-text-2">
          <KIcon name="warning" size={16} className="flex-none text-text" />
          {WRITE_FAILED}
        </p>
      )}

      <button type="button" onClick={apply} disabled={busy || !sel} className={`${SHEET_SOLID} mt-4`}>
        {busy ? "Guardando…" : "Guardar"}
      </button>
    </>
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
      <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg" />
    </div>
  );
}
