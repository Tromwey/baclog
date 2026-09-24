"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertUser } from "@/authz";
import {
  followUser,
  unfollowUser,
  type FollowResult,
} from "@/modules/social/follow";
import {
  getFeedCards,
  getPeoplePage,
  searchProfiles,
} from "@/modules/social/queries";
import type {
  FeedCardsPage,
  PeoplePage,
  PersonRow,
} from "@/modules/social/types";

/**
 * F3.10 — the follow mutations and the feed's pagination endpoints. The
 * follow/unfollow rules (public-only targets, no isPublic gate on unfollow,
 * idempotence) live in `modules/social/follow.ts`, shared with
 * `PUT`/`DELETE /api/v1/me/following/{handle}`; these wrappers only add
 * `assertUser()` and the revalidation the web pages need.
 */

export type { FollowResult };

/** Follow the public profile at `username` (see modules/social/follow.ts). */
export async function followUserAction(
  username: string,
): Promise<FollowResult> {
  const user = await assertUser();
  const result = await followUser(user.id, username);
  if ("error" in result) return result;
  revalidateFollowSurfaces(username);
  return result;
}

/** Drop the caller's follow of `username` — no isPublic gate, on purpose. */
export async function unfollowUserAction(
  username: string,
): Promise<FollowResult> {
  const user = await assertUser();
  const result = await unfollowUser(user.id, username);
  if ("error" in result) return result;
  revalidateFollowSurfaces(username);
  return result;
}

function revalidateFollowSurfaces(username: string) {
  revalidatePath("/feed");
  revalidatePath("/perfil");
  revalidatePath(`/u/${username.trim().toLowerCase()}`);
}

/** "Ver más" on the feed — the next page of CARDS for the caller's own follows. */
export async function loadMoreFeedAction(input: {
  cursor: string;
}): Promise<FeedCardsPage> {
  const user = await assertUser();
  const cursor = z.string().min(1).max(160).safeParse(input.cursor);
  if (!cursor.success) return { cards: [], nextCursor: null, followingCount: 0 };
  return getFeedCards(user.id, { cursor: cursor.data });
}

/** "Ver más" on the siguiendo/seguidores lists — always the caller's own. */
export async function loadMorePeopleAction(input: {
  mode: "following" | "followers";
  cursor: string;
}): Promise<PeoplePage> {
  const user = await assertUser();
  const parsed = z
    .object({
      mode: z.enum(["following", "followers"]),
      cursor: z.string().min(1).max(160),
    })
    .safeParse(input);
  if (!parsed.success) return { people: [], privateCount: 0, nextCursor: null };
  return getPeoplePage(user.id, parsed.data.mode, parsed.data.cursor);
}

/**
 * Buscar gente — live search over PUBLIC profiles for the caller. The gate
 * lives inside searchProfiles (publicAuthor + public-safe fields); this only
 * bounds the needle. Too short or malformed → an empty list, never an error:
 * the screen treats "nothing yet" and "nothing found" the same way.
 */
export async function searchProfilesAction(input: {
  q: string;
}): Promise<PersonRow[]> {
  const user = await assertUser();
  const parsed = z.string().max(60).safeParse(input.q);
  if (!parsed.success) return [];
  return searchProfiles(user.id, parsed.data);
}
