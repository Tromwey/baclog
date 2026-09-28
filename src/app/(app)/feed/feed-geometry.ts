import { tintEnds } from "@/components/kura/tint";

/**
 * The stack's load-bearing numbers as a PLAIN module: the server page and
 * `loading.tsx` size their header and cards with these, and a `"use client"`
 * module's exports become client references on the server (learnings/
 * 2026-09-03-export-de-modulo-use-client-llamado-en-servidor.md) — so they
 * cannot live in feed-card.tsx. The skeleton and the loaded stack read the
 * SAME numbers, which is what keeps the skeleton → content swap still.
 */

/**
 * Sticky header height — what every card pins under. Feed v10: 18 top + the
 * 44 bell chip row ("tu feed" Newsreader 36 sits on its baseline) + 14
 * bottom. The header in feed-header.tsx is sized to exactly this.
 */
export const HDR_PX = 76;
/** How far a card's body runs past its own height (the mock's EXTB). */
export const EXT_BOTTOM = 120;
/** The cards' top corners (iOS `KRadius.screen`). */
export const CARD_RADIUS = 26;
/** The band rises over the last this-many px before its card pins (iOS `FeedStackCard`). */
export const BAND_RISE_PX = 140;

/** The header's real height, safe area included — where cards 1… pin. */
export const STICKY_TOP = `calc(${HDR_PX}px + env(safe-area-inset-top))`;

export type TierName = "L" | "M" | "S";
type Tier = { h: number; cap: number; textMax: number };
/**
 * [fixed height, ceiling as a fraction of the frame below the status bar, max
 * height of the text block] — iOS `FeedView.tierHeight` / `FeedCard.textMax`.
 * The fraction only caps them so the next card's edge always shows.
 */
export const TIER: Record<TierName, Tier> = {
  L: { h: 620, cap: 0.72, textMax: 180 },
  M: { h: 500, cap: 0.58, textMax: 105 },
  S: { h: 370, cap: 0.44, textMax: 105 },
};

/** A card's own height (its body runs EXT_BOTTOM further, under the next card). */
export function tierHeight(size: TierName): string {
  const t = TIER[size];
  return `min(${t.h}px, calc((100dvh - env(safe-area-inset-top)) * ${t.cap}))`;
}

/** A card is never lit by nothing: the neutral the skeleton wears too (iOS `palette(nil)`). */
export const NEUTRAL_HEXES: readonly string[] = ["#6C6B76"];

/** The palette pair dragged toward black (`tintEnds`). */
export function cardEnds(hexes: readonly string[]): [string, string] {
  return tintEnds(hexes.length > 0 ? hexes : NEUTRAL_HEXES);
}

/** The card surface: 168°, top end → bottom end (iOS `Tint.card`). */
export function cardBackground(hexes: readonly string[]): string {
  const [top, bot] = cardEnds(hexes);
  return `linear-gradient(168deg, ${top} 0%, ${bot} 100%)`;
}

/** The colour the page continues in below the last card (the mock's tailBg). */
export function cardTailHex(hexes: readonly string[]): string {
  return cardEnds(hexes)[1];
}

/** The band's resting shadow — short and faint, cast upward (iOS `kShadow(.stack)`). */
export const bandShadow = (alpha: number | string) => `0 -8px 18px rgba(0,0,0,${alpha})`;
export const BAND_SHADOW_ALPHA = 0.42;
