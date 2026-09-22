import type { ReactNode } from "react";
import { plural } from "@/lib/plural";

/**
 * BacklogHero — the shared hero for the two backlog-detail twins (B
 * disciplinada): the in-app zoom view (BacklogZoomView) and the public page
 * (u/[username]/[backlogId]). Extracted so the hero CAN'T drift between them —
 * identical title, vibe line and meta on both. The two surfaces keep
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
  controls,
  zoom = false,
}: {
  name: string;
  vibe: string | null;
  itemCount: number;
  /** Backlog creation year. Public-safe (the page itself is already public). */
  year: number;
  /** Top-bar slot: private = back + ⋯; public = ‹ @username. */
  controls: ReactNode;
  /** Intercepted-overlay bloom (private overlay twin only): staggers the content
   *  in. No-op on the plain page and the public surface. */
  zoom?: boolean;
}) {
  const hasItems = itemCount > 0;
  const content = zoom ? "bl-zoom-content" : "";

  return (
    <>
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
