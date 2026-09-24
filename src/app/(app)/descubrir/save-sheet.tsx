"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import type { MediaType } from "@/modules/catalog/types";
import { SOLID_BUTTON } from "@/components/kura/components";
import { tintCard } from "@/components/kura/tint";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import {
  useScrollerTouchAction,
  useSheetMotion,
} from "@/hooks/use-sheet-motion";
import type { SearchBacklog } from "./descubrir-screen";
import type { LibraryIndex } from "./library";
import {
  PlusGlyph,
  RowCover,
  TriangleGlyph,
  workMeta,
} from "./kura-bits";

/** Whatever Descubrir can offer to save: a result, a reco, a trend. */
export interface SaveWork {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  byline: string | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * 19h — "guardar en": the one way a title gets into collections from
 * Descubrir (§patrones · guardar: "guardar abre siempre la hoja"). A floating
 * `--s2` sheet inset 8, radius 36: the title on top, then "Nueva colección"
 * and every collection with its cover and a check disc, and the solid action
 * at the end — "Guardar en N colecciones".
 *
 * Pre-checked with where the title already lives; a title that isn't saved
 * anywhere starts on the collection used last. Unchecking is how a title
 * leaves a collection, so the sheet is also the edit. The write itself (and
 * its "Deshacer") belongs to the parent: the sheet only says which set.
 *
 * Portaled to <body> (AGENTS.md: the content wrapper would trap it under the
 * dock). Hydration gate outside the body, which owns the motion hook
 * (learnings/2026-09-17-hojas-con-gesto…).
 */
export function SaveSheet(props: {
  work: SaveWork;
  collections: SearchBacklog[];
  library: LibraryIndex;
  onSave: (work: SaveWork, backlogIds: string[]) => Promise<boolean>;
  onCreate: (name: string) => Promise<SearchBacklog | null>;
  onClose: () => void;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <SaveSheetBody {...props} />;
}

function SaveSheetBody({
  work,
  collections,
  library,
  onSave,
  onCreate,
  onClose,
}: {
  work: SaveWork;
  collections: SearchBacklog[];
  library: LibraryIndex;
  onSave: (work: SaveWork, backlogIds: string[]) => Promise<boolean>;
  onCreate: (name: string) => Promise<SearchBacklog | null>;
  onClose: () => void;
}) {
  const keyboardInset = useKeyboardInset();
  const { panelRef, scrimRef, dismiss, panelHandlers } = useSheetMotion({ onClose });
  const listRef = useRef<HTMLDivElement>(null);
  useScrollerTouchAction(listRef);

  const current = (library.byTitle[work.catalogItemId] ?? []).map((m) => m.backlogId);
  const wasSaved = current.length > 0;
  const [checked, setChecked] = useState<Set<string>>(() => {
    if (wasSaved) return new Set(current);
    const last =
      (library.lastUsedBacklogId &&
        collections.find((c) => c.id === library.lastUsedBacklogId)?.id) ||
      collections[0]?.id;
    return new Set(last ? [last] : []);
  });
  const [creating, setCreating] = useState(collections.length === 0);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  useEffect(() => {
    if (creating) newInputRef.current?.focus();
  }, [creating]);

  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const n = checked.size;
  const unchanged =
    n === current.length && current.every((id) => checked.has(id));
  const label = busy
    ? "Guardando…"
    : n === 0
      ? wasSaved
        ? "Quitar de tus colecciones"
        : "Elige una colección"
      : n === 1
        ? "Guardar en 1 colección"
        : `Guardar en ${n} colecciones`;

  const save = async () => {
    if (busy) return;
    if (unchanged) {
      dismiss();
      return;
    }
    setBusy(true);
    setFailed(false);
    const ok = await onSave(work, [...checked]);
    setBusy(false);
    if (ok) dismiss();
    else setFailed(true);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const made = await onCreate(name);
    setBusy(false);
    if (made) {
      setChecked((s) => new Set(s).add(made.id));
      setNewName("");
      setCreating(false);
    } else {
      setFailed(true);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div ref={scrimRef} className="absolute inset-0">
        <button
          type="button"
          aria-label="Cerrar"
          onClick={dismiss}
          className="absolute inset-0 bg-[rgba(5,5,6,0.62)]"
        />
      </div>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Guardar ${work.title}`}
        {...panelHandlers}
        className="absolute inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] mx-auto flex max-h-[calc(100dvh-72px)] max-w-md touch-none flex-col gap-1 rounded-[36px] bg-surface-2 px-3 pb-[26px] pt-2.5 shadow-float will-change-transform"
        style={keyboardInset > 0 ? { bottom: keyboardInset + 8 } : undefined}
      >
        <button
          type="button"
          data-sheet-handle
          onClick={dismiss}
          aria-label="Cerrar"
          className="-mt-1 mb-1 flex h-5 items-center self-center px-4"
        >
          <span className="h-[5px] w-9 rounded-full bg-white/[0.18]" />
        </button>

        <div className="flex items-center gap-3.5 px-2 pb-3">
          <RowCover posterUrl={work.posterUrl} paletteHex={work.paletteHex} mediaType={work.mediaType} />
          <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
            <span className="truncate font-serif text-[20px] italic leading-[1.1]">{work.title}</span>
            <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
              {workMeta(work)}
            </span>
          </div>
        </div>

        <span className="px-2 pb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-text-2">
          Guardar en
        </span>

        <div ref={listRef} className="bl-scroll flex max-h-[340px] min-h-0 flex-col overflow-y-auto overscroll-contain">
          {creating ? (
            <form onSubmit={create} className="flex min-h-14 items-center gap-2 px-2">
              <input
                ref={newInputRef}
                value={newName}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de la colección"
                aria-label="Nombre de la nueva colección"
                enterKeyHint="done"
                className="h-12 min-w-0 flex-1 rounded-[16px] bg-[var(--glass-bg)] px-4 text-[16px] text-text caret-accent outline-none transition-colors placeholder:text-text-3 focus:bg-white/[0.11]"
              />
              <button
                type="submit"
                disabled={busy || !newName.trim()}
                className="inline-flex h-11 flex-none items-center rounded-full bg-[var(--glass-bg)] px-4 text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12] disabled:opacity-40"
              >
                Crear
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex min-h-14 items-center gap-3.5 px-2 text-left transition-opacity active:opacity-70"
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[var(--r-cover-s)] bg-[var(--glass-bg)]">
                <PlusGlyph />
              </span>
              <span className="flex-1 text-[16px] font-medium">Nueva colección</span>
            </button>
          )}

          {collections.map((c) => {
            const on = checked.has(c.id);
            const thumb = library.thumbs[c.id];
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.id)}
                className="flex min-h-14 items-center gap-3.5 px-2 text-left transition-opacity active:opacity-70"
              >
                <span
                  aria-hidden
                  className="relative h-10 w-10 flex-none overflow-hidden rounded-[var(--r-cover-s)] bg-[var(--glass-bg)]"
                  style={thumb && !thumb.posterUrl ? { background: tintCard(thumb.paletteHex) } : undefined}
                >
                  {thumb?.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                    <img src={thumb.posterUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-serif text-[19px]">{c.name}</span>
                <span
                  className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full transition-colors ${
                    on ? "bg-white/[0.2]" : "bg-[var(--glass-bg)]"
                  }`}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill={on ? "var(--text)" : "transparent"} aria-hidden>
                    <path d="M20.5 6.3a1.1 1.1 0 010 1.6l-9.6 9.6a1.1 1.1 0 01-1.6 0L4.6 12.8a1.1 1.1 0 011.6-1.6l3.9 3.9 8.8-8.8a1.1 1.1 0 011.6 0z" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>

        {failed && (
          <p role="status" className="flex items-center gap-2 px-2 pt-2 text-[14px] text-text-2">
            <TriangleGlyph size={16} />
            No se guardó. Revisa tu conexión y vuelve a intentarlo.
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy || (n === 0 && !wasSaved)}
          className={`${SOLID_BUTTON} mt-2.5 w-full`}
        >
          {label}
        </button>
      </div>
    </div>,
    document.body,
  );
}
