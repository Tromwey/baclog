import { AuraField } from "@/components/ui";
import { plural } from "@/lib/plural";

/** Deterministic seed from the backlog id, so the aura is stable per backlog.
 * Delegates to the shared auraSeed; kept as an export so consumers (zoom view,
 * public profile) keep their import surface. */
export { auraSeed as shelfSeed } from "@/lib/color";

/**
 * The shelf band (mock #p1) — a backlog's ADN aura, count chip top-right,
 * serif name bottom-left. The aura stays content-driven (AuraField, our
 * system); the mock's directional scrim sits over it so the name/chip corners
 * keep contrast regardless of palette. Presentational and server-safe (no
 * client hooks), so it's shared by the in-app Backlogs list (wrapped in a
 * zoom Link) and the public profile (wrapped in a Link).
 */
export function ShelfCard({
  name,
  itemCount,
  paletteHex,
  seed,
}: {
  name: string;
  itemCount: number;
  /** The backlog's ADN — dominant colors of its items (lima fallback). */
  paletteHex: string[];
  seed: number;
}) {
  return (
    // Base = the nav dock's glass (founder call): the blurred backdrop aura
    // shows through where the ADN ellipses fade, instead of pure black
    // (which read as a dark border around the card).
    <div className="bl-dock-glass relative flex h-[88px] flex-col justify-between overflow-hidden rounded-[18px] px-4 py-3.5">
      <AuraField variant="shelf" colors={paletteHex} seed={seed} />
      {/* Mock's directional scrim: darkens both ends so the corner content reads. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(92deg,rgba(11,11,13,0.5),rgba(11,11,13,0.05)_55%,rgba(11,11,13,0.45))]"
      />
      {/* No backdrop-blur here: the chip already sits on the card's own glass,
          and a nested blur is a per-frame compositing cost for nothing. */}
      <span className="relative self-end rounded-full bg-black/35 px-[9px] py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-text">
        {itemCount} {plural(itemCount, "ítem", "ítems")}
      </span>
      <div className="relative font-serif text-[27px] italic leading-none text-text [text-shadow:0_1px_14px_rgba(0,0,0,0.55)]">
        {name}
      </div>
    </div>
  );
}
