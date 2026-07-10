"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, Search as SearchIcon } from "lucide-react";
import {
  addItemAction,
  removeMembershipAction,
} from "@/app/actions/backlog-item-actions";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import { extractPalette } from "@/modules/cards/palette";
import type { DiscoveryBacklog } from "@/app/(app)/item/[catalogItemId]/cross-media-discovery";
import {
  MEDIA_TYPES,
  MEDIA_TYPE_LABEL,
  type CatalogSearchResult,
  type MediaType,
  type SearchTab,
} from "@/modules/catalog/types";
import { AddButton } from "./add-button";
import { Pills } from "./pills";

type Target = { id: string; name: string };

/**
 * The "Buscar" path of Descubrir. Adds go to a VISIBLE, changeable target
 * backlog (no more silent "default" when the user has several), and the ＋
 * toggles: tap again to remove — you can undo a mis-add without leaving.
 */
export function SearchPanel({
  selected,
  onToggle,
  fromRect,
  backlogs,
  onBack,
}: {
  selected: Record<MediaType, boolean>;
  onToggle: (t: MediaType) => void;
  /** The Buscar button's rect at tap time — the bar FLIPs up from here. */
  fromRect: DOMRect | null;
  backlogs: DiscoveryBacklog[];
  onBack: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  // catalogItemId -> the created backlogItem row id, so tapping ✓ can remove it.
  const [added, setAdded] = useState<Record<string, string>>({});
  // catalogItemIds with an add/remove in flight. A Set (not one shared flag) so
  // each row owns its pending state — adding item A never touches B's button.
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  // Session target backlog — shown + changeable so adds aren't a mystery.
  const [options, setOptions] = useState<DiscoveryBacklog[]>(backlogs);
  const [target, setTarget] = useState<Target | null>(
    backlogs[0] ? { id: backlogs[0].id, name: backlogs[0].name } : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // FLIP: start the search bar at the Buscar button's position/size, then let
  // it animate up into place — it rises "with" the native keyboard.
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el || !fromRect) return;
    const to = el.getBoundingClientRect();
    const sx = to.width ? fromRect.width / to.width : 1;
    const sy = to.height ? fromRect.height / to.height : 1;
    el.style.transformOrigin = "top left";
    el.style.transform = `translate(${fromRect.left - to.left}px, ${fromRect.top - to.top}px) scale(${sx}, ${sy})`;
    el.style.opacity = "0.5";
    void el.offsetWidth; // reflow so the start frame commits
    el.style.transition =
      "transform 0.42s cubic-bezier(0.7, 0, 0.2, 1), opacity 0.32s ease";
    el.style.transform = "translate(0px, 0px) scale(1, 1)";
    el.style.opacity = "1";
    const clear = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.transformOrigin = "";
    };
    el.addEventListener("transitionend", clear, { once: true });
    return () => el.removeEventListener("transitionend", clear);
  }, [fromRect]);

  const active = MEDIA_TYPES.filter((t) => selected[t]);
  // One type selected → search just that; 0 or 2+ → "all" and filter client-side.
  const tab: SearchTab = active.length === 1 ? active[0] : "all";

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

  // 0 selected = no filter (avoids a dead-end); otherwise keep only chosen types.
  const visible =
    active.length === 0
      ? results
      : results.filter((r) => selected[r.mediaType]);

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
      // No target chosen yet (e.g. user has no backlogs) → pick/create one first.
      setPickerOpen(true);
      return;
    }
    setRowPending(id, true);
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
        }
        // duplicate/invalid → leave unmarked (it's already in the backlog)
      }
    } catch {
      // Add/remove failed: don't fake success. The row falls back to its prior
      // state (idle ＋ if it wasn't added), and clearing pending re-enables the
      // tap — a failed add is retryable, never stuck mid-state.
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
        setOptions((o) => [{ id, name, itemCount: 0 }, ...o]);
        setTarget({ id, name });
        setNewName("");
        setPickerOpen(false);
      }
    } catch {
      // swallow
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative z-10 flex min-h-dvh flex-col px-4 pb-dock-clearance pt-[calc(48px+env(safe-area-inset-top))]">
      <div ref={rowRef} className="flex items-center gap-2.5 will-change-transform">
        <button
          onClick={onBack}
          aria-label="Volver"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-text transition-colors hover:bg-surface-3"
        >
          <ChevronLeft size={19} />
        </button>
        <div className="flex h-[42px] flex-1 items-center gap-2.5 rounded-[26px] bg-surface-3 px-3.5">
          <SearchIcon size={17} className="shrink-0 text-text-2" />
          <input
            type="search"
            autoFocus
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
            placeholder="Busca películas, series, álbumes…"
            aria-label="Búsqueda universal"
            // 16px (not 15) on purpose: iOS Safari auto-zooms the page when a
            // focused input is <16px, and this one has autoFocus — the zoom
            // fired on mount and overflowed the viewport. Keep it ≥16px.
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-text-3"
          />
        </div>
      </div>

      <div className="mt-3.5">
        <Pills selected={selected} onToggle={onToggle} />
      </div>

      {/* Target backlog — visible + changeable, so adds go somewhere you chose. */}
      <button
        onClick={() => setPickerOpen(true)}
        className="mt-3 inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-surface-2 py-1.5 pl-3.5 pr-3 text-[12.5px] transition-colors hover:bg-surface-3"
      >
        <span className="shrink-0 text-text-3">Agregando a</span>
        <span className="truncate font-semibold text-accent">
          {target?.name ?? "elige un backlog"}
        </span>
        <ChevronDown size={14} className="shrink-0 text-text-3" />
      </button>

      <div className="mt-4 flex-1 space-y-1">
        {state === "loading" &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-1" />
          ))}
        {state === "error" && (
          <p className="py-8 text-center text-sm text-hot">
            Algo falló buscando. Intenta de nuevo.
          </p>
        )}
        {state === "done" && visible.length === 0 && (
          <p className="py-8 text-center text-sm text-text-3">
            Nada por aquí. Prueba otro nombre.
          </p>
        )}
        {visible.map((r) => (
          <div
            key={r.catalogItemId}
            onClick={() => router.push(`/item/${r.catalogItemId}`)}
            className="flex cursor-pointer items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-surface-1"
          >
            {r.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
              <img
                src={r.posterUrl}
                alt=""
                className="h-16 w-12 shrink-0 rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-surface-2 text-lg text-text-3">
                {r.mediaType === "album" ? "♫" : "▶"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.title}</p>
              <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.06em] text-text-2">
                {[MEDIA_TYPE_LABEL[r.mediaType], r.year, r.byline]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <AddButton
              added={!!added[r.catalogItemId]}
              busy={pending.has(r.catalogItemId)}
              label={r.title}
              onClick={(e) => {
                e.stopPropagation();
                toggle(r);
              }}
            />
          </div>
        ))}
      </div>

      {pickerOpen &&
        createPortal(
          // Portaled to <body> so it escapes the content wrapper and sits above
          // the dock. Centered glass, matching the rest of the M3.5 interface.
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-[2px]"
            onClick={() => setPickerOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bl-rise relative w-full max-w-sm overflow-hidden rounded-[28px] bg-white/[0.07] p-5 shadow-[var(--shadow-card)] backdrop-blur-[28px] backdrop-saturate-[1.25]"
            >
              <div aria-hidden className="bl-grain" />
              <div className="relative">
                <h2 className="font-display text-xl font-bold tracking-[-0.01em]">
                  Agregar a…
                </h2>
                <div className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto">
                  {options.map((b) => {
                    const on = target?.id === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => {
                          setTarget({ id: b.id, name: b.name });
                          setPickerOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors ${
                          on
                            ? "bg-accent-soft text-accent"
                            : "bg-black/25 text-text hover:bg-black/40"
                        }`}
                      >
                        <span className="truncate font-medium">{b.name}</span>
                        {on && <Check size={16} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <form onSubmit={createAndSelect} className="mt-3 flex gap-2">
                  <input
                    value={newName}
                    maxLength={60}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={
                      options.length === 0
                        ? "Tu primer backlog…"
                        : "Nuevo backlog…"
                    }
                    className="min-w-0 flex-1 rounded-2xl bg-black/25 px-4 py-3 outline-none transition-colors placeholder:text-text-3 focus:bg-black/40"
                  />
                  <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    className="shrink-0 rounded-2xl bg-accent px-4 font-semibold text-bg disabled:opacity-40"
                  >
                    Crear
                  </button>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
