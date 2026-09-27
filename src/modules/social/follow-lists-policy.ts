import {
  FOLLOW_LISTS_VISIBILITY,
  type FollowListsVisibility,
} from "@/db/schema";

/**
 * Who may read someone's followers / following LISTS (founder, 2026-09-27 —
 * revokes F3.10's "the lists are only the owner's"). The owner picks one of
 * three values (`user.follow_lists_visibility`, migration 0031, default
 * `private`):
 *
 *   public  → anyone signed in
 *   mutuals → the viewer follows the owner AND the owner follows the viewer
 *   private → only the owner
 *
 * The owner can always read their own. A block in EITHER direction is never
 * "allowed" — the caller turns it into the same 404 as a private or
 * nonexistent profile (block-gate.ts), so this never has to express it as a
 * 403. The COUNTS are public regardless (Person.followers/followingCount).
 *
 * Pure on purpose (no `server-only`, no DB): `scripts/check-wire.ts` runs the
 * truth table. The one reader that feeds it is `getFollowListsAccess`
 * (follow-lists.ts), which resolves the four booleans in ONE query.
 */
export { FOLLOW_LISTS_VISIBILITY, type FollowListsVisibility };

export function canSeeFollowLists(input: {
  visibility: FollowListsVisibility;
  isOwner: boolean;
  /** A `user_block` row exists between viewer and owner, either direction. */
  blocked: boolean;
  /** viewer → owner edge. */
  viewerFollowsOwner: boolean;
  /** owner → viewer edge. */
  ownerFollowsViewer: boolean;
}): boolean {
  if (input.blocked) return false;
  if (input.isOwner) return true;
  switch (input.visibility) {
    case "public":
      return true;
    case "mutuals":
      return input.viewerFollowsOwner && input.ownerFollowsViewer;
    case "private":
      return false;
  }
}
