import type { MediaType } from "@/modules/catalog/types";

/**
 * What Descubrir needs to know about the caller's own library to draw
 * "guardar" honestly (flujos-v2 · 19f/19h): which collections each title is
 * already in (the bookmark + N on a result, the pre-checked rows of the
 * "guardar en" sheet), the cover each collection shows in that sheet, and the
 * collection used last (the default check for a title that isn't saved yet).
 *
 * Plain data, client-safe. The read lives in `library-index.ts` (server-only,
 * own-user); the client keeps its own copy in state and patches it after every
 * save, so the page never has to re-render to stay truthful.
 */

export interface Membership {
  backlogId: string;
  /** The `backlog_item` row — what `removeMembershipAction` takes. */
  backlogItemId: string;
}

export interface CollectionThumb {
  posterUrl: string | null;
  paletteHex: string[];
  mediaType: MediaType;
}

export interface LibraryIndex {
  /** catalogItemId → every collection the title is filed under. */
  byTitle: Record<string, Membership[]>;
  /** backlogId → its newest cover (absent = an empty collection). */
  thumbs: Record<string, CollectionThumb>;
  /** The collection the newest save went to — the sheet's default. */
  lastUsedBacklogId: string | null;
}

export const EMPTY_LIBRARY: LibraryIndex = {
  byTitle: {},
  thumbs: {},
  lastUsedBacklogId: null,
};

/** Immutable patch: `catalogItemId` now lives in exactly `memberships`. */
export function withMemberships(
  lib: LibraryIndex,
  catalogItemId: string,
  memberships: Membership[],
): LibraryIndex {
  const byTitle = { ...lib.byTitle };
  if (memberships.length > 0) byTitle[catalogItemId] = memberships;
  else delete byTitle[catalogItemId];
  return { ...lib, byTitle };
}
