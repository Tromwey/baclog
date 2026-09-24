import { visibilityOf } from "@/modules/backlog/visibility";
import {
  isoDate,
  type Collection,
  type Title,
  type TitleState,
  type Visibility,
} from "../schemas";
import { toTitleState } from "./state";
import { toTitleSummary } from "./title";

/**
 * `Collection` (§3) from a `backlog` row plus ALL of its memberships. The
 * order is `addedAt desc` (the collection's own order); `coverTitleId` is
 * DERIVED (most recent membership whose title has a cover) and never
 * persisted; `visibility` folds the two DB axes into the three wire states.
 */

export interface CollectionMembershipInput {
  catalogItemId: string;
  /** `backlog_item.addedAt` — when it entered THIS collection. */
  addedAt: Date;
  posterUrl: string | null;
}

export interface CollectionInput {
  id: string;
  name: string;
  vibe: string | null;
  isPublic: boolean;
  showOnProfile: boolean;
  createdAt: Date;
  updatedAt: Date;
  memberships: CollectionMembershipInput[];
}

/** DB axes → wire: private · link (public, off the profile) · profile (both). */
export function wireVisibilityOf(b: {
  isPublic: boolean;
  showOnProfile: boolean;
}): Visibility {
  switch (visibilityOf(b)) {
    case "private":
      return "private";
    case "public":
      return "link";
    case "featured":
      return "profile";
  }
}

export function toCollection(row: CollectionInput): Collection {
  const ordered = [...row.memberships].sort(
    (a, b) => b.addedAt.getTime() - a.addedAt.getTime(),
  );
  const addedAt: Record<string, string> = {};
  const titleIds: string[] = [];
  for (const m of ordered) {
    // A title can't be in the same backlog twice (unique index), but stay
    // idempotent if a caller ever hands over a merged list.
    if (m.catalogItemId in addedAt) continue;
    titleIds.push(m.catalogItemId);
    addedAt[m.catalogItemId] = isoDate(m.addedAt);
  }
  const cover = ordered.find((m) => m.posterUrl !== null && m.posterUrl !== "");
  return {
    id: row.id,
    name: row.name,
    vibe: row.vibe,
    visibility: wireVisibilityOf(row),
    titleIds,
    addedAt,
    coverTitleId: cover?.catalogItemId ?? null,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  };
}

// ---------- { collection, titles, states } ----------

/** One membership row joined to its catalog facts and a per-title state. */
export interface CollectionDetailItem {
  catalogItemId: string;
  /** `backlog_item.addedAt` — when it entered THIS collection. */
  addedAt: Date;
  title: string;
  mediaType: "film" | "series" | "album";
  year: number | null;
  byline: string | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
  /** `catalog_item.releaseDate` → the summary's `release`. */
  releaseDate: Date | null;
  status: string;
  verdict: string | null;
  obsessed: boolean;
  /** What `TitleState.savedAt` reports: `user_item.addedAt` for the owner's
   *  own read, the membership's `addedAt` on the public read (the first save
   *  across shelves is not a public fact). */
  savedAt: Date;
  reviewId: string | null;
}

export type CollectionDetailMeta = Omit<CollectionInput, "memberships">;

export interface CollectionDetail {
  collection: Collection;
  /** Summaries in the collection's order. */
  titles: Title[];
  /** Keyed by titleId. */
  states: Record<string, TitleState>;
}

/**
 * The shape `GET /collections/{id}` and `GET /people/{handle}/collections/{id}`
 * both answer, from one list of joined rows: the collection (order + cover
 * derived here), the title summaries in that order, one state per title.
 * Dedupes on `catalogItemId` like `toCollection` does.
 */
export function toCollectionDetail(
  meta: CollectionDetailMeta,
  items: CollectionDetailItem[],
): CollectionDetail {
  const collection = toCollection({ ...meta, memberships: items });
  const byId = new Map(items.map((it) => [it.catalogItemId, it]));
  const titles: Title[] = [];
  const states: Record<string, TitleState> = {};
  for (const id of collection.titleIds) {
    const it = byId.get(id)!;
    titles.push(toTitleSummary(it));
    states[id] = toTitleState({ ...it, addedAt: it.savedAt });
  }
  return { collection, titles, states };
}
