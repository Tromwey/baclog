import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backlogs, userFollows, users } from "@/db/schema";
import { notBlockedWith } from "./block-gate";
import { collectionCards, type CollectionCard } from "./collection-cards";
import { publicAuthor } from "./queries";

/**
 * Descubrir · Todo (Claude Design "Descubrir Final – Todo", 3a): "colecciones
 * para ti · de gente que sigues" — the most recently touched SHOWCASED
 * collections of the people the viewer follows.
 *
 * Cross-user read WITH a viewer, same posture as the feed (F3.10.1): the
 * owner is re-gated `publicAuthor` + `notBlockedWith` INSIDE the query (a
 * followed account that went private simply drops out; its follow row stays
 * inert), and the collection must be on their profile — `is_public AND
 * show_on_profile`, the derived "featured" — so a public-by-link shelf never
 * surfaces here. Whitelisted fields only (`collection-cards.ts`).
 */
export async function getFollowedCollections(viewerId: string, limit = 4): Promise<CollectionCard[]> {
  const lists = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      coverCatalogItemId: backlogs.coverCatalogItemId,
      displayName: users.name,
      username: users.username,
      image: users.image,
    })
    .from(userFollows)
    .innerJoin(
      users,
      and(eq(users.id, userFollows.followedUserId), publicAuthor, notBlockedWith(viewerId, users.id)),
    )
    .innerJoin(backlogs, eq(backlogs.userId, users.id))
    .where(
      and(
        eq(userFollows.followerUserId, viewerId),
        eq(backlogs.isPublic, true),
        eq(backlogs.showOnProfile, true),
      ),
    )
    .orderBy(desc(backlogs.updatedAt))
    // Read wider than shown: empty collections are skipped by `collectionCards`.
    .limit(limit * 3);

  return (await collectionCards(lists)).slice(0, limit);
}
