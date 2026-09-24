import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { publicAuthor } from "./queries";

/**
 * F3.10 — the follow mutations behind `followUserAction` /
 * `unfollowUserAction` (web) and `PUT` / `DELETE /me/following/{handle}`
 * (API). Both key on the caller's id and only ever write the caller's OWN
 * edge; neither can touch another user's rows. Takes a `viewerId`: never a
 * "use server" file. Idempotent both ways.
 */

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/);

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
  const parsed = handleSchema.safeParse(username);
  if (!parsed.success) return { error: "invalid" };

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, parsed.data), publicAuthor))
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
          eq(userFollows.followerUserId, viewerId),
          eq(userFollows.followedUserId, target.id),
        ),
      );
  }
  return { ok: true };
}
