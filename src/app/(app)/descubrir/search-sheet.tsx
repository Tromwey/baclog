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
import { PaletteGlow, Segmented, StrokeIcon, type Segment } from "@/components/ui";
import { CoverTile, coverAspect } from "@/components/cover-tile";
import { PLUS_PATH } from "@/components/glyph-paths";
import {
  addItemAction,
  removeMembershipAction,
} from "@/app/actions/backlog-item-actions";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import { extractPalette } from "@/modules/cards/palette";
import type { CatalogSearchResult, SearchTab } from "@/modules/catalog/types";
import { useKeyboardScrollGuard } from "@/hooks/use-keyboard-scroll-guard";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useHideNavDock } from "@/app/(app)/nav-dock";
import type { SearchBacklog } from "./descubrir-screen";
import { workMeta } from "./discover-home";
import {
  FirstItemSheet,
  type FirstItemCelebration,
} from "./first-item-sheet";

type Target = { id: string; name: string; paletteHex: string[] };

/** The mock's ✓ on an added row (14px, stroke 2.6). */
const ADDED_PATH = "M5 12.5l4.5 4.5L19 7";

const TABS: { key: SearchTab; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "film", label: "Cine" },
  { key: "series", label: "Series" },
  { key: "album", label: "Música" },
];

const NEW_KEY = "__new";

/** False on the server, true in the browser — the createPortal guard. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Buscar / agregar título (Revamp UI, 2026-09-03 — mock 07): a full-height
 * sheet over Discover. Behind it the page keeps rendering under the TARGET
 * backlog's glow and a scrim; the sheet is glass (rgba(18,18,24,.7) + blur 30
 * saturate 1.5), top-anchored at 96px, with the search field, the kind tabs,
 * the results and — pinned at the bottom — "Agregar a", the backlog picker.
 *
 * Portaled to <body> (AGENTS.md: the app shell's content wrapper is a stacking
 * context that would trap a fixed sheet under the dock) and the dock hides
 * while it's open. Adds go to a VISIBLE, changeable target backlog, and the ＋
 * toggles: tap ✓ to remove — a mis-add is undone without leaving.
 */
export function SearchSheet({
  inputRef,
  initialQuery,
  backlogs,
  pinnedBacklogId,
  libraryEmpty,
  onClose,
}: {
  /** Owned by the parent so the tap handler can focus it inside the gesture. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** From ?q= — a search restored after closing an item (re-runs on mount). */
  initialQuery: string;
  backlogs: SearchBacklog[];
  /**
   * From ?to= — the backlog the user came FROM, pre-selected as the add target.
   * Resolved against `backlogs` (the owner's own server-loaded list), so a
   * foreign or stale id simply doesn't match and falls back to the first:
   * no extra query, no enumeration oracle, assertOwnsBacklog still the choke
   * point on the add itself.
   */
  pinnedBacklogId: string | null;
  /** The account has no titles yet — a successful add here is the first ever. */
  libraryEmpty: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const keyboardInset = useKeyboardInset();
  useHideNavDock(true);

  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<SearchTab>("all");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    initialQuery.trim().length >= 2 ? "loading" : "idle",
  );
  // catalogItemId -> the created backlogItem row id, so tapping ✓ can remove it.
  const [added, setAdded] = useState<Record<string, string>>({});
  // catalogItemIds with an add/remove in flight. A Set (not one shared flag) so
  // each row owns its pending state — adding item A never touches B's button.
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  // Session target backlog — shown + changeable so adds aren't a mystery.
  const [options, setOptions] = useState<SearchBacklog[]>(backlogs);
  const [target, setTarget] = useState<Target | null>(() => {
    const pinned =
      (pinnedBacklogId && backlogs.find((b) => b.id === pinnedBacklogId)) ||
      backlogs[0];
    return pinned
      ? { id: pinned.id, name: pinned.name, paletteHex: pinned.paletteHex }
      : null;
  });
  // catalogItemId whose add just failed — the row says so instead of quietly
  // snapping back to ＋, which read as "nothing happened".
  const [failed, setFailed] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<FirstItemCelebration | null>(
    null,
  );
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Once per mount, even if the user undoes the add and re-adds — the sheet is
  // a first-time moment, not a per-add confirmation.
  const celebrated = useRef(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  // Fallback for a mount that didn't come from the search-field tap (the
  // handler focuses inside the gesture, the only path iOS opens a keyboard
  // for) — e.g. a ?buscar=1 arrival. Skipped on a restored search: you came
  // back to READ those results, and a keyboard would cover them.
  useEffect(() => {
    if (initialQuery) return;
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.focus();
    // Only ever on mount — a later re-render must not re-grab focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // iOS scrolls the document to clear the keyboard on its own and (in a
  // standalone PWA) never scrolls back — keep the field row on screen.
  useKeyboardScrollGuard(inputRef, fieldRef);

  // Escape closes, matching every other dismissible surface in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The picker scrolls; make sure the active backlog is in view once the
  // portal exists (on a ?buscar=1 arrival the first render is the SSR null).
  useEffect(() => {
    if (!hydrated) return;
    pickerRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [hydrated]);

  useEffect(() => {
    if (newOpen) newInputRef.current?.focus();
  }, [newOpen]);

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
  }, [query, tab]);

  // Stamp the live query onto THIS history entry before pushing the item, so
  // the item's ✕ (router.back) returns to these same results. Native
  // replaceState is the supported way to sync the URL without a re-render
  // (Next: "Native History API"); router.replace would re-run the page.
  const openItem = (catalogItemId: string) => {
    const q = query.trim();
    if (q) {
      window.history.replaceState(
        null,
        "",
        `/descubrir?q=${encodeURIComponent(q)}`,
      );
    }
    router.push(`/item/${catalogItemId}`);
  };

  // Flip a single row's pending flag, leaving every other row untouched.
  const setRowPending = (id: string, on: boolean) =>
    setPending((p) => {
      const next = new Set(p);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Tap ＋ to add to the target backlog; tap ✓ to remove it again (undo).
  const toggle = async (r: CatalogSearchResult) => {
    const id = r.catalogItemId;
    if (pending.has(id)) return; // ignore repeat taps on THIS row while in flight
    const existingItemId = added[id];
    if (!existingItemId && !target) {
      // No target yet (the user has no backlogs) → create one first.
      setNewOpen(true);
      return;
    }
    setRowPending(id, true);
    setFailed((f) => (f === id ? null : f)); // a retry clears its own error
    try {
      if (existingItemId) {
        await removeMembershipAction(existingItemId);
        setAdded((a) => {
          const next: Record<string, string> = {};
          for (const [k, v] of Object.entries(a)) {
            if (k !== id) next[k] = v;
          }
          return next;
        });
      } else if (target) {
        // Palette is cover-derived + cached on catalog_item; only extract when
        // this title has none yet (the result carries the cached one).
        const needsPalette = !r.paletteHex || r.paletteHex.length === 0;
        const paletteHex =
          needsPalette && r.posterUrl ? await extractPalette(r.posterUrl) : [];
        const res = await addItemAction({
          backlogId: target.id,
          catalogItemId: id,
          paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
        });
        const itemId = "id" in res ? res.id : null;
        if (itemId) {
          setAdded((a) => ({ ...a, [id]: itemId }));
          // First title of the account (the library was empty when this sheet
          // mounted) → the closing sheet, once. A duplicate returns the
          // existing membership id, so re-adding can't re-trigger it: `added`
          // already holds every id this session put in.
          if (libraryEmpty && !celebrated.current) {
            celebrated.current = true;
            setCelebration({
              title: r.title,
              mediaType: r.mediaType,
              year: r.year,
              posterUrl: r.posterUrl,
              paletteHex:
                paletteHex.length > 0 ? paletteHex : (r.paletteHex ?? []),
              backlogId: target.id,
              backlogName: target.name,
            });
          }
        } else {
          setFailed(id);
        }
      }
    } catch {
      // Add/remove failed: don't fake success. The row falls back to its prior
      // state (idle ＋ if it wasn't added), and clearing pending re-enables the
      // tap — a failed add is retryable, never stuck mid-state. Removals stay
      // silent (the row simply keeps its ✓); only a failed ADD gets the line,
      // because that's the one the user was told would be saved.
      if (!existingItemId) setFailed(id);
    } finally {
      setRowPending(id, false);
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
        // A new backlog has no palette yet — the lima-only ADN fallback the
        // shelf list uses, so the glow never goes dark.
        const fresh: SearchBacklog = { id, name, itemCount: 0, paletteHex: ["#D8FF3E"] };
        setOptions((o) => [fresh, ...o]);
        setTarget({ id, name, paletteHex: fresh.paletteHex });
        setNewName("");
        setNewOpen(false);
      }
    } catch {
      // swallow
    } finally {
      setCreating(false);
    }
  };

  const pick = (key: string) => {
    if (key === NEW_KEY) {
      setNewOpen((o) => !o);
      return;
    }
    const b = options.find((o) => o.id === key);
    if (b) {
      setTarget({ id: b.id, name: b.name, paletteHex: b.paletteHex });
      setNewOpen(false);
    }
  };

  const segments: Segment[] = [
    ...options.map((b) => ({ key: b.id, label: b.name })),
    { key: NEW_KEY, label: "+ Nuevo" },
  ];

  if (!hydrated) return null;

  return createPortal(
    <div className="bl-fade-in fixed inset-0 z-50">
      {/* The target backlog's light and a scrim — the page keeps rendering behind. */}
      <PaletteGlow
        hexes={target?.paletteHex ?? []}
        angle={110}
        opacity={0.25}
        blur={90}
        className="inset-0"
      />
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar y agregar título"
        className="absolute inset-x-0 bottom-0 top-24 mx-auto flex max-w-md flex-col gap-[18px] rounded-t-[32px] bg-[rgba(18,18,24,.7)] px-5 pt-3 shadow-[var(--shadow-glass)] backdrop-blur-[30px] backdrop-saturate-[1.5]"
        style={
          keyboardInset > 0 ? { paddingBottom: `${keyboardInset}px` } : undefined
        }
      >
        {/* The handle: a real tap target around the 38×4 bar. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-my-2 flex h-6 items-center self-center px-4"
        >
          <span className="h-1 w-[38px] rounded-full bg-white/20" />
        </button>

        <div
          ref={fieldRef}
          className="flex items-center gap-2.5 rounded-full bg-white/[0.07] px-4 py-3"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden
            className="flex-none text-text-2"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4-4" />
          </svg>
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
            placeholder="Películas, series, álbumes…"
            aria-label="Búsqueda universal"
            enterKeyHint="search"
            // 16px (the mock says 15) on purpose: iOS Safari auto-zooms the
            // page when a focused input is <16px, and this one is focused the
            // moment it mounts. Keep it ≥16px.
            className="min-w-0 flex-1 bg-transparent text-[16px] caret-accent outline-none placeholder:text-text-3"
          />
          <span className="ml-auto max-w-[38%] flex-none truncate font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
            → {target?.name ?? "elige un backlog"}
          </span>
        </div>

        <Segmented
          segments={TABS}
          value={tab}
          onSelect={(k) => setTab(k as SearchTab)}
          ariaLabel="Tipo"
        />

        <div className="bl-scroll -mx-5 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-5">
          {state === "loading" &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3.5">
                <span className="h-16 w-12 flex-none rounded-[9px] bg-white/[0.06]" />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="h-4 w-3/5 rounded-full bg-white/[0.06]" />
                  <span className="h-2.5 w-2/5 rounded-full bg-white/[0.05]" />
                </span>
                <span className="h-[34px] w-[34px] flex-none rounded-full bg-white/[0.06]" />
              </div>
            ))}
          {state === "error" && (
            <p className="py-8 text-center text-sm text-hot">
              Algo falló buscando. Intenta de nuevo.
            </p>
          )}
          {state === "done" && results.length === 0 && (
            <p className="py-8 text-center text-sm text-text-3">
              Nada por aquí. Prueba otro nombre.
            </p>
          )}
          {state !== "loading" &&
            results.map((r) => {
              const isAdded = !!added[r.catalogItemId];
              const busy = pending.has(r.catalogItemId);
              return (
                <div key={r.catalogItemId} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => openItem(r.catalogItemId)}
                      className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                    >
                      <CoverTile
                        posterUrl={r.posterUrl}
                        paletteHex={r.paletteHex}
                        radius="rounded-[9px]"
                        className={`w-12 ${coverAspect(r.mediaType)}`}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="truncate font-serif text-[19px] italic leading-[1.1]">
                          {r.title}
                        </span>
                        <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
                          {searchMeta(r)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(r)}
                      disabled={busy}
                      aria-label={
                        isAdded ? `Quitar ${r.title}` : `Agregar ${r.title}`
                      }
                      aria-pressed={isAdded}
                      className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full transition-colors disabled:opacity-60 ${
                        isAdded
                          ? "bg-accent text-bg"
                          : "bg-[var(--glass-bg)] text-text hover:bg-white/[0.12]"
                      }`}
                    >
                      <StrokeIcon
                        d={isAdded ? ADDED_PATH : PLUS_PATH}
                        size={14}
                        strokeWidth={2.6}
                      />
                    </button>
                  </div>
                  {/* A failed add used to revert in silence, which reads as
                      "nothing happened" — say it didn't save, and that ＋ retries. */}
                  {failed === r.catalogItemId && (
                    <p
                      role="status"
                      className="pl-[62px] font-mono text-[10px] uppercase tracking-[0.12em] text-hot"
                    >
                      No se guardó · toca ＋ para reintentar
                    </p>
                  )}
                </div>
              );
            })}
        </div>

        <div className="mt-auto flex flex-col gap-2.5 pb-[calc(16px+max(14px,env(safe-area-inset-bottom)))]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
            Agregar a
          </span>
          <div ref={pickerRef}>
            <Segmented
              segments={segments}
              value={target?.id ?? null}
              onSelect={pick}
              scrollable
              ariaLabel="Backlog destino"
            />
          </div>
          {newOpen && (
            <form onSubmit={createAndSelect} className="bl-rise-soft flex gap-2">
              <input
                ref={newInputRef}
                value={newName}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={
                  options.length === 0 ? "Tu primer backlog…" : "Nuevo backlog…"
                }
                aria-label="Nombre del backlog"
                className="min-w-0 flex-1 rounded-full bg-white/[0.07] px-4 py-3 text-[16px] caret-accent outline-none transition-colors placeholder:text-text-3 focus:bg-white/[0.1]"
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="flex-none rounded-full bg-accent px-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-bg disabled:opacity-40"
              >
                Crear
              </button>
            </form>
          )}
        </div>
      </div>

      {celebration && (
        <FirstItemSheet
          item={celebration}
          onDismiss={() => setCelebration(null)}
        />
      )}
    </div>,
    document.body,
  );
}

/** "Cine · 2023 · Wim Wenders" / "Álbum · Charli xcx" — the mock's search meta. */
function searchMeta(r: CatalogSearchResult): string {
  if (r.mediaType === "album") return workMeta(r);
  return [workMeta(r), r.byline].filter(Boolean).join(" · ");
}
