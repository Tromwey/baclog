"use client";

import { useEffect, useRef, useState } from "react";
import { CoverTile, coverAspect } from "@/components/cover-tile";
import { CHECK_PATH, PLUS_PATH } from "@/components/glyph-paths";
import { StrokeIcon } from "@/components/ui";
import type { OnboardingPoolItem } from "@/modules/backlog/onboarding-pool";
import {
  MEDIA_TYPE_TITLE,
  type CatalogSearchResult,
} from "@/modules/catalog/types";

/**
 * "Buscar otra cosa" — the inline catalog search of the picks step (Revamp
 * UI, 2026-09-03; mock rows: 48px cover · serif title · mono meta · a 34px
 * glass "+" that turns into the accent check once picked). Same endpoint and
 * debounce as Descubrir's search; every kind at once (no pills here).
 *
 * The "+" TOGGLES: a picked row taps back off, so a mis-add is undone in
 * place. Replaces the grid while open; the step's footer stays.
 */
export function PickSearch({
  pickedIds,
  onChoose,
}: {
  pickedIds: ReadonlySet<string>;
  onChoose: (item: OnboardingPoolItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(q)}&tab=all`,
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
  }, [query]);

  return (
    <div className="relative flex flex-col px-5 pt-[22px]">
      <div className="flex h-[46px] items-center rounded-full bg-[var(--glass-bg)] px-[18px]">
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
          aria-label="Buscar en el catálogo"
          // ≥16px on purpose: iOS Safari auto-zooms a focused input below 16px.
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-text-3"
        />
      </div>

      <div className="mt-2 flex flex-col">
        {state === "loading" &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="my-1 h-16 animate-pulse rounded-[12px] bg-surface-1"
            />
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
        {state === "done" &&
          results.map((r) => {
            const isPicked = pickedIds.has(r.catalogItemId);
            const meta = [MEDIA_TYPE_TITLE[r.mediaType], r.year, r.byline]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={r.catalogItemId}
                className="flex items-center gap-3 py-2"
              >
                <CoverTile
                  posterUrl={r.posterUrl}
                  paletteHex={r.paletteHex}
                  radius="rounded-[8px]"
                  className={`h-12 ${coverAspect(r.mediaType)}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-[19px] italic leading-[1.1] text-text">
                    {r.title}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
                    {meta}
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={isPicked}
                  aria-label={
                    isPicked ? `Quitar ${r.title}` : `Elegir ${r.title}`
                  }
                  onClick={() => onChoose(toPick(r))}
                  className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full transition-colors ${
                    isPicked
                      ? "bg-accent text-bg"
                      : "bg-[var(--glass-bg)] text-text hover:bg-white/[0.12]"
                  }`}
                >
                  <StrokeIcon
                    d={isPicked ? CHECK_PATH : PLUS_PATH}
                    size={16}
                    strokeWidth={isPicked ? 3.2 : 2.4}
                  />
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function toPick(r: CatalogSearchResult): OnboardingPoolItem {
  return {
    catalogItemId: r.catalogItemId,
    title: r.title,
    mediaType: r.mediaType,
    posterUrl: r.posterUrl,
    paletteHex: r.paletteHex,
    year: r.year,
    byline: r.byline,
  };
}
