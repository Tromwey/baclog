"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { completePicksAction } from "@/app/actions/onboarding-actions";
import { Cover, GLASS_BUTTON } from "@/components/kura/components";
import { BG, tintEnds } from "@/components/kura/tint";
import { extractPalette } from "@/modules/cards/palette";
import type {
  OnboardingPoolItem,
  OnboardingPoolPage,
} from "@/modules/backlog/onboarding-pool";
import {
  CLEAR_PATH,
  FailLine,
  FlowCta,
  PinnedFooter,
  SEARCH_PATH,
  SEED_STEPS,
  StepMark,
  Stroke,
} from "./chrome";
import { PickSearch } from "./pick-search";
import { SKELETON_PULSE } from "@/components/kura/components";

const MAX_PICKS = 3;
/** Skeleton tiles per column while the next page loads. */
const SKELETONS_PER_COLUMN = 2;
const COLUMNS = 3;

/**
 * Kura · 32a "elige 3 que te obsesionan." (flujos-v2, flujo 01).
 *
 * The grid is the curated pool (`/api/onboarding/pool`): page 1 arrives
 * server-rendered, the rest load as the user scrolls — a sentinel under the
 * columns asks for the next page (observed against THIS scroller, so the
 * 600px look-ahead actually applies) and appends it, deduped on
 * catalogItemId. A failed page shows the triangle + Reintentar, never an
 * error screen.
 *
 * Masonry: the mock is `column-count: 3`, but CSS columns re-balance on every
 * append, so an endless grid would shuffle tiles between columns under the
 * user's thumb. The columns are filled in JS instead — each tile drops into
 * the currently shortest column by its native aspect (2:3 or 1:1) — which
 * reads the same and stays put as pages arrive.
 *
 * Selection is the mock's: a 26 `--glass-art` disc with the pick's NUMBER,
 * the picked tile lifts to 1.04, and once three are picked the rest drop to
 * .35 and ignore taps (un-pick one to change your mind). The screen's
 * background takes the FIRST pick's tint (`obBg`: 180°, the top end of its
 * tint to --bg at 55 %) — flat, no glow. A pool title with no cached palette
 * gets one extracted on-device the moment it's picked, and that same palette
 * rides along on Continue (written to the shared cache only where empty).
 */
export function PicksStep({
  initialPool,
  initialNextPage,
  onDone,
}: {
  initialPool: OnboardingPoolItem[];
  initialNextPage: number | null;
  onDone: () => void;
}) {
  const [grid, setGrid] = useState<OnboardingPoolItem[]>(initialPool);
  const [nextPage, setNextPage] = useState<number | null>(initialNextPage);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [picked, setPicked] = useState<OnboardingPoolItem[]>([]);
  // On-device palettes for picks the catalog had none for, by catalogItemId.
  const [palettes, setPalettes] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // The observer can fire twice before React commits `loading`; a ref gates.
  const inFlight = useRef(false);
  const extracting = useRef(new Set<string>());

  const needle = query.trim();
  const searching = needle.length >= 2;
  const pickedIds = picked.map((p) => p.catalogItemId);
  const full = picked.length >= MAX_PICKS;

  const loadMore = useCallback(async () => {
    if (nextPage === null || inFlight.current) return;
    inFlight.current = true;
    setLoadState("loading");
    try {
      const res = await fetch(`/api/onboarding/pool?page=${nextPage}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as OnboardingPoolPage;
      setGrid((g) => {
        const have = new Set(g.map((x) => x.catalogItemId));
        return [...g, ...page.items.filter((x) => !have.has(x.catalogItemId))];
      });
      // An empty page means the sources ran dry: stop asking.
      setNextPage(page.items.length === 0 ? null : page.nextPage);
      setLoadState("idle");
    } catch {
      setLoadState("error");
    } finally {
      inFlight.current = false;
    }
  }, [nextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollerRef.current;
    if (!el || !root || searching || nextPage === null || loadState !== "idle")
      return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      // Ask for the next page while the last row is still a screen away.
      { root, rootMargin: "0px 0px 600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [searching, nextPage, loadState, loadMore]);

  function paletteOf(item: OnboardingPoolItem): string[] {
    return item.paletteHex && item.paletteHex.length > 0
      ? item.paletteHex
      : (palettes[item.catalogItemId] ?? []);
  }

  function ensurePalette(item: OnboardingPoolItem) {
    const id = item.catalogItemId;
    if ((item.paletteHex?.length ?? 0) > 0 || !item.posterUrl) return;
    if (palettes[id] || extracting.current.has(id)) return;
    extracting.current.add(id);
    extractPalette(item.posterUrl)
      .then((hex) => {
        if (hex.length > 0) setPalettes((p) => ({ ...p, [id]: hex }));
      })
      .catch(() => {
        // CORS / decode failure: this pick simply carries no colour.
      })
      .finally(() => extracting.current.delete(id));
  }

  function toggle(item: OnboardingPoolItem) {
    setFailed(false);
    const isPicked = picked.some((p) => p.catalogItemId === item.catalogItemId);
    if (isPicked) {
      setPicked((prev) =>
        prev.filter((p) => p.catalogItemId !== item.catalogItemId),
      );
      return;
    }
    if (full) return;
    setPicked((prev) => [...prev, item]);
    ensurePalette(item);
  }

  // From the search: pick it AND make sure the grid shows it, up top.
  function choose(item: OnboardingPoolItem) {
    const wasPicked = pickedIds.includes(item.catalogItemId);
    if (!wasPicked && full) return;
    toggle(item);
    if (wasPicked) return;
    setGrid((g) =>
      g.some((x) => x.catalogItemId === item.catalogItemId) ? g : [item, ...g],
    );
  }

  async function submit() {
    if (picked.length !== MAX_PICKS || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const payload = await Promise.all(
        picked.map(async (p) => {
          let hex = paletteOf(p);
          if (hex.length === 0 && p.posterUrl) {
            try {
              hex = await extractPalette(p.posterUrl);
            } catch {
              hex = [];
            }
          }
          return {
            catalogItemId: p.catalogItemId,
            paletteHex: hex.length > 0 ? hex : undefined,
          };
        }),
      );
      const res = await completePicksAction(payload);
      if ("backlogId" in res && res.backlogId) {
        onDone();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // Tiles into the shortest column by native aspect (height per unit width:
  // 1.5 for a 2:3 poster, 1 for an album; the 12px gap is ~0.1 of a column).
  const columns = useMemo(() => {
    const cols: OnboardingPoolItem[][] = Array.from({ length: COLUMNS }, () => []);
    const heights = new Array<number>(COLUMNS).fill(0);
    for (const item of grid) {
      let shortest = 0;
      for (let c = 1; c < COLUMNS; c++) {
        if (heights[c] < heights[shortest] - 0.01) shortest = c;
      }
      cols[shortest].push(item);
      heights[shortest] += (item.mediaType === "album" ? 1 : 1.5) + 0.1;
    }
    return cols;
  }, [grid]);

  const firstHexes = picked[0] ? paletteOf(picked[0]) : [];
  const tint =
    firstHexes.length > 0
      ? `linear-gradient(180deg, ${tintEnds(firstHexes)[0]} 0%, ${BG} 55%)`
      : null;

  const left = MAX_PICKS - picked.length;

  return (
    <main className="relative isolate h-dvh overflow-hidden bg-bg text-text">
      {/* The first pick's tint. Gradients don't interpolate, so the layer
          fades in/out (240 ms, the system's tint timing) instead. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-[240ms]"
        style={{ background: tint ?? "transparent", opacity: tint ? 1 : 0 }}
      />

      <div
        ref={scrollerRef}
        className="bl-scroll relative h-full overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-[calc(150px+env(safe-area-inset-bottom))] pt-[calc(72px+env(safe-area-inset-top))]">
          <StepMark n={1} of={SEED_STEPS} />
          <h1 className="font-brand text-[32px] font-normal leading-[1.08] text-text text-balance">
            elige 3 que te obsesionan.
          </h1>
          <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
            Las tres tiñen tu perfil. Con las tres encontramos a tu gente.
          </p>

          <label className="flex h-12 cursor-text items-center gap-2.5 rounded-full bg-[var(--glass-bg)] px-4 text-text-2 transition-colors focus-within:bg-white/[0.11]">
            <Stroke d={SEARCH_PATH} width={2} />
            <span className="sr-only">Buscar en el catálogo</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar películas, series o música"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
              // ≥16px on purpose: iOS Safari zooms a focused input below 16px.
              className="min-w-0 flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-text-2 [&::-webkit-search-cancel-button]:hidden"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Borrar búsqueda"
                className="-mr-1.5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-text-2 bl-press-sm hover:text-text"
              >
                <Stroke d={CLEAR_PATH} size={16} />
              </button>
            )}
          </label>

          {searching ? (
            <PickSearch
              query={needle}
              picked={pickedIds}
              full={full}
              onChoose={choose}
            />
          ) : (
            <>
              <div
                role="group"
                aria-label="Elige 3"
                className="flex items-start gap-3 pt-1"
              >
                {columns.map((col, c) => (
                  <div key={c} className="flex min-w-0 flex-1 flex-col gap-3">
                    {col.map((item) => {
                      const index = pickedIds.indexOf(item.catalogItemId);
                      const sel = index >= 0;
                      const dim = !sel && full;
                      return (
                        <button
                          key={item.catalogItemId}
                          type="button"
                          aria-pressed={sel}
                          aria-disabled={dim || undefined}
                          aria-label={
                            sel ? `${item.title}, elegida ${index + 1}` : item.title
                          }
                          onClick={() => toggle(item)}
                          className={`relative block w-full transition-[opacity,scale] duration-[260ms] ease-[cubic-bezier(.2,.9,.3,1.4)] ${
                            dim ? "opacity-35" : "opacity-100"
                          } ${sel ? "motion-safe:scale-[1.04]" : ""}`}
                        >
                          <Cover
                            posterUrl={item.posterUrl}
                            paletteHex={item.paletteHex}
                            mediaType={item.mediaType}
                            radius="rounded-[var(--r-cover-s)]"
                            className="w-full"
                          />
                          {sel && (
                            <span className="absolute left-1.5 top-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-glass-art font-mono text-[12px] text-text backdrop-blur-[14px]">
                              {index + 1}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {loadState === "loading" &&
                      Array.from({ length: SKELETONS_PER_COLUMN }).map((_, i) => (
                        <span
                          key={`skeleton-${i}`}
                          aria-hidden
                          className={`block aspect-[2/3] w-full rounded-[var(--r-cover-s)] bg-surface-1 ${SKELETON_PULSE}`}
                        />
                      ))}
                  </div>
                ))}
              </div>

              {grid.length === 0 && loadState !== "loading" && (
                <p className="py-6 text-center text-[15px] leading-[1.5] text-text-2">
                  No cargaron sugerencias. Busca las tuyas arriba.
                </p>
              )}

              {loadState === "error" && (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <FailLine>No cargaron más títulos.</FailLine>
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className={GLASS_BUTTON}
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {/* The sentinel: 1px tall, right under the columns. */}
              {nextPage !== null && (
                <div ref={sentinelRef} aria-hidden className="h-px w-full" />
              )}
            </>
          )}
        </div>
      </div>

      <PinnedFooter>
        {failed && (
          <FailLine>No se guardaron tus tres. Toca Continuar de nuevo.</FailLine>
        )}
        <FlowCta ready={full} busy={busy} onClick={submit}>
          {busy ? "Guardando…" : full ? "Continuar" : `Elige ${left} más`}
        </FlowCta>
      </PinnedFooter>
    </main>
  );
}
