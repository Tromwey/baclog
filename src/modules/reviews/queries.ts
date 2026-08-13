import "server-only";
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  catalogItems,
  itemReviews,
  userItems,
  users,
} from "@/db/schema";
import { MEDIA_TYPE_TITLE } from "@/modules/catalog/types";
import { FALLBACK_ADN, isLegibleBehindText, relativeWhen } from "./format";
import {
  REVIEW_PAGE_SIZE,
  type FeedReview,
  type ItemReviewContext,
  type OwnReview,
  type ProfileReview,
  type ReviewAuthor,
  type ReviewFeedPage,
  type ReviewMark,
} from "./types";

/**
 * F3.9 — reads for the review feed.
 *
 * SECOND deliberate authz exception after modules/backlog/public.ts, and built
 * to the same rules: the feed runs with NO session (the public item page serves
 * anonymous viewers), so every query gates on `users.isPublic = true AND
 * users.username IS NOT NULL` INSIDE the query, filters out moderated rows, and
 * selects an explicit public-safe field list. Nothing here returns an email, a
 * user id, a backlog, or the author's status on the title — only what a review
 * card renders. `userId` is used internally for the avatar palettes and is
 * dropped before the row leaves this module.
 *
 * The author's reaction (verdict / obsessed) DOES ride along, which is a
 * deliberate widening of the F3.7 public rule: on a public backlog a verdict
 * only shows once the title is completed (a mid-consumption verdict is a live
 * behavioral signal), but here the author volunteered a whole paragraph about
 * the title — the reaction is the caption of something they chose to publish,
 * not a leak of what they're doing right now.
 */

/** The one visibility predicate. Anything reading the feed goes through it. */
const publicAuthor = and(
  eq(users.isPublic, true),
  sql`${users.username} is not null`,
  isNull(itemReviews.hiddenAt),
);


function initialOf(username: string): string {
  return (Array.from(username)[0] ?? "·").toUpperCase();
}

function markOf(row: {
  obsessed: boolean | null;
  verdict: string | null;
}): ReviewMark {
  if (row.obsessed) return "obsessed";
  if (row.verdict === "liked") return "liked";
  if (row.verdict === "disliked") return "disliked";
  return null;
}

/**
 * Two ADN hexes per author, in ONE round-trip for the whole page.
 *
 * The naive version is a query per card. This ranks each author's items by
 * recency in a subquery and keeps the top 12 per author, then reuses
 * `dominantHexes`' rule (first distinct dominant color per item) — the same
 * colors the profile orb auras with, cut to two.
 */
async function avatarHexesFor(
  userIds: string[],
): Promise<Map<string, [string, string]>> {
  const out = new Map<string, [string, string]>();
  if (userIds.length === 0) return out;

  const ranked = db
    .select({
      userId: userItems.userId,
      paletteHex: catalogItems.paletteHex,
      rn: sql<number>`row_number() over (partition by ${userItems.userId} order by ${userItems.addedAt} desc)`.as(
        "rn",
      ),
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(
      and(
        inArray(userItems.userId, userIds),
        sql`${catalogItems.paletteHex} is not null`,
      ),
    )
    .as("ranked");

  const rows = await db
    .select({ userId: ranked.userId, paletteHex: ranked.paletteHex })
    .from(ranked)
    .where(lte(ranked.rn, 12))
    .orderBy(ranked.userId, ranked.rn);

  const picked = new Map<string, string[]>();
  for (const row of rows) {
    const hex = row.paletteHex?.[0];
    if (!hex || !isLegibleBehindText(hex)) continue;
    const list = picked.get(row.userId) ?? [];
    if (list.length >= 2) continue;
    if (list.some((h) => h.toLowerCase() === hex.toLowerCase())) continue;
    list.push(hex);
    picked.set(row.userId, list);
  }

  // Pad every author to exactly two stops — a one-color gradient reads as a
  // flat disc, and a missing one would blow up the CSS list.
  for (const id of userIds) {
    const list = picked.get(id) ?? [];
    out.set(id, [list[0] ?? FALLBACK_ADN[0], list[1] ?? FALLBACK_ADN[1]]);
  }
  return out;
}

function decodeCursor(cursor: string | null): { at: Date; id: string } | null {
  if (!cursor) return null;
  const sep = cursor.lastIndexOf("|");
  if (sep < 1) return null;
  const at = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (!id || Number.isNaN(at.getTime())) return null;
  return { at, id };
}

/**
 * One page of a title's public reviews, newest first.
 *
 * Keyset pagination on (createdAt, id) rather than OFFSET: a review published
 * while someone is reading would shift every offset by one and silently
 * duplicate a card. The extra row fetched is how `nextCursor` knows whether
 * there IS a next page without a second count.
 */
export async function getReviewFeedPage(
  catalogItemId: string,
  opts: {
    /** The viewer's own review is pinned above the feed, never repeated in it. */
    excludeUserId?: string | null;
    /**
     * Same idea for the public page, where the pinned review belongs to the
     * profile the link points at and no user id is in play (the public reads
     * are keyed on handles, never ids).
     */
    excludeUsername?: string | null;
    cursor?: string | null;
    limit?: number;
    now?: number;
  } = {},
): Promise<ReviewFeedPage> {
  const limit = opts.limit ?? REVIEW_PAGE_SIZE;
  const now = opts.now ?? Date.now();
  const after = decodeCursor(opts.cursor ?? null);

  const rows = await db
    .select({
      id: itemReviews.id,
      userId: itemReviews.userId,
      body: itemReviews.body,
      hasSpoiler: itemReviews.hasSpoiler,
      createdAt: itemReviews.createdAt,
      username: users.username,
      obsessed: userItems.obsessed,
      verdict: userItems.verdict,
    })
    .from(itemReviews)
    .innerJoin(users, eq(itemReviews.userId, users.id))
    .leftJoin(
      userItems,
      and(
        eq(userItems.userId, itemReviews.userId),
        eq(userItems.catalogItemId, itemReviews.catalogItemId),
      ),
    )
    .where(
      and(
        eq(itemReviews.catalogItemId, catalogItemId),
        publicAuthor,
        opts.excludeUserId
          ? sql`${itemReviews.userId} <> ${opts.excludeUserId}`
          : undefined,
        opts.excludeUsername
          ? sql`${users.username} <> ${opts.excludeUsername}`
          : undefined,
        after
          ? or(
              lt(itemReviews.createdAt, after.at),
              and(
                eq(itemReviews.createdAt, after.at),
                lt(itemReviews.id, after.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(itemReviews.createdAt), desc(itemReviews.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const hexes = await avatarHexesFor([...new Set(page.map((r) => r.userId))]);

  const reviews: FeedReview[] = page.map((row) => {
    const username = row.username ?? "";
    return {
      id: row.id,
      body: row.body,
      hasSpoiler: row.hasSpoiler,
      mark: markOf(row),
      when: relativeWhen(row.createdAt, now),
      author: {
        username,
        initial: initialOf(username),
        avatarHexes: hexes.get(row.userId) ?? FALLBACK_ADN,
      } satisfies ReviewAuthor,
    };
  });

  const last = page.at(-1);
  return {
    reviews,
    nextCursor:
      rows.length > limit && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null,
  };
}

/** How many public, non-hidden reviews this title has — the header count. */
export async function countPublicReviews(
  catalogItemId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemReviews)
    .innerJoin(users, eq(itemReviews.userId, users.id))
    .where(and(eq(itemReviews.catalogItemId, catalogItemId), publicAuthor));
  return row?.n ?? 0;
}

/**
 * Everything the in-app block renders, in one place: the viewer's own review
 * (hidden or not, private profile or not), the first page of everyone else's,
 * and the count. Own review is read WITHOUT the public gate — its author sees
 * it regardless of moderation or profile visibility.
 */
export async function getItemReviewContext(
  userId: string,
  catalogItemId: string,
  now = Date.now(),
): Promise<ItemReviewContext> {
  const [ownRows, page, total] = await Promise.all([
    db
      .select({
        id: itemReviews.id,
        body: itemReviews.body,
        hasSpoiler: itemReviews.hasSpoiler,
        hiddenAt: itemReviews.hiddenAt,
        updatedAt: itemReviews.updatedAt,
        obsessed: userItems.obsessed,
        verdict: userItems.verdict,
      })
      .from(itemReviews)
      .leftJoin(
        userItems,
        and(
          eq(userItems.userId, itemReviews.userId),
          eq(userItems.catalogItemId, itemReviews.catalogItemId),
        ),
      )
      .where(
        and(
          eq(itemReviews.userId, userId),
          eq(itemReviews.catalogItemId, catalogItemId),
        ),
      )
      .limit(1),
    getReviewFeedPage(catalogItemId, { excludeUserId: userId, now }),
    countPublicReviews(catalogItemId),
  ]);

  const row = ownRows[0];
  if (!row) return { ...page, own: null, total };

  const own: OwnReview = {
    id: row.id,
    body: row.body,
    hasSpoiler: row.hasSpoiler,
    mark: markOf(row),
    // The own card shows when it was last SAVED — editing is re-publishing.
    when: relativeWhen(row.updatedAt, now),
    hidden: row.hiddenAt !== null,
  };
  return { ...page, own, total };
}

/**
 * The owner's review of a title, for the public item page's "Lo que dice X"
 * block. Public-gated like everything else here: a private owner's review
 * simply isn't there, and the page renders without the block.
 */
export async function getPublicOwnerReview(
  username: string,
  catalogItemId: string,
  now = Date.now(),
): Promise<FeedReview | null> {
  const [row] = await db
    .select({
      id: itemReviews.id,
      userId: itemReviews.userId,
      body: itemReviews.body,
      hasSpoiler: itemReviews.hasSpoiler,
      createdAt: itemReviews.createdAt,
      username: users.username,
      obsessed: userItems.obsessed,
      verdict: userItems.verdict,
    })
    .from(itemReviews)
    .innerJoin(users, eq(itemReviews.userId, users.id))
    .leftJoin(
      userItems,
      and(
        eq(userItems.userId, itemReviews.userId),
        eq(userItems.catalogItemId, itemReviews.catalogItemId),
      ),
    )
    .where(
      and(
        eq(itemReviews.catalogItemId, catalogItemId),
        eq(users.username, username),
        publicAuthor,
      ),
    )
    .limit(1);
  if (!row) return null;

  const hexes = await avatarHexesFor([row.userId]);
  const name = row.username ?? "";
  return {
    id: row.id,
    body: row.body,
    hasSpoiler: row.hasSpoiler,
    mark: markOf(row),
    when: relativeWhen(row.createdAt, now),
    author: {
      username: name,
      initial: initialOf(name),
      avatarHexes: hexes.get(row.userId) ?? FALLBACK_ADN,
    },
  };
}

/**
 * "Lo que dice X" on the public profile — the person is the constant here and
 * the TITLE is the variable, so the card flips: title in serif, no avatar.
 * Gated on the profile being public, like every other read in this file.
 */
export async function getProfileReviews(
  username: string,
  limit = 12,
  now = Date.now(),
): Promise<ProfileReview[]> {
  const rows = await db
    .select({
      id: itemReviews.id,
      catalogItemId: itemReviews.catalogItemId,
      body: itemReviews.body,
      hasSpoiler: itemReviews.hasSpoiler,
      createdAt: itemReviews.createdAt,
      title: catalogItems.title,
      mediaType: catalogItems.mediaType,
      obsessed: userItems.obsessed,
      verdict: userItems.verdict,
    })
    .from(itemReviews)
    .innerJoin(users, eq(itemReviews.userId, users.id))
    .innerJoin(catalogItems, eq(itemReviews.catalogItemId, catalogItems.id))
    .leftJoin(
      userItems,
      and(
        eq(userItems.userId, itemReviews.userId),
        eq(userItems.catalogItemId, itemReviews.catalogItemId),
      ),
    )
    .where(and(eq(users.username, username), publicAuthor))
    .orderBy(desc(itemReviews.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    catalogItemId: row.catalogItemId,
    title: row.title,
    mediaTypeLabel: MEDIA_TYPE_TITLE[row.mediaType],
    body: row.body,
    hasSpoiler: row.hasSpoiler,
    mark: markOf(row),
    when: relativeWhen(row.createdAt, now),
  }));
}
