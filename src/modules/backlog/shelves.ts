import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems, userItems } from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";
import { getCollaboratorsForBacklogs } from "./collaborators";
import type { CollectionItem } from "./collection-item";
import { fanHexes, fanOf, type Collaborator, type FanCover } from "./fan";
import { MANUAL_ORDER } from "./queries";

/**
 * The /backlogs carousel and the profile's collections (Colecciones
 * formalizado, 2026-09-27): every backlog of the user with its fan, its
 * titles in the manual order, its counts and its credit line. Own-user only —
 * the caller passes the session's id.
 *
 * Two round trips + the credits, grouped in JS: the backlogs (the PINNED one
 * first, then newest first) and ALL of the user's memberships in
 * `MANUAL_ORDER`, joined to their per-title state (`user_item`) and the shared
 * cover facts (`catalog_item`) — AGENTS.md: state never lives on
 * `backlog_item`, palette never on `user_item`. Every membership travels
 * (Colecciones · una sola página, 2026-09-27): Tus colecciones mounts the
 * collection's whole body under the carousel — every title, Mover a, the
 * memberships a move checks — so there is no cap. The profile only needs the
 * fans and counts: it passes `withoutItems(shelves)` to the client.
 */

/** A title of a shelf — the body's `CollectionItem`. */
export type ShelfCover = CollectionItem;

export interface KindCount {
  total: number;
  done: number;
}

export interface Shelf {
  id: string;
  name: string;
  vibe: string | null;
  isPublic: boolean;
  showOnProfile: boolean;
  pinned: boolean;
  coverCatalogItemId: string | null;
  itemCount: number;
  doneCount: number;
  /** Totals per kind (the hold sheet's "24 · mixto"). */
  byKind: Record<MediaType, KindCount>;
  /** Every title, in the manual order. */
  items: ShelfCover[];
  /** The three covers it shows itself with (fan.ts `fanOf`). */
  fan: ShelfCover[];
  /** The two tones it tints with (fan.ts `fanHexes`); [] = no colour. */
  hexes: string[];
  collaborators: Collaborator[];
}

/** A shelf without its titles — what a screen that only draws fans needs. */
export type ShelfSummary = Omit<Shelf, "items">;

export function withoutItems(shelves: readonly Shelf[]): ShelfSummary[] {
  return shelves.map((s) => {
    const { items, ...summary } = s;
    void items;
    return summary;
  });
}

const emptyByKind = (): Record<MediaType, KindCount> => ({
  film: { total: 0, done: 0 },
  series: { total: 0, done: 0 },
  album: { total: 0, done: 0 },
});

export async function getShelvesForUser(userId: string): Promise<Shelf[]> {
  const rows = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      vibe: backlogs.vibe,
      isPublic: backlogs.isPublic,
      showOnProfile: backlogs.showOnProfile,
      pinnedAt: backlogs.pinnedAt,
      coverCatalogItemId: backlogs.coverCatalogItemId,
    })
    .from(backlogs)
    .where(eq(backlogs.userId, userId))
    // The pinned collection leads; the rest newest first (same as the pickers).
    .orderBy(sql`${backlogs.pinnedAt} desc nulls last`, desc(backlogs.createdAt));

  if (rows.length === 0) return [];

  const [memberships, credits] = await Promise.all([
    db
      .select({
        backlogId: backlogItems.backlogId,
        backlogItemId: backlogItems.id,
        catalogItemId: catalogItems.id,
        title: catalogItems.title,
        byline: catalogItems.byline,
        mediaType: catalogItems.mediaType,
        year: catalogItems.year,
        posterUrl: catalogItems.posterUrl,
        paletteHex: catalogItems.paletteHex,
        releaseDate: catalogItems.releaseDate,
        addedAt: backlogItems.addedAt,
        status: userItems.status,
        verdict: userItems.verdict,
        obsessed: userItems.obsessed,
      })
      .from(backlogItems)
      .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
      .innerJoin(
        userItems,
        // Composite join on (userId, catalogItemId): the per-title row is one
        // per user, shared by every backlog the title is filed under.
        and(
          eq(userItems.userId, backlogItems.userId),
          eq(userItems.catalogItemId, backlogItems.catalogItemId),
        ),
      )
      .where(eq(backlogItems.userId, userId))
      .orderBy(...MANUAL_ORDER),
    getCollaboratorsForBacklogs(rows.map((r) => r.id)),
  ]);

  const shelves = new Map<string, Shelf>(
    rows.map(({ pinnedAt, ...r }) => [
      r.id,
      {
        ...r,
        pinned: pinnedAt !== null,
        itemCount: 0,
        doneCount: 0,
        byKind: emptyByKind(),
        items: [],
        fan: [],
        hexes: [],
        collaborators: credits.get(r.id) ?? [],
      },
    ]),
  );

  for (const m of memberships) {
    const shelf = shelves.get(m.backlogId);
    if (!shelf) continue;
    const done = m.status === "completed";
    shelf.itemCount += 1;
    shelf.byKind[m.mediaType].total += 1;
    if (done) {
      shelf.doneCount += 1;
      shelf.byKind[m.mediaType].done += 1;
    }
    const cover: ShelfCover = {
      backlogItemId: m.backlogItemId,
      catalogItemId: m.catalogItemId,
      title: m.title,
      byline: m.byline,
      mediaType: m.mediaType,
      year: m.year,
      posterUrl: m.posterUrl,
      paletteHex: m.paletteHex ?? null,
      status: m.status,
      verdict: m.verdict,
      obsessed: m.obsessed,
      releaseDate: m.releaseDate ? m.releaseDate.toISOString() : null,
      addedAt: m.addedAt.toISOString(),
    };
    shelf.items.push(cover);
  }

  return rows.map((r) => {
    const shelf = shelves.get(r.id)!;
    shelf.fan = fanOf(shelf.items, shelf.coverCatalogItemId);
    shelf.hexes = fanHexes(shelf.fan, shelf.items);
    return shelf;
  });
}

/**
 * Every collection's fan and count, for the pickers ("guardar en", "mover a",
 * search's destination): a mini fan per row instead of a thumbnail
 * (Colecciones formalizado · 7a). Own-user only, same two reads as the
 * carousel minus the per-title state.
 */
export interface CollectionFan {
  covers: FanCover[];
  count: number;
}

export async function getCollectionFans(userId: string): Promise<Record<string, CollectionFan>> {
  const [rows, memberships] = await Promise.all([
    db
      .select({ id: backlogs.id, coverCatalogItemId: backlogs.coverCatalogItemId })
      .from(backlogs)
      .where(eq(backlogs.userId, userId)),
    db
      .select({
        backlogId: backlogItems.backlogId,
        catalogItemId: backlogItems.catalogItemId,
        posterUrl: catalogItems.posterUrl,
        paletteHex: catalogItems.paletteHex,
        mediaType: catalogItems.mediaType,
        title: catalogItems.title,
      })
      .from(backlogItems)
      .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
      .where(eq(backlogItems.userId, userId))
      .orderBy(...MANUAL_ORDER),
  ]);
  const byBacklog = new Map<string, typeof memberships>();
  for (const m of memberships) {
    const list = byBacklog.get(m.backlogId) ?? [];
    list.push(m);
    byBacklog.set(m.backlogId, list);
  }
  const out: Record<string, CollectionFan> = {};
  for (const r of rows) {
    const all = byBacklog.get(r.id) ?? [];
    out[r.id] = {
      count: all.length,
      covers: fanOf(all, r.coverCatalogItemId).map((c) => ({
        posterUrl: c.posterUrl,
        paletteHex: c.paletteHex ?? null,
        mediaType: c.mediaType,
        title: c.title,
      })),
    };
  }
  return out;
}

/**
 * API v1 `GET /collections` — every backlog of the user with ALL of its
 * memberships (no cover cap: the app hydrates `titleIds` itself and needs
 * the full order + `addedAt` map), in two round trips. Own-user only: the
 * caller passes the bearer user's id. Only membership facts travel (the
 * manual `position`, `addedAt`) plus the collection's own curation (pin,
 * chosen cover) — no per-title state (that is `GET /collections/{id}` /
 * `GET /me/titles`). The wire order and fan are resolved in
 * `api/v1/_lib/wire/collection.ts` with the same `fan.ts` rules the web uses.
 */
export interface CollectionMembership {
  catalogItemId: string;
  /** `backlog_item.addedAt` — when it entered THIS collection. */
  addedAt: Date;
  /** `backlog_item.position` — the manual order; null = unplaced. */
  position: number | null;
}

export interface CollectionWithMemberships {
  id: string;
  name: string;
  vibe: string | null;
  isPublic: boolean;
  showOnProfile: boolean;
  pinnedAt: Date | null;
  coverCatalogItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** `MANUAL_ORDER`. */
  memberships: CollectionMembership[];
}

export async function getCollectionsWithMemberships(
  userId: string,
  opts: { backlogId?: string } = {},
): Promise<CollectionWithMemberships[]> {
  // `backlogId` narrows BOTH reads (the row and its memberships) so a write
  // handler re-reading one collection doesn't load the whole library.
  const one = opts.backlogId;
  const rows = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      vibe: backlogs.vibe,
      isPublic: backlogs.isPublic,
      showOnProfile: backlogs.showOnProfile,
      pinnedAt: backlogs.pinnedAt,
      coverCatalogItemId: backlogs.coverCatalogItemId,
      createdAt: backlogs.createdAt,
      updatedAt: backlogs.updatedAt,
    })
    .from(backlogs)
    .where(and(eq(backlogs.userId, userId), one ? eq(backlogs.id, one) : undefined))
    .orderBy(desc(backlogs.createdAt));

  if (rows.length === 0) return [];

  const memberships = await db
    .select({
      backlogId: backlogItems.backlogId,
      catalogItemId: backlogItems.catalogItemId,
      addedAt: backlogItems.addedAt,
      position: backlogItems.position,
    })
    .from(backlogItems)
    .where(
      and(eq(backlogItems.userId, userId), one ? eq(backlogItems.backlogId, one) : undefined),
    )
    .orderBy(...MANUAL_ORDER);

  const byBacklog = new Map<string, CollectionWithMemberships>(
    rows.map((r) => [r.id, { ...r, memberships: [] }]),
  );
  for (const m of memberships) {
    byBacklog.get(m.backlogId)?.memberships.push({
      catalogItemId: m.catalogItemId,
      addedAt: m.addedAt,
      position: m.position,
    });
  }
  return rows.map((r) => byBacklog.get(r.id)!);
}
