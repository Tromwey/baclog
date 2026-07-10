import { z } from "zod";

/**
 * ADN palette aggregation — one source of truth for "take up to N distinct
 * dominant colors, most-recent-first". The dominant color of an item is its
 * paletteHex[0] (extractPalette ranks by vividness — F3.6.1). Rows are expected to be
 * ordered newest-first by the caller. The cap is product-visible (the ADN
 * aura), so keep it here, not scattered.
 */

/**
 * Shared validation for a catalog_item.paletteHex array — used by both
 * addItemAction (backlog-item-actions.ts) and updateItemPaletteAction
 * (palette-backfill-actions.ts). Lives here, NOT in either "use server" action
 * file — a "use server" file may only export async functions.
 */
export const paletteHexSchema = z
  .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
  .max(6);

/** Distinct dominant hexes across rows, deduped case-insensitively, capped. */
export function dominantHexes(
  rows: { paletteHex: string[] | null }[],
  limit: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const hex = r.paletteHex?.[0];
    if (!hex) continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hex);
    if (out.length >= limit) break;
  }
  return out;
}

/** Same, grouped by a key — e.g. dominant colors per backlog. */
export function groupDominantHexes<T extends { paletteHex: string[] | null }>(
  rows: T[],
  keyOf: (row: T) => string,
  limit: number,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const hex = r.paletteHex?.[0];
    if (!hex) continue;
    const k = keyOf(r);
    const list = out.get(k) ?? [];
    if (list.length >= limit) continue;
    const seenForKey = seen.get(k) ?? new Set<string>();
    const key = hex.toLowerCase();
    if (seenForKey.has(key)) continue;
    seenForKey.add(key);
    list.push(hex);
    out.set(k, list);
    seen.set(k, seenForKey);
  }
  return out;
}
