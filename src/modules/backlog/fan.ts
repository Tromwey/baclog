import type { MediaType } from "@/modules/catalog/types";

/**
 * Colecciones formalizado (design/colecciones-propuesta · "El abanico es la
 * colección"): the three covers a collection shows itself with, and the order
 * its titles are read in. Plain module, client-safe — the server readers and
 * the client screens resolve a fan the same way, so they can't disagree.
 *
 *  - ORDER: the owner's manual order (`backlog_item.position`, 0 first), with
 *    every unplaced title (null) ahead of it, newest first — so a collection
 *    nobody reordered reads exactly as before (newest first) and a title
 *    added after a reorder shows up on top until it's placed. The SQL twin is
 *    `MANUAL_ORDER` in queries.ts; keep both in step.
 *  - FAN: the chosen cover (`backlog.cover_catalog_item_id`) in front when it
 *    is still a member, then the next titles in that order. A chosen cover
 *    that left the collection is ignored, never shown.
 */

export interface FanCover {
  posterUrl: string | null;
  paletteHex?: readonly string[] | null;
  mediaType: MediaType;
  title?: string;
}

/** The manual order as a comparator (see the SQL twin `MANUAL_ORDER`). */
export function byManualOrder(
  a: { position: number | null; addedAt: Date | string },
  b: { position: number | null; addedAt: Date | string },
): number {
  if (a.position === null && b.position !== null) return -1;
  if (a.position !== null && b.position === null) return 1;
  if (a.position !== null && b.position !== null && a.position !== b.position) {
    return a.position - b.position;
  }
  return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
}

/** Up to three titles for the fan: the chosen cover first, then the order. */
export function fanOf<T extends { catalogItemId: string }>(
  ordered: readonly T[],
  coverId: string | null | undefined,
): T[] {
  const cover = coverId ? ordered.find((t) => t.catalogItemId === coverId) : undefined;
  const out: T[] = cover ? [cover] : [];
  for (const t of ordered) {
    if (out.length >= 3) break;
    if (t !== cover) out.push(t);
  }
  return out;
}

/**
 * The two tones a collection tints with (the feed gradient): its fan's front
 * cover when it has a palette, else the first title in the order that does.
 * Empty = no colour ("sin portada no hay color").
 */
export function fanHexes(
  fan: readonly { paletteHex?: readonly string[] | null }[],
  ordered: readonly { paletteHex?: readonly string[] | null }[] = [],
): string[] {
  const lead = fan.find((c) => c.paletteHex?.length) ?? ordered.find((c) => c.paletteHex?.length);
  return lead?.paletteHex ? [...lead.paletteHex].filter((h) => h.toLowerCase() !== "#d8ff3e") : [];
}

/** A collaborator as the credit line and the seals need them. */
export interface Collaborator {
  name: string;
  username: string | null;
  image: string | null;
}

/** "mariel ortega" → "mariel"; a handle when there's no name. */
export function shortName(c: Pick<Collaborator, "name" | "username">): string {
  const first = c.name.trim().split(/\s+/)[0];
  return (first || c.username || "").toLowerCase();
}

/** "a", "a y b", "a, b y c". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * Who a collection is by, from its owner's side: "solo tú" · "tú y mo" ·
 * "tú, mo y ja" (the carousel's mono line and the header's credit).
 */
export function ownCreditLine(collaborators: readonly Collaborator[]): string {
  if (collaborators.length === 0) return "solo tú";
  return joinNames(["tú", ...collaborators.map(shortName)]);
}

/** "12 títulos · cine, series, música" — the formats a collection mixes. */
export function formatsLine(kinds: readonly MediaType[]): string {
  const word: Record<MediaType, string> = { film: "cine", series: "series", album: "música" };
  return (["film", "series", "album"] as const).filter((k) => kinds.includes(k)).map((k) => word[k]).join(", ");
}
