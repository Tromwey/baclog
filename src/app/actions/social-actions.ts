"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertUser } from "@/authz";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import {
  getFeedCards,
  getPeoplePage,
  publicAuthor,
  searchProfiles,
} from "@/modules/social/queries";
import type {
  FeedCardsPage,
  PeoplePage,
  PersonRow,
} from "@/modules/social/types";

/**
 * F3.10 — the follow mutations and the feed's pagination endpoints. Both
 * mutations key on the caller's session (assertUser) and only ever write the
 * caller's OWN edge; neither can touch another user's rows.
 */

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/);

export type FollowResult = { ok: true } | { error: "not_found" | "invalid" };

/**
 * Follow the public profile at `username`.
 *
 * Only PUBLIC profiles are followable — the target is resolved with the
 * isPublic + username gate inside the query, so a private handle and a
 * nonexistent one fail identically (no enumeration oracle, same posture as
 * getPublicProfile). Self-follow resolves to the same not_found. Re-following
 * is an upsert no-op (the pair unique), so the button can't double-insert.
 */
export async function followUserAction(
  username: string,
): Promise<FollowResult> {
  const user = await assertUser();
  const parsed = handleSchema.safeParse(username);
  if (!parsed.success) return { error: "invalid" };

  // The SAME predicate the feed reads with (publicAuthor) — followability and
  // visibility can't drift apart.
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, parsed.data), publicAuthor))
    .limit(1);
  if (!target || target.id === user.id) return { error: "not_found" };

  await db
    .insert(userFollows)
    .values({ followerUserId: user.id, followedUserId: target.id })
    .onConflictDoNothing();

  revalidatePath("/feed");
  revalidatePath("/perfil");
  revalidatePath(`/u/${parsed.data}`);
  return { ok: true };
}

/**
 * Drop the caller's follow of `username`. Deliberately NOT gated on isPublic:
 * unfollowing someone who went private must keep working, or their row in the
 * viewer's list becomes unremovable. Deleting scopes to the caller's own edge,
 * so there's nothing to leak — the response never varies.
 */
export async function unfollowUserAction(
  username: string,
): Promise<FollowResult> {
  const user = await assertUser();
  const parsed = handleSchema.safeParse(username);
  if (!parsed.success) return { error: "invalid" };

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, parsed.data))
    .limit(1);
  if (target) {
    await db
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.followerUserId, user.id),
          eq(userFollows.followedUserId, target.id),
        ),
      );
  }

  revalidatePath("/feed");
  revalidatePath("/perfil");
  revalidatePath(`/u/${parsed.data}`);
  return { ok: true };
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
