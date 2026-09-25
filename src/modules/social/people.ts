import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, userFollows, userItems, users } from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";
import { FALLBACK_ADN } from "@/modules/reviews/format";
import { avatarHexesFor } from "@/modules/reviews/queries";
import { notBlockedWith } from "@/modules/social/block-gate";
import { getFollowSuggestions, publicAuthor } from "@/modules/social/queries";

/**
 * The reads behind 32b "tu gente" (Kura onboarding, 2026-09-24).
 *
 * `getOwnPicks` reads the VIEWER's own rows only. `getPeopleForPicks` is a
 * CROSS-USER read (it names other accounts), so it follows the F3.10 rule the
 * social module lives by: every query that touches another user's rows gates
 * on `publicAuthor` (isPublic + username) INSIDE the query and selects a
 * public-safe field list (handle, display name, photo URL, a title they
 * obsess over). A private account is never offered, never named, and neither
 * is anyone with a block in either direction (`notBlockedWith`). Include it
 * in any audit of cross-user reads (AGENTS.md · Authorization).
 */

export interface OwnPick {
  catalogItemId: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  paletteHex: string[] | null;
}

/**
 * The account's three newest obsessions, in the order they were picked
 * (completePicksAction stamps one `obsessedAt` for all three and inserts them
 * in pick order, so `addedAt` breaks the tie). Empty = the picks aren't done.
 */
export async function getOwnPicks(userId: string): Promise<OwnPick[]> {
  const rows = await db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      posterUrl: catalogItems.posterUrl,
      mediaType: catalogItems.mediaType,
      paletteHex: catalogItems.paletteHex,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
    .where(and(eq(userItems.userId, userId), eq(userItems.obsessed, true)))
    .orderBy(desc(userItems.obsessedAt), desc(userItems.addedAt))
    .limit(3);
  return rows.reverse();
}

export interface OnboardingPerson {
  username: string;
  name: string;
  avatarHexes: [string, string];
  avatarUrl: string | null;
  /** A title you both obsess over — null when they came from the fallback
   *  pool (recently active public profiles) and share none. */
  sharedTitle: string | null;
  /** Already followed — a reload (or the refresh a follow triggers) keeps
   *  them in the list, flipped to Siguiendo, instead of dropping the row. */
  following: boolean;
}

/**
 * Public profiles that obsess over what the viewer obsesses over, most shared
 * first (ties → whoever obsessed most recently), each with the title they
 * share — "También le obsesiona X". Topped up with the empty states' pool
 * (getFollowSuggestions: recently active public profiles, gated the same
 * way) when too few share anything, so a young catalogue still offers
 * someone. Already-followed profiles stay in (see `following`).
 */
export async function getPeopleForPicks(
  viewerId: string,
  limit = 8,
): Promise<OnboardingPerson[]> {
  const mineObsessed = sql`exists (select 1 from ${userItems} mine where mine.user_id = ${viewerId} and mine.catalog_item_id = ${userItems.catalogItemId} and mine.obsessed = true)`;
  const shared = sql<number>`count(distinct ${userItems.catalogItemId})::int`;
  const visible = notBlockedWith(viewerId, users.id);

  const matches = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      shared,
    })
    .from(userItems)
    .innerJoin(
      users,
      and(eq(users.id, userItems.userId), publicAuthor, visible),
    )
    .where(
      and(
        ne(userItems.userId, viewerId),
        eq(userItems.obsessed, true),
        mineObsessed,
      ),
    )
    .groupBy(users.id, users.username, users.name, users.image)
    .orderBy(desc(shared), desc(sql`max(${userItems.obsessedAt})`))
    .limit(limit);

  const ids = matches.map((m) => m.id);

  const [titles, hexes, follows] = await Promise.all([
    ids.length === 0
      ? Promise.resolve([] as { userId: string; title: string }[])
      : db
          .selectDistinctOn([userItems.userId], {
            userId: userItems.userId,
            title: catalogItems.title,
          })
          .from(userItems)
          .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
          .innerJoin(
            users,
            and(eq(users.id, userItems.userId), publicAuthor, visible),
          )
          .where(
            and(
              inArray(userItems.userId, ids),
              eq(userItems.obsessed, true),
              mineObsessed,
            ),
          )
          .orderBy(userItems.userId, desc(userItems.obsessedAt)),
    avatarHexesFor(ids),
    ids.length === 0
      ? Promise.resolve([] as { id: string }[])
      : db
          .select({ id: userFollows.followedUserId })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerUserId, viewerId),
              inArray(userFollows.followedUserId, ids),
            ),
          ),
  ]);

  const titleOf = new Map(titles.map((t) => [t.userId, t.title]));
  const followed = new Set(follows.map((f) => f.id));

  const people: OnboardingPerson[] = [];
  for (const m of matches) {
    const title = titleOf.get(m.id);
    // Went private between the two reads: the gated title query dropped
    // them, and so do we.
    if (!m.username || !title) continue;
    people.push({
      username: m.username,
      name: m.name ?? m.username,
      avatarHexes: hexes.get(m.id) ?? FALLBACK_ADN,
      avatarUrl: m.image,
      sharedTitle: title,
      following: followed.has(m.id),
    });
  }

  if (people.length < 4) {
    const have = new Set(people.map((p) => p.username));
    const pool = await getFollowSuggestions(viewerId, limit);
    for (const s of pool) {
      if (people.length >= limit) break;
      if (!s.username || have.has(s.username)) continue;
      people.push({
        username: s.username,
        name: s.name,
        avatarHexes: s.avatarHexes,
        avatarUrl: s.avatarUrl,
        sharedTitle: null,
        following: false,
      });
    }
  }

  return people;
}
