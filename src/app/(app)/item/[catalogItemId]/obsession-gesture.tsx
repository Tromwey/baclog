"use client";

import { useState, useTransition } from "react";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { AuraField } from "@/components/ui";
import { useItemReaction } from "./reaction-state";

/**
 * "Me obsesiona" — the ONLY reaction shown prominently on the detail
 * (HANDOFF §2); me gusta / no me gusta live in the ⋯ menu. Tap toggles:
 * inactive → obsessed, active → clear. Active gets the hot AuraField from the
 * mock (#p3) — the aura is the only light (HANDOFF §7: no glow/halo/pulse).
 */

/** Fixed hot palette for the active aura (mock #p3) — never cover-derived. */
const HOT_AURA = ["#FF2D55", "#7A1B4A", "#C7462F", "#FF7A98"];

export function ObsessionGesture() {
  const { obsessed, mutateObsessed } = useItemReaction();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = obsessed;

  function toggle() {
    setError(null);
    // Independent of the verdict now (F3.7): toggling obsession never touches
    // me gusta / no me gusta. Optimistic set + persist + safe revert live in
    // the shared context.
    startTransition(async () => {
      const ok = await mutateObsessed(!active);
      if (!ok) setError("No se pudo guardar tu reacción.");
    });
  }

  return (
    <div>
      {active ? (
        <button
          onClick={toggle}
          disabled={pending}
          aria-pressed
          aria-label="Me obsesiona — activo. Toca para quitar la marca"
          className="relative flex w-full items-center gap-4 overflow-hidden rounded-[18px] bg-[#150710] px-[18px] py-4 text-left transition-transform active:scale-[0.99] disabled:opacity-70"
        >
          <AuraField variant="gesture" colors={HOT_AURA} seed={13} />
          {/* Vignette so the label stays legible over the aura (mock #p3). */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(130% 110% at 22% 10%, rgba(0,0,0,0) 34%, rgba(21,7,16,.5) 100%)",
            }}
          />
          <span className="relative flex h-11 w-11 flex-none items-center justify-center">
            {/* Static DARK drop-shadow = legibility over the aura (mock #p3);
                never a colored glow (HANDOFF §7). */}
            <svg
              width="34"
              height="34"
              viewBox={GLYPH_VIEWBOX}
              fill="#fff"
              style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,.5))" }}
              aria-hidden
            >
              <path d={FLAME_PATH} />
            </svg>
          </span>
          {/* Mock #p3: active keeps the SAME copy — the white ✓ badge alone
              signals the state (the aria-label above carries the toggle). */}
          <span className="relative min-w-0 flex-1">
            <span className="block font-display text-[19px] font-extrabold tracking-[-0.01em] text-white">
              Me obsesiona
            </span>
            <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-[0.08em] text-[#FFC2D0]">
              Márcalo cuando algo te consuma
            </span>
          </span>
          <span className="relative flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-white text-hot">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 12l5 5 11-12"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      ) : (
        <button
          onClick={toggle}
          disabled={pending}
          aria-pressed={false}
          className="flex w-full items-center gap-4 rounded-[18px] bg-surface-1 px-[18px] py-4 text-left transition-colors hover:bg-surface-2 active:scale-[0.99] disabled:opacity-70"
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center text-text-2">
            <svg
              width="30"
              height="30"
              viewBox={GLYPH_VIEWBOX}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={FLAME_PATH} />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[19px] font-extrabold tracking-[-0.01em] text-text">
              Me obsesiona
            </span>
            <span className="mt-0.5 block font-mono text-[8.5px] uppercase tracking-[0.08em] text-text-3">
              Márcalo cuando algo te consuma
            </span>
          </span>
        </button>
      )}
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}
