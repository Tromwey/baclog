import "server-only";
import { ApiError } from "@/authz/api";
import type { CurrentUser } from "@/auth/session";
import { profileTint } from "@/modules/backlog/profile-hexes";
import {
  getPublicProfile,
  getPublicReactionCounts,
} from "@/modules/backlog/public";
import { countPublicReviewsByAuthor } from "@/modules/reviews/counts";
import { getAffinity } from "@/modules/social/affinity";
import { blockStateWith } from "@/modules/social/block";
import { isFollowing } from "@/modules/social/queries";
import type { Person } from "@/app/api/v1/_lib/schemas";

/**
 * `GET /people/{handle}` — the FULL `Person` (§3), built from the same gated
 * reads the web profile makes (app/u/[username]/page.tsx): `public.ts` for
 * identity, counts and the escaparate; `social/*` for what the viewer and
 * the profile share. Every read gates `users.isPublic + username` inside its
 * query, so a private or nonexistent handle comes back null from the first
 * one and this module answers the SAME 404 for both — there is no
 * `isPrivate` on the wire and no distinguishable body.
 *
 * Blocks (App Store 1.2): if the profile blocked the viewer, it is that same
 * 404 — even when the viewer blocked them back. If only the viewer blocked
 * them, the profile is still served (it is the place to unblock from) with
 * `isBlocked: true`, `isFollowing: false`, and no `common` / `collections`:
 * affinity is gated on blocks (`getAffinity` → null) and every collection
 * link would be a 404 (`assertNotBlocked`).
 */

/** `{handle}` path segments go through `parseHandle` in `_lib/http.ts` (the
 *  one username grammar; malformed = the same 404). */
export { parseHandle } from "@/app/api/v1/_lib/http";

/**
 * `GET /people/{handle}/collections/{id}`: a block in EITHER direction is the
 * same 404 as a private or nonexistent collection (the blocker keeps only the
 * profile itself, to unblock from). Throws; returns nothing.
 */
export async function assertNotBlocked(viewerId: string, handle: string): Promise<void> {
  const block = await blockStateWith(viewerId, handle);
  if (block.blockedByViewer || block.blocksViewer) throw new ApiError("not_found");
}

export async function buildPerson(
  viewer: CurrentUser,
  handle: string,
): Promise<Person> {
  const [profile, counts, block] = await Promise.all([
    getPublicProfile(handle),
    getPublicReactionCounts(handle),
    blockStateWith(viewer.id, handle),
  ]);
  if (!profile || !counts || block.blocksViewer) throw new ApiError("not_found");
  const isBlocked = block.blockedByViewer;

  // The owner looking at themselves: no follow state, no affinity (same as
  // the web, where the owner sees neither control).
  const isOwner = viewer.username === profile.username;
  const [following, affinity, reviews] = await Promise.all([
    isOwner || isBlocked ? false : isFollowing(viewer.id, profile.username),
    isOwner ? null : getAffinity(viewer.id, profile.username),
    countPublicReviewsByAuthor(profile.username),
  ]);

  // One rule for the tint AND the title it names (profile-hexes.ts, shared
  // with `Me`). The lima fallback of public.ts is not a Kura colour — the
  // rule drops it.
  const tint = profileTint(profile.obsessions, profile.palette);

  return {
    handle: profile.username,
    name: profile.displayName,
    avatarUrl: profile.avatarUrl,
    hexes: tint.hexes,
    featuredTitleId: tint.featuredTitleId,
    isFounder: profile.isFounder,
    followers: profile.followerCount,
    followingCount: profile.followingCount,
    stats: {
      obsessed: counts.obsessed,
      liked: counts.liked,
      completed: counts.completed,
      reviews,
    },
    obsessions: profile.obsessions.map((o) => o.catalogItemId),
    common: affinity?.common.map((c) => c.catalogItemId) ?? [],
    collections: isBlocked
      ? []
      : profile.backlogs.map((b) => ({
          id: b.id,
          name: b.name,
          titleIds: b.titleIds,
          coverTitleId: b.coverTitleId,
        })),
    isFollowing: following,
    isBlocked,
  };
}
