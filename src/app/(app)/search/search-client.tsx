"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CatalogSearchResult, SearchTab } from "@/modules/catalog/types";

const TABS: { id: SearchTab; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "film", label: "Cine" },
  { id: "series", label: "Series" },
  { id: "album", label: "Música" },
];

const TYPE_BADGE: Record<string, string> = {
  film: "FILM",
  series: "SERIE",
  album: "ÁLBUM",
};

export function SearchClient() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const abortRef = useRef<AbortController | null>(null);

  // State transitions live in the event handlers (input/tab onChange);
  // this effect only debounces and fires the fetch.
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

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-neutral-950 px-4 pb-16 pt-6 text-neutral-100">
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
        className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 outline-none focus:border-neutral-400"
        aria-label="Búsqueda universal"
      />

      <div className="mt-3 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (query.trim().length >= 2) setState("loading");
            }}
            className={`rounded-full px-3.5 py-1.5 text-sm ${
              tab === t.id
                ? "bg-neutral-100 font-semibold text-neutral-900"
                : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {state === "loading" &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-neutral-900"
            />
          ))}
        {state === "error" && (
          <p className="py-8 text-center text-sm text-red-400">
            Algo falló buscando. Intenta de nuevo.
          </p>
        )}
        {state === "done" && results.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">
            Nada por aquí. Prueba otro nombre.
          </p>
        )}
        {results.map((r) => (
          <Link
            key={r.catalogItemId}
            href={`/item/${r.catalogItemId}`}
            className="flex items-center gap-3 rounded-xl bg-neutral-900 p-2.5 hover:bg-neutral-800"
          >
            {r.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
              <img
                src={r.posterUrl}
                alt=""
                className="h-16 w-12 rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-16 w-12 items-center justify-center rounded-md bg-neutral-800 text-lg">
                {r.mediaType === "album" ? "♫" : "▶"}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{r.title}</p>
              <p className="truncate text-sm text-neutral-400">
                {[TYPE_BADGE[r.mediaType], r.year, r.byline]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
