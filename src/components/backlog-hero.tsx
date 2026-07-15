import type { ReactNode } from "react";
import { AuraField, EMPTY_SHELF_AURA } from "@/components/ui";
import { plural } from "@/lib/plural";

/**
 * BacklogHero — the shared hero for the two backlog-detail twins (B
 * disciplinada): the in-app zoom view (BacklogZoomView) and the public page
 * (u/[username]/[backlogId]). Extracted so the hero CAN'T drift between them —
 * identical ADN aura, title, vibe line and meta on both. The two surfaces keep
 * their own row density below the hero; only the hero is unified.
 *
 * Presentational and server-safe (no hooks) — `controls` is the top-bar slot
 * each surface fills with its own chrome (private: back + ⋯ menu; public: the
 * ‹ @username link). Renders a fragment (absolute aura + relative content), so
 * the caller's `relative max-w-md` container is the aura's positioning context
 * and the hero light bleeds down behind the first rows (mock #p2).
 */
export function BacklogHero({
  name,
  vibe,
  itemCount,
  year,
  palette,
  seed,
  controls,
  zoom = false,
}: {
  name: string;
  vibe: string | null;
  itemCount: number;
  /** Backlog creation year. Public-safe (the page itself is already public). */
  year: number;
  /** The backlog's ADN (dominant hexes). Ignored while the backlog is empty. */
  palette: string[];
  /** Deterministic aura seed (shelfSeed(backlogId)) — same as the shelf card. */
  seed: number;
  /** Top-bar slot: private = back + ⋯; public = ‹ @username. */
  controls: ReactNode;
  /** Intercepted-overlay bloom (private overlay twin only): staggers the content
   *  in + fades the aura up. No-op on the plain page and the public surface. */
  zoom?: boolean;
}) {
  const hasItems = itemCount > 0;
  const content = zoom ? "bl-zoom-content" : "";

  return (
    <>
      {/* Hero light. Sin aura hasta el primer ítem (HANDOFF §5) — AuraField
          would fall back to lima on empty colors, so an empty backlog gets the
          neutral EMPTY_SHELF_AURA glow instead (#p7). Same height/opacity/
          gradient/mask on both surfaces so the hero reads as one product. */}
      <div
        className={`absolute inset-x-0 top-0 overflow-hidden ${hasItems ? "h-[330px]" : "h-[300px]"}`}
      >
        {hasItems ? (
          <div className={`absolute inset-0 ${zoom ? "bl-zoom-aura" : ""}`}>
            <AuraField variant="ambient" colors={palette} seed={seed} />
          </div>
        ) : (
          <AuraField layers={[EMPTY_SHELF_AURA]} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: hasItems
              ? "linear-gradient(180deg, rgba(11,11,13,0.15) 0%, rgba(11,11,13,0.1) 45%, #0B0B0D 96%)"
              : "linear-gradient(180deg, rgba(11,11,13,0.18) 0%, rgba(11,11,13,0.12) 45%, #0B0B0D 96%)",
          }}
        />
      </div>

      {/* top bar */}
      <div
        className={`relative flex items-center justify-between px-4 pt-[calc(24px+env(safe-area-inset-top))] ${content}`}
      >
        {controls}
      </div>

      {/* hero text */}
      <div className={`relative px-5 pt-[22px] ${content}`}>
        <h1
          className={`font-display font-extrabold leading-none tracking-[-0.025em] [text-shadow:0_2px_20px_rgba(0,0,0,0.5)] ${hasItems ? "mt-[5px] text-[40px]" : "text-[38px]"}`}
        >
          {name}
        </h1>
        {vibe && (
          <p className="mt-2 max-w-[22ch] font-serif text-lg italic leading-[1.15] [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
            {vibe}
          </p>
        )}
        <p
          className={`font-mono text-[10px] uppercase tracking-[0.1em] text-text-2 ${hasItems ? "mt-2" : "mt-2.5"}`}
        >
          {itemCount} {plural(itemCount, "ítem", "ítems")}
          {hasItems ? ` · ${year}` : " · aún sin aura"}
        </p>
      </div>
    </>
  );
}
