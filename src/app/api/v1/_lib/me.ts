import "server-only";
import { loadUserById, type CurrentUser } from "@/auth/session";
import { ApiError } from "@/authz/api";
import { getObsessions, getReactionCounts } from "@/modules/backlog/profile-stats";
import { profileTint } from "@/modules/backlog/profile-hexes";
import { getUserPalette } from "@/modules/backlog/queries";
import { countOwnReviews } from "@/modules/reviews/queries";
import { getFollowCounts } from "@/modules/social/queries";
import { isoDate, type Me } from "./schemas";

/**
 * `Me` (§3) for the bearer user — the same reads the web profile makes
 * (perfil/page.tsx), every one scoped by `user.id` inside its query. Builds
 * from a `CurrentUser` only: that type has no `birthYear` by construction,
 * and this is the one payload allowed to carry `email`.
 */
export async function buildMe(user: CurrentUser): Promise<Me> {
  const [counts, reviews, follow, obsessions, palette] = await Promise.all([
    getReactionCounts(user.id),
    countOwnReviews(user.id),
    getFollowCounts(user.id),
    getObsessions(user.id),
    getUserPalette(user.id),
  ]);
  // One rule for the tint AND the title it names (profile-hexes.ts).
  const tint = profileTint(obsessions, palette);

  return {
    id: user.id,
    email: user.email,
    handle: user.username,
    name: user.name,
    avatarUrl: user.image,
    isPublic: user.isPublic,
    preferredService: user.preferredService,
    notifyReleases: user.notifyReleases,
    notifyRecap: user.notifyRecap,
    isFounder: user.isFounder,
    onboardingComplete: user.name !== null,
    hexes: tint.hexes,
    featuredTitleId: tint.featuredTitleId,
    followers: follow.followers,
    followingCount: follow.following,
    stats: {
      obsessed: counts.obsessed,
      liked: counts.liked,
      completed: counts.completed,
      reviews,
    },
    createdAt: isoDate(user.createdAt),
  };
}

/**
 * `Me` AFTER a write to the account: re-reads the user through the one loader
 * (explicit field list, no `birthYear`) so the payload reflects the write and
 * is byte-for-byte what `GET /me` returns next. A row that vanished or got
 * blocked between the write and the read is a 401 (the bearer is already
 * revoked), never a half-built `Me`.
 */
export async function freshMe(userId: string): Promise<Me> {
  const user = await loadUserById(userId);
  if (!user) throw new ApiError("unauthorized");
  return buildMe(user);
}
