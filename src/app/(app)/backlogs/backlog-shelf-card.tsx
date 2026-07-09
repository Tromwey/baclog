import { AuraField } from "@/components/ui";
import { plural } from "@/lib/plural";

/** Deterministic seed from the backlog id, so the aura is stable per backlog. */
export function shelfSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Zero-pad a count to 2 digits ("03"). Shared with the shelf zoom detail. */
export const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The shelf band — a backlog's ADN aura + name + count. Presentational and
 * server-safe (no client hooks), so it's shared by the in-app Backlogs list
 * (wrapped in a zoom button) and the public profile (wrapped in a Link).
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
    <div className="relative flex h-28 flex-col items-center justify-center overflow-hidden rounded-[26px] border border-white/10 bg-bg px-5 text-center">
      <AuraField variant="shelf" colors={paletteHex} seed={seed} />
      <div className="relative font-serif text-[29px] italic leading-[1.04] text-text [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]">
        {name}
      </div>
      <div className="relative mt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-text/80 [text-shadow:0_1px_10px_rgba(0,0,0,0.65)]">
        {pad(itemCount)} {plural(itemCount, "título", "títulos")}
      </div>
    </div>
  );
}
