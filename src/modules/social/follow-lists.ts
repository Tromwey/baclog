import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { notBlockedWith } from "./block-gate";
import {
  canSeeFollowLists,
  type FollowListsVisibility,
} from "./follow-lists-policy";
import { publicAuthor } from "./queries";

/**
 * `"user"."id"`, ALWAYS table-qualified. In a single-table select Drizzle
 * renders `${users.id}` as a bare `"id"`, and inside the correlated
 * subqueries below a bare `"id"` binds to the INNER table (`user_follow.id`),
 * not the owner — the edge checks silently read false
 * (learnings/2026-09-27-columna-sin-calificar-en-subquery-correlacionada).
 */
const OWNER_ID = sql`${users}.${sql.identifier("id")}`;

export interface FollowListsAccess {
  ownerId: string;
  visibility: FollowListsVisibility;
  isOwner: boolean;
  /** A block exists between viewer and owner, either direction. */
  blocked: boolean;
  /** `canSeeFollowLists` for this viewer (false whenever `blocked`). */
  allowed: boolean;
}

/**
 * The ONE gate for reading someone's followers / following lists (founder,
 * 2026-09-27). ONE query resolves everything the policy needs:
 *
 *   - the owner row, gated `publicAuthor` (isPublic + username) INSIDE the
 *     query — a private or nonexistent handle is `null`, which the caller
 *     turns into the same 404 as `GET /people/{handle}`;
 *   - whether a block exists in either direction (`notBlockedWith`, the same
 *     predicate every cross-user read uses) — the caller 404s on it too;
 *   - both follow edges (viewer → owner, owner → viewer) for `mutuals`.
 *
 * `viewerId` is always the session/bearer user. Also feeds `Person`'s
 * `followListsVisibility` / `canSeeFollowLists` (people/_lib/person.ts).
 */
export async function getFollowListsAccess(
  viewerId: string,
  handle: string,
): Promise<FollowListsAccess | null> {
  const [row] = await db
    .select({
      ownerId: users.id,
      visibility: users.followListsVisibility,
      notBlocked: sql<boolean>`${notBlockedWith(viewerId, OWNER_ID)}`,
      viewerFollowsOwner: sql<boolean>`exists (select 1 from ${userFollows} f where f.follower_user_id = ${viewerId} and f.followed_user_id = ${OWNER_ID})`,
      ownerFollowsViewer: sql<boolean>`exists (select 1 from ${userFollows} f where f.follower_user_id = ${OWNER_ID} and f.followed_user_id = ${viewerId})`,
    })
    .from(users)
    .where(and(eq(users.username, handle), publicAuthor))
    .limit(1);
  if (!row) return null;

  const isOwner = row.ownerId === viewerId;
  const blocked = !row.notBlocked;
  return {
    ownerId: row.ownerId,
    visibility: row.visibility,
    isOwner,
    blocked,
    allowed: canSeeFollowLists({
      visibility: row.visibility,
      isOwner,
      blocked,
      viewerFollowsOwner: row.viewerFollowsOwner,
      ownerFollowsViewer: row.ownerFollowsViewer,
    }),
  };
}
