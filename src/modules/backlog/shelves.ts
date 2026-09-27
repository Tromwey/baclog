import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems, userItems } from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";
import { getCollaboratorsForBacklogs } from "./collaborators";
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
 * `backlog_item`, palette never on `user_item`. Counts use every membership;
 * `covers` is capped (the carousel shows COVER_CAP and links to the rest),
 * the fan is resolved over the whole order so a chosen cover past the cap
 * still leads it.
 */

export interface ShelfCover {
  backlogItemId: string;
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
  status: string;
  verdict: "liked" | "disliked" | null;
  obsessed: boolean;
  /** ISO string, or null when the catalog has no date. */
  releaseDate: string | null;
}

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
  /** In the manual order, capped at COVER_CAP. */
  covers: ShelfCover[];
  /** The three covers it shows itself with (fan.ts `fanOf`). */
  fan: ShelfCover[];
  /** The two tones it tints with (fan.ts `fanHexes`); [] = no colour. */
  hexes: string[];
  collaborators: Collaborator[];
}

/** The carousel's grid shows this many titles, then "Ver los N". */
export const COVER_CAP = 30;

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
        mediaType: catalogItems.mediaType,
        year: catalogItems.year,
        posterUrl: catalogItems.posterUrl,
        paletteHex: catalogItems.paletteHex,
        releaseDate: catalogItems.releaseDate,
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

  const shelves = new Map<string, Shelf & { all: ShelfCover[] }>(
    rows.map(({ pinnedAt, ...r }) => [
      r.id,
      {
        ...r,
        pinned: pinnedAt !== null,
        itemCount: 0,
        doneCount: 0,
        byKind: emptyByKind(),
        covers: [],
        fan: [],
        hexes: [],
        collaborators: credits.get(r.id) ?? [],
        all: [],
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
      mediaType: m.mediaType,
      year: m.year,
      posterUrl: m.posterUrl,
      paletteHex: m.paletteHex ?? null,
      status: m.status,
      verdict: m.verdict,
      obsessed: m.obsessed,
      releaseDate: m.releaseDate ? m.releaseDate.toISOString() : null,
    };
    shelf.all.push(cover);
    if (shelf.covers.length < COVER_CAP) shelf.covers.push(cover);
  }

  return rows.map((r) => {
    const { all, ...shelf } = shelves.get(r.id)!;
    shelf.fan = fanOf(all, shelf.coverCatalogItemId);
    shelf.hexes = fanHexes(shelf.fan, all);
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
 * the full order + `addedAt` map), in the same two round trips as
 * `getShelvesForUser`. Own-user only: the caller passes the bearer user's id.
 * Only membership facts and the shared cover URL travel — no per-title state
 * (that is `GET /collections/{id}` / `GET /me/titles`).
 */
export interface CollectionMembership {
  catalogItemId: string;
  /** `backlog_item.addedAt` — when it entered THIS collection. */
  addedAt: Date;
  posterUrl: string | null;
}

export interface CollectionWithMemberships {
  id: string;
  name: string;
  vibe: string | null;
  isPublic: boolean;
  showOnProfile: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Newest first. */
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
      posterUrl: catalogItems.posterUrl,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(
      and(eq(backlogItems.userId, userId), one ? eq(backlogItems.backlogId, one) : undefined),
    )
    .orderBy(desc(backlogItems.addedAt));

  const byBacklog = new Map<string, CollectionWithMemberships>(
    rows.map((r) => [r.id, { ...r, memberships: [] }]),
  );
  for (const m of memberships) {
    byBacklog.get(m.backlogId)?.memberships.push({
      catalogItemId: m.catalogItemId,
      addedAt: m.addedAt,
      posterUrl: m.posterUrl,
    });
  }
  return rows.map((r) => byBacklog.get(r.id)!);
}
