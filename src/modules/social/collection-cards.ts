import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, catalogItems } from "@/db/schema";
import { byManualOrder, fanHexes, fanOf, type FanCover } from "@/modules/backlog/fan";
import type { MediaType } from "@/modules/catalog/types";
import { libraryMedia, libraryMediaType } from "@/modules/catalog/library-media";

/**
 * Someone else's PUBLIC collection as Descubrir draws it — a fan, the name,
 * the owner's signature and the count. Shared by the two cross-user readers
 * that surface other people's collections there (`kurada.ts`, the team's;
 * `followed-collections.ts`, people you follow). Those callers pick the rows
 * under their own gates (`publicAuthor` + blocks + `backlog.is_public`); this
 * module only reads the chosen collections' titles and shapes the card, so it
 * never decides WHICH collections are visible.
 */

export interface CollectionCard {
  id: string;
  name: string;
  /** The owner's public name (display name, else @handle). */
  owner: string;
  username: string;
  /** The owner's photo (`users.image`) — identity, read under the caller's `publicAuthor` gate. */
  avatarUrl: string | null;
  count: number;
  /** The format most of its titles are (a tie goes film → series → album). */
  format: MediaType;
  /** The fan's titles, front first — covers for the web, summaries for the API. */
  fan: (FanCover & {
    catalogItemId: string;
    year: number | null;
    byline: string | null;
    /** ISO, or null — a string so the card crosses the RSC boundary as-is. */
    releaseDate: string | null;
  })[];
  hexes: string[];
}

export interface CollectionRow {
  id: string;
  name: string;
  coverCatalogItemId: string | null;
  displayName: string | null;
  username: string | null;
  image?: string | null;
}

/** Cards for the given (already gated) collections, in their order; empty ones are skipped. */
export async function collectionCards(lists: CollectionRow[]): Promise<CollectionCard[]> {
  if (lists.length === 0) return [];
  const items = await db
    .select({
      backlogId: backlogItems.backlogId,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      year: catalogItems.year,
      byline: catalogItems.byline,
      releaseDate: catalogItems.releaseDate,
      mediaType: libraryMediaType(),
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      position: backlogItems.position,
      addedAt: backlogItems.addedAt,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(and(inArray(backlogItems.backlogId, lists.map((l) => l.id)), libraryMedia()))
    .orderBy(asc(backlogItems.backlogId));

  const byList = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byList.get(it.backlogId) ?? [];
    arr.push(it);
    byList.set(it.backlogId, arr);
  }

  const out: CollectionCard[] = [];
  for (const l of lists) {
    const all = (byList.get(l.id) ?? []).sort(byManualOrder);
    if (all.length === 0 || !l.username) continue;
    const tally = { film: 0, series: 0, album: 0 };
    for (const t of all) tally[t.mediaType] += 1;
    const format = (["film", "series", "album"] as const).reduce((best, k) =>
      tally[k] > tally[best] ? k : best,
    );
    const fan = fanOf(all, l.coverCatalogItemId).map((c) => ({
      catalogItemId: c.catalogItemId,
      year: c.year,
      byline: c.byline,
      releaseDate: c.releaseDate ? c.releaseDate.toISOString() : null,
      posterUrl: c.posterUrl,
      paletteHex: c.paletteHex ?? null,
      mediaType: c.mediaType,
      title: c.title,
    }));
    out.push({
      id: l.id,
      name: l.name,
      owner: l.displayName?.trim() || `@${l.username}`,
      username: l.username,
      avatarUrl: l.image ?? null,
      count: all.length,
      format,
      fan,
      hexes: fanHexes(fan, all),
    });
  }
  return out;
}
