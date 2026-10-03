"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addPartySongAction, searchPartySongsAction } from "@/app/actions/party-collection-actions";
import { SKELETON_PULSE } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";
import type { ToastHost } from "@/components/kura/toast";
import { isTopDialog, useDialogFocus } from "@/hooks/use-dialog-focus";
import { duplicateMessage } from "@/modules/party-collections/rules";
import type { PartyDetail, PartySongHit } from "@/modules/party-collections/types";
import { logged, usePartyFailure } from "./party-errors";
import { SongCover, SongRowsSkeleton } from "./party-parts";
import { paletteFor } from "./use-party-tint";

/**
 * "Buscar canción" (fiesta-app-v2 · search-idle / loading / results / dup /
 * error): a full-screen panel over the party, PORTALED to <body> (AGENTS.md:
 * never trapped under anything). iTunes songs through
 * `searchPartySongsAction`, each hit already annotated against the party:
 * "Agregar" / "Ya está" with "Ya la agregaste" or "Ya está · la agregó @ana".
 *
 * Failures (party-errors.ts): `not_found` = the party is gone for this
 * person → `onGone` (the room closes the search and re-reads, which sends
 * them to /backlogs); a gone session → login; iTunes down → the "no pudimos
 * buscar." state with Reintentar; everything thrown is logged.
 *
 * No 30 s preview play button: the v2 design removed it from the rows (the
 * contract carries `previewUrl` for when a design brings it back).
 */

type Status = "idle" | "loading" | "results" | "error";

export function remainLabel(party: PartyDetail): string {
  const v = party.viewer;
  if (v.role === "host" || v.remaining === null) return "Sin límite";
  const limit = party.perGuestLimit ?? 0;
  if (v.remaining <= 0) return limit === 1 ? "Ya agregaste tu canción" : `Ya agregaste tus ${limit}`;
  return `Te ${v.remaining === 1 ? "queda" : "quedan"} ${v.remaining} de ${limit}`;
}

export function PartySearch({
  party,
  onParty,
  onCap,
  onClose,
  onGone,
  toast,
}: {
  party: PartyDetail;
  onParty: (p: PartyDetail) => void;
  /** The guest reached their cap ("ya pusiste tus 3." sheet). */
  onCap: () => void;
  onClose: () => void;
  /** `not_found`: the party is no longer this person's — close and re-read. */
  onGone: () => void;
  toast: ToastHost;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [hits, setHits] = useState<PartySongHit[]>([]);
  const fail = usePartyFailure(toast);
  const [adding, setAdding] = useState<string | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel);

  const run = (query: string) => {
    const id = ++seq.current;
    if (!query.trim()) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    void logged("search songs", party.id, searchPartySongsAction(party.id, query.trim())).then((res) => {
      if (id !== seq.current) return;
      if (!res) {
        setStatus("error");
        return;
      }
      if ("ok" in res && res.ok) {
        setHits(res.items);
        setStatus("results");
        return;
      }
      if (!("error" in res)) return;
      switch (res.error) {
        case "rate_limited":
          setStatus(hits.length ? "results" : "idle");
          toast.show({ message: "Demasiadas búsquedas seguidas. Espera un momento y vuelve a buscar.", kind: "error" });
          return;
        case "unavailable":
          // iTunes down: the "no pudimos buscar." state.
          setStatus("error");
          return;
        case "invalid":
          setStatus("idle");
          return;
        case "not_found":
          onGone();
          return;
        default:
          setStatus(hits.length ? "results" : "idle");
          fail(res, "No pudimos buscar. Vuelve a intentarlo.");
      }
    });
  };

  const onQuery = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(value), 350);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    // A sheet on top (the cap sheet) owns Escape: the dialog stack says so.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && isTopDialog(panel.current) && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mark = (titleId: string, inParty: PartySongHit["inParty"]) =>
    setHits((hs) => hs.map((h) => (h.titleId === titleId ? { ...h, inParty } : h)));

  async function add(hit: PartySongHit) {
    if (hit.inParty) {
      toast.show({
        // The server's own sentence (rules.ts), so both can't drift.
        message: duplicateMessage(hit.inParty.mine, hit.inParty.addedBy?.handle ?? null),
      });
      return;
    }
    setAdding(hit.titleId);
    const palette = await paletteFor(hit.artworkUrl, hit.paletteHex);
    const res = await logged("add song", party.id, addPartySongAction(party.id, hit.titleId, palette));
    setAdding(null);
    if (res && "ok" in res && res.ok) {
      onParty(res.party);
      mark(hit.titleId, { mine: true, addedBy: null });
      const v = res.party.viewer;
      if (v.role === "guest" && v.remaining === 0) onCap();
      else toast.show({ message: `Agregaste ${hit.title}` });
      return;
    }
    if (res && "error" in res) {
      switch (res.error) {
        case "duplicate_mine":
        case "duplicate_other":
          mark(hit.titleId, { mine: res.error === "duplicate_mine", addedBy: res.addedBy });
          toast.show({ message: res.message });
          return;
        case "cap_reached":
          onCap();
          return;
        case "blocked":
          toast.show({ message: "Ya no puedes agregar canciones" });
          return;
        case "view_only":
          toast.show({ message: "En esta fiesta solo se puede ver la colección" });
          return;
        case "not_found":
          onGone();
          return;
      }
    }
    fail(res, "No pudimos agregarla. Vuelve a intentarlo.");
  }

  return createPortal(
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar canción"
      className="fixed inset-0 z-40 flex flex-col overscroll-contain bg-bg text-text"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-1.5 py-1.5 pl-4 pr-3">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[16px] bg-surface-2 px-3.5 text-text-2 focus-within:bg-surface-3">
            <KIcon name="search" size={18} />
            <input
              autoFocus
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (timer.current) clearTimeout(timer.current);
                  run(q);
                }
              }}
              enterKeyHint="search"
              maxLength={100}
              aria-label="Canción o artista"
              placeholder="Canción o artista"
              className="min-w-0 flex-1 bg-transparent font-sans text-[16px] text-text outline-none placeholder:text-text-3"
            />
          </label>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-full px-2.5 font-sans text-[15px] font-medium text-text transition-colors active:bg-surface-2"
          >
            Cancelar
          </button>
        </div>
        <div className="px-6 pb-1.5 pt-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">
          {remainLabel(party)}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-10">
          {status === "idle" && (
            <p className="px-6 py-[60px] text-center font-sans text-[15px] leading-[1.45] text-text-2">
              Busca por nombre de la canción o del artista.
            </p>
          )}
          {status === "loading" && <SongRowsSkeleton pulse={SKELETON_PULSE} aside={88} />}
          {status === "error" && (
            <div className="flex flex-col gap-2.5 px-5 pt-14">
              <span className="font-brand text-[30px] leading-[1.05] tracking-[-0.01em]">no pudimos buscar.</span>
              <span className="font-sans text-[15px] leading-[1.45] text-text-2 [text-wrap:pretty]">
                El buscador de canciones no respondió. Revisa tu conexión y vuelve a intentarlo; tus
                canciones siguen guardadas.
              </span>
              <button
                type="button"
                onClick={() => run(q)}
                className="mt-3 h-[52px] self-start rounded-full bg-honey px-7 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press"
              >
                Reintentar
              </button>
            </div>
          )}
          {status === "results" && hits.length === 0 && (
            <p className="px-6 py-[60px] text-center font-sans text-[15px] leading-[1.45] text-text-2">
              No encontramos esa canción. Prueba con el nombre del artista.
            </p>
          )}
          {status === "results" && hits.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {hits.map((h) => {
                const dup = !!h.inParty;
                const sub = h.inParty
                  ? h.inParty.mine
                    ? "Ya la agregaste"
                    : `Ya está · la agregó ${h.inParty.addedBy ? `@${h.inParty.addedBy.handle}` : "alguien"}`
                  : null;
                const line = [h.artist, h.album].filter(Boolean).join(" · ");
                return (
                  <li key={h.titleId} className="flex items-center gap-3 rounded-[18px] px-3 py-2">
                    <SongCover song={h} size={56} radius={8} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-brand text-[18px] italic leading-[1.2] text-text">{h.title}</span>
                      {line && <span className="truncate font-sans text-[13px] text-text-2">{line}</span>}
                      {sub && <span className="font-sans text-[12px] font-medium text-text-3">{sub}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => void add(h)}
                      disabled={adding !== null}
                      aria-label={dup ? `${h.title}: ya está` : `Agregar ${h.title}`}
                      className={`h-11 flex-none rounded-full px-4 font-sans text-[14px] font-medium bl-press-sm disabled:opacity-60 ${
                        dup ? "bg-surface-1 text-text-3" : "bg-surface-2 text-text"
                      }`}
                    >
                      {adding === h.titleId ? "Agregando…" : dup ? "Ya está" : "Agregar"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
