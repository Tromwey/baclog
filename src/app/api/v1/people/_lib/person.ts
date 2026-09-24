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
 */

/** `{handle}` path segments go through `parseHandle` in `_lib/http.ts` (the
 *  one username grammar; malformed = the same 404). */
export { parseHandle } from "@/app/api/v1/_lib/http";

export async function buildPerson(
  viewer: CurrentUser,
  handle: string,
): Promise<Person> {
  const [profile, counts] = await Promise.all([
    getPublicProfile(handle),
    getPublicReactionCounts(handle),
  ]);
  if (!profile || !counts) throw new ApiError("not_found");

  // The owner looking at themselves: no follow state, no affinity (same as
  // the web, where the owner sees neither control).
  const isOwner = viewer.username === profile.username;
  const [following, affinity, reviews] = await Promise.all([
    isOwner ? false : isFollowing(viewer.id, profile.username),
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
    collections: profile.backlogs.map((b) => ({
      id: b.id,
      name: b.name,
      titleIds: b.titleIds,
      coverTitleId: b.coverTitleId,
    })),
    isFollowing: following,
  };
}
