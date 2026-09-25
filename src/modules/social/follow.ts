import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { afterResponse } from "@/lib/after-response";
import { parseHandleOrNull } from "@/modules/account/username";
import { notifyNewFollower } from "@/modules/push/follower";
import { notBlockedWith } from "./block-gate";
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
 * A block in EITHER direction (`user_block`, App Store 1.2) is the same
 * not_found too — the gate sits in the same query, so a follow can't be
 * recreated while the block exists.
 *
 * Phase 4e: when the edge is NEW (the insert returned a row — not an
 * idempotent re-follow), the "@x te sigue" push is scheduled after the
 * response (`notifyNewFollower`: its own gates + a 24 h per-pair throttle).
 * It can't block or fail the follow; errors only reach the log.
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
    .where(
      and(
        eq(users.username, handle),
        publicAuthor,
        notBlockedWith(viewerId, users.id),
      ),
    )
    .limit(1);
  if (!target || target.id === viewerId) return { error: "not_found" };

  const created = await db
    .insert(userFollows)
    .values({ followerUserId: viewerId, followedUserId: target.id })
    .onConflictDoNothing()
    .returning({ id: userFollows.id });
  if (created.length > 0) {
    const followedId = target.id;
    afterResponse("push/follower", () => notifyNewFollower(viewerId, followedId));
  }
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
