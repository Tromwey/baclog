import "server-only";
import type { CurrentUser } from "@/auth/session";
import { getObsessions, getReactionCounts } from "@/modules/backlog/profile-stats";
import { profileHexes } from "@/modules/backlog/profile-hexes";
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
  // The obsession that tints the profile (profile-hexes.ts): the newest one
  // with a cover palette; failing that, the newest obsession at all.
  const featured =
    obsessions.find((o) => (o.paletteHex?.length ?? 0) > 0) ?? obsessions[0];

  return {
    id: user.id,
    email: user.email,
    handle: user.username,
    name: user.name,
    avatarUrl: user.image,
    isPublic: user.isPublic,
    preferredService: user.preferredService,
    notifyReleases: user.notifyReleases,
    isFounder: user.isFounder,
    onboardingComplete: user.name !== null,
    hexes: profileHexes(obsessions, palette),
    featuredTitleId: featured?.catalogItemId ?? null,
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
