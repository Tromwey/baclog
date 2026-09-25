import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { followPushNotices, users } from "@/db/schema";
import { MIGRATION_0029_LIVE } from "@/auth/live-0029";
import { appleKeyConfig } from "@/auth/apple-key";
import { publicAuthor } from "@/modules/social/queries";
import { pushToUser } from "./apns";

/** At most one "te sigue" push per (follower, followed) pair per window. */
export const FOLLOW_PUSH_WINDOW_HOURS = 24;

/**
 * Phase 4e — "@{handle} te sigue", sent when `followUser` created a NEW edge
 * (never on an idempotent re-follow). Scheduled after the response by
 * `followUser` (`afterResponse`): it never blocks or fails the follow, and
 * every failure is only logged.
 *
 * Sent only when ALL hold, in this order (cheapest refusal first):
 *   1. migration 0029 live and the APNs key configured (else a logged no-op
 *      in `pushToUsers` — checked here too, so no throttle row is claimed
 *      for a push that can't go out);
 *   2. the FOLLOWER is a public profile with a handle (`publicAuthor`, the
 *      feed's own gate): a private follower is never named — the same
 *      posture as follower lists, where they are an anonymous count;
 *   3. the FOLLOWED has `notify_followers` on;
 *   4. the pair's throttle claim succeeds: an atomic upsert on
 *      `follow_push_notice` that only writes when there is no row or its
 *      `sent_at` is older than 24 h — so unfollow/refollow can't buzz a
 *      phone, and two concurrent follows can't both send.
 */
export async function notifyNewFollower(followerId: string, followedId: string): Promise<void> {
  if (!MIGRATION_0029_LIVE || !appleKeyConfig()) {
    console.log("[push] aviso de seguidor omitido: migración 0029 sin aplicar o sin llave de APNs");
    return;
  }

  const [follower] = await db
    .select({ handle: users.username })
    .from(users)
    .where(and(eq(users.id, followerId), publicAuthor))
    .limit(1);
  if (!follower?.handle) return;

  const [followed] = await db
    .select({ on: sql<boolean>`"user"."notify_followers"` })
    .from(users)
    .where(eq(users.id, followedId))
    .limit(1);
  if (!followed?.on) return;

  const claimed = await db
    .insert(followPushNotices)
    .values({ followerUserId: followerId, followedUserId: followedId })
    .onConflictDoUpdate({
      target: [followPushNotices.followerUserId, followPushNotices.followedUserId],
      set: { sentAt: sql`now()` },
      setWhere: sql`${followPushNotices.sentAt} < now() - make_interval(hours => ${FOLLOW_PUSH_WINDOW_HOURS})`,
    })
    .returning({ at: followPushNotices.sentAt });
  if (claimed.length === 0) return;

  const outcome = await pushToUser(followedId, {
    title: `@${follower.handle} te sigue`,
    data: { type: "follower", handle: follower.handle },
  });
  if (outcome.failed > 0) {
    console.error(`[push] aviso de seguidor ${followerId} → ${followedId}: ${outcome.failed} envío(s) fallaron`);
  }
}
