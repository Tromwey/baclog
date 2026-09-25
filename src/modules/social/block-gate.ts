import "server-only";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { userBlocks } from "@/db/schema";

/**
 * THE block predicate (App Store 1.2, 2026-09-24). A block is stored one way
 * (`blocker → blocked`) but is MUTUAL in visibility: for a viewer V, any user U
 * with a `user_block` row in EITHER direction disappears from every
 * cross-user read V makes (feed, feed suggestion, reviews of a title, "entre
 * quienes sigues", trending, affinity, people search, suggestions, onboarding
 * people, V's own following/followers lists).
 *
 * Use it INSIDE the query, next to `publicAuthor`, on the column that holds
 * the OTHER user's id (usually `users.id` of the joined author):
 *
 *   .innerJoin(users, and(eq(users.id, t.userId), publicAuthor, notBlockedWith(viewerId, users.id)))
 *
 * `viewerId` is always the session/bearer user — never an id from a client.
 * Reads with no viewer (anonymous public pages) have nothing to gate on and
 * don't use it. Two index probes per row: the PK `(blocker, blocked)` serves
 * the first half, `user_block_blocked_idx` the second.
 */
export function notBlockedWith(viewerId: string, userIdCol: AnyColumn | SQL): SQL {
  return sql`not exists (select 1 from ${userBlocks} ub where (ub.blocker_user_id = ${viewerId} and ub.blocked_user_id = ${userIdCol}) or (ub.blocker_user_id = ${userIdCol} and ub.blocked_user_id = ${viewerId}))`;
}
