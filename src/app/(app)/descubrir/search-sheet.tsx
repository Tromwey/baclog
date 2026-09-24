"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  addItemAction,
  removeMembershipAction,
} from "@/app/actions/backlog-item-actions";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import { extractPalette } from "@/modules/cards/palette";
import type { CatalogSearchResult } from "@/modules/catalog/types";
import { GLASS_BUTTON } from "@/components/kura/components";
import { CHEVRON_DOWN_PATH } from "@/components/glyph-paths";
import { useKeyboardScrollGuard } from "@/hooks/use-keyboard-scroll-guard";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import {
  useScrollerTouchAction,
  useSheetMotion,
} from "@/hooks/use-sheet-motion";
import { useHideNavDock } from "@/app/(app)/nav-dock";
import type { SearchBacklog } from "./descubrir-screen";
import type { LibraryIndex } from "./library";
import {
  CheckStroke,
  CloseGlyph,
  Highlight,
  KindPills,
  PlusGlyph,
  RowCover,
  SKELETON_PULSE,
  SearchGlyph,
  TriangleGlyph,
  workMeta,
  type KindTab,
} from "./kura-bits";
import {
  FirstItemSheet,
  type FirstItemCelebration,
} from "./first-item-sheet";

type Target = { id: string; name: string };

/** False on the server, true in the browser — the createPortal guard. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const keyOf = (backlogId: string, catalogItemId: string) =>
  `${backlogId}:${catalogItemId}`;

/**
 * Agregar títulos a una colección (Kura · flujos-v2 27a/27b). A tall `--s1`
 * sheet 54 from the top, radius 36: "AGREGAR A" + the collection's name in
 * Newsreader 28 and a glass "Listo · N"; the 48 glass field; the format pills
 * (Todo · Cine · Series · Música, the selected one solid); rows 72 with the
 * cover (40×60 poster / 44×44 disc), the italic title with the typed text
 * bold, the mono meta and a round + that turns into a solid ✓. Every add says
 * "Agregado a {colección} · Deshacer" at the foot for 5 s.
 *
 * CONTRACT (kept for other areas — the collection's "Agregar títulos" lands
 * here via `/descubrir?buscar=1&to={id}`): same props as before; `library`
 * and `onMembershipChange` are optional extras Descubrir passes so titles
 * already in the collection start checked and its own index stays true.
 *
 * The target is visible and changeable (tap the name) — adds are never a
 * mystery — and ✓ toggles back: a mis-add is undone without leaving. Portaled
 * to <body> (AGENTS.md: the content wrapper traps a fixed sheet under the
 * dock) and the dock hides while it's open. The first title of an account gets
 * the closing moment AFTER this sheet leaves — never two sheets at a time.
 *
 * "Para esta colección · por lo que ya tiene" (27a's suggestions) has no
 * source in the product yet: the idle sheet says what to type instead.
 */
export function SearchSheet({
  inputRef,
  initialQuery,
  backlogs,
  pinnedBacklogId,
  libraryEmpty,
  library,
  onMembershipChange,
  onClose,
}: {
  /** Owned by the parent so the tap handler can focus it inside the gesture. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** A search restored after closing an item (re-runs on mount). */
  initialQuery: string;
  backlogs: SearchBacklog[];
  /**
   * The collection the user came FROM, pre-selected as the add target.
   * Resolved against `backlogs` (the owner's own server-loaded list), so a
   * foreign or stale id simply doesn't match and falls back to the first: no
   * extra query, no enumeration oracle, assertOwnsBacklog still the choke
   * point on the add itself.
   */
  pinnedBacklogId: string | null;
  /** The account has no titles yet — a successful add here is the first ever. */
  libraryEmpty: boolean;
  /** Optional: the caller's memberships, so what's already in starts as ✓. */
  library?: LibraryIndex;
  /** Optional: told about every membership this sheet creates (id) or drops (null). */
  onMembershipChange?: (
    catalogItemId: string,
    backlogId: string,
    backlogItemId: string | null,
  ) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const keyboardInset = useKeyboardInset();
  useHideNavDock(true);

  // Set when the first title of the account lands; the sheet's own exit then
  // hands over to the celebration instead of closing outright.
  const [celebration, setCelebration] = useState<FirstItemCelebration | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const celebrationRef = useRef<FirstItemCelebration | null>(null);

  // The app-wide sheet motion: rises in, leaves the way it came, drags down to
  // dismiss. A short 56px rise: the field is focused inside the opening tap,
  // and iOS pans the page to chase an input that is still off-screen.
  const { panelRef, scrimRef, dismiss, panelHandlers } = useSheetMotion({
    onClose: () => {
      if (celebrationRef.current) setCelebrating(true);
      else onClose();
    },
    enterOffset: 56,
    enterScale: 1,
    enabled: hydrated,
  });
  const resultsRef = useRef<HTMLDivElement>(null);
  useScrollerTouchAction(resultsRef, hydrated);

  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<KindTab>("all");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    initialQuery.trim().length >= 2 ? "loading" : "idle",
  );
  const [attempt, setAttempt] = useState(0);
  // `${backlogId}:${catalogItemId}` → the membership id this session created
  // (string) or removed (null). Absent = whatever `library` says.
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [addsThisVisit, setAddsThisVisit] = useState(0);
  // Rows with an add/remove in flight — per row, so adding A never touches B.
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [options, setOptions] = useState<SearchBacklog[]>(backlogs);
  const [target, setTarget] = useState<Target | null>(() => {
    const pinned =
      (pinnedBacklogId && backlogs.find((b) => b.id === pinnedBacklogId)) ||
      backlogs[0];
    return pinned ? { id: pinned.id, name: pinned.name } : null;
  });
  const [pickerOpen, setPickerOpen] = useState(backlogs.length === 0);
  const [newOpen, setNewOpen] = useState(backlogs.length === 0);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; catalogItemId: string; backlogId: string; name: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  // Fallback for a mount that didn't come from a tap (a ?buscar=1 arrival).
  // Skipped on a restored search: you came back to READ those results.
  useEffect(() => {
    if (initialQuery || newOpen) return;
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.focus();
    // Only ever on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // iOS scrolls the document to clear the keyboard and (standalone PWA) never
  // scrolls back — keep the field row on screen.
  useKeyboardScrollGuard(inputRef, fieldRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  useEffect(() => {
    if (newOpen) newInputRef.current?.focus();
  }, [newOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((x) => (x?.id === toast.id ? null : x)), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(q)}&tab=${tab}`,
          { signal: ctl.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setResults(data.results);
        setState("done");
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setState("error");
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, tab, attempt]);

  /** The membership of `catalogItemId` in the current target, if any. */
  const membershipIn = (catalogItemId: string): string | null => {
    if (!target) return null;
    const k = keyOf(target.id, catalogItemId);
    if (k in overrides) return overrides[k];
    return (
      library?.byTitle[catalogItemId]?.find((m) => m.backlogId === target.id)
        ?.backlogItemId ?? null
    );
  };

  // On Descubrir, stamp the live query on THIS history entry before pushing
  // the item, so the item's back lands on the same results. Anywhere else the
  // URL belongs to the host page and is left alone.
  const openItem = (catalogItemId: string) => {
    const q = query.trim();
    if (q.length >= 2 && window.location.pathname === "/descubrir") {
      window.history.replaceState(null, "", `/descubrir?q=${encodeURIComponent(q)}`);
    }
    router.push(`/item/${catalogItemId}`);
  };

  const setRowPending = (id: string, on: boolean) =>
    setPending((p) => {
      const next = new Set(p);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const record = (backlogId: string, catalogItemId: string, id: string | null) => {
    setOverrides((o) => ({ ...o, [keyOf(backlogId, catalogItemId)]: id }));
    onMembershipChange?.(catalogItemId, backlogId, id);
  };

  // Tap + to add to the target; tap ✓ to take it out again.
  const toggle = async (r: CatalogSearchResult) => {
    const id = r.catalogItemId;
    if (pending.has(id)) return;
    if (!target) {
      setPickerOpen(true);
      setNewOpen(true);
      return;
    }
    const t = target;
    const existing = membershipIn(id);
    setRowPending(id, true);
    setFailed((f) => (f === id ? null : f));
    try {
      if (existing) {
        await removeMembershipAction(existing);
        record(t.id, id, null);
        setAddsThisVisit((n) => Math.max(0, n - 1));
        setToast((x) => (x?.catalogItemId === id ? null : x));
      } else {
        // Palette is cover-derived + cached on catalog_item: extract only when
        // this title has none yet.
        const needsPalette = !r.paletteHex || r.paletteHex.length === 0;
        const paletteHex =
          needsPalette && r.posterUrl ? await extractPalette(r.posterUrl) : [];
        const res = await addItemAction({
          backlogId: t.id,
          catalogItemId: id,
          paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
        });
        const newId = "id" in res ? res.id : undefined;
        if (!newId) {
          setFailed(id);
          return;
        }
        record(t.id, id, newId);
        setAddsThisVisit((n) => n + 1);
        setToast({ id: Date.now(), catalogItemId: id, backlogId: t.id, name: t.name });
        if (libraryEmpty && !celebrationRef.current && !celebration) {
          const c: FirstItemCelebration = {
            title: r.title,
            mediaType: r.mediaType,
            year: r.year,
            posterUrl: r.posterUrl,
            paletteHex: paletteHex.length > 0 ? paletteHex : (r.paletteHex ?? []),
            backlogId: t.id,
            backlogName: t.name,
          };
          celebrationRef.current = c;
          setCelebration(c);
        }
      }
    } catch {
      // Don't fake success: the row keeps its prior state and stays tappable.
      // Only a failed ADD says so — that's the one the user was told would save.
      if (!existing) setFailed(id);
    } finally {
      setRowPending(id, false);
    }
  };

  const undoToast = async () => {
    if (!toast) return;
    const { catalogItemId, backlogId } = toast;
    setToast(null);
    const k = keyOf(backlogId, catalogItemId);
    const id = overrides[k];
    if (!id) return;
    setRowPending(catalogItemId, true);
    try {
      await removeMembershipAction(id);
      record(backlogId, catalogItemId, null);
      setAddsThisVisit((n) => Math.max(0, n - 1));
    } catch {
      // Left as it is; the ✓ still toggles it out.
    } finally {
      setRowPending(catalogItemId, false);
    }
  };

  const createAndSelect = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await createBacklogAction({ name });
      const id = "id" in res ? res.id : null;
      if (id) {
        // A new collection has no cover yet, so no colour (§color: "sin
        // portada no hay color").
        const fresh: SearchBacklog = { id, name, itemCount: 0, paletteHex: [] };
        setOptions((o) => [fresh, ...o]);
        setTarget({ id, name });
        setNewName("");
        setNewOpen(false);
        setPickerOpen(false);
        inputRef.current?.focus();
      }
    } catch {
      // The field stays filled; "Crear" can be tapped again.
    } finally {
      setCreating(false);
    }
  };

  if (!hydrated) return null;

  if (celebrating && celebration) {
    return <FirstItemSheet item={celebration} onDismiss={onClose} />;
  }

  const q = query.trim();

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
        aria-label={target ? `Agregar a ${target.name}` : "Agregar títulos"}
        {...panelHandlers}
        className="absolute inset-x-0 bottom-0 top-[calc(54px+env(safe-area-inset-top))] mx-auto flex max-w-md touch-none flex-col overflow-hidden rounded-t-[36px] bg-surface-1 will-change-transform"
        style={keyboardInset > 0 ? { paddingBottom: `${keyboardInset}px` } : undefined}
      >
        <button
          type="button"
          data-sheet-handle
          onClick={dismiss}
          aria-label="Cerrar"
          className="flex h-[19px] flex-none items-end justify-center self-center px-4"
        >
          <span className="h-[5px] w-9 rounded-full bg-white/[0.18]" />
        </button>

        <div className="flex flex-none items-center justify-between gap-3 px-5 pb-3.5 pt-2">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-expanded={pickerOpen}
            className="flex min-w-0 flex-col gap-0.5 text-left"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
              Agregar a
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-display text-[28px] leading-[1.05] text-text">
                {target?.name ?? "elige una colección"}
              </span>
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className={`flex-none text-text-2 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
              >
                <path d={CHEVRON_DOWN_PATH} />
              </svg>
            </span>
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 flex-none rounded-full bg-[var(--glass-bg)] px-[18px] text-[16px] font-semibold text-text bl-press hover:bg-white/[0.12]"
          >
            {addsThisVisit > 0 ? `Listo · ${addsThisVisit}` : "Listo"}
          </button>
        </div>

        {pickerOpen && (
          <div className="flex flex-none flex-col gap-2.5 pb-3.5">
            <div role="listbox" aria-label="Colección destino" className="bl-scroll flex gap-2 overflow-x-auto px-5">
              {options.map((b) => {
                const on = b.id === target?.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      setTarget({ id: b.id, name: b.name });
                      setPickerOpen(false);
                      setNewOpen(false);
                    }}
                    className={`min-h-9 flex-none rounded-full px-3.5 text-[15px] font-medium transition-colors ${
                      on ? "bg-text text-bg" : "bg-white/[0.08] text-text hover:bg-white/[0.12]"
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setNewOpen((o) => !o)}
                className="flex min-h-9 flex-none items-center gap-1.5 rounded-full bg-white/[0.08] pl-2.5 pr-3.5 text-[15px] font-medium text-text hover:bg-white/[0.12]"
              >
                <PlusGlyph size={16} />
                Nueva colección
              </button>
            </div>
            {newOpen && (
              <form onSubmit={createAndSelect} className="bl-rise-soft flex gap-2 px-5">
                <input
                  ref={newInputRef}
                  value={newName}
                  maxLength={60}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={options.length === 0 ? "Tu primera colección" : "Nombre de la colección"}
                  aria-label="Nombre de la colección"
                  className="h-12 min-w-0 flex-1 rounded-[16px] bg-[var(--glass-bg)] px-4 text-[16px] text-text caret-accent outline-none transition-colors placeholder:text-text-3 focus:bg-white/[0.11]"
                />
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="h-12 flex-none rounded-full bg-text px-5 text-[16px] font-semibold text-bg bl-press disabled:opacity-40"
                >
                  Crear
                </button>
              </form>
            )}
          </div>
        )}

        <div ref={fieldRef} className="flex-none px-5">
          <label className="flex h-12 items-center gap-2.5 rounded-full bg-white/[0.08] px-4 text-text-2">
            <SearchGlyph />
            <input
              type="search"
              ref={inputRef}
              value={query}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                if (v.trim().length < 2) {
                  setResults([]);
                  setState("idle");
                } else {
                  setState("loading");
                }
              }}
              placeholder="Buscar títulos"
              aria-label="Buscar títulos"
              enterKeyHint="search"
              autoComplete="off"
              // 16px on purpose: iOS Safari zooms into a focused input below 16.
              className="min-w-0 flex-1 bg-transparent text-[16px] text-text caret-accent outline-none placeholder:text-text-2 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setState("idle");
                  inputRef.current?.focus();
                }}
                aria-label="Borrar búsqueda"
                className="-mr-2 flex h-11 w-9 flex-none items-center justify-center"
              >
                <CloseGlyph />
              </button>
            )}
          </label>
        </div>

        <KindPills
          value={tab}
          onSelect={(k) => {
            setTab(k);
            if (query.trim().length >= 2) setState("loading");
          }}
          tone="solid"
          className="flex-none px-5 pb-1.5 pt-3.5"
        />

        <div
          ref={resultsRef}
          className="bl-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(96px+env(safe-area-inset-bottom))] pt-1.5"
        >
          {state === "idle" && (
            <p className="px-5 pt-4 text-[15px] leading-[1.5] text-text-2">
              Escribe el nombre de una película, una serie o un álbum.
            </p>
          )}

          {state === "loading" && (
            <div aria-busy="true" aria-label="Buscando" className={SKELETON_PULSE}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex min-h-[72px] items-center gap-3.5 px-5">
                  <span className="flex h-[60px] w-11 flex-none items-center justify-center">
                    <span className="block h-[60px] w-10 rounded-[var(--r-cover-s)] bg-surface-2" />
                  </span>
                  <span className="flex flex-1 flex-col gap-2.5">
                    <span className="block h-4 w-[70%] rounded-[6px] bg-surface-2" />
                    <span className="block h-2.5 w-[45%] rounded-[5px] bg-surface-2" />
                  </span>
                  <span className="block h-11 w-11 flex-none rounded-full bg-surface-2" />
                </div>
              ))}
            </div>
          )}

          {state === "error" && (
            <div className="flex flex-col items-start gap-3 px-5 pt-6">
              <span className="text-text-2">
                <TriangleGlyph />
              </span>
              <p className="text-[15px] leading-[1.5] text-text-2">
                No pudimos buscar. Revisa tu conexión y vuelve a intentarlo.
              </p>
              <button
                type="button"
                onClick={() => {
                  setState("loading");
                  setAttempt((n) => n + 1);
                }}
                className={GLASS_BUTTON}
              >
                Reintentar
              </button>
            </div>
          )}

          {state === "done" && results.length === 0 && (
            <div className="flex flex-col gap-2 px-5 pt-6">
              <p className="font-display text-[26px] leading-[1.1] text-text text-balance break-words">
                nada con “{q}”.
              </p>
              <p className="text-[15px] leading-[1.5] text-text-2">
                Revisa cómo se escribe, o prueba con otro nombre.
              </p>
            </div>
          )}

          {state === "done" &&
            results.map((r) => {
              const inTarget = membershipIn(r.catalogItemId) !== null;
              const busy = pending.has(r.catalogItemId);
              return (
                <div key={r.catalogItemId} className="flex flex-col">
                  <div className="flex min-h-[72px] items-center gap-3.5 px-5">
                    <button
                      type="button"
                      onClick={() => openItem(r.catalogItemId)}
                      className="flex min-w-0 flex-1 items-center gap-3.5 text-left transition-opacity active:opacity-70"
                    >
                      <RowCover
                        posterUrl={r.posterUrl}
                        paletteHex={r.paletteHex}
                        mediaType={r.mediaType}
                        size="add"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-serif text-[18px] italic leading-[1.15] text-text">
                          <Highlight text={r.title} query={q} />
                        </span>
                        <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
                          {workMeta(r)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(r)}
                      disabled={busy}
                      aria-pressed={inTarget}
                      aria-label={
                        inTarget
                          ? `Quitar ${r.title} de ${target?.name ?? "la colección"}`
                          : `Agregar ${r.title} a ${target?.name ?? "una colección"}`
                      }
                      className={`flex h-11 w-11 flex-none items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 disabled:opacity-60 ${
                        inTarget
                          ? "scale-[1.04] bg-text text-bg"
                          : "bg-white/[0.1] text-text hover:bg-white/[0.14]"
                      }`}
                    >
                      {inTarget ? <CheckStroke /> : <PlusGlyph />}
                    </button>
                  </div>
                  {failed === r.catalogItemId && (
                    <p
                      role="status"
                      className="-mt-2 flex items-center gap-1.5 pb-2 pl-[78px] font-mono text-[11px] uppercase tracking-[0.08em] text-text-2"
                    >
                      <TriangleGlyph size={13} />
                      No se guardó · toca + para reintentar
                    </p>
                  )}
                </div>
              );
            })}
        </div>

        {toast && (
          <div
            role="status"
            className="bl-rise-soft absolute inset-x-4 bottom-[calc(30px+env(safe-area-inset-bottom))] flex min-h-[52px] items-center gap-3 rounded-full bg-surface-2 pl-[18px] pr-2 shadow-float"
            style={keyboardInset > 0 ? { bottom: keyboardInset + 16 } : undefined}
          >
            <span className="min-w-0 flex-1 truncate text-[15px] text-text">
              Agregado a {toast.name}
            </span>
            <button
              type="button"
              onClick={undoToast}
              className="min-h-11 flex-none px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text"
            >
              Deshacer
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
