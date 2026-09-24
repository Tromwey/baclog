import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { itemReviews, users } from "@/db/schema";

/**
 * How many reviews a PUBLIC profile has published — the "N reseñas" pill of a
 * public profile (`GET /api/v1/people/{handle}`, web 33a counts
 * `getProfileReviews().length`, which is capped; this is the real count).
 *
 * Cross-user read, so it follows the reviews-feed posture (`queries.ts`):
 * gated INSIDE the query on `users.isPublic = true AND username IS NOT NULL`
 * AND `hidden_at IS NULL` — a moderated review is out of the public count the
 * same way it is out of the feed. A private or nonexistent handle counts 0,
 * indistinguishable from a public profile that has written nothing; the
 * caller's profile lookup is what decides 404, never this number.
 */
export async function countPublicReviewsByAuthor(username: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemReviews)
    .innerJoin(users, eq(users.id, itemReviews.userId))
    .where(
      and(
        eq(users.username, username),
        eq(users.isPublic, true),
        isNotNull(users.username),
        isNull(itemReviews.hiddenAt),
      ),
    );
  return row?.n ?? 0;
}
