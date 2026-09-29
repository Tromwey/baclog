"use client";

import { useEffect, useState } from "react";
import { extractPalette } from "@/modules/cards/palette";
import type { PartySong } from "@/modules/party-collections/types";
import { partyHexes } from "./party-parts";

/**
 * The two tones the party page is tinted with (design `feedBg`): the first
 * song's shared palette — and, while nobody has extracted it yet, the same
 * on-device extraction the rest of the app uses, for THIS screen only (the
 * shared palette is written when a song is added, `addPartySongAction`).
 */
export function usePartyHexes(songs: readonly Pick<PartySong, "paletteHex" | "artworkUrl">[]): string[] {
  const known = partyHexes(songs);
  const first = songs[0]?.artworkUrl ?? null;
  const [extracted, setExtracted] = useState<{ url: string; hexes: string[] } | null>(null);
  const need = known.length === 0 && !!first;
  useEffect(() => {
    if (!need || !first) return;
    let off = false;
    extractPalette(first)
      .then((hexes) => {
        if (!off && hexes.length) setExtracted({ url: first, hexes });
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [need, first]);
  if (known.length) return known;
  return extracted && extracted.url === first ? extracted.hexes : EMPTY_PARTY_TINT;
}

/** A party with no colour yet (no songs, or none extracted): the design's
 *  neutral slate pair (fiesta-app-v2 `feedBg` fallback), through the same
 *  tint recipe as any cover palette. */
export const EMPTY_PARTY_TINT: string[] = ["#5a5a70", "#16161c"];

/** Extract a cover's palette for `addPartySongAction`, bounded so adding never waits long. */
export async function paletteFor(url: string | null, known: string[] | null, ms = 1200): Promise<string[] | undefined> {
  if (known && known.length) return undefined;
  if (!url) return undefined;
  const timeout = new Promise<string[]>((r) => setTimeout(() => r([]), ms));
  const hexes = await Promise.race([extractPalette(url).catch(() => [] as string[]), timeout]);
  return hexes.length ? hexes.slice(0, 6) : undefined;
}
