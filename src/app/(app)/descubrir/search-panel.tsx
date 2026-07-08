"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Search as SearchIcon } from "lucide-react";
import { addToDefaultBacklogAction } from "@/app/actions/discover-add-actions";
import { extractPalette } from "@/modules/cards/palette";
import {
  MEDIA_TYPES,
  MEDIA_TYPE_LABEL,
  type CatalogSearchResult,
  type MediaType,
  type SearchTab,
} from "@/modules/catalog/types";
import { AddButton } from "./add-button";
import { Pills } from "./pills";

/**
 * The "Buscar" path of Descubrir — the shipped /search behavior (cross-media,
 * type-filterable, debounced) re-housed as a state inside the merged
 * destination, with a native input and an inline one-tap ＋ that adds to the
 * user's default backlog (no seed → addToDefaultBacklogAction).
 */
export function SearchPanel({
  selected,
  onToggle,
  fromRect,
  onBack,
}: {
  selected: Record<MediaType, boolean>;
  onToggle: (t: MediaType) => void;
  /** The Buscar button's rect at tap time — the bar FLIPs up from here. */
  fromRect: DOMRect | null;
  onBack: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [added, setAdded] = useState<Record<string, boolean>>({});
  // Single-flight lock: only one add in flight at a time, so two quick taps on
  // a brand-new user can't both race resolveOrCreateDefaultBacklog and create
  // duplicate "Descubrimientos" backlogs (no unique index on (user_id, name)).
  const [adding, setAdding] = useState(false);
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

  const add = async (r: CatalogSearchResult) => {
    if (added[r.catalogItemId] || adding) return;
    setAdding(true);
    setAdded((a) => ({ ...a, [r.catalogItemId]: true }));
    try {
      const paletteHex = r.posterUrl ? await extractPalette(r.posterUrl) : [];
      const res = await addToDefaultBacklogAction({
        catalogItemId: r.catalogItemId,
        paletteHex: paletteHex.length > 0 ? paletteHex : undefined,
      });
      if ("error" in res) setAdded((a) => ({ ...a, [r.catalogItemId]: false }));
    } catch {
      setAdded((a) => ({ ...a, [r.catalogItemId]: false }));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="relative z-10 flex min-h-dvh flex-col px-4 pb-dock-clearance pt-[calc(48px+env(safe-area-inset-top))]">
      <div ref={rowRef} className="flex items-center gap-2.5 will-change-transform">
        <button
          onClick={onBack}
          aria-label="Volver"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-text transition-colors hover:border-text-3"
        >
          <ChevronLeft size={19} />
        </button>
        <div className="flex h-[42px] flex-1 items-center gap-2.5 rounded-[26px] border border-accent bg-surface-2 px-3.5 shadow-[0_0_0_3px_rgba(216,255,62,0.10)]">
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
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-3"
          />
        </div>
      </div>

      <div className="mt-3.5">
        <Pills selected={selected} onToggle={onToggle} />
      </div>

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
              busy={adding}
              label={r.title}
              onClick={(e) => {
                e.stopPropagation();
                add(r);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
