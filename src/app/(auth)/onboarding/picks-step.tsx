"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { completePicksAction } from "@/app/actions/onboarding-actions";
import { CoverTile } from "@/components/cover-tile";
import { CHECK_PATH } from "@/components/glyph-paths";
import { Button, StrokeIcon, mixHexes } from "@/components/ui";
import { extractPalette } from "@/modules/cards/palette";
import type {
  OnboardingPoolItem,
  OnboardingPoolPage,
} from "@/modules/backlog/onboarding-pool";
import { CTA_CLASS, GhostButton, OnboardingShell } from "./chrome";
import { PickSearch } from "./pick-search";

const MAX_PICKS = 3;
/** Skeleton tiles while the next page loads: two rows of the grid. */
const SKELETON_TILES = 6;

/**
 * Step 2 · "Elige tres cosas que te obsesionan." (Revamp UI, 2026-09-03;
 * endless pool 2026-09-03).
 *
 * The grid is the curated pool (`/api/onboarding/pool`): page 1 arrives
 * server-rendered, the rest load as the user scrolls — a sentinel under the
 * last row asks for the next page and appends it (deduped on catalogItemId:
 * a title tagged with two genres can come back under both). Skeleton tiles
 * while a page is in flight; a failed page shows a retry line, never an
 * error screen. Tapping toggles a pick, and a fourth pick REPLACES THE OLDEST
 * one (first in, first out) rather than being ignored — an ignored tap reads
 * as a dead tile. "Buscar otra cosa" swaps the grid for an inline catalog
 * search; a searched title joins the picks the same way and is PREPENDED to
 * the grid so it's visible when the search closes.
 *
 * The glow is the mock's `onboardGlow`: the mix of the PICKED titles' palettes
 * — the palette the account is building — and the first rows' mix until the
 * first pick. Palettes still missing are extracted on-device on Continue,
 * exactly like Descubrir's add (a failed extraction is skipped, never
 * blocking).
 */
export function PicksStep({
  initialPool,
  initialNextPage,
  onDone,
}: {
  initialPool: OnboardingPoolItem[];
  initialNextPage: number | null;
  onDone: (backlogId: string) => void;
}) {
  const [grid, setGrid] = useState<OnboardingPoolItem[]>(initialPool);
  const [nextPage, setNextPage] = useState<number | null>(initialNextPage);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  // Ordered oldest → newest, so `slice(-MAX_PICKS)` drops the oldest.
  const [picked, setPicked] = useState<OnboardingPoolItem[]>([]);
  // A pool that came back empty (providers down) opens straight into search.
  const [searchOpen, setSearchOpen] = useState(initialPool.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // The observer can fire twice before React commits `loading`; a ref gates.
  const inFlight = useRef(false);

  const pickedIds = new Set(picked.map((p) => p.catalogItemId));

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
    if (!el || searchOpen || nextPage === null || loadState !== "idle") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      // Ask for the next page while the last row is still a screen away.
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [searchOpen, nextPage, loadState, loadMore]);

  function toggle(item: OnboardingPoolItem) {
    setError(false);
    setPicked((prev) =>
      prev.some((p) => p.catalogItemId === item.catalogItemId)
        ? prev.filter((p) => p.catalogItemId !== item.catalogItemId)
        : [...prev, item].slice(-MAX_PICKS),
    );
  }

  // From the search: pick it AND make sure the grid shows it, up top.
  function choose(item: OnboardingPoolItem) {
    const already = pickedIds.has(item.catalogItemId);
    toggle(item);
    if (already) return;
    setGrid((g) =>
      g.some((x) => x.catalogItemId === item.catalogItemId) ? g : [item, ...g],
    );
  }

  async function submit() {
    if (picked.length !== MAX_PICKS || busy) return;
    setBusy(true);
    setError(false);
    try {
      // Palette is cover-derived + cached on catalog_item; only extract for
      // titles that have none yet (the pool / result carries the cached one).
      const payload = await Promise.all(
        picked.map(async (p) => {
          let hex = p.paletteHex ?? [];
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
        onDone(res.backlogId);
        return;
      }
      setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const glowHexes = mixHexes(
    (picked.length > 0 ? picked : grid.slice(0, 9)).map(
      (p) => p.paletteHex ?? [],
    ),
  );

  return (
    <OnboardingShell
      step={2}
      layout="scroll"
      glowHexes={glowHexes}
      title="Elige tres cosas que te obsesionan."
      lede="Con eso armamos tu primer backlog y tu paleta."
      footer={
        <>
          {error && (
            <p className="text-center text-sm text-hot">
              No se guardó. Intenta de nuevo.
            </p>
          )}
          <Button
            type="button"
            onClick={submit}
            disabled={busy || picked.length !== MAX_PICKS}
            className={CTA_CLASS}
          >
            {busy
              ? "Guardando…"
              : `Continuar · ${picked.length} de ${MAX_PICKS}`}
          </Button>
          <GhostButton
            onClick={() => setSearchOpen((o) => !o)}
            disabled={busy}
          >
            {searchOpen ? "Volver a la selección" : "Buscar otra cosa"}
          </GhostButton>
        </>
      }
    >
      {searchOpen ? (
        <PickSearch pickedIds={pickedIds} onChoose={choose} />
      ) : (
        <>
          <div
            role="group"
            aria-label="Elige tres"
            className="relative grid grid-cols-3 gap-2.5 px-8 pt-[22px]"
          >
            {grid.map((item) => {
              const isPicked = pickedIds.has(item.catalogItemId);
              return (
                <button
                  key={item.catalogItemId}
                  type="button"
                  aria-pressed={isPicked}
                  aria-label={item.title}
                  onClick={() => toggle(item)}
                  className={`relative block w-full rounded-[14px] outline outline-2 outline-offset-2 transition-[outline-color] duration-[var(--dur-fast)] ${
                    isPicked ? "outline-accent" : "outline-transparent"
                  }`}
                >
                  <CoverTile
                    posterUrl={item.posterUrl}
                    paletteHex={item.paletteHex}
                    title={item.title}
                    radius="rounded-[14px]"
                    className="aspect-[3/3.6] w-full"
                  >
                    {isPicked && (
                      <span className="absolute right-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent text-bg">
                        <StrokeIcon
                          d={CHECK_PATH}
                          size={12}
                          strokeWidth={3.2}
                        />
                      </span>
                    )}
                  </CoverTile>
                </button>
              );
            })}
            {loadState === "loading" &&
              Array.from({ length: SKELETON_TILES }).map((_, i) => (
                <span
                  key={`skeleton-${i}`}
                  aria-hidden
                  className="block aspect-[3/3.6] w-full animate-pulse rounded-[14px] bg-surface-1"
                />
              ))}
          </div>

          {loadState === "error" && (
            <div className="flex flex-col items-center gap-1 px-8 pt-5">
              <p className="text-center text-sm text-text-3">
                No cargaron más títulos.
              </p>
              <GhostButton onClick={() => void loadMore()}>
                Reintentar
              </GhostButton>
            </div>
          )}

          {/* The sentinel: 1px tall, sits right under the last row. */}
          {nextPage !== null && (
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          )}
        </>
      )}
    </OnboardingShell>
  );
}
