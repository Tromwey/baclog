"use server";

import { assertOwnsBacklog, NotFoundError, UnauthorizedError } from "@/authz";
import {
  COLLECTION_PAGE_SIZE,
  COLLECTION_WINDOW_MAX,
  decodeCollectionCursor,
  encodeCollectionCursor,
  isPagedSort,
} from "@/modules/backlog/collection-cursor";
import type { CollectionItem } from "@/modules/backlog/collection-item";
import {
  getBacklogItems,
  getBacklogItemsPage,
  getBacklogKindCounts,
  getMembershipsOf,
  toCollectionItem,
} from "@/modules/backlog/queries";
import { MEDIA_TYPES, type MediaType } from "@/modules/catalog/types";

/**
 * Colecciones largas (founder, ronda 8): the pages of a collection AFTER the
 * first one (which the RSC renders), read as the page scrolls. READS, but
 * through the same gate as every write here: each call re-authorizes with
 * `assertOwnsBacklog` — the user comes from the session, never from an
 * argument, and a collection that isn't the caller's answers `not_found`
 * exactly like one that doesn't exist. Nothing here is cross-user: the
 * public page (`/u/…`) has its own reader and does not share this body.
 *
 * Every answer carries the collection's CURRENT counts per format and the
 * memberships of the titles it returns, so the client paints a list and the
 * numbers above it from the same snapshot.
 */

export type CollectionPage =
  | {
      items: CollectionItem[];
      /** Opaque; null = that was the last page. */
      nextCursor: string | null;
      counts: Record<MediaType, number>;
      /** `catalogItemId → backlogId[]` for the titles in `items`. */
      memberships: Record<string, string[]>;
      error?: undefined;
    }
  | { error: "invalid" | "not_found" };

async function owned(backlogId: unknown) {
  if (typeof backlogId !== "string" || backlogId.length === 0 || backlogId.length > 64) return null;
  try {
    return await assertOwnsBacklog(backlogId);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof UnauthorizedError) return null;
    throw err;
  }
}

/**
 * One page in `sort`'s order (`manual` · `recent` · `state` · `year`),
 * optionally one format. `limit` defaults to 60; a refresh asks for as many
 * rows as it already shows (up to 600) from the start, in one call.
 */
export async function getCollectionPageAction(input: {
  backlogId: string;
  sort: string;
  format?: string | null;
  cursor?: string | null;
  limit?: number;
}): Promise<CollectionPage> {
  // The argument crosses an RPC boundary: every field is checked by hand.
  if (input === null || typeof input !== "object") return { error: "invalid" };
  const { sort, format = null, cursor = null, limit = COLLECTION_PAGE_SIZE } = input;
  if (typeof sort !== "string" || !isPagedSort(sort)) return { error: "invalid" };
  if (format !== null && !(MEDIA_TYPES as readonly unknown[]).includes(format)) return { error: "invalid" };
  if (!Number.isInteger(limit) || limit < 1 || limit > COLLECTION_WINDOW_MAX) return { error: "invalid" };
  // A cursor this order of this collection could not have emitted is refused, never treated as
  // "page 1" (learnings/2026-09-24-new-date-no-valida-un-cursor).
  const after = cursor === null ? null : decodeCollectionCursor(cursor, sort, input.backlogId);
  if (cursor !== null && !after) return { error: "invalid" };

  const gate = await owned(input.backlogId);
  if (!gate) return { error: "not_found" };
  const { user, backlog } = gate;

  const [page, counts] = await Promise.all([
    getBacklogItemsPage(backlog.id, { sort, format: format as MediaType | null, after, limit }),
    getBacklogKindCounts(backlog.id),
  ]);
  const memberships = await getMembershipsOf(
    user.id,
    page.rows.map((r) => r.catalogItemId),
  );
  return {
    items: page.rows.map(toCollectionItem),
    nextCursor: page.next ? encodeCollectionCursor(page.next, backlog.id) : null,
    counts,
    memberships,
  };
}

/**
 * The WHOLE collection in the manual order, for the two things that cannot
 * work on a page: Reordenar (the owner drags among all of its titles) and
 * the "Título" order (sorted in the client with the Spanish collation — see
 * collection-cursor.ts for why that one has no cursor).
 */
export async function getCollectionAllAction(backlogId: string): Promise<CollectionPage> {
  const gate = await owned(backlogId);
  if (!gate) return { error: "not_found" };
  const { user, backlog } = gate;
  const [rows, counts] = await Promise.all([getBacklogItems(backlog.id), getBacklogKindCounts(backlog.id)]);
  const memberships = await getMembershipsOf(
    user.id,
    rows.map((r) => r.catalogItemId),
  );
  return { items: rows.map(toCollectionItem), nextCursor: null, counts, memberships };
}
