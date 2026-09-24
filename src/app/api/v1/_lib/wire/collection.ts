import { visibilityOf } from "@/modules/backlog/visibility";
import { isoDate, type Collection, type Visibility } from "../schemas";

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
