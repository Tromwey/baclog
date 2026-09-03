"use client";

import { useState } from "react";
import { completePicksAction } from "@/app/actions/onboarding-actions";
import { CoverTile } from "@/components/cover-tile";
import { CHECK_PATH } from "@/components/glyph-paths";
import { Button, StrokeIcon, mixHexes } from "@/components/ui";
import { extractPalette } from "@/modules/cards/palette";
import type { OnboardingPoolItem } from "@/modules/backlog/onboarding-pool";
import { CTA_CLASS, GhostButton, OnboardingShell } from "./chrome";
import { PickSearch } from "./pick-search";

/** How many the grid shows, and how many can be picked. */
const GRID_SIZE = 9;
const MAX_PICKS = 3;

/**
 * Step 2 · "Elige tres cosas que te obsesionan." (Revamp UI, 2026-09-03).
 *
 * Nine covers from the pool; tapping toggles a pick, and a fourth pick
 * REPLACES THE OLDEST one (first in, first out) rather than being ignored —
 * an ignored tap reads as a dead tile. "Buscar otra cosa" swaps the grid for
 * an inline catalog search; a searched title joins the picks the same way
 * and is PREPENDED to the grid (dropping the last unpicked tile) so it's
 * visible when the search closes.
 *
 * The glow is the mock's `onboardGlow`: the mix of the PICKED titles' palettes
 * — the palette the account is building — and the pool's mix until the first
 * pick. Palettes still missing are extracted on-device on Continue, exactly
 * like Descubrir's add (a failed extraction is skipped, never blocking).
 */
export function PicksStep({
  pool,
  onDone,
}: {
  pool: OnboardingPoolItem[];
  onDone: (backlogId: string) => void;
}) {
  const [grid, setGrid] = useState<OnboardingPoolItem[]>(() =>
    pool.slice(0, GRID_SIZE),
  );
  // Ordered oldest → newest, so `slice(-MAX_PICKS)` drops the oldest.
  const [picked, setPicked] = useState<OnboardingPoolItem[]>([]);
  // A young catalog with nothing to show opens straight into search.
  const [searchOpen, setSearchOpen] = useState(pool.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const pickedIds = new Set(picked.map((p) => p.catalogItemId));

  function toggle(item: OnboardingPoolItem) {
    setError(false);
    setPicked((prev) =>
      prev.some((p) => p.catalogItemId === item.catalogItemId)
        ? prev.filter((p) => p.catalogItemId !== item.catalogItemId)
        : [...prev, item].slice(-MAX_PICKS),
    );
  }

  // From the search: pick it AND make sure the grid shows it.
  function choose(item: OnboardingPoolItem) {
    const already = pickedIds.has(item.catalogItemId);
    toggle(item);
    if (already) return;
    setGrid((g) => {
      if (g.some((x) => x.catalogItemId === item.catalogItemId)) return g;
      const next = [item, ...g];
      if (next.length > GRID_SIZE) {
        // Drop the LAST tile that isn't picked (never a pick — it'd vanish).
        for (let i = next.length - 1; i > 0; i--) {
          if (!pickedIds.has(next[i].catalogItemId)) {
            next.splice(i, 1);
            break;
          }
        }
      }
      return next.slice(0, GRID_SIZE);
    });
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
    (picked.length > 0 ? picked : grid).map((p) => p.paletteHex ?? []),
  );

  return (
    <OnboardingShell
      step={2}
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
                      <StrokeIcon d={CHECK_PATH} size={12} strokeWidth={3.2} />
                    </span>
                  )}
                </CoverTile>
              </button>
            );
          })}
        </div>
      )}
    </OnboardingShell>
  );
}
