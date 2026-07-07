"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { discoverNextRecoAction } from "@/app/actions/crossmedia-actions";
import {
  CrossMediaDiscovery,
  type DiscoveryBacklog,
  type DiscoveryWork,
} from "@/app/(app)/item/[catalogItemId]/cross-media-discovery";
import type { DoubleFeatureData } from "@/modules/cards/types";
import { FeatureAura } from "./feature-aura";

export interface ScreenItem {
  seed: DiscoveryWork;
  reco: DiscoveryWork;
  narrative: DoubleFeatureData["narrative"];
  defaultBacklog: { id: string; name: string };
}

/**
 * F3.5.6 — the /para-ti screen. The cross-media discovery IS the screen (not a
 * card inside one): a minimal top bar over a full-bleed dual aura, one pairing
 * at a time. "Otra conexión" walks the cached feed for free and only generates
 * (spending a metered generation) once the cache is exhausted; × advances too.
 */
export function ParaTiScreen({
  items,
  username,
  backlogs,
  remaining,
  cap,
}: {
  items: ScreenItem[];
  username: string;
  backlogs: DiscoveryBacklog[];
  remaining: number;
  cap: number;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const safeIndex = Math.min(index, items.length - 1);
  const cur = items[safeIndex];

  const another = () => {
    setNotice(null);
    setMenuOpen(false);
    // More cached pairings ahead → advance for free (no generation charged).
    if (safeIndex < items.length - 1) {
      setIndex(safeIndex + 1);
      return;
    }
    if (remaining <= 0) {
      setNotice("Llegaste a tu límite del mes. Volvemos el mes que viene.");
      return;
    }
    start(async () => {
      const { result } = await discoverNextRecoAction();
      if (result === "generated") {
        setIndex(items.length); // clamp lands on the fresh pairing after refresh
        router.refresh();
      } else if (result === "no_more") {
        setNotice("Ya exploramos todo lo que amas. Ama algo nuevo y volvemos.");
      } else if (result === "cap_reached") {
        setNotice("Llegaste a tu límite del mes. Volvemos el mes que viene.");
      } else {
        setNotice("No dimos con una conexión esta vez. Intenta de nuevo.");
      }
    });
  };

  const perSeedBacklogs = backlogs.map(
    (b): DiscoveryBacklog => ({
      ...b,
      isSeedHome: b.id === cur.defaultBacklog.id,
    }),
  );

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      {/* Full-bleed dual aura, re-tinted per current pairing (A top / B bottom) */}
      <FeatureAura
        key={cur.seed.catalogItemId}
        seedPosterUrl={cur.seed.posterUrl}
        recoPosterUrl={cur.reco.posterUrl}
      />

      {/* Top bar — this is the screen's chrome, not a page header */}
      <div className="relative z-30 flex items-center justify-between px-4 pt-4">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line/70 text-lg text-text-2 transition-colors hover:border-text-3"
        >
          ‹
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-2">
          Descubrimiento
        </span>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Más opciones"
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line/70 text-lg text-text-2 transition-colors hover:border-text-3"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-line bg-surface-1 p-2 shadow-[var(--shadow-card)]">
              <button
                onClick={another}
                disabled={pending}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                {pending ? "Buscando…" : "Descubre otra conexión"}
                <span aria-hidden className="text-accent">
                  →
                </span>
              </button>
              <p className="px-3 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
                {remaining} de {cap} descubrimientos este mes
              </p>
            </div>
          )}
        </div>
      </div>

      {/* The discovery itself, full-bleed — the design IS the screen */}
      <div className="relative z-10 flex-1 px-4 pb-6 pt-3">
        <CrossMediaDiscovery
          key={cur.seed.catalogItemId}
          variant="page"
          seed={cur.seed}
          reco={cur.reco}
          narrative={cur.narrative}
          username={username}
          defaultBacklog={cur.defaultBacklog}
          backlogs={perSeedBacklogs}
          onDismiss={another}
        />
        {notice && (
          <p className="mt-4 text-center text-sm text-text-2">{notice}</p>
        )}
      </div>
    </div>
  );
}
