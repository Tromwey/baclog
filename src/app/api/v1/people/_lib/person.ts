import "server-only";
import { z } from "zod";
import { ApiError } from "@/authz/api";
import type { CurrentUser } from "@/auth/session";
import { profileHexes } from "@/modules/backlog/profile-hexes";
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

/** The handle grammar `claimUsernameAction` enforces. Anything else is a
 *  404, not a 400: a validation error on the path would tell a prober which
 *  strings are even worth trying. */
const HandleSchema = z.string().regex(/^[a-z0-9_.]{3,30}$/);

export function parseHandle(raw: string | string[] | undefined): string {
  const parsed = HandleSchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) throw new ApiError("not_found");
  return parsed.data;
}

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

  // The obsession that tints the profile (profile-hexes.ts): the newest one
  // with a cover palette; failing that, the newest obsession at all. The
  // lima fallback of public.ts is not a Kura colour — profileHexes drops it.
  const featured =
    profile.obsessions.find((o) => (o.paletteHex?.length ?? 0) > 0) ??
    profile.obsessions[0];

  return {
    handle: profile.username,
    name: profile.displayName,
    avatarUrl: profile.avatarUrl,
    hexes: profileHexes(profile.obsessions, profile.palette),
    featuredTitleId: featured?.catalogItemId ?? null,
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
