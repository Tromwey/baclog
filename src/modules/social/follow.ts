import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { parseHandleOrNull } from "@/modules/account/username";
import { publicAuthor } from "./queries";

/**
 * F3.10 — the follow mutations behind `followUserAction` /
 * `unfollowUserAction` (web) and `PUT` / `DELETE /me/following/{handle}`
 * (API). Both key on the caller's id and only ever write the caller's OWN
 * edge; neither can touch another user's rows. Takes a `viewerId`: never a
 * "use server" file. Idempotent both ways.
 */

/** `invalid` = the handle can't even be a username (`parseHandleOrNull`,
 *  the one grammar shared with the claim). The API folds it into the same
 *  404 as `not_found`; the web actions return it as is. */
export type FollowResult = { ok: true } | { error: "not_found" | "invalid" };

/**
 * Follow the public profile at `username`.
 *
 * Only PUBLIC profiles are followable — the target is resolved with the
 * isPublic + username gate inside the query (`publicAuthor`, the SAME
 * predicate the feed reads with, so followability and visibility can't drift
 * apart), so a private handle and a nonexistent one fail identically (no
 * enumeration oracle, same posture as getPublicProfile). Self-follow resolves
 * to the same not_found. Re-following is an upsert no-op (the pair unique).
 */
export async function followUser(
  viewerId: string,
  username: string,
): Promise<FollowResult> {
  const handle = parseHandleOrNull(username);
  if (!handle) return { error: "invalid" };

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, handle), publicAuthor))
    .limit(1);
  if (!target || target.id === viewerId) return { error: "not_found" };

  await db
    .insert(userFollows)
    .values({ followerUserId: viewerId, followedUserId: target.id })
    .onConflictDoNothing();
  return { ok: true };
}

/**
 * Drop the caller's follow of `username`. Deliberately NOT gated on isPublic
 * (AGENTS.md): unfollowing someone who went private must keep working, or
 * their row in the viewer's list becomes unremovable. Deleting scopes to the
 * caller's own edge, so there's nothing to leak — the response never varies
 * (unknown handle and no edge are both `ok`).
 */
export async function unfollowUser(
  viewerId: string,
  username: string,
): Promise<FollowResult> {
  const handle = parseHandleOrNull(username);
  if (!handle) return { error: "invalid" };

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, handle))
    .limit(1);
  if (target) {
    await db
      .delete(userFollows)
      .where(
        and(
          eq(userFollows.followerUserId, viewerId),
          eq(userFollows.followedUserId, target.id),
        ),
      );
  }
  return { ok: true };
}
