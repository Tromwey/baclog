"use client";

import { useEffect, useRef, useState } from "react";
import { PLUS_PATH } from "@/components/glyph-paths";
import { Cover } from "@/components/kura/components";
import type { OnboardingPoolItem } from "@/modules/backlog/onboarding-pool";
import {
  MEDIA_TYPE_TITLE,
  type CatalogSearchResult,
} from "@/modules/catalog/types";
import { FailLine, Stroke } from "./chrome";
import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * The results of 32a's search field (the field itself lives in the step, so
 * it sits where the mock draws it, above the grid). Same endpoint and
 * debounce as Descubrir's search, every kind at once.
 *
 * Kura title rows (80): a small cover (radius 8), the title in Newsreader
 * italic 19, the mono meta, and a 36 glass "+" at the right. A picked row
 * shows its pick NUMBER instead — the same number the grid's disc carries —
 * on the solid fill, and tapping it again un-picks. With three picked, the
 * "+" of the rest dims to .35 like the grid's tiles and does nothing.
 *
 * Results are stored WITH the query they answer, so "loading" is derived
 * (the latest answer is for an older query) instead of set in an effect.
 */
export function PickSearch({
  query,
  picked,
  full,
  onChoose,
}: {
  /** Already trimmed, ≥ 2 characters (the step decides when to mount us). */
  query: string;
  /** Picked ids in pick order — the index + 1 is the number shown. */
  picked: readonly string[];
  full: boolean;
  onChoose: (item: OnboardingPoolItem) => void;
}) {
  const [answer, setAnswer] = useState<{
    q: string;
    results: CatalogSearchResult[] | null;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(query)}&tab=all`,
          { signal: ctl.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: CatalogSearchResult[] };
        setAnswer({ q: query, results: data.results });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setAnswer({ q: query, results: null });
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!answer || answer.q !== query) {
    return (
      <div aria-busy className="flex flex-col">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex min-h-[80px] items-center gap-3.5">
            <span className={`h-16 w-[43px] flex-none rounded-[var(--r-cover-s)] bg-surface-2 ${SKELETON_PULSE}`} />
            <span className={`h-4 w-2/3 rounded-full bg-surface-1 ${SKELETON_PULSE}`} />
          </div>
        ))}
      </div>
    );
  }

  if (answer.results === null) {
    return (
      <FailLine className="py-8">
        No pudimos buscar. Revisa tu conexión y escribe de nuevo.
      </FailLine>
    );
  }

  if (answer.results.length === 0) {
    return (
      <p className="py-8 text-center text-[15px] leading-[1.5] text-text-2">
        Nada con ese nombre. Prueba con otro.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {answer.results.map((r) => {
        const index = picked.indexOf(r.catalogItemId);
        const isPicked = index >= 0;
        const blocked = full && !isPicked;
        const meta = [MEDIA_TYPE_TITLE[r.mediaType], r.year, r.byline]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={r.catalogItemId} className="flex min-h-[80px] items-center gap-3.5">
            <Cover
              posterUrl={r.posterUrl}
              paletteHex={r.paletteHex}
              mediaType={r.mediaType}
              radius="rounded-[var(--r-cover-s)]"
              style={{ height: 64 }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate font-brand text-[19px] italic leading-[1.15] text-text">
                {r.title}
              </span>
              <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
                {meta}
              </span>
            </div>
            <button
              type="button"
              aria-pressed={isPicked}
              disabled={blocked}
              aria-label={isPicked ? `Quitar ${r.title}` : `Elegir ${r.title}`}
              onClick={() => onChoose(toPick(r))}
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-full bl-press-sm disabled:opacity-35 ${
                isPicked
                  ? "bg-text font-mono text-[13px] text-bg"
                  : "bg-[var(--glass-bg)] text-text hover:bg-white/[0.12]"
              }`}
            >
              {isPicked ? index + 1 : <Stroke d={PLUS_PATH} size={16} width={2.4} />}
            </button>
          </li>
        );
      })}
    </ul>
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
